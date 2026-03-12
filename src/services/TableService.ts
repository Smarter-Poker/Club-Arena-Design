/**
 * ♠ CLUB ARENA — Table Service
 * Manages poker tables and game sessions
 */

import { supabase, subscribeToTable, subscribeToHandState } from '../lib/supabase';
import type { PokerTable, TableSettings, GameVariant, HandState } from '../types/database.types';
import { WalletService } from './WalletService';
import { masterBus } from '../core/MasterBus';
import { retryAsync } from '../utils/retryAsync';

class TableService {
  // ═══════════════════════════════════════════════════════════════════════════════
  // Table Operations
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Get all tables for a club
   */
  async getClubTables(clubId: string): Promise<PokerTable[]> {
    const { data, error } = await supabase
      .from('tables')
      .select('*')
      .eq('club_id', clubId)
      .eq('is_deleted', false)
      .neq('status', 'closed')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[TableService] Error fetching club tables:', error);
      return [];
    }
    return data || [];
  }

  /**
   * Get all active tables across the platform (for lobby)
   */
  async getActiveTables(limit = 50): Promise<PokerTable[]> {
    const { data, error } = await supabase
      .from('tables')
      .select('*')
      .eq('is_deleted', false)
      .neq('status', 'closed')
      .is('tournament_id', null) // Exclude tournament tables from cash lobby
      .order('current_players', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[TableService] Error fetching active tables:', error);
      return [];
    }
    return data || [];
  }

  /**
   * Get all active tables in a union
   */
  async getUnionTables(unionId: string): Promise<PokerTable[]> {
    // Get all clubs in the union, then get their tables
    const { data: clubs, error: clubError } = await supabase
      .from('union_clubs')
      .select('club_id')
      .eq('union_id', unionId);

    if (clubError || !clubs?.length) {
      return [];
    }

    const clubIds = clubs.map((c) => c.club_id);
    const { data, error } = await supabase
      .from('tables')
      .select('*')
      .in('club_id', clubIds)
      .eq('is_deleted', false)
      .neq('status', 'closed');

    if (error) {
      console.error('[TableService] Error fetching union tables:', error);
      return [];
    }
    return data || [];
  }

  /**
   * Get a single table
   */
  async getTable(tableId: string): Promise<PokerTable | null> {
    const { data, error } = await supabase
      .from('tables')
      .select('*')
      .eq('id', tableId)
      .maybeSingle();

    if (error) {
      console.error('[TableService] Error fetching table:', error);
      return null;
    }
    return data;
  }

  /**
   * Create a new table
   */
  async createTable(
    clubId: string,
    name: string,
    gameVariant: GameVariant,
    smallBlind: number,
    bigBlind: number,
    maxPlayers: number = 9,
    settings?: Partial<TableSettings>
  ): Promise<PokerTable> {
    const defaultSettings: TableSettings = {
      straddle_enabled: true,
      straddle_type: 'utg',
      run_it_twice: true,
      bomb_pot_enabled: false,
      bomb_pot_frequency: 0,
      bomb_pot_ante_bb: 0,
      time_bank_seconds: 30,
      auto_muck: true,
      vpip_display: false,
      ante_enabled: false,
      ante_amount: 0,
      no_rathole: false,
      double_board: false,
      time_limit_minutes: 0,
      action_time_seconds: 15,
      min_buyin_bb: 20,
      max_buyin_bb: 100,
      insurance_enabled: false,
      auto_restart: true,
      call_time_enabled: false,
      ...settings,
    };

    // Union guard: clubs inside a union cannot create their own tables
    const { data: unionCheck } = await supabase
      .from('union_clubs')
      .select('union_id')
      .eq('club_id', clubId)
      .maybeSingle();
    if (unionCheck) {
      throw new Error(
        'Clubs inside a union cannot create standalone tables. Tables are managed at the union level.'
      );
    }

    const { data, error } = await supabase
      .from('tables')
      .insert({
        club_id: clubId,
        name,
        game_type: 'cash',
        game_variant: gameVariant,
        stakes: `${smallBlind}/${bigBlind}`,
        small_blind: smallBlind,
        big_blind: bigBlind,
        min_buy_in: bigBlind * 40,
        max_buy_in: bigBlind * 200,
        max_players: maxPlayers,
        current_players: 0,
        status: 'waiting',
        settings: defaultSettings,
      })
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  /**
   * Update table player count
   */
  async updatePlayerCount(tableId: string, count: number): Promise<void> {
    const { error } = await supabase
      .from('tables')
      .update({ current_players: count })
      .eq('id', tableId);

    if (error) {
      console.error('[TableService] Error updating player count:', error);
    }
  }

  /**
   * Close a table
   * Uses force_close_table_and_refund RPC to gracefully return all chips
   * in the table_seats stack directly back to player_wallets before closing.
   */
  async closeTable(tableId: string): Promise<void> {
    const { data: result, error } = await retryAsync(
      () => supabase.rpc('force_close_table_and_refund', { p_table_id: tableId }),
      3
    );

    if (error) {
      console.error('[TableService] Error closing table and refunding chips:', error);
      // Fallback: manually flag it as closed if the RPC somehow fails
      await supabase.from('tables').update({ status: 'closed' }).eq('id', tableId);
    } else {
      console.debug(`[TableService] Table closed successfully. Result:`, result);
    }
  }

  /**
   * Leave a table - handles full cleanup:
   * 1. Returns remaining chips to player wallet
   * 2. Clears the seat
   * 3. Updates player count
   * 4. Notifies next in waitlist
   */
  async leaveTable(
    tableId: string,
    seatNumber: number,
    userId: string
  ): Promise<{ success: boolean; chipsReturned: number }> {
    try {
      // Get the player's current seat data
      const { data: seat, error: seatError } = await supabase
        .from('table_seats')
        .select('stack, status')
        .eq('table_id', tableId)
        .eq('seat_number', seatNumber)
        .eq('user_id', userId)
        .is('left_at', null)
        .maybeSingle();

      if (seatError || !seat) {
        console.error('[TableService] Seat not found:', seatError);
        return { success: false, chipsReturned: 0 };
      }

      // Check if player is in active hand
      if (seat.status === 'playing') {
        // Mark as sitting out instead of leaving immediately
        await supabase
          .from('table_seats')
          .update({ status: 'sitting_out', leave_pending: true })
          .eq('table_id', tableId)
          .eq('seat_number', seatNumber)
          .is('left_at', null);

        return { success: true, chipsReturned: 0 };
      }

      const chipsToReturn = seat.stack || 0;

      // Get club_id from table (needed for chip credit + tournament leave + transaction log)
      const { data: tableData } = await supabase
        .from('tables')
        .select('club_id, tournament_id')
        .eq('id', tableId)
        .maybeSingle();

      const clubId = tableData?.club_id;
      if (!clubId) {
        console.error('[TableService] Cannot return chips — table has no club_id');
        return { success: false, chipsReturned: 0 };
      }

      let returnedChips = 0;

      // ATOMIC CASH-OUT: Return chips to Player Wallet (ONLY for cash games) and clear seat
      if (!tableData?.tournament_id) {
        const { data: rpcAmount, error: cashoutError } = await retryAsync(
          () =>
            supabase.rpc('atomic_table_cashout', {
              p_user_id: userId,
              p_table_id: tableId,
              p_seat_number: seatNumber,
            }),
          3
        );

        if (cashoutError) {
          console.error('[TableService] Error in atomic_table_cashout:', cashoutError.message);
          return { success: false, chipsReturned: 0 };
        }

        returnedChips = rpcAmount || 0;
        console.debug(
          `[TableService] Returned ${returnedChips} chips to Player Wallet for user ${userId}`
        );
        masterBus.emit('BALANCE_UPDATED', { source: 'table_leave_cashout', userId });
      } else {
        // For tournaments, just clear the seat without crediting wallets
        await supabase
          .from('table_seats')
          .update({ left_at: new Date().toISOString() })
          .eq('table_id', tableId)
          .eq('seat_number', seatNumber)
          .eq('user_id', userId)
          .is('left_at', null);
      }

      // If this is a tournament table, update tournament_players status
      const { data: tblInfo } = await supabase
        .from('tables')
        .select('tournament_id')
        .eq('id', tableId)
        .maybeSingle();

      if (tblInfo?.tournament_id) {
        await supabase
          .from('tournament_players')
          .update({ status: 'eliminated', chips: 0 })
          .eq('tournament_id', tblInfo.tournament_id)
          .eq('user_id', userId);
      }

      // Update player count for TOURNAMENT leaves only
      // (atomic_table_cashout already updates current_players for cash game leaves)
      if (tableData?.tournament_id) {
        const { count } = await supabase
          .from('table_seats')
          .select('*', { count: 'exact', head: true })
          .eq('table_id', tableId)
          .is('left_at', null);

        await this.updatePlayerCount(tableId, count || 0);
      }

      // Check waitlist and notify next player
      const { data: nextWaiter } = await supabase
        .from('table_waitlists')
        .select('user_id')
        .eq('table_id', tableId)
        .order('position', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (nextWaiter) {
        // Send notification to next in waitlist
        await supabase.from('notifications').insert({
          user_id: nextWaiter.user_id,
          type: 'seat_available',
          title: 'Seat Available!',
          message: 'A seat has opened up at your table.',
          data: { table_id: tableId },
        });
      }

      // Record in table history
      await supabase.from('table_activity').insert({
        table_id: tableId,
        user_id: userId,
        action: 'leave',
        chips_cashed_out: chipsToReturn,
      });

      // Note: Transaction already logged via WalletService.logTransaction above

      return { success: true, chipsReturned: chipsToReturn };
    } catch (err) {
      console.error('[TableService] Error leaving table:', err);
      return { success: false, chipsReturned: 0 };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Real-time Subscriptions
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Subscribe to table updates
   */
  subscribeToTable(tableId: string, callback: (table: PokerTable) => void): () => void {
    return subscribeToTable<PokerTable>('tables', callback, {
      column: 'id',
      value: tableId,
    });
  }

  /**
   * Subscribe to hand state updates via Realtime Broadcast
   * (No database table needed — HeadlessTableEngine broadcasts directly)
   */
  subscribeToHand(tableId: string, callback: (hand: HandState) => void): () => void {
    return subscribeToHandState(tableId, (payload) => {
      callback(payload as unknown as HandState);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Statistics
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Get average pot size for a table
   */
  async getAveragePot(tableId: string): Promise<number> {
    // Query hand history for average pot size (last 100 hands)
    const { data, error } = await supabase
      .from('hands')
      .select('pot_size')
      .eq('table_id', tableId)
      .limit(100);

    if (error || !data?.length) return 0;

    const total = data.reduce((sum, h) => sum + (h.pot_size || 0), 0);
    return Math.round(total / data.length);
  }

  /**
   * Get waiting list count
   */
  async getWaitlistCount(tableId: string): Promise<number> {
    const { count, error } = await supabase
      .from('table_waitlists')
      .select('*', { count: 'exact', head: true })
      .eq('table_id', tableId);

    if (error) return 0;
    return count || 0;
  }
  // ═══════════════════════════════════════════════════════════════════════════════
  // Admin Operations — Club owner/admin table controls
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Pause a running table (stops new hands from being dealt)
   */
  async pauseTable(tableId: string): Promise<boolean> {
    const { error } = await supabase
      .from('tables')
      .update({ status: 'paused' })
      .eq('id', tableId)
      .in('status', ['running', 'waiting']);

    if (error) {
      console.error('[TableService] Error pausing table:', error);
      return false;
    }
    return true;
  }

  /**
   * Resume a paused table
   */
  async resumeTable(tableId: string): Promise<boolean> {
    const { error } = await supabase
      .from('tables')
      .update({ status: 'running' })
      .eq('id', tableId)
      .eq('status', 'paused');

    if (error) {
      console.error('[TableService] Error resuming table:', error);
      return false;
    }
    return true;
  }

  /**
   * Kick a player from a table — marks seat as left, returns chips to wallet
   */
  async kickPlayer(tableId: string, userId: string, reason?: string): Promise<boolean> {
    // Get player's current stack
    const { data: seat } = await supabase
      .from('table_seats')
      .select('stack, seat_number')
      .eq('table_id', tableId)
      .eq('user_id', userId)
      .is('left_at', null)
      .maybeSingle();

    if (!seat) return false;

    // Return chips to player wallet
    if (seat.stack > 0) {
      const { error: walletErr } = await retryAsync(
        () =>
          supabase.rpc('credit_player_wallet', {
            p_user_id: userId,
            p_amount: seat.stack,
          }),
        3
      );
      if (walletErr) {
        console.error('[TableService] Error crediting wallet on kick:', walletErr);
        return false;
      }

      // Log the forced cash-out via centralized WalletService RPC
      await WalletService.logTransaction(
        userId,
        'PLAYER',
        seat.stack,
        'credit',
        'cashout',
        `Kicked from table: ${seat.stack} chips returned${reason ? ` (${reason})` : ''}`,
        tableId
      );
      masterBus.emit('BALANCE_UPDATED', { source: 'table_kick_cashout', userId });
    }

    // Mark seat as left
    const { error } = await supabase
      .from('table_seats')
      .update({ left_at: new Date().toISOString() })
      .eq('table_id', tableId)
      .eq('user_id', userId)
      .is('left_at', null);

    if (error) {
      console.error('[TableService] Error kicking player:', error);
      return false;
    }

    // Update player count
    const { count } = await supabase
      .from('table_seats')
      .select('*', { count: 'exact', head: true })
      .eq('table_id', tableId)
      .is('left_at', null);

    await supabase
      .from('tables')
      .update({ current_players: count || 0 })
      .eq('id', tableId);

    return true;
  }

  /**
   * Get seated players for a table (admin view)
   */
  async getSeatedPlayers(tableId: string) {
    const { data, error } = await supabase
      .from('table_seats')
      .select(
        `
                user_id,
                seat_number,
                stack,
                created_at,
                profiles (
                    display_name,
                    username,
                    avatar_url,
                    is_horse
                )
            `
      )
      .eq('table_id', tableId)
      .is('left_at', null)
      .order('seat_number', { ascending: true });

    if (error) {
      console.error('[TableService] Error fetching seated players:', error);
      return [];
    }
    return data || [];
  }

  /**
   * Update table settings live (blinds, ante, max players)
   */
  async updateTableSettings(
    tableId: string,
    settings: {
      small_blind?: number;
      big_blind?: number;
      ante?: number;
      max_players?: number;
    }
  ): Promise<boolean> {
    const { error } = await supabase.from('tables').update(settings).eq('id', tableId);

    if (error) {
      console.error('[TableService] Error updating table settings:', error);
      return false;
    }
    return true;
  }

  /**
   * Get table stats summary (for admin panel)
   */
  async getTableStats(tableId: string) {
    const [rakeData, handData] = await Promise.all([
      supabase.from('rake_history').select('rake_amount').eq('table_id', tableId),
      supabase
        .from('hand_history')
        .select('id', { count: 'exact', head: true })
        .eq('table_id', tableId),
    ]);

    const totalRake = (rakeData.data || []).reduce((sum, r) => sum + (r.rake_amount || 0), 0);
    const totalHands = handData.count || 0;

    return { totalRake, totalHands };
  }
}

export const tableService = new TableService();

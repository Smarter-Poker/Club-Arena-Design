/**
 * ♠ CLUB ARENA — Table Service
 * Manages poker tables and game sessions
 */

import { supabase, subscribeToTable } from '../lib/supabase';
import type { PokerTable, TableSettings, GameVariant, HandState } from '../types/database.types';

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

        const clubIds = clubs.map(c => c.club_id);
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
            .single();

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
            ...settings,
        };

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
            .single();

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
     */
    async closeTable(tableId: string): Promise<void> {
        const { error } = await supabase
            .from('tables')
            .update({ status: 'closed' })
            .eq('id', tableId);

        if (error) {
            console.error('[TableService] Error closing table:', error);
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
                .single();

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
                    .eq('seat_number', seatNumber);

                return { success: true, chipsReturned: 0 };
            }

            const chipsToReturn = seat.stack || 0;

            // Return chips to player wallet
            if (chipsToReturn > 0) {
                const { error: walletError } = await supabase.rpc('add_to_player_wallet', {
                    p_user_id: userId,
                    p_amount: chipsToReturn,
                    p_description: 'Chips cashed out from table'
                });

                if (walletError) {
                    console.error('[TableService] Error returning chips:', walletError);
                    // CRITICAL: Do NOT delete the seat if chip return failed — chips would be lost
                    return { success: false, chipsReturned: 0 };
                }
            }

            // Clear the seat
            const { error: clearError } = await supabase
                .from('table_seats')
                .delete()
                .eq('table_id', tableId)
                .eq('seat_number', seatNumber)
                .eq('user_id', userId);

            if (clearError) {
                console.error('[TableService] Error clearing seat:', clearError);
                return { success: false, chipsReturned: 0 };
            }

            // Update player count
            const { count } = await supabase
                .from('table_seats')
                .select('*', { count: 'exact', head: true })
                .eq('table_id', tableId);

            await this.updatePlayerCount(tableId, count || 0);

            // Check waitlist and notify next player
            const { data: nextWaiter } = await supabase
                .from('table_waitlist')
                .select('user_id')
                .eq('table_id', tableId)
                .order('position', { ascending: true })
                .limit(1)
                .single();

            if (nextWaiter) {
                // Send notification to next in waitlist
                await supabase
                    .from('notifications')
                    .insert({
                        user_id: nextWaiter.user_id,
                        type: 'seat_available',
                        title: 'Seat Available!',
                        message: 'A seat has opened up at your table.',
                        data: { table_id: tableId }
                    });
            }

            // Record in table history
            await supabase
                .from('table_activity')
                .insert({
                    table_id: tableId,
                    user_id: userId,
                    action: 'leave',
                    chips_cashed_out: chipsToReturn
                });

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
    subscribeToTable(
        tableId: string,
        callback: (table: PokerTable) => void
    ): () => void {
        return subscribeToTable<PokerTable>('tables', callback, {
            column: 'id',
            value: tableId,
        });
    }

    /**
     * Subscribe to hand state updates
     */
    subscribeToHand(
        tableId: string,
        callback: (hand: HandState) => void
    ): () => void {
        return subscribeToTable<HandState>('hand_states', callback, {
            column: 'table_id',
            value: tableId,
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
            .from('table_waitlist')
            .select('*', { count: 'exact', head: true })
            .eq('table_id', tableId);

        if (error) return 0;
        return count || 0;
    }
}

export const tableService = new TableService();

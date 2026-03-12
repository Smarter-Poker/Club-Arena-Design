/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CASHOUT SERVICE — Player Chip Cashout Management
 * ═══════════════════════════════════════════════════════════════════════════════
 * Handles:
 * - Player cashout requests (locks chips in escrow)
 * - Agent approval/rejection of cashouts
 * - Player cancellation of pending cashouts
 * - 10-minute reversal window for agent chip sends
 * - 🔔 Agent notifications on new cashout requests
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { supabase } from '../lib/supabase';
import { notificationService } from './NotificationService';
import { WalletService } from './WalletService';
import { ChipFlowService } from './ChipFlowService';
import { FinancialAlertService } from './FinancialAlertService';
import { masterBus } from '../core/MasterBus';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type CashoutStatus = 'pending' | 'approved' | 'completed' | 'cancelled' | 'rejected';

export interface CashoutRequest {
  id: string;
  clubId: string;
  playerId: string;
  playerName?: string;
  playerAvatar?: string;
  agentId: string;
  agentName?: string;
  amount: number;
  status: CashoutStatus;
  playerNote?: string;
  agentNote?: string;
  createdAt: string;
  updatedAt: string;
  acknowledgedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
}

export interface ChipTransaction {
  id: string;
  clubId: string;
  fromUserId?: string;
  toUserId?: string;
  amount: number;
  transactionType: 'send' | 'remove' | 'cashout' | 'escrow_lock' | 'escrow_release';
  relatedCashoutId?: string;
  reversibleUntil?: string;
  isReversed: boolean;
  createdAt: string;
  notes?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class CashoutServiceClass {
  /**
   * Player: Request a cashout (locks chips in escrow)
   */
  async requestCashout(
    playerId: string,
    clubId: string,
    amount: number,
    note?: string
  ): Promise<CashoutRequest | null> {
    // Rate limit: max 1 pending cashout per player per club
    const { data: existing } = await supabase
      .from('cashout_requests')
      .select('id')
      .eq('player_id', playerId)
      .eq('club_id', clubId)
      .eq('status', 'pending')
      .limit(1);

    if (existing && existing.length > 0) {
      throw new Error(
        'You already have a pending cashout for this club. Please wait for it to be processed before requesting another.'
      );
    }

    const { data, error } = await supabase.rpc('fn_request_cashout', {
      p_player_id: playerId,
      p_club_id: clubId,
      p_amount: amount,
      p_note: note || null,
    });

    if (error) {
      console.error('[Cashout] Failed to request cashout:', error);
      throw new Error(error.message || 'Failed to request cashout');
    }

    // Get the created cashout
    const cashout = await this.getCashout(data);

    // 🔔 Notify agent of the new cash-out request (graceful failure)
    if (cashout?.agentId) {
      try {
        await notificationService.notifyCashoutRequest(
          cashout.agentId,
          cashout.playerName || 'A player',
          cashout.amount,
          cashout.clubId,
          cashout.id
        );
      } catch (notifyError) {
        console.warn('[Cashout] Failed to notify agent:', notifyError);
        // Don't fail the cashout if notification fails
      }
    }

    // Emit balance change so Cashier/Wallet pages refresh instantly
    masterBus.emit('BALANCE_UPDATED', {
      source: 'cashout_request',
      userId: playerId,
      amount: -amount,
    });

    return cashout;
  }

  /**
   * Player: Cancel a pending cashout (returns chips from escrow)
   */
  async cancelCashout(cashoutId: string, playerId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('fn_cancel_cashout', {
      p_cashout_id: cashoutId,
      p_player_id: playerId,
    });

    if (error) {
      console.error('[Cashout] Failed to cancel cashout:', error);
      throw new Error(error.message || 'Failed to cancel cashout');
    }

    // Emit balance change — chips returned from escrow
    masterBus.emit('BALANCE_UPDATED', { source: 'cashout_cancel', userId: playerId });

    return data === true;
  }

  /**
   * Agent: Approve a cashout request
   */
  async approveCashout(cashoutId: string, agentId: string, note?: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('fn_agent_approve_cashout', {
      p_cashout_id: cashoutId,
      p_agent_id: agentId,
      p_note: note || null,
    });

    if (error) {
      console.error('[Cashout] Failed to approve cashout:', error);
      throw new Error(error.message || 'Failed to approve cashout');
    }

    return data === true;
  }

  /**
   * Agent: Complete a cashout (removes chips from escrow)
   */
  async completeCashout(cashoutId: string, agentId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('fn_complete_cashout', {
      p_cashout_id: cashoutId,
      p_agent_id: agentId,
    });

    if (error) {
      console.error('[Cashout] Failed to complete cashout:', error);
      throw new Error(error.message || 'Failed to complete cashout');
    }

    return data === true;
  }

  /**
   * Agent: Reject a cashout request (returns chips to player)
   */
  async rejectCashout(cashoutId: string, agentId: string, reason?: string): Promise<boolean> {
    // Get cashout details first
    const cashout = await this.getCashout(cashoutId);
    if (!cashout || cashout.agentId !== agentId || cashout.status !== 'pending') {
      throw new Error('Cashout not found or not rejectable');
    }

    // STEP 1: Return chips to Player Wallet FIRST — must succeed before changing any state
    const { error: balanceError } = await supabase.rpc('credit_player_wallet', {
      p_user_id: cashout.playerId,
      p_amount: cashout.amount,
    });

    if (balanceError) {
      console.error(
        '[Cashout] CRITICAL: Failed to return chips to Player Wallet — aborting rejection:',
        balanceError
      );
      FinancialAlertService.logCritical(
        'CashoutService',
        'Failed to return chips during cashout rejection',
        {
          cashoutId,
          playerId: cashout.playerId,
          amount: cashout.amount,
          error: balanceError.message,
        }
      );
      throw new Error('Cannot reject: chip return failed. Cashout remains pending.');
    }

    // Log wallet transaction for audit trail
    await WalletService.logTransaction(
      cashout.playerId,
      'PLAYER',
      cashout.amount,
      'credit',
      'refund',
      `Cashout rejected by agent — chips returned`,
      undefined,
      undefined,
      cashoutId
    );

    // STEP 2: Update status to rejected (chips already returned)
    const { error: updateError } = await supabase
      .from('cashout_requests')
      .update({
        status: 'rejected',
        agent_note: reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cashoutId);

    if (updateError) {
      console.error('[Cashout] Status update failed after chip return:', updateError);
    }

    // STEP 3: Release escrow
    const { error: escrowError } = await supabase
      .from('chip_escrow')
      .update({
        released_at: new Date().toISOString(),
        release_type: 'rejected',
      })
      .eq('cashout_request_id', cashoutId);

    if (escrowError) {
      console.error('[Cashout] Failed to release escrow:', escrowError);
    }

    // Emit balance change — chips returned to player from rejected cashout
    masterBus.emit('BALANCE_UPDATED', {
      source: 'cashout_reject',
      userId: cashout.playerId,
      amount: cashout.amount,
    });

    return true;
  }

  /**
   * Get a single cashout by ID
   */
  async getCashout(cashoutId: string): Promise<CashoutRequest | null> {
    const { data, error } = await supabase
      .from('cashout_requests')
      .select(
        `
                *,
                player:player_id(display_name, avatar_url),
                agent:agent_id(display_name)
            `
      )
      .eq('id', cashoutId)
      .maybeSingle();

    if (error || !data) return null;

    return this.mapCashout(data);
  }

  /**
   * Get pending cashouts for an agent
   */
  async getAgentPendingCashouts(agentId: string, clubId?: string): Promise<CashoutRequest[]> {
    let query = supabase
      .from('cashout_requests')
      .select(
        `
                *,
                player:player_id(display_name, avatar_url),
                agent:agent_id(display_name)
            `
      )
      .eq('agent_id', agentId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (clubId) {
      query = query.eq('club_id', clubId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Cashout] Failed to get agent cashouts:', error);
      return [];
    }

    return (data || []).map((d) => this.mapCashout(d));
  }

  /**
   * Get cashouts for a player
   */
  async getPlayerCashouts(playerId: string, clubId?: string): Promise<CashoutRequest[]> {
    let query = supabase
      .from('cashout_requests')
      .select(
        `
                *,
                player:player_id(display_name, avatar_url),
                agent:agent_id(display_name)
            `
      )
      .eq('player_id', playerId)
      .order('created_at', { ascending: false });

    if (clubId) {
      query = query.eq('club_id', clubId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Cashout] Failed to get player cashouts:', error);
      return [];
    }

    return (data || []).map((d) => this.mapCashout(d));
  }

  /**
   * Agent: Check if chips can be removed (within 10 min window)
   */
  async canRemoveChips(
    agentId: string,
    playerId: string,
    clubId: string,
    amount: number
  ): Promise<boolean> {
    const { data, error } = await supabase.rpc('fn_can_agent_remove_chips', {
      p_agent_id: agentId,
      p_player_id: playerId,
      p_club_id: clubId,
      p_amount: amount,
    });

    if (error) {
      console.error('[Cashout] Failed to check remove permission:', error);
      return false;
    }

    return data === true;
  }

  /**
   * Agent: Send chips to player (with 10-min reversal window)
   * Uses ChipFlowService for proper atomic wallet debit/credit with audit trail.
   */
  async sendChipsToPlayer(
    agentId: string,
    playerId: string,
    clubId: string,
    amount: number,
    notes?: string
  ): Promise<boolean> {
    // Use ChipFlowService for proper atomic transfer (deducts from agent, credits player)
    await ChipFlowService.transfer(
      agentId,
      playerId,
      amount,
      'transfer',
      notes || 'Agent sent chips to player via Cashier'
    );

    // Record reversal window metadata in chip_transactions
    const reversibleUntil = new Date();
    reversibleUntil.setMinutes(reversibleUntil.getMinutes() + 10);

    const { error: txError } = await supabase.from('chip_transactions').insert({
      club_id: clubId,
      from_user_id: agentId,
      to_user_id: playerId,
      amount,
      transaction_type: 'send',
      metadata: { reversible_until: reversibleUntil.toISOString() },
      notes,
    });

    if (txError) {
      console.warn('[Cashout] Failed to record reversal metadata (transfer succeeded):', txError);
    }

    return true;
  }

  /**
   * Agent: Remove chips from player (only within 10-min window)
   * Reverses the transfer: deducts from player, credits back to agent.
   */
  async removeChipsFromPlayer(
    agentId: string,
    playerId: string,
    clubId: string,
    amount: number,
    notes?: string
  ): Promise<boolean> {
    // Check if within reversal window
    const canRemove = await this.canRemoveChips(agentId, playerId, clubId, amount);
    if (!canRemove) {
      throw new Error(
        'Cannot remove chips: Outside 10-minute window or insufficient reversible amount'
      );
    }

    // Use ChipFlowService for proper atomic transfer (deducts from player, credits agent)
    await ChipFlowService.transfer(
      playerId,
      agentId,
      amount,
      'refund',
      notes || 'Agent reversed chip send within 10-minute window'
    );

    // Mark original transaction as reversed via metadata
    const { error: reverseError } = await supabase
      .from('chip_transactions')
      .update({ metadata: { is_reversed: true } })
      .eq('from_user_id', agentId)
      .eq('to_user_id', playerId)
      .eq('club_id', clubId)
      .eq('transaction_type', 'send')
      .limit(1);

    if (reverseError) {
      console.warn('[Cashout] Failed to mark reversal metadata:', reverseError);
    }

    // Record removal in chip_transactions for reversal tracking
    const { error: txError } = await supabase.from('chip_transactions').insert({
      club_id: clubId,
      from_user_id: playerId,
      to_user_id: agentId,
      amount,
      transaction_type: 'remove',
      notes: notes || 'Agent removed chips within 10-minute window',
    });

    if (txError) {
      console.warn('[Cashout] Failed to record removal metadata:', txError);
    }

    return true;
  }

  /**
   * Map database record to CashoutRequest
   */
  private mapCashout(data: Record<string, unknown>): CashoutRequest {
    return {
      id: data.id as string,
      clubId: data.club_id as string,
      playerId: data.player_id as string,
      playerName: (data.player as Record<string, unknown>)?.display_name as string,
      playerAvatar: (data.player as Record<string, unknown>)?.avatar_url as string,
      agentId: data.agent_id as string,
      agentName: (data.agent as Record<string, unknown>)?.display_name as string,
      amount: data.amount as number,
      status: data.status as CashoutStatus,
      playerNote: data.player_note as string,
      agentNote: data.agent_note as string,
      createdAt: data.created_at as string,
      updatedAt: data.updated_at as string,
      acknowledgedAt: data.acknowledged_at as string,
      completedAt: data.completed_at as string,
      cancelledAt: data.cancelled_at as string,
    };
  }
}

// Export singleton
export const cashoutService = new CashoutServiceClass();

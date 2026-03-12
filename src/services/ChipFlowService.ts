/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CHIP FLOW SERVICE — Hierarchical Chip Distribution
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Manages the complete chip flow hierarchy:
 *   Union Owner → Club → Agent → Player
 *
 * Every chip movement is logged as a wallet_transaction with full traceability.
 * Chips originate from the Union Owner and flow down through the hierarchy.
 *
 * KEY RULES:
 * - Club owners can send chips directly to any player
 * - Agents fund their players from their own PLAYER wallet
 * - Every single transfer is logged with sender, receiver, amount, and reason
 * - Exact cent precision: Math.trunc(value * 100) / 100
 * - No rounding anywhere — exact numbers only
 */

import { supabase } from '../lib/supabase';
import { WalletService } from './WalletService';
import { masterBus } from '../core/MasterBus';
import { FinancialAlertService } from './FinancialAlertService';
import { retryAsync } from '../utils/retryAsync';

// Exact cent precision — never round
const exact = (v: number): number => Math.trunc(v * 100) / 100;

export interface ChipTransferResult {
  success: boolean;
  amount: number;
  fromBalance: number;
  toBalance: number;
  transactionIds: string[];
}

export const ChipFlowService = {
  // ─────────────────────────────────────────────────────────────────────────────
  // CORE TRANSFER: Any user → Any user (PLAYER wallet)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Transfer chips between two users with full audit trail.
   * Uses atomic RPCs for debit/credit to prevent race conditions.
   */
  async transfer(
    fromUserId: string,
    toUserId: string,
    amount: number,
    category: string,
    description: string,
    relatedEntityId?: string
  ): Promise<ChipTransferResult> {
    const amt = exact(amount);
    if (amt <= 0) throw new Error('Transfer amount must be positive');

    // RATE LIMIT: Max 10 transfers per user per 60 seconds
    const { data: recentTransfers } = await supabase
      .from('wallet_transactions')
      .select('id')
      .eq('user_id', fromUserId)
      .eq('category', 'transfer')
      .gte('created_at', new Date(Date.now() - 60_000).toISOString())
      .limit(11);

    if (recentTransfers && recentTransfers.length >= 10) {
      throw new Error(
        'Transfer rate limit exceeded — max 10 transfers per minute. Please wait and try again.'
      );
    }

    // LARGE TRANSACTION ALERT: Log warning for transfers ≥ 50,000 chips
    if (amt >= 50_000) {
      FinancialAlertService.logWarning(
        'ChipFlowService',
        `Large transfer: ${amt.toLocaleString()} chips from ${fromUserId.slice(0, 8)} to ${toUserId.slice(0, 8)}`,
        { fromUserId, toUserId, amount: amt, category, description }
      );
    }

    // 1. Deduct from sender's PLAYER wallet
    const { data: deductResult, error: deductErr } = await retryAsync(
      () =>
        supabase.rpc('deduct_player_wallet', {
          p_user_id: fromUserId,
          p_amount: amt,
        }),
      3
    );

    if (deductErr) throw new Error(`Deduct failed: ${deductErr.message}`);
    if (deductResult === false) throw new Error('Insufficient balance for transfer');

    // 2. Credit to receiver's PLAYER wallet (BEFORE logging — keep audit trail clean on rollback)
    const { error: creditErr } = await retryAsync(
      () =>
        supabase.rpc('credit_player_wallet', {
          p_user_id: toUserId,
          p_amount: amt,
        }),
      3
    );

    if (creditErr) {
      // Rollback: re-credit sender — no audit trail was written yet, so rollback is clean
      const { error: rollbackErr } = await retryAsync(
        () =>
          supabase.rpc('credit_player_wallet', {
            p_user_id: fromUserId,
            p_amount: amt,
          }),
        3
      );
      if (rollbackErr)
        console.error(
          `[ChipFlowService] CRITICAL: Rollback failed for ${fromUserId.slice(0, 8)} — ${amt} chips lost: ${rollbackErr.message}`
        );
      throw new Error(`Credit failed (rolled back): ${creditErr.message}`);
    }

    // 3. Both wallet ops succeeded — NOW log the audit trail
    await WalletService.logTransaction(
      fromUserId,
      'PLAYER',
      amt,
      'debit',
      category,
      description,
      undefined,
      undefined,
      relatedEntityId || toUserId
    );

    await WalletService.logTransaction(
      toUserId,
      'PLAYER',
      amt,
      'credit',
      category,
      description,
      undefined,
      undefined,
      relatedEntityId || fromUserId
    );

    // 4. Emit bus events so CashierPage/PlayerWallet pages refresh for BOTH parties
    masterBus.emit('BALANCE_UPDATED', {
      source: 'chip_transfer',
      userId: fromUserId,
      amount: -amt,
    });
    masterBus.emit('BALANCE_UPDATED', { source: 'chip_transfer', userId: toUserId, amount: amt });

    // 5. Get final balances
    const { data: fromWallet } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', fromUserId)
      .eq('wallet_type', 'PLAYER')
      .maybeSingle();

    const { data: toWallet } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', toUserId)
      .eq('wallet_type', 'PLAYER')
      .maybeSingle();

    return {
      success: true,
      amount: amt,
      fromBalance: fromWallet?.balance || 0,
      toBalance: toWallet?.balance || 0,
      transactionIds: [],
    };
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // HIERARCHY TRANSFERS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Union Owner → Club Owner
   * Chips originate from the union owner's wallet and flow to the club owner.
   * The union owner and club owner may be the same person (like KingFish).
   */
  async unionToClub(
    unionOwnerId: string,
    clubOwnerId: string,
    clubId: string,
    amount: number,
    clubName: string
  ): Promise<ChipTransferResult> {
    // If same person, log a single internal allocation note (no wallet movement needed)
    if (unionOwnerId === clubOwnerId) {
      await WalletService.logTransaction(
        unionOwnerId,
        'PLAYER',
        exact(amount),
        'credit',
        'transfer',
        `Union → Club ${clubName}: internal allocation (same owner)`,
        undefined,
        undefined,
        clubId
      );

      // Return real balance instead of zeros
      const { data: wallet } = await supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', unionOwnerId)
        .eq('wallet_type', 'PLAYER')
        .maybeSingle();

      return {
        success: true,
        amount: exact(amount),
        fromBalance: wallet?.balance || 0,
        toBalance: wallet?.balance || 0,
        transactionIds: [],
      };
    }

    return this.transfer(
      unionOwnerId,
      clubOwnerId,
      amount,
      'transfer',
      `Union → Club ${clubName}: chip allocation`,
      clubId
    );
  },

  /**
   * Club Owner → Agent
   * Club owner funds an agent's PLAYER wallet for distribution to their players.
   */
  async clubToAgent(
    clubOwnerId: string,
    agentUserId: string,
    clubId: string,
    amount: number,
    agentName: string,
    clubName: string
  ): Promise<ChipTransferResult> {
    return this.transfer(
      clubOwnerId,
      agentUserId,
      amount,
      'transfer',
      `${clubName} → Agent ${agentName}: player funding allocation`,
      clubId
    );
  },

  /**
   * Agent → Player
   * Agent funds a player under them from their own PLAYER wallet.
   */
  async agentToPlayer(
    agentUserId: string,
    playerId: string,
    amount: number,
    agentName: string,
    playerName: string,
    clubName: string
  ): Promise<ChipTransferResult> {
    return this.transfer(
      agentUserId,
      playerId,
      amount,
      'transfer',
      `Agent ${agentName} → ${playerName}: player funding (${clubName})`,
      agentUserId
    );
  },

  /**
   * Club Owner → Player (direct)
   * Club owners can send chips directly to any player, bypassing agents.
   */
  async clubToPlayer(
    clubOwnerId: string,
    playerId: string,
    amount: number,
    playerName: string,
    clubName: string
  ): Promise<ChipTransferResult> {
    return this.transfer(
      clubOwnerId,
      playerId,
      amount,
      'transfer',
      `${clubName} Owner → ${playerName}: direct player funding`,
      clubOwnerId
    );
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // MINTING (System → Union Owner)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Mint chips to the Union Owner's wallet.
   * This is the origin point of ALL chips in the system.
   *
   * RULE: Once a club joins a union, minting is LOCKED at the club level.
   * Only the Union owner can mint. Standalone clubs (no union) can still mint directly.
   */
  async mintToUnionOwner(
    unionOwnerId: string,
    amount: number,
    unionId: string,
    reason: string = 'System chip mint for union distribution'
  ): Promise<number> {
    const amt = exact(amount);

    const { error } = await retryAsync(
      () =>
        supabase.rpc('credit_player_wallet', {
          p_user_id: unionOwnerId,
          p_amount: amt,
        }),
      3
    );

    if (error) throw new Error(`Mint failed: ${error.message}`);

    await WalletService.logTransaction(
      unionOwnerId,
      'PLAYER',
      amt,
      'credit',
      'mint',
      reason,
      undefined,
      undefined,
      unionId
    );

    // Return new balance
    const { data: wallet } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', unionOwnerId)
      .eq('wallet_type', 'PLAYER')
      .maybeSingle();

    return wallet?.balance || 0;
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // BALANCE RESET (for re-initialization)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Reset a user's PLAYER wallet balance to 0 with audit trail.
   * Used when re-initializing the funding chain.
   */
  async resetBalance(
    userId: string,
    reason: string = 'Balance reset for proper funding chain'
  ): Promise<number> {
    const { data: wallet } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', userId)
      .eq('wallet_type', 'PLAYER')
      .maybeSingle();

    const currentBalance = wallet?.balance || 0;

    if (currentBalance > 0) {
      await supabase
        .from('wallets')
        .update({ balance: 0 })
        .eq('user_id', userId)
        .eq('wallet_type', 'PLAYER');

      await WalletService.logTransaction(
        userId,
        'PLAYER',
        currentBalance,
        'debit',
        'settlement',
        reason
      );
    }

    return currentBalance;
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // LEDGER QUERIES
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get the complete chip flow trail for a user — every transaction that funded them.
   */
  async getChipTrail(userId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  /**
   * Verify ledger integrity: total minted should equal total in circulation.
   */
  async verifyLedger(): Promise<{
    totalMinted: number;
    totalInWallets: number;
    totalInLockedBalance: number;
    difference: number;
    isBalanced: boolean;
  }> {
    // 1. First try the hardened RPC for massive tables
    const { data: rpcData, error: rpcError } = await supabase.rpc('verify_ledger_totals');

    if (!rpcError && rpcData) {
      const difference = exact(
        rpcData.total_minted - rpcData.total_in_wallets - rpcData.total_locked
      );
      return {
        totalMinted: exact(rpcData.total_minted),
        totalInWallets: exact(rpcData.total_in_wallets),
        totalInLockedBalance: exact(rpcData.total_locked),
        difference,
        isBalanced: Math.abs(difference) < 0.01,
      };
    }

    // 2. Fallback to paginated client-side aggregation if RPC is missing
    let totalMinted = 0;
    let hasMoreMints = true;
    let offsetMints = 0;

    while (hasMoreMints) {
      const { data: mints, error } = await supabase
        .from('wallet_transactions')
        .select('amount')
        .eq('type', 'credit')
        .eq('category', 'mint')
        .range(offsetMints, offsetMints + 999);

      if (error || !mints) break;
      totalMinted += mints.reduce((s, t) => s + Number(t.amount), 0);

      if (mints.length < 1000) hasMoreMints = false;
      else offsetMints += 1000;
    }

    let totalInWallets = 0;
    let totalInLockedBalance = 0;
    let hasMoreWallets = true;
    let offsetWallets = 0;

    while (hasMoreWallets) {
      const { data: wallets, error } = await supabase
        .from('wallets')
        .select('balance, locked_balance')
        .range(offsetWallets, offsetWallets + 999);

      if (error || !wallets) break;
      totalInWallets += wallets.reduce((s, w) => s + Number(w.balance || 0), 0);
      totalInLockedBalance += wallets.reduce((s, w) => s + Number(w.locked_balance || 0), 0);

      if (wallets.length < 1000) hasMoreWallets = false;
      else offsetWallets += 1000;
    }

    const difference = exact(totalMinted - totalInWallets - totalInLockedBalance);

    return {
      totalMinted: exact(totalMinted),
      totalInWallets: exact(totalInWallets),
      totalInLockedBalance: exact(totalInLockedBalance),
      difference,
      isBalanced: Math.abs(difference) < 0.01,
    };
  },

  /**
   * Run ledger reconciliation — verifies total minted equals total in circulation.
   * If imbalanced, fires a CRITICAL financial alert for ops investigation.
   * Designed to be called from a cron/edge function on a daily schedule.
   */
  async runReconciliation(): Promise<{
    isBalanced: boolean;
    difference: number;
  }> {
    const result = await this.verifyLedger();

    if (!result.isBalanced) {
      await FinancialAlertService.logCritical(
        'ChipFlowService.reconciliation',
        `Ledger imbalance detected: ${result.difference.toFixed(2)} chips unaccounted for`,
        {
          totalMinted: result.totalMinted,
          totalInWallets: result.totalInWallets,
          totalInLockedBalance: result.totalInLockedBalance,
          difference: result.difference,
        }
      );
    } else {
      console.debug(
        `[Reconciliation] ✅ Ledger balanced: ${result.totalMinted.toLocaleString()} minted, ` +
          `${result.totalInWallets.toLocaleString()} in wallets, ${result.totalInLockedBalance.toLocaleString()} locked`
      );
    }

    return { isBalanced: result.isBalanced, difference: result.difference };
  },
};

export default ChipFlowService;

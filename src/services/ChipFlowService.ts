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

        const txIds: string[] = [];

        // 1. Deduct from sender's PLAYER wallet
        const { data: deductResult, error: deductErr } = await supabase.rpc('deduct_player_wallet', {
            p_user_id: fromUserId,
            p_amount: amt,
        });

        if (deductErr) throw new Error(`Deduct failed: ${deductErr.message}`);
        if (deductResult === false) throw new Error('Insufficient balance for transfer');

        // Log sender debit
        await WalletService.logTransaction(
            fromUserId, 'PLAYER', amt, 'debit', category,
            description, undefined, undefined, relatedEntityId || toUserId
        );

        // 2. Credit to receiver's PLAYER wallet
        const { error: creditErr } = await supabase.rpc('credit_player_wallet', {
            p_user_id: toUserId,
            p_amount: amt,
        });

        if (creditErr) {
            // Rollback: re-credit sender
            const { error: rollbackErr } = await supabase.rpc('credit_player_wallet', { p_user_id: fromUserId, p_amount: amt });
            if (rollbackErr) console.error(`[ChipFlowService] CRITICAL: Rollback failed for ${fromUserId.slice(0, 8)} — ${amt} chips lost: ${rollbackErr.message}`);
            throw new Error(`Credit failed (rolled back): ${creditErr.message}`);
        }

        // Log receiver credit
        await WalletService.logTransaction(
            toUserId, 'PLAYER', amt, 'credit', category,
            description, undefined, undefined, relatedEntityId || fromUserId
        );

        // Get final balances
        const { data: fromWallet } = await supabase
            .from('wallets')
            .select('balance')
            .eq('user_id', fromUserId)
            .eq('wallet_type', 'PLAYER')
            .single();

        const { data: toWallet } = await supabase
            .from('wallets')
            .select('balance')
            .eq('user_id', toUserId)
            .eq('wallet_type', 'PLAYER')
            .single();

        return {
            success: true,
            amount: amt,
            fromBalance: fromWallet?.balance || 0,
            toBalance: toWallet?.balance || 0,
            transactionIds: txIds,
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
        // If same person, just log the allocation (no actual transfer needed)
        if (unionOwnerId === clubOwnerId) {
            await WalletService.logTransaction(
                unionOwnerId, 'PLAYER', exact(amount), 'debit', 'transfer',
                `Union allocation to ${clubName}: internal ledger entry`,
                undefined, undefined, clubId
            );
            await WalletService.logTransaction(
                clubOwnerId, 'PLAYER', exact(amount), 'credit', 'transfer',
                `Club ${clubName} funded by Union: internal ledger entry`,
                undefined, undefined, clubId
            );

            return {
                success: true,
                amount: exact(amount),
                fromBalance: 0,
                toBalance: 0,
                transactionIds: [],
            };
        }

        return this.transfer(
            unionOwnerId, clubOwnerId, amount, 'transfer',
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
            clubOwnerId, agentUserId, amount, 'transfer',
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
            agentUserId, playerId, amount, 'transfer',
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
            clubOwnerId, playerId, amount, 'transfer',
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

        const { error } = await supabase.rpc('credit_player_wallet', {
            p_user_id: unionOwnerId,
            p_amount: amt,
        });

        if (error) throw new Error(`Mint failed: ${error.message}`);

        await WalletService.logTransaction(
            unionOwnerId, 'PLAYER', amt, 'credit', 'mint',
            reason, undefined, undefined, unionId
        );

        // Return new balance
        const { data: wallet } = await supabase
            .from('wallets')
            .select('balance')
            .eq('user_id', unionOwnerId)
            .eq('wallet_type', 'PLAYER')
            .single();

        return wallet?.balance || 0;
    },

    // ─────────────────────────────────────────────────────────────────────────────
    // BALANCE RESET (for re-initialization)
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Reset a user's PLAYER wallet balance to 0 with audit trail.
     * Used when re-initializing the funding chain.
     */
    async resetBalance(userId: string, reason: string = 'Balance reset for proper funding chain'): Promise<number> {
        const { data: wallet } = await supabase
            .from('wallets')
            .select('balance')
            .eq('user_id', userId)
            .eq('wallet_type', 'PLAYER')
            .single();

        const currentBalance = wallet?.balance || 0;

        if (currentBalance > 0) {
            await supabase
                .from('wallets')
                .update({ balance: 0 })
                .eq('user_id', userId)
                .eq('wallet_type', 'PLAYER');

            await WalletService.logTransaction(
                userId, 'PLAYER', currentBalance, 'debit', 'settlement',
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
        // Get total minted (all 'mint' category credits)
        const { data: mints } = await supabase
            .from('wallet_transactions')
            .select('amount')
            .eq('type', 'credit')
            .eq('category', 'mint');

        const totalMinted = (mints || []).reduce((s, t) => s + Number(t.amount), 0);

        // Get total in all wallets
        const { data: wallets } = await supabase
            .from('wallets')
            .select('balance, locked_balance');

        const totalInWallets = (wallets || []).reduce((s, w) => s + Number(w.balance), 0);
        const totalInLockedBalance = (wallets || []).reduce((s, w) => s + Number(w.locked_balance), 0);

        const difference = exact(totalMinted - totalInWallets - totalInLockedBalance);

        return {
            totalMinted: exact(totalMinted),
            totalInWallets: exact(totalInWallets),
            totalInLockedBalance: exact(totalInLockedBalance),
            difference,
            isBalanced: Math.abs(difference) < 0.01,
        };
    },
};

export default ChipFlowService;

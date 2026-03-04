/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  WALLET SERVICE — Complete Triple-Wallet System
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Core financial operations for Club Arena.
 * Implements the Triple-Wallet architecture:
 * - BUSINESS Wallet: Commissions, settlements, withdrawals
 * - PLAYER Wallet: Table buy-ins, gameplay chips
 * - PROMO Wallet: Bonuses, giveaways, leaderboard rewards
 *
 * 75% Cheaper Law: 38 Diamonds = 100 Chips
 */

import { supabase } from '../lib/supabase';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type WalletType = 'BUSINESS' | 'PLAYER' | 'PROMO';

export interface WalletBalance {
    userId: string;
    walletType: WalletType;
    balance: number;
    lockedBalance: number; // Chips currently at tables
    availableBalance: number;
    lastUpdated: string;
}

export interface TransferRequest {
    fromWallet: WalletType;
    toWallet: WalletType;
    amount: number;
    note?: string;
}

export interface TransactionRecord {
    id: string;
    userId: string;
    walletType: WalletType;
    amount: number;
    type: 'credit' | 'debit';
    category: 'mint' | 'transfer' | 'buyin' | 'cashout' | 'rake' | 'commission' | 'promo' | 'settlement';
    description: string;
    relatedEntityId?: string;
    createdAt: string;
}

export interface ChipMintResult {
    success: boolean;
    chipsAdded: number;
    diamondsSpent: number;
    newBalance: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export const WalletService = {
    // ─────────────────────────────────────────────────────────────────────────────
    // BALANCE QUERIES
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Get all wallet balances for a user
     */
    async getBalances(userId: string): Promise<WalletBalance[]> {
        const { data, error } = await supabase
            .from('player_wallets')
            .select('*')
            .eq('user_id', userId);

        if (error) throw error;
        return (data || []).map(w => ({
            userId: w.user_id,
            walletType: w.wallet_type as WalletType,
            balance: w.balance,
            lockedBalance: w.locked_balance,
            availableBalance: w.balance - w.locked_balance,
            lastUpdated: w.updated_at,
        }));
    },

    /**
     * Get specific wallet balance
     */
    async getWalletBalance(userId: string, walletType: WalletType): Promise<WalletBalance> {
        const balances = await this.getBalances(userId);
        const wallet = balances.find(b => b.walletType === walletType);
        if (!wallet) throw new Error(`Wallet ${walletType} not found for user ${userId}`);
        return wallet;
    },

    /**
     * Get total available chips across all wallets
     */
    async getTotalAvailable(userId: string): Promise<number> {
        const balances = await this.getBalances(userId);
        return balances.reduce((sum, w) => sum + w.availableBalance, 0);
    },

    // ─────────────────────────────────────────────────────────────────────────────
    // CHIP MINTING
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Mint chips using diamonds (Club Owner Only)
     * 75% Cheaper Law: 38 Diamonds = 100 Chips
     */
    async mintChips(clubId: string, chipAmount: number): Promise<ChipMintResult> {
        // Calculate diamond cost
        const diamondCost = Math.ceil((chipAmount / 100) * 38);

        const { data, error } = await supabase.rpc('mint_club_chips', {
            p_club_id: clubId,
            p_chips: chipAmount,
            p_diamonds: diamondCost,
        });

        if (error) throw error;
        return {
            success: true,
            chipsAdded: chipAmount,
            diamondsSpent: diamondCost,
            newBalance: data.new_balance,
        };
    },

    // ─────────────────────────────────────────────────────────────────────────────
    // TRANSFERS
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Transfer funds between wallets (same user)
     */
    async internalTransfer(userId: string, request: TransferRequest): Promise<boolean> {
        if (request.amount <= 0) throw new Error('Transfer amount must be positive');
        if (request.fromWallet === request.toWallet) throw new Error('Cannot transfer to same wallet');

        const { error } = await supabase.rpc('wallet_internal_transfer', {
            p_user_id: userId,
            p_from_wallet: request.fromWallet,
            p_to_wallet: request.toWallet,
            p_amount: request.amount,
            p_note: request.note || null,
        });

        if (error) throw error;
        return true;
    },

    /**
     * Agent self-transfer: Business → Player (to play at tables)
     */
    async agentSelfTransfer(agentId: string, amount: number): Promise<boolean> {
        return this.internalTransfer(agentId, {
            fromWallet: 'BUSINESS',
            toWallet: 'PLAYER',
            amount,
            note: 'Agent self-transfer for gameplay',
        });
    },

    /**
     * Transfer chips to another user
     */
    async transferToUser(
        fromUserId: string,
        toUserId: string,
        amount: number,
        fromWallet: WalletType = 'PLAYER',
        toWallet: WalletType = 'PLAYER'
    ): Promise<boolean> {
        if (amount <= 0) throw new Error('Transfer amount must be positive');

        const { error } = await supabase.rpc('wallet_user_transfer', {
            p_from_user_id: fromUserId,
            p_to_user_id: toUserId,
            p_amount: amount,
            p_from_wallet: fromWallet,
            p_to_wallet: toWallet,
        });

        if (error) throw error;
        return true;
    },

    // ─────────────────────────────────────────────────────────────────────────────
    // PROMO DISTRIBUTION
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Distribute promo chips to a player
     */
    async distributePromo(agentId: string, playerId: string, amount: number): Promise<boolean> {
        if (amount <= 0) throw new Error('Amount must be positive');

        const { error } = await supabase.rpc('distribute_promo_chips', {
            p_agent_id: agentId,
            p_player_id: playerId,
            p_amount: amount,
        });

        if (error) throw error;
        return true;
    },

    /**
     * Bulk promo distribution (leaderboard rewards, etc.)
     */
    async bulkDistributePromo(
        agentId: string,
        distributions: Array<{ playerId: string; amount: number }>
    ): Promise<{ success: number; failed: number }> {
        let success = 0;
        let failed = 0;

        for (const dist of distributions) {
            try {
                await this.distributePromo(agentId, dist.playerId, dist.amount);
                success++;
            } catch {
                failed++;
            }
        }

        return { success, failed };
    },

    // ─────────────────────────────────────────────────────────────────────────────
    // TABLE OPERATIONS
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Lock chips for table buy-in
     * Deducts from club_members.chip_balance for the user's club membership
     */
    async lockForBuyIn(userId: string, tableId: string, amount: number): Promise<boolean> {
        // 1. Get the table's club_id
        const { data: tableData, error: tableError } = await supabase
            .from('tables')
            .select('club_id')
            .eq('id', tableId)
            .single();

        if (tableError || !tableData?.club_id) {
            console.error('[WalletService] Failed to get table club_id:', tableError);
            throw new Error('Table not found');
        }

        // 2. Atomically deduct chips using RPC to prevent race conditions
        // This single RPC call checks balance AND deducts in one atomic DB operation
        const { data: rpcResult, error: rpcError } = await supabase.rpc('lock_chips_for_table', {
            p_user_id: userId,
            p_club_id: tableData.club_id,
            p_table_id: tableId,
            p_amount: amount,
        });

        if (rpcError) {
            console.warn('[WalletService] RPC lock_chips_for_table failed:', rpcError.message, '— falling back to direct deduction');
            // RPC failed (permission denied or doesn't exist) — use direct table update fallback
            return this.lockForBuyInFallback(userId, tableData.club_id, amount);
        }

        if (rpcResult === false) {
            throw new Error('Insufficient chips for buy-in');
        }

        console.log(`[WalletService] Buy-in: ${amount} chips deducted atomically for user ${userId}`);
        return true;
    },

    /**
     * Fallback buy-in deduction (used if RPC doesn't exist).
     * Uses .gte() guard to prevent double-spend race conditions —
     * the UPDATE only succeeds if chip_balance >= amount at execution time.
     */
    async lockForBuyInFallback(userId: string, clubId: string, amount: number): Promise<boolean> {
        // Read current balance first for the subtraction value
        const { data: memberData, error: memberError } = await supabase
            .from('club_members')
            .select('chip_balance')
            .eq('club_id', clubId)
            .eq('user_id', userId)
            .single();

        if (memberError || !memberData) {
            throw new Error('Not a member of this club');
        }

        const currentBalance = memberData.chip_balance || 0;
        if (currentBalance < amount) {
            throw new Error(`Insufficient chips: have ${currentBalance}, need ${amount}`);
        }

        // CRITICAL: .gte('chip_balance', amount) acts as an atomic guard.
        // If a concurrent transaction reduced the balance below `amount`,
        // this update will match 0 rows and `count` will be 0.
        const { error: updateError, count } = await supabase
            .from('club_members')
            .update({ chip_balance: currentBalance - amount })
            .eq('club_id', clubId)
            .eq('user_id', userId)
            .gte('chip_balance', amount);

        if (updateError) {
            throw new Error('Failed to deduct chips for buy-in');
        }

        if (!count || count === 0) {
            throw new Error('Insufficient chips (concurrent transaction detected)');
        }

        return true;
    },

    /**
     * Unlock chips on cash-out from table
     */
    async unlockFromTable(userId: string, tableId: string, amount: number): Promise<boolean> {
        // Get club_id from table for the RPC
        const { data: tableData } = await supabase
            .from('tables')
            .select('club_id')
            .eq('id', tableId)
            .single();

        const clubId = tableData?.club_id || '';

        const { error } = await supabase.rpc('unlock_chips_from_table', {
            p_user_id: userId,
            p_table_id: tableId,
            p_club_id: clubId,
            p_amount: amount,
        });

        if (error) {
            console.warn('[WalletService] RPC unlock_chips_from_table failed:', error.message, '— falling back to direct credit');
            // Fallback: Try deduct_chip_balance RPC with negative amount (adds chips)
            let credited = false;
            try {
                const { error: rpcErr } = await supabase.rpc('deduct_chip_balance', {
                    p_club_id: clubId,
                    p_user_id: userId,
                    p_amount: -amount, // Negative = credit
                });
                credited = !rpcErr;
            } catch { /* RPC may not exist */ }

            if (!credited) {
                // Last resort: read-modify-write (credit is safer than debit — overpay is better than loss)
                const { data: memberData } = await supabase
                    .from('club_members')
                    .select('chip_balance')
                    .eq('club_id', clubId)
                    .eq('user_id', userId)
                    .single();

                const currentBalance = memberData?.chip_balance || 0;
                const { error: updateError } = await supabase
                    .from('club_members')
                    .update({ chip_balance: currentBalance + amount })
                    .eq('club_id', clubId)
                    .eq('user_id', userId);

                if (updateError) throw updateError;
            }
        }
        return true;
    },

    // ─────────────────────────────────────────────────────────────────────────────
    // TRANSACTION HISTORY
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Get transaction history for a user
     */
    async getTransactionHistory(
        userId: string,
        options?: {
            walletType?: WalletType;
            category?: TransactionRecord['category'];
            limit?: number;
            offset?: number;
        }
    ): Promise<TransactionRecord[]> {
        let query = supabase
            .from('wallet_transactions')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(options?.limit || 50);

        if (options?.walletType) {
            query = query.eq('wallet_type', options.walletType);
        }
        if (options?.category) {
            query = query.eq('category', options.category);
        }
        if (options?.offset) {
            query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
        }

        const { data, error } = await query;
        if (error) throw error;

        return data.map(t => ({
            id: t.id,
            userId: t.user_id,
            walletType: t.wallet_type as WalletType,
            amount: t.amount,
            type: t.type,
            category: t.category,
            description: t.description,
            relatedEntityId: t.related_entity_id,
            createdAt: t.created_at,
        }));
    },

    // ─────────────────────────────────────────────────────────────────────────────
    // SETTLEMENT OPERATIONS
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Credit commission to agent's business wallet
     */
    async creditCommission(agentId: string, amount: number, periodId: string): Promise<boolean> {
        const { error } = await supabase.rpc('credit_agent_commission', {
            p_agent_id: agentId,
            p_amount: amount,
            p_period_id: periodId,
        });

        if (error) throw error;
        return true;
    },

    /**
     * Process rakeback to player's wallet
     */
    async creditRakeback(playerId: string, amount: number, periodId: string): Promise<boolean> {
        const { error } = await supabase.rpc('credit_player_rakeback', {
            p_player_id: playerId,
            p_amount: amount,
            p_period_id: periodId,
        });

        if (error) throw error;
        return true;
    },

    /**
     * Process dealer tip from player's table stack
     */
    async processDealerTip(userId: string, tableId: string, amount: number): Promise<boolean> {
        // Deduct from player's locked chips at table
        // Use table_chip_locks to track locked chip balances
        const { data: lockData, error: lockError } = await supabase
            .from('table_chip_locks')
            .select('amount')
            .eq('user_id', userId)
            .eq('table_id', tableId)
            .single();

        if (lockError || !lockData) {
            console.error('WalletService.processDealerTip: No chip lock found:', lockError);
            throw new Error('No chips locked at this table');
        }

        if (lockData.amount < amount) {
            throw new Error('Insufficient chips for dealer tip');
        }

        const { error } = await supabase
            .from('table_chip_locks')
            .update({ amount: lockData.amount - amount })
            .eq('user_id', userId)
            .eq('table_id', tableId);

        if (error) {
            console.error('WalletService.processDealerTip deduction failed:', error);
            throw new Error('Failed to deduct dealer tip');
        }

        // Record tip transaction
        const { error: insertError } = await supabase.from('wallet_transactions').insert({
            user_id: userId,
            wallet_type: 'PLAYER',
            type: 'debit',
            category: 'TIP',
            amount: -amount,
            table_id: tableId,
            description: `Dealer tip at table`,
        });

        if (insertError) {
            console.error('[WalletService] Tip transaction record failed:', insertError);
            // Deduction succeeded but record failed — log for reconciliation
        }

        return true;
    },

    /**
     * Process insurance purchase from player's table stack
     */
    async processInsurance(userId: string, tableId: string, handId: string, premium: number): Promise<boolean> {
        // Deduct premium from player's table stack
        const { data: chipLock, error: chipLockError } = await supabase
            .from('table_chip_locks')
            .select('amount')
            .eq('user_id', userId)
            .eq('table_id', tableId)
            .single();

        if (chipLockError || !chipLock) {
            console.error('[WalletService] Insurance: No chip lock found:', chipLockError);
            throw new Error('No chips locked at this table');
        }

        if (chipLock.amount < premium) {
            throw new Error('Insufficient chips for insurance premium');
        }

        const { error: deductError } = await supabase
            .from('table_chip_locks')
            .update({ amount: chipLock.amount - premium })
            .eq('user_id', userId)
            .eq('table_id', tableId);

        if (deductError) {
            console.error('[WalletService] Insurance deduction failed:', deductError);
            throw new Error('Failed to deduct insurance premium');
        }

        // Record insurance transaction
        const { error: insertError } = await supabase.from('wallet_transactions').insert({
            user_id: userId,
            wallet_type: 'PLAYER',
            type: 'debit',
            category: 'INSURANCE',
            amount: -premium,
            table_id: tableId,
            hand_id: handId,
            description: 'Insurance premium',
        });

        if (insertError) {
            console.error('[WalletService] Insurance transaction record failed:', insertError);
            // Deduction succeeded but record failed — log for reconciliation
        }

        return true;
    },
};

export default WalletService;

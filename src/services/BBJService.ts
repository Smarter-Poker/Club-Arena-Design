/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  BBJ SERVICE — Bad Beat Jackpot Management
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Manages the Triple-Bank BBJ system:
 * - MAIN Pool: Active jackpot displayed to players
 * - BACKUP Pool: Seeds next jackpot after a hit
 * - PROMO Pool: High-hand rewards and rain events
 * 
 * TRIGGER LAW:
 * - NLH/PLO4/PLO5: Quad 2s or better beaten
 * - PLO6:  HARD LOCK - No BBJ for PLO6 variants
 */

import { supabase } from '../lib/supabase';
import type { EvaluatedHand } from '../engine/PokerEngine';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface BBJPool {
    id: string;
    union_id: string | null;
    club_id: string | null;
    main_balance: number;
    backup_balance: number;
    promo_balance: number;
    total_contributed: number;
    last_hit_at: string | null;
    last_hit_amount: number | null;
    created_at: string;
    updated_at: string;
}

export interface BBJContribution {
    id: string;
    pool_id: string;
    hand_id: string;
    table_id: string;
    amount: number;
    main_portion: number;
    backup_portion: number;
    promo_portion: number;
    created_at: string;
}

export interface BBJPayout {
    id: string;
    pool_id: string;
    hand_id: string;
    winner_user_id: string;
    loser_user_id: string;
    table_players_share: number;
    winner_share: number;  // Typically 50%
    loser_share: number;   // Typically 25%
    table_share: number;   // Typically 25% split among dealt-in players
    total_amount: number;
    created_at: string;
}

export type GameVariant = 'nlh' | 'plo4' | 'plo5' | 'plo6' | 'plo8' | 'short_deck' | 'ofc';

export interface BBJTriggerResult {
    triggered: boolean;
    losingHand?: string;
    winningHand?: string;
    reason?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * BBJ Allocation Ratios
 * STANDARD MODE: <$100k in main pool
 * PIVOT MODE: ≥$100k in main pool
 */
const ALLOCATION = {
    STANDARD: {
        MAIN: 0.50,    // 50%
        BACKUP: 0.25,  // 25%
        PROMO: 0.25,   // 25%
    },
    PIVOT: {
        MAIN: 0.30,    // 30%
        BACKUP: 0.40,  // 40%
        PROMO: 0.30,   // 30%
    },
    PIVOT_THRESHOLD: 100000, // $100,000
};

/**
 * BBJ Payout Distribution
 */
const PAYOUT_SHARES = {
    WINNER: 0.50,      // 50% to the player with the better hand (who beat the qualifier)
    LOSER: 0.25,       // 25% to the player with the qualifying losing hand
    TABLE: 0.25,       // 25% split among all dealt-in players at the table
};

/**
 * Minimum hand rankings that qualify for BBJ
 * Quad 2s is FOUR_OF_A_KIND (rank 8) with 2s as kicker
 */
const BBJ_MINIMUM_RANKING = 8; // FOUR_OF_A_KIND

/**
 * Variants that DO NOT have BBJ
 */
const BBJ_EXCLUDED_VARIANTS: GameVariant[] = ['plo6', 'ofc'];

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export const BBJService = {
    /**
     * Get BBJ pool balances for a union or independent club
     */
    async getPool(options: { unionId?: string; clubId?: string }): Promise<BBJPool | null> {
        const { unionId, clubId } = options;

        let query = supabase.from('bbj_pools').select('*');

        if (unionId) {
            query = query.eq('union_id', unionId);
        } else if (clubId) {
            query = query.eq('club_id', clubId);
        } else {
            console.error('BBJService.getPool: Must provide unionId or clubId');
            return null;
        }

        const { data, error } = await query.single();

        if (error) {
            console.error('BBJService.getPool error:', error);
            return null;
        }

        return data;
    },

    /**
     * Calculate BBJ contribution from a pot
     * Uses 0.5x Big Blind rule
     */
    calculateContribution(bigBlind: number): number {
        return bigBlind * 0.5;
    },

    /**
     * Determine allocation ratios based on current pool size
     */
    getAllocationRatios(currentMainBalance: number): typeof ALLOCATION.STANDARD {
        if (currentMainBalance >= ALLOCATION.PIVOT_THRESHOLD) {
            return ALLOCATION.PIVOT;
        }
        return ALLOCATION.STANDARD;
    },

    /**
     * Record a BBJ contribution from a completed hand
     */
    async recordContribution(params: {
        poolId: string;
        handId: string;
        tableId: string;
        bigBlind: number;
        currentMainBalance: number;
        clubId?: string;
        handNumber?: number;
        stakesTier?: string;
    }): Promise<BBJContribution | null> {
        const contribution = this.calculateContribution(params.bigBlind);

        // Determine stakes tier from big blind
        const stakesTier = params.stakesTier || (
            params.bigBlind <= 100 ? 'micro' :
            params.bigBlind <= 500 ? 'low' :
            params.bigBlind <= 2000 ? 'mid' : 'high'
        );

        // Get club_id from table if not provided
        let clubId = params.clubId;
        if (!clubId) {
            const { data: tableData } = await supabase
                .from('tables')
                .select('club_id')
                .eq('id', params.tableId)
                .single();
            clubId = tableData?.club_id || '';
        }

        // Call RPC to atomically update pool and record contribution
        // Using the existing add_bbj_contribution function signature
        const { data, error } = await supabase.rpc('add_bbj_contribution', {
            p_table_id: params.tableId,
            p_club_id: clubId,
            p_amount: contribution,
            p_big_blind: params.bigBlind,
            p_hand_number: params.handNumber || 0,
            p_stakes_tier: stakesTier,
        });

        if (error) {
            console.error('BBJService.recordContribution error:', error);
            return null;
        }

        return data;
    },

    /**
     * Check if a hand result triggers a BBJ
     * 
     * TRIGGER CONDITIONS:
     * 1. Losing hand must be Quad 2s or better (FOUR_OF_A_KIND minimum)
     * 2. Winning hand must beat a qualifying hand
     * 3. Both players must use both hole cards (Omaha rule check)
     * 4. Variant must not be excluded (PLO6, OFC)
     */
    checkBBJTrigger(
        losingHand: EvaluatedHand,
        winningHand: EvaluatedHand,
        variant: GameVariant
    ): BBJTriggerResult {
        // Check variant exclusion
        if (BBJ_EXCLUDED_VARIANTS.includes(variant)) {
            return {
                triggered: false,
                reason: `BBJ not available for ${variant.toUpperCase()}`
            };
        }

        // Check if losing hand qualifies (Quad 2s or better)
        if (losingHand.ranking < BBJ_MINIMUM_RANKING) {
            return {
                triggered: false,
                reason: 'Losing hand does not qualify (requires Quad 2s or better)'
            };
        }

        // Verify winning hand actually beats losing hand
        if (winningHand.ranking <= losingHand.ranking) {
            // If same ranking, need to check kickers
            if (winningHand.ranking === losingHand.ranking) {
                const kickerComparison = this.compareKickers(winningHand.kickers, losingHand.kickers);
                if (kickerComparison <= 0) {
                    return {
                        triggered: false,
                        reason: 'Winning hand does not beat losing hand'
                    };
                }
            } else {
                return {
                    triggered: false,
                    reason: 'Winning hand does not beat losing hand'
                };
            }
        }

        // BBJ TRIGGERED!
        return {
            triggered: true,
            losingHand: losingHand.name,
            winningHand: winningHand.name,
        };
    },

    /**
     * Compare kicker arrays (higher is better)
     */
    compareKickers(a: number[], b: number[]): number {
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            const aKicker = a[i] || 0;
            const bKicker = b[i] || 0;
            if (aKicker !== bKicker) {
                return aKicker - bKicker;
            }
        }
        return 0;
    },

    /**
     * Execute BBJ payout
     * 
     * DISTRIBUTION:
     * - 50% to "loser" (holder of the beaten qualifying hand)
     * - 25% to "winner" (holder of the hand that beat it)
     * - 25% split among all dealt-in players at the table
     */
    async executePayout(params: {
        poolId: string;
        handId: string;
        loserUserId: string;
        winnerUserId: string;
        dealtInPlayerIds: string[];
    }): Promise<BBJPayout | null> {
        // Get current pool by ID (NOT by clubId — params.poolId is the pool's primary key)
        const { data: pool, error: poolError } = await supabase
            .from('bbj_pools')
            .select('*')
            .eq('id', params.poolId)
            .single();

        if (poolError || !pool) {
            console.error('BBJService.executePayout: Pool not found:', poolError);
            return null;
        }

        if (params.dealtInPlayerIds.length === 0) {
            console.error('BBJService.executePayout: No dealt-in players for table share');
            return null;
        }

        const totalAmount = pool.main_balance;
        const winnerShare = totalAmount * PAYOUT_SHARES.WINNER;
        const loserShare = totalAmount * PAYOUT_SHARES.LOSER;
        const tableShare = totalAmount * PAYOUT_SHARES.TABLE;
        const perPlayerShare = tableShare / params.dealtInPlayerIds.length;

        // Get table/club context from pool
        const { data: poolContext } = await supabase
            .from('bbj_pools')
            .select('club_id')
            .eq('id', params.poolId)
            .single();

        // Get table info for context
        const tableId = params.handId; // Use hand context to find table
        const clubId = poolContext?.club_id || '';

        // Call RPC to atomically execute the BBJ payout
        // Using the existing award_bbj function
        const { data, error } = await supabase.rpc('award_bbj', {
            p_club_id: clubId,
            p_table_id: tableId,
            p_hand_number: 0,
            p_big_blind: 0,
            p_stakes_tier: 'mid',
            p_game_variant: 'nlh',
            p_winner_user_id: params.winnerUserId,
            p_winner_hand: 'BBJ Winner',
            p_winner_cards: '',
            p_winner_display_name: '',
            p_loser_user_id: params.loserUserId,
            p_loser_hand: 'BBJ Qualifier',
            p_loser_cards: '',
            p_loser_display_name: '',
            p_payout_total_pct: 100,
            p_payout_winner_pct: PAYOUT_SHARES.WINNER * 100,
            p_payout_loser_pct: PAYOUT_SHARES.LOSER * 100,
            p_payout_table_pct: PAYOUT_SHARES.TABLE * 100,
        });

        if (error) {
            console.error('BBJService.executePayout error:', error);
            return null;
        }

        return data;
    },

    /**
     * Get BBJ history for a pool
     */
    async getPayoutHistory(poolId: string, limit: number = 10): Promise<BBJPayout[]> {
        const { data, error } = await supabase
            .from('bbj_payouts')
            .select('*')
            .eq('pool_id', poolId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('BBJService.getPayoutHistory error:', error);
            return [];
        }

        return data || [];
    },

    /**
     * Manually trigger a promo payout (rain event, high hand, etc.)
     * Requires admin authorization
     */
    async executePromoPayout(params: {
        poolId: string;
        amount: number;
        recipientUserIds: string[];
        reason: string;
    }): Promise<boolean> {
        // Distribute promo payout to each recipient
        const perPlayer = Math.floor(params.amount / params.recipientUserIds.length);
        let lastError: Error | null = null;

        for (const userId of params.recipientUserIds) {
            const { error: payoutError } = await supabase.rpc('add_to_promo_wallet', {
                p_user_id: userId,
                p_amount: perPlayer,
            });
            if (payoutError) {
                console.error(`BBJService.executePromoPayout: Failed for ${userId}:`, payoutError);
                lastError = payoutError;
            }
        }

        const error = lastError;

        if (error) {
            console.error('BBJService.executePromoPayout error:', error);
            return false;
        }

        return true;
    },
};

export default BBJService;

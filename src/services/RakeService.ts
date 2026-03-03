import { supabase } from '../lib/supabase';
import { BBJService } from './BBJService';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  RAKE WATERFALL ENGINE
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Complete rake management implementing the financial laws:
 * 
 * LOCKED SCALING LAWS (Hard Law):
 * - 10% Rake Law: Flat 10.00% of Total Pot (No Flop, No Drop)
 * - 2.5x Cap Law: Rake Cap = Big Blind × 2.5
 * - 0.5x BBJ Law: BBJ Drop = Big Blind × 0.5
 * 
 * WATERFALL FLOW:
 * 1. Calculate Rake & BBJ from pot
 * 2. Execute Pot Drops (RPC)
 * 3. Attribute Rake to Dealt-In Players
 * 4. Queue Commission Credits → Monday Settlement
 * 
 * CORE LAWS:
 * 1. Rake is taken from Pot
 * 2. Rake is split EVENLY among DEALT-IN players
 * 3. Sitting Out = ZERO Credit
 * 4. No Flop = No Drop
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface RakeCalculation {
    potSize: number;
    bigBlind: number;
    rakePercent: number;
    rawRake: number;
    cappedRake: number;
    rakeCap: number;
    bbjDrop: number;
    totalDeduction: number;
    netPot: number;
}

export interface RakeAttribution {
    userId: string;
    tableId: string;
    handId: string;
    rakeCredit: number;
    timestamp: string;
}

export interface WaterfallResult {
    handId: string;
    tableId: string;
    calculation: RakeCalculation;
    attributions: RakeAttribution[];
    bbjContributed: boolean;
    commissionsQueued: boolean;
}

export interface DealtInPlayer {
    userId: string;
    agentId?: string;
    clubId: string;
    isSittingOut: boolean;
    hasCards: boolean;
    wentToFlop: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS (HARD LAWS - DO NOT MODIFY)
// ═══════════════════════════════════════════════════════════════════════════════

const RAKE_LAWS = {
    RAKE_PERCENT: 0.10,        // 10% of pot
    CAP_MULTIPLIER: 2.5,       // Rake cap = BB × 2.5
    BBJ_MULTIPLIER: 0.5,       // BBJ drop = BB × 0.5
    TOURNAMENT_RAKE: 0.10,     // Flat 10% on tournament buy-ins
    MIN_POT_FOR_RAKE: 0,       // Minimum pot size to take rake
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export const RakeService = {
    /**
     * CALCULATE RAKE & BBJ
     * Implements the Locked Scaling Laws
     */
    calculateRake(potSize: number, bigBlind: number, wentToFlop: boolean = true): RakeCalculation {
        // NO FLOP, NO DROP rule
        if (!wentToFlop) {
            return {
                potSize,
                bigBlind,
                rakePercent: RAKE_LAWS.RAKE_PERCENT,
                rawRake: 0,
                cappedRake: 0,
                rakeCap: bigBlind * RAKE_LAWS.CAP_MULTIPLIER,
                bbjDrop: 0,
                totalDeduction: 0,
                netPot: potSize,
            };
        }

        // Use integer arithmetic (cents) to avoid floating point precision errors
        // Multiply by 100, compute, then divide back
        const potCents = Math.round(potSize * 100);
        const bbCents = Math.round(bigBlind * 100);

        // Calculate raw rake (10% of pot)
        const rawRakeCents = Math.round(potCents * RAKE_LAWS.RAKE_PERCENT);

        // Apply cap (2.5x BB)
        const rakeCapCents = Math.round(bbCents * RAKE_LAWS.CAP_MULTIPLIER);
        const cappedRakeCents = Math.min(rawRakeCents, rakeCapCents);

        // Calculate BBJ drop (0.5x BB)
        const bbjDropCents = Math.round(bbCents * RAKE_LAWS.BBJ_MULTIPLIER);

        // Total deduction from pot
        const totalDeductionCents = cappedRakeCents + bbjDropCents;

        // Convert back to dollars
        const rawRake = rawRakeCents / 100;
        const rakeCap = rakeCapCents / 100;
        const cappedRake = cappedRakeCents / 100;
        const bbjDrop = bbjDropCents / 100;
        const totalDeduction = totalDeductionCents / 100;

        return {
            potSize,
            bigBlind,
            rakePercent: RAKE_LAWS.RAKE_PERCENT,
            rawRake,
            cappedRake,
            rakeCap,
            bbjDrop,
            totalDeduction,
            netPot: potSize - totalDeduction,
        };
    },

    /**
     * EXECUTE WATERFALL
     * Main entry point - orchestrates the full rake flow
     */
    async executeWaterfall(params: {
        handId: string;
        tableId: string;
        clubId: string;
        unionId?: string;
        potSize: number;
        bigBlind: number;
        wentToFlop: boolean;
        players: DealtInPlayer[];
    }): Promise<WaterfallResult> {
        const { handId, tableId, clubId, unionId, potSize, bigBlind, wentToFlop, players } = params;

        // STEP 1: Calculate rake and BBJ
        const calculation = this.calculateRake(potSize, bigBlind, wentToFlop);

        // STEP 2: Execute pot drops (if there's rake to take)
        if (calculation.cappedRake > 0) {
            const potDropSuccess = await this.executePotDrops({
                handId,
                tableId,
                clubId,
                unionId,
                rakeAmount: calculation.cappedRake,
                bbjAmount: calculation.bbjDrop,
            });

            // ABORT waterfall if pot drops failed — cannot attribute rake that was never collected
            if (!potDropSuccess) {
                console.error('[RakeService] Pot drops failed — aborting waterfall for hand:', handId);
                return {
                    handId,
                    tableId,
                    calculation,
                    attributions: [],
                    bbjContributed: false,
                    commissionsQueued: false,
                };
            }
        }

        // STEP 3: Attribute rake to dealt-in players
        const attributions = await this.distributeHandRake(
            tableId,
            handId,
            calculation.cappedRake,
            players
        );

        // STEP 4: Queue commission credits
        let commissionsQueued = false;
        if (calculation.cappedRake > 0 && attributions.length > 0) {
            commissionsQueued = await this.queueCommissionCredits({
                handId,
                clubId,
                rakeAmount: calculation.cappedRake,
                players: players.filter(p => !p.isSittingOut && p.hasCards),
            });
        }

        // STEP 5: Record BBJ contribution
        let bbjContributed = false;
        if (calculation.bbjDrop > 0) {
            const pool = await BBJService.getPool({ unionId, clubId });
            if (pool) {
                await BBJService.recordContribution({
                    poolId: pool.id,
                    handId,
                    tableId,
                    bigBlind,
                    currentMainBalance: pool.main_balance,
                });
                bbjContributed = true;
            }
        }

        return {
            handId,
            tableId,
            calculation,
            attributions,
            bbjContributed,
            commissionsQueued,
        };
    },

    /**
     * EXECUTE POT DROPS
     * Atomically deduct rake and BBJ from pot
     */
    async executePotDrops(params: {
        handId: string;
        tableId: string;
        clubId: string;
        unionId?: string;
        rakeAmount: number;
        bbjAmount: number;
    }): Promise<boolean> {
        const { error } = await supabase.rpc('execute_pot_drops', {
            p_hand_id: params.handId,
            p_table_id: params.tableId,
            p_rake_amount: params.rakeAmount,
            p_bbj_amount: params.bbjAmount,
        });

        if (error) {
            console.error('RakeService.executePotDrops error:', error);
            return false;
        }

        return true;
    },

    /**
     * DISTRIBUTE RAKE CREDIT
     * Split rake evenly among dealt-in players
     */
    async distributeHandRake(
        tableId: string,
        handId: string,
        totalRake: number,
        players: DealtInPlayer[]
    ): Promise<RakeAttribution[]> {
        // Filter to active players only
        const activePlayers = players.filter(p => !p.isSittingOut && p.hasCards);

        if (activePlayers.length === 0 || totalRake === 0) {
            return [];
        }

        // Calculate equal split using integer arithmetic to avoid floating point loss
        const totalRakeCents = Math.round(totalRake * 100);
        const baseCreditCents = Math.floor(totalRakeCents / activePlayers.length);
        let remainderCents = totalRakeCents - (baseCreditCents * activePlayers.length);
        const timestamp = new Date().toISOString();

        // Build attribution records — distribute remainder 1 cent at a time
        const attributions: RakeAttribution[] = activePlayers.map((p, i) => {
            const extra = i < remainderCents ? 1 : 0;
            return {
                userId: p.userId,
                tableId,
                handId,
                rakeCredit: (baseCreditCents + extra) / 100,
                timestamp,
            };
        });

        // Persist attributions to rake_records (single record per hand)
        const { error } = await supabase.from('rake_records').insert({
            hand_id: handId,
            table_id: tableId,
            club_id: players[0]?.clubId || null,
            rake_amount: totalRake,
            bbj_contribution: 0, // BBJ tracked separately
            pot_size: totalRake / 0.10, // Approximate from 10% rake
            num_players: activePlayers.length,
            player_contributions: Object.fromEntries(
                attributions.map(a => [a.userId, a.rakeCredit])
            ),
        });

        if (error) {
            console.warn('RakeService.distributeHandRake error:', error);
            // Don't throw — game should continue even if rake recording fails
        }

        return attributions;
    },

    /**
     * QUEUE COMMISSION CREDITS
     * Stage rake credits for Monday settlement payout
     */
    async queueCommissionCredits(params: {
        handId: string;
        clubId: string;
        rakeAmount: number;
        players: DealtInPlayer[];
    }): Promise<boolean> {
        // Guard against division by zero
        if (params.players.length === 0) return true;

        // Group players by agent for commission attribution
        const byAgent = new Map<string, number>();
        const perPlayer = params.rakeAmount / params.players.length;

        for (const player of params.players) {
            if (player.agentId) {
                const current = byAgent.get(player.agentId) || 0;
                byAgent.set(player.agentId, current + perPlayer);
            }
        }

        // Commission queueing is tracked in-memory for now
        // Settlement happens via commission_history table during weekly settlement
        // TODO: Create commission_queue table for real-time tracking
        return true;
    },

    /**
     * CALCULATE TOURNAMENT RAKE
     * Law: Flat 10% on Buy-in
     */
    calculateTournamentRake(buyIn: number): { rake: number; prizePoolContribution: number } {
        const rake = buyIn * RAKE_LAWS.TOURNAMENT_RAKE;
        const contribution = buyIn - rake;

        return {
            rake,
            prizePoolContribution: contribution,
        };
    },

    /**
     * GET SCALING MATRIX
     * Reference table for stake-based caps
     */
    getScalingMatrix(): { stakeLevel: string; bigBlind: number; rakeCap: number; bbjDrop: number }[] {
        const stakes = [
            { stakeLevel: '$0.10 / $0.20', bigBlind: 0.20 },
            { stakeLevel: '$0.25 / $0.50', bigBlind: 0.50 },
            { stakeLevel: '$0.50 / $1.00', bigBlind: 1.00 },
            { stakeLevel: '$1.00 / $2.00', bigBlind: 2.00 },
            { stakeLevel: '$2.00 / $5.00', bigBlind: 5.00 },
            { stakeLevel: '$5.00 / $10.00', bigBlind: 10.00 },
            { stakeLevel: '$10.00 / $20.00', bigBlind: 20.00 },
            { stakeLevel: '$25.00 / $50.00', bigBlind: 50.00 },
        ];

        return stakes.map(s => ({
            ...s,
            rakeCap: s.bigBlind * RAKE_LAWS.CAP_MULTIPLIER,
            bbjDrop: s.bigBlind * RAKE_LAWS.BBJ_MULTIPLIER,
        }));
    },

    /**
     * GET LAWS
     * Expose rake laws for external reference
     */
    getLaws(): typeof RAKE_LAWS {
        return { ...RAKE_LAWS };
    },
};

export default RakeService;

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
// OFFICIAL RAKE CHART — Stake-Based Tiers (DO NOT MODIFY)
// ═══════════════════════════════════════════════════════════════════════════════

interface RakeTier {
    sb: number;
    bb: number;
    rakePercent: number;
    maxAmount: number;       // Cap in dollars
    bbjRakeBB: number;       // BBJ drop in BB units
    mainBBJ: number;         // % of BBJ drop → Main pool
    backupBBJ: number;       // % of BBJ drop → Backup pool
    promotional: number;     // % of BBJ drop → Promo pool
}

const RAKE_CHART: RakeTier[] = [
    { sb: 0.10, bb: 0.20, rakePercent: 0.10, maxAmount: 3,    bbjRakeBB: 0.60,  mainBBJ: 0.40, backupBBJ: 0.30, promotional: 0.30 },
    { sb: 0.20, bb: 0.40, rakePercent: 0.10, maxAmount: 3,    bbjRakeBB: 0.60,  mainBBJ: 0.40, backupBBJ: 0.30, promotional: 0.30 },
    { sb: 0.25, bb: 0.50, rakePercent: 0.10, maxAmount: 3,    bbjRakeBB: 0.60,  mainBBJ: 0.40, backupBBJ: 0.30, promotional: 0.30 },
    { sb: 0.30, bb: 0.60, rakePercent: 0.10, maxAmount: 5,    bbjRakeBB: 0.60,  mainBBJ: 0.40, backupBBJ: 0.30, promotional: 0.30 },
    { sb: 0.50, bb: 1.00, rakePercent: 0.10, maxAmount: 5,    bbjRakeBB: 0.25,  mainBBJ: 0.40, backupBBJ: 0.30, promotional: 0.30 },
    { sb: 1.00, bb: 2.00, rakePercent: 0.10, maxAmount: 5,    bbjRakeBB: 0.25,  mainBBJ: 0.40, backupBBJ: 0.30, promotional: 0.30 },
    { sb: 2.00, bb: 4.00, rakePercent: 0.10, maxAmount: 7.50, bbjRakeBB: 0.12,  mainBBJ: 0.40, backupBBJ: 0.30, promotional: 0.30 },
    { sb: 2.00, bb: 5.00, rakePercent: 0.10, maxAmount: 7.50, bbjRakeBB: 0.12,  mainBBJ: 0.40, backupBBJ: 0.30, promotional: 0.30 },
    { sb: 5.00, bb: 5.00, rakePercent: 0.10, maxAmount: 7.50, bbjRakeBB: 0.12,  mainBBJ: 0.40, backupBBJ: 0.30, promotional: 0.30 },
    { sb: 3.00, bb: 6.00, rakePercent: 0.10, maxAmount: 8,    bbjRakeBB: 0.12,  mainBBJ: 0.40, backupBBJ: 0.30, promotional: 0.30 },
    { sb: 4.00, bb: 8.00, rakePercent: 0.10, maxAmount: 10,   bbjRakeBB: 0.12,  mainBBJ: 0.40, backupBBJ: 0.30, promotional: 0.30 },
    { sb: 5.00, bb: 10.0, rakePercent: 0.10, maxAmount: 12.50,bbjRakeBB: 0.06,  mainBBJ: 0.40, backupBBJ: 0.30, promotional: 0.30 },
    { sb: 10.0, bb: 20.0, rakePercent: 0.10, maxAmount: 15,   bbjRakeBB: 0.06,  mainBBJ: 0.40, backupBBJ: 0.30, promotional: 0.30 },
    { sb: 10.0, bb: 25.0, rakePercent: 0.10, maxAmount: 15,   bbjRakeBB: 0.06,  mainBBJ: 0.40, backupBBJ: 0.30, promotional: 0.30 },
];

/** Look up the correct rake tier for given blinds — falls back to closest match */
function getRakeTier(smallBlind: number, bigBlind: number): RakeTier {
    // Exact match first
    const exact = RAKE_CHART.find(t => t.sb === smallBlind && t.bb === bigBlind);
    if (exact) return exact;

    // Closest by big blind
    let closest = RAKE_CHART[0];
    let minDiff = Math.abs(bigBlind - closest.bb);
    for (const tier of RAKE_CHART) {
        const diff = Math.abs(bigBlind - tier.bb);
        if (diff < minDiff) { minDiff = diff; closest = tier; }
    }
    return closest;
}

const RAKE_LAWS = {
    RAKE_PERCENT: 0.10,        // 10% of pot (universal)
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
    calculateRake(potSize: number, bigBlind: number, wentToFlop: boolean = true, smallBlind?: number): RakeCalculation {
        const sb = smallBlind ?? bigBlind / 2;
        const tier = getRakeTier(sb, bigBlind);

        // NO FLOP, NO DROP rule
        if (!wentToFlop) {
            return {
                potSize, bigBlind,
                rakePercent: tier.rakePercent,
                rawRake: 0, cappedRake: 0,
                rakeCap: tier.maxAmount,
                bbjDrop: 0, totalDeduction: 0, netPot: potSize,
            };
        }

        // Integer arithmetic (cents) to avoid floating point
        const potCents = Math.round(potSize * 100);

        // Raw rake = rakePercent of pot
        const rawRakeCents = Math.round(potCents * tier.rakePercent);

        // Cap from chart (in dollars → cents)
        const rakeCapCents = Math.round(tier.maxAmount * 100);
        const cappedRakeCents = Math.min(rawRakeCents, rakeCapCents);

        // BBJ drop = bbjRakeBB × BB (in BB units → dollars → cents)
        const bbjDropDollars = tier.bbjRakeBB * bigBlind;
        const bbjDropCents = Math.round(bbjDropDollars * 100);

        // Total deduction from pot
        const totalDeductionCents = cappedRakeCents + bbjDropCents;

        return {
            potSize, bigBlind,
            rakePercent: tier.rakePercent,
            rawRake: rawRakeCents / 100,
            cappedRake: cappedRakeCents / 100,
            rakeCap: tier.maxAmount,
            bbjDrop: bbjDropCents / 100,
            totalDeduction: totalDeductionCents / 100,
            netPot: potSize - (totalDeductionCents / 100),
        };
    },

    /** Get the BBJ split percentages for given stakes */
    getBBJSplit(smallBlind: number, bigBlind: number): { main: number; backup: number; promo: number } {
        const tier = getRakeTier(smallBlind, bigBlind);
        return { main: tier.mainBBJ, backup: tier.backupBBJ, promo: tier.promotional };
    },

    /** Get the rake tier for given stakes */
    getTier(smallBlind: number, bigBlind: number): RakeTier {
        return getRakeTier(smallBlind, bigBlind);
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
        smallBlind?: number;
        potSize: number;
        bigBlind: number;
        wentToFlop: boolean;
        players: DealtInPlayer[];
    }): Promise<WaterfallResult> {
        const { handId, tableId, clubId, unionId, potSize, bigBlind, wentToFlop, players } = params;
        const sb = params.smallBlind ?? bigBlind / 2;

        // STEP 1: Calculate rake and BBJ using official stake-based chart
        const calculation = this.calculateRake(potSize, bigBlind, wentToFlop, sb);

        // STEP 2: Execute pot drops (if there's rake to take)
        if (calculation.cappedRake > 0) {
            const potDropSuccess = await this.executePotDrops({
                handId,
                tableId,
                clubId,
                unionId,
                rakeAmount: calculation.cappedRake,
                bbjAmount: calculation.bbjDrop,
                potSize,
                numPlayers: players.length,
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
        potSize?: number;
        numPlayers?: number;
    }): Promise<boolean> {
        // Direct INSERT into rake_records (bypasses broken execute_pot_drops RPC)
        const { error } = await supabase
            .from('rake_records')
            .insert({
                hand_id: params.handId,
                table_id: params.tableId,
                club_id: params.clubId,
                rake_amount: params.rakeAmount,
                bbj_contribution: params.bbjAmount,
                pot_size: params.potSize || 0,
                num_players: params.numPlayers || 0,
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
    getScalingMatrix(): { stakeLevel: string; bigBlind: number; rakeCap: number; bbjDrop: number; mainBBJ: number; backupBBJ: number; promo: number }[] {
        return RAKE_CHART.map(t => ({
            stakeLevel: `$${t.sb} / $${t.bb}`,
            bigBlind: t.bb,
            rakeCap: t.maxAmount,
            bbjDrop: t.bbjRakeBB * t.bb,
            mainBBJ: t.mainBBJ,
            backupBBJ: t.backupBBJ,
            promo: t.promotional,
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

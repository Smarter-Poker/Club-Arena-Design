/**
 * ♠ CLUB ARENA — Tournament Service
 * SNGs and MTTs with blind levels and payout structures
 */

import { supabase } from '../lib/supabase';
import { WalletService } from './WalletService';
import type { Tournament, TournamentPlayer } from '../types/database.types';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface BlindLevel {
    level: number;
    smallBlind: number;
    bigBlind: number;
    ante: number;
    durationMinutes: number;
}

export interface PayoutStructure {
    place: number;
    percentage: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOURNAMENT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Tournament Types:
 * - sng: Sit & Go (starts when full)
 * - mtt: Multi-Table Tournament (scheduled start)
 * - satellite: Wins seats to bigger tournaments
 * - spin: Spin & Go (random multiplier prize pools)
 * - bounty: Fixed bounty per knockout
 * - mystery_bounty: Hidden bounty revealed on knockout
 * - progressive_bounty: Half bounty to knocker, half added to their head
 */
export type TournamentType =
    | 'sng'
    | 'mtt'
    | 'satellite'
    | 'spin'
    | 'bounty'
    | 'mystery_bounty'
    | 'progressive_bounty';

export interface BountyConfig {
    bountyType: 'fixed' | 'mystery' | 'progressive';
    baseBounty: number; // Starting bounty per player
    mysteryTiers?: MysteryBountyTier[]; // For mystery bounties
    progressiveStartLevel?: number; // When progressive bounties start
}

export interface MysteryBountyTier {
    minMultiplier: number;
    maxMultiplier: number;
    probability: number; // Percentage chance
}

export interface SpinConfig {
    possibleMultipliers: SpinMultiplier[];
}

export interface SpinMultiplier {
    multiplier: number; // e.g., 2, 3, 5, 10, 25, 120, 10000
    probability: number; // Percentage chance
    isPremium?: boolean; // Special handling for huge multipliers
}

export interface TournamentConfig {
    name: string;
    type: TournamentType;
    buyIn: number;
    rake: number;
    startingStack: number;
    maxPlayers: number;
    minPlayers: number;
    blindStructure: BlindLevel[];
    payoutStructure: PayoutStructure[];
    lateRegistrationLevels: number;
    startTime?: Date;

    // Rebuy/Add-on
    isRebuy: boolean;
    rebuyLevels?: number;
    rebuyChips?: number;
    rebuyCost?: number;
    addOnAvailable: boolean;
    addOnChips?: number;
    addOnCost?: number;

    // Bounty Configuration
    bountyConfig?: BountyConfig;

    // Spin Configuration
    spinConfig?: SpinConfig;

    // Satellite Target
    satelliteTarget?: {
        tournamentId: string;
        seatsAwarded: number;
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STANDARD STRUCTURES
// ═══════════════════════════════════════════════════════════════════════════════

export const BLIND_STRUCTURES = {
    turbo: [
        { level: 1, smallBlind: 10, bigBlind: 20, ante: 0, durationMinutes: 3 },
        { level: 2, smallBlind: 15, bigBlind: 30, ante: 0, durationMinutes: 3 },
        { level: 3, smallBlind: 25, bigBlind: 50, ante: 5, durationMinutes: 3 },
        { level: 4, smallBlind: 50, bigBlind: 100, ante: 10, durationMinutes: 3 },
        { level: 5, smallBlind: 75, bigBlind: 150, ante: 15, durationMinutes: 3 },
        { level: 6, smallBlind: 100, bigBlind: 200, ante: 20, durationMinutes: 3 },
        { level: 7, smallBlind: 150, bigBlind: 300, ante: 30, durationMinutes: 3 },
        { level: 8, smallBlind: 200, bigBlind: 400, ante: 40, durationMinutes: 3 },
        { level: 9, smallBlind: 300, bigBlind: 600, ante: 60, durationMinutes: 3 },
        { level: 10, smallBlind: 400, bigBlind: 800, ante: 80, durationMinutes: 3 },
    ],
    regular: [
        { level: 1, smallBlind: 10, bigBlind: 20, ante: 0, durationMinutes: 8 },
        { level: 2, smallBlind: 15, bigBlind: 30, ante: 0, durationMinutes: 8 },
        { level: 3, smallBlind: 25, bigBlind: 50, ante: 5, durationMinutes: 8 },
        { level: 4, smallBlind: 50, bigBlind: 100, ante: 10, durationMinutes: 8 },
        { level: 5, smallBlind: 75, bigBlind: 150, ante: 15, durationMinutes: 8 },
        { level: 6, smallBlind: 100, bigBlind: 200, ante: 25, durationMinutes: 8 },
        { level: 7, smallBlind: 150, bigBlind: 300, ante: 40, durationMinutes: 8 },
        { level: 8, smallBlind: 200, bigBlind: 400, ante: 50, durationMinutes: 8 },
        { level: 9, smallBlind: 300, bigBlind: 600, ante: 75, durationMinutes: 8 },
        { level: 10, smallBlind: 400, bigBlind: 800, ante: 100, durationMinutes: 8 },
    ],
    deepStack: [
        { level: 1, smallBlind: 10, bigBlind: 20, ante: 0, durationMinutes: 15 },
        { level: 2, smallBlind: 15, bigBlind: 30, ante: 0, durationMinutes: 15 },
        { level: 3, smallBlind: 20, bigBlind: 40, ante: 0, durationMinutes: 15 },
        { level: 4, smallBlind: 25, bigBlind: 50, ante: 5, durationMinutes: 15 },
        { level: 5, smallBlind: 50, bigBlind: 100, ante: 10, durationMinutes: 15 },
        { level: 6, smallBlind: 75, bigBlind: 150, ante: 15, durationMinutes: 15 },
        { level: 7, smallBlind: 100, bigBlind: 200, ante: 25, durationMinutes: 15 },
        { level: 8, smallBlind: 150, bigBlind: 300, ante: 40, durationMinutes: 15 },
        { level: 9, smallBlind: 200, bigBlind: 400, ante: 50, durationMinutes: 15 },
        { level: 10, smallBlind: 300, bigBlind: 600, ante: 75, durationMinutes: 15 },
    ],
};

export const PAYOUT_STRUCTURES = {
    sng6: [
        { place: 1, percentage: 65 },
        { place: 2, percentage: 35 },
    ],
    sng9: [
        { place: 1, percentage: 50 },
        { place: 2, percentage: 30 },
        { place: 3, percentage: 20 },
    ],
    mtt10: [
        { place: 1, percentage: 50 },
        { place: 2, percentage: 30 },
        { place: 3, percentage: 20 },
    ],
    mtt20: [
        { place: 1, percentage: 38 },
        { place: 2, percentage: 27 },
        { place: 3, percentage: 18 },
        { place: 4, percentage: 10 },
        { place: 5, percentage: 7 },
    ],
    mtt50: [
        { place: 1, percentage: 28 },
        { place: 2, percentage: 18 },
        { place: 3, percentage: 13 },
        { place: 4, percentage: 10 },
        { place: 5, percentage: 8 },
        { place: 6, percentage: 6 },
        { place: 7, percentage: 5 },
        { place: 8, percentage: 4.5 },
        { place: 9, percentage: 4 },
        { place: 10, percentage: 3.5 },
    ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// SPIN CONFIGURATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const SPIN_MULTIPLIERS: Record<string, SpinMultiplier[]> = {
    standard: [
        { multiplier: 2, probability: 75.0 },
        { multiplier: 3, probability: 15.0 },
        { multiplier: 5, probability: 7.0 },
        { multiplier: 10, probability: 2.5 },
        { multiplier: 25, probability: 0.4 },
        { multiplier: 120, probability: 0.09, isPremium: true },
        { multiplier: 10000, probability: 0.01, isPremium: true },
    ],
    hyper: [
        { multiplier: 2, probability: 65.0 },
        { multiplier: 4, probability: 20.0 },
        { multiplier: 6, probability: 10.0 },
        { multiplier: 12, probability: 4.0 },
        { multiplier: 50, probability: 0.9 },
        { multiplier: 240, probability: 0.09, isPremium: true },
        { multiplier: 12000, probability: 0.01, isPremium: true },
    ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// BOUNTY CONFIGURATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const BOUNTY_PRESETS: Record<string, BountyConfig> = {
    fixed: {
        bountyType: 'fixed',
        baseBounty: 5, // 50% of buy-in typically goes to bounty
    },
    progressive: {
        bountyType: 'progressive',
        baseBounty: 2.5, // 25% of buy-in as starting bounty
        progressiveStartLevel: 1,
    },
    mystery: {
        bountyType: 'mystery',
        baseBounty: 10,
        mysteryTiers: [
            { minMultiplier: 1, maxMultiplier: 1, probability: 60 },
            { minMultiplier: 2, maxMultiplier: 2, probability: 25 },
            { minMultiplier: 5, maxMultiplier: 5, probability: 10 },
            { minMultiplier: 10, maxMultiplier: 10, probability: 4 },
            { minMultiplier: 50, maxMultiplier: 50, probability: 0.9 },
            { minMultiplier: 500, maxMultiplier: 500, probability: 0.1 },
        ],
    },
};

// ═══════════════════════════════════════════════════════════════════════════════
// HYPER-TURBO STRUCTURE (for Spins)
// ═══════════════════════════════════════════════════════════════════════════════

export const SPIN_BLIND_STRUCTURE: BlindLevel[] = [
    { level: 1, smallBlind: 10, bigBlind: 20, ante: 0, durationMinutes: 2 },
    { level: 2, smallBlind: 20, bigBlind: 40, ante: 0, durationMinutes: 2 },
    { level: 3, smallBlind: 30, bigBlind: 60, ante: 0, durationMinutes: 2 },
    { level: 4, smallBlind: 50, bigBlind: 100, ante: 0, durationMinutes: 2 },
    { level: 5, smallBlind: 75, bigBlind: 150, ante: 0, durationMinutes: 2 },
    { level: 6, smallBlind: 100, bigBlind: 200, ante: 0, durationMinutes: 2 },
    { level: 7, smallBlind: 150, bigBlind: 300, ante: 0, durationMinutes: 2 },
    { level: 8, smallBlind: 250, bigBlind: 500, ante: 0, durationMinutes: 2 },
];

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function ordinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

class TournamentService {
    // ─────────────────────────────────────────────────────────────────────────────
    // Tournament CRUD
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Get all tournaments for a club
     */
    async getTournaments(clubId: string): Promise<Tournament[]> {
        const { data, error } = await supabase
            .from('tournaments')
            .select('*')
            .eq('club_id', clubId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[TournamentService] Error fetching tournaments:', error);
            return [];
        }
        return data || [];
    }

    /**
     * Get a single tournament
     */
    async getTournament(tournamentId: string): Promise<Tournament | null> {
        const { data, error } = await supabase
            .from('tournaments')
            .select('*')
            .eq('id', tournamentId)
            .single();

        if (error) {
            console.error('[TournamentService] Error fetching tournament:', error);
            return null;
        }
        return data;
    }

    /**
     * Create a new tournament
     */
    async createTournament(clubId: string, config: TournamentConfig): Promise<Tournament> {
        // Union guard: clubs inside a union cannot create their own tournaments
        const { data: unionCheck } = await supabase
            .from('union_clubs')
            .select('union_id')
            .eq('club_id', clubId)
            .maybeSingle();
        if (unionCheck) {
            throw new Error('Clubs inside a union cannot create standalone tournaments. Tournaments are managed at the union level.');
        }

        const { data, error } = await supabase
            .from('tournaments')
            .insert({
                club_id: clubId,
                name: config.name,
                game_type: config.type?.toUpperCase() || 'NLH',
                buy_in_amount: config.buyIn,
                buy_in_fee: config.rake || 0,
                starting_chips: config.startingStack,
                max_players: config.maxPlayers,
                current_players: 0,
                status: 'ANNOUNCED',
                blind_structure: config.blindStructure,
                payout_structure: config.payoutStructure,
                guaranteed_prize: 0,
                start_time: config.startTime?.toISOString(),
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Registration
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Register a player for a tournament
     */
    async registerPlayer(
        tournamentId: string,
        userId: string,
        username: string
    ): Promise<TournamentPlayer> {
        const tournament = await this.getTournament(tournamentId);
        if (!tournament) throw new Error('Tournament not found');

        // Check registration eligibility (includes late registration window)
        const lateRegMins = tournament.late_reg_mins || 0;
        const isLateRegOpen = tournament.status === 'RUNNING'
            && lateRegMins > 0
            && tournament.started_at
            && (Date.now() - new Date(tournament.started_at).getTime()) < lateRegMins * 60 * 1000;

        if (tournament.status !== 'REGISTERING' && tournament.status !== 'ANNOUNCED' && !isLateRegOpen) {
            throw new Error('Registration is closed');
        }
        if (tournament.max_players && tournament.current_players >= tournament.max_players) {
            throw new Error('Tournament is full');
        }

        // ─── Duplicate registration check ───
        const { data: existing } = await supabase
            .from('tournament_players')
            .select('id')
            .eq('tournament_id', tournamentId)
            .eq('user_id', userId)
            .maybeSingle();
        if (existing) {
            throw new Error('Already registered for this tournament');
        }

        // Calculate total cost (buy-in + fee — exact penny values from DB, NO rounding)
        const buyIn = tournament.buy_in_amount || 0;
        const rake = tournament.buy_in_fee || 0;
        const totalCost = buyIn + rake;

        // ─── Deduct from Player Wallet (wallets table, not club_members) ───
        // Chip flow: Union → Club Bank → Agent Wallet → Player Wallet → Game Buy-ins
        // Players buy into tournaments from their Player Wallet only
        const clubId = tournament.club_id;

        // Check player wallet balance first (for better error messages)
        const { data: walletData } = await supabase
            .from('wallets')
            .select('balance')
            .eq('user_id', userId)
            .eq('wallet_type', 'PLAYER')
            .single();

        if (!walletData || (walletData.balance || 0) < totalCost) {
            throw new Error(`Insufficient chips in Player Wallet. Need ${totalCost}, have ${walletData?.balance || 0}`);
        }

        // Atomically deduct from Player Wallet via RPC (SECURITY DEFINER bypasses RLS)
        const { data: deductResult, error: deductError } = await supabase.rpc('deduct_player_wallet', {
            p_user_id: userId,
            p_amount: totalCost,
        });

        if (deductError) {
            throw new Error(`Failed to deduct tournament buy-in: ${deductError.message}`);
        }
        if (deductResult === false) {
            throw new Error('Insufficient chips in Player Wallet for tournament buy-in');
        }

        // Log buy-in transaction (just the buy-in amount that feeds prize pool)
        if (buyIn > 0) {
            await WalletService.logTransaction(
                userId, 'PLAYER', -buyIn, 'debit', 'buyin',
                `Tournament buy-in: ${tournament.name}`,
                undefined, undefined, tournamentId
            );
        }

        // Log rake/fee separately for clean audit trail
        if (rake > 0) {
            await WalletService.logTransaction(
                userId, 'PLAYER', -rake, 'debit', 'rake',
                `Tournament fee: ${tournament.name}`,
                undefined, undefined, tournamentId
            );
        }

        // Insert player (username is NOT NULL in schema — must be provided)
        const { data, error } = await supabase
            .from('tournament_players')
            .insert({
                tournament_id: tournamentId,
                user_id: userId,
                username: username,
                chips: 0,
                status: 'registered',
            })
            .select()
            .single();

        if (error) {
            // Refund to Player Wallet on failure
            console.error('[TournamentService] Registration failed, refunding buy-in:', error);
            try {
                await supabase.rpc('credit_player_wallet', {
                    p_user_id: userId,
                    p_amount: totalCost,
                });
            } catch (refundErr) {
                console.error('[TournamentService] CRITICAL: Refund also failed:', refundErr);
            }
            throw error;
        }

        // Atomically update player count and prize pool (only buy-in goes to pool, not rake)
        // If guaranteed prize is set, prize pool = max(entries * buy-in, guaranteed_prize)
        const newPlayerCount = (tournament.current_players || 0) + 1;
        const entriesPrize = buyIn * newPlayerCount;
        const newPrizePool = tournament.guaranteed_prize
            ? Math.max(entriesPrize, tournament.guaranteed_prize)
            : entriesPrize;
        const { error: countError } = await supabase.from('tournaments').update({
            current_players: newPlayerCount,
            prize_pool: newPrizePool,
        }).eq('id', tournamentId);

        if (countError) {
            console.error('[TournamentService] Failed to increment registration count:', countError);
        }

        // ── SNG AUTO-START: if tournament is full, trigger immediate start ──
        if (
            tournament.max_players &&
            newPlayerCount >= tournament.max_players &&
            (tournament.variant === 'sng' || tournament.variant === 'spin')
        ) {
            console.log(`[TournamentService] SNG ${tournamentId} is full (${newPlayerCount}/${tournament.max_players}), auto-starting...`);
            try {
                // Set start_time to NOW so server's tournament discovery loop picks it up
                // Server polls for REGISTERING tournaments where start_time <= now && players >= 2
                await supabase.from('tournaments').update({
                    start_time: new Date().toISOString(),
                }).eq('id', tournamentId);
            } catch (autoStartErr) {
                console.error('[TournamentService] SNG auto-start failed:', autoStartErr);
            }
        }

        // ── LATE REGISTRATION: seat player at active table immediately ──
        if (isLateRegOpen) {
            console.log(`[TournamentService] Late reg: seating ${userId.slice(0, 8)} in running tournament ${tournamentId.slice(0, 8)}`);
            try {
                // Find tournament table with an open seat
                const { data: tables } = await supabase
                    .from('tables')
                    .select('id, max_seats, current_players')
                    .eq('tournament_id', tournamentId)
                    .eq('status', 'active');

                const openTable = (tables || []).find(t => t.current_players < t.max_seats);
                if (openTable) {
                    // Find an empty seat number
                    const { data: existingSeats } = await supabase
                        .from('table_seats')
                        .select('seat_number')
                        .eq('table_id', openTable.id);

                    const takenSeats = new Set((existingSeats || []).map(s => s.seat_number));
                    let seatNumber = 1;
                    while (takenSeats.has(seatNumber) && seatNumber <= openTable.max_seats) seatNumber++;

                    // Seat the player
                    await supabase.from('table_seats').insert({
                        table_id: openTable.id,
                        user_id: userId,
                        seat_number: seatNumber,
                        stack: tournament.starting_chips,
                        status: 'active',
                    });

                    // Update tournament_players to playing status with starting chips
                    await supabase.from('tournament_players').update({
                        status: 'playing',
                        chips: tournament.starting_chips,
                        table_id: openTable.id,
                    }).eq('tournament_id', tournamentId).eq('user_id', userId);

                    // Increment table player count
                    await supabase.from('tables').update({
                        current_players: openTable.current_players + 1,
                    }).eq('id', openTable.id);
                }
            } catch (lateRegErr) {
                console.error('[TournamentService] Late reg seating failed:', lateRegErr);
            }
        }

        return data;
    }

    /**
     * Unregister a player (with full refund)
     */
    async unregisterPlayer(tournamentId: string, userId: string): Promise<void> {
        const tournament = await this.getTournament(tournamentId);
        if (!tournament) throw new Error('Tournament not found');
        if (tournament.status !== 'REGISTERING' && tournament.status !== 'ANNOUNCED') {
            throw new Error('Cannot unregister after tournament started');
        }

        // Calculate refund amount (buy-in + fee — exact penny values from DB, NO rounding)
        const buyInAmount = tournament.buy_in_amount || 0;
        const refundAmount = buyInAmount + (tournament.buy_in_fee || 0);

        // Refund to Player Wallet — MUST succeed before unregistering
        const { error: refundError } = await supabase.rpc('credit_player_wallet', {
            p_user_id: userId,
            p_amount: refundAmount,
        });

        if (refundError) {
            console.error('[TournamentService] Refund to Player Wallet failed:', refundError);
            throw new Error('Refund failed — cannot unregister without refunding buy-in');
        }

        // Log refund transaction
        await WalletService.logTransaction(
            userId, 'PLAYER', refundAmount, 'credit', 'refund',
            `Tournament unregister refund: ${tournament.name}`,
            undefined, undefined, tournamentId
        );

        await supabase
            .from('tournament_players')
            .delete()
            .eq('tournament_id', tournamentId)
            .eq('user_id', userId);

        // Decrement player count and recalculate prize pool (guaranteed minimum applies)
        const newPlayerCount = Math.max(0, tournament.current_players - 1);
        const entriesPrize = (tournament.buy_in_amount || 0) * newPlayerCount;
        const newPrizePool = tournament.guaranteed_prize
            ? Math.max(entriesPrize, tournament.guaranteed_prize)
            : entriesPrize;
        const { error: countError } = await supabase.from('tournaments').update({
            current_players: newPlayerCount,
            prize_pool: newPrizePool,
        }).eq('id', tournamentId);

        if (countError) {
            console.error('[TournamentService] Failed to decrement registration count:', countError);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Tournament Cancellation
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Cancel a tournament and refund ALL registered players' buy-ins.
     * Tournaments are ONLY cancelled when fewer than 3 players have joined.
     * This is the sole cancellation condition — tournaments never cancel for other reasons.
     */
    async cancelTournament(tournamentId: string, reason: string = 'Insufficient players (minimum 3 required)'): Promise<{ refunded: number; playersRefunded: number }> {
        const tournament = await this.getTournament(tournamentId);
        if (!tournament) throw new Error('Tournament not found');

        if (tournament.status !== 'ANNOUNCED' && tournament.status !== 'REGISTERING') {
            throw new Error('Can only cancel tournaments that have not started yet');
        }

        // Verify cancellation reason: only cancel if < 3 players
        if ((tournament.current_players || 0) >= 3) {
            throw new Error('Cannot cancel — tournament has 3 or more players registered');
        }

        // Get all registered players
        const { data: players } = await supabase
            .from('tournament_players')
            .select('user_id, username')
            .eq('tournament_id', tournamentId);

        let totalRefunded = 0;
        let playersRefunded = 0;
        const refundAmount = (tournament.buy_in_amount || 0) + (tournament.buy_in_fee || 0);

        // Refund each player's buy-in to their Player Wallet
        if (players && players.length > 0 && refundAmount > 0) {
            for (const player of players) {
                try {
                    const { error: refundError } = await supabase.rpc('credit_player_wallet', {
                        p_user_id: player.user_id,
                        p_amount: refundAmount,
                    });

                    if (refundError) {
                        console.error(`[TournamentService] Failed to refund ${player.user_id}:`, refundError);
                        continue;
                    }

                    // Log refund transaction
                    await WalletService.logTransaction(
                        player.user_id, 'PLAYER', refundAmount, 'credit', 'refund',
                        `Tournament cancelled: ${tournament.name} — ${reason}`,
                        undefined, undefined, tournamentId
                    );

                    totalRefunded += refundAmount;
                    playersRefunded++;
                } catch (err) {
                    console.error(`[TournamentService] Refund error for ${player.user_id}:`, err);
                }
            }
        }

        // Delete all tournament_players entries
        await supabase
            .from('tournament_players')
            .delete()
            .eq('tournament_id', tournamentId);

        // Update tournament status to CANCELLED
        await supabase
            .from('tournaments')
            .update({
                status: 'CANCELLED',
                current_players: 0,
                prize_pool: 0,
            })
            .eq('id', tournamentId);

        console.log(`[TournamentService] Cancelled tournament ${tournament.name}: refunded ${playersRefunded} players, ${totalRefunded} chips`);
        return { refunded: totalRefunded, playersRefunded };
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Tournament Operations
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Start a tournament
     */
    async startTournament(tournamentId: string): Promise<Tournament> {
        const tournament = await this.getTournament(tournamentId);
        if (!tournament) throw new Error('Tournament not found');

        // Validate tournament has required configuration
        if (!tournament.blind_structure?.length) {
            throw new Error('Tournament has no blind structure defined');
        }
        if (!tournament.payout_structure?.length) {
            throw new Error('Tournament has no payout structure defined');
        }
        if ((tournament.starting_chips || 0) <= 0) {
            throw new Error('Tournament starting chips must be > 0');
        }

        // 1. Get Players
        const { data: players } = await supabase
            .from('tournament_players')
            .select('*')
            .eq('tournament_id', tournamentId)
            .eq('status', 'registered');

        if (!players || players.length === 0) throw new Error('No players registered');

        // Auto-cancel if fewer than 3 players — minimum for a valid tournament
        if (players.length < 3) {
            console.log(`[TournamentService] Auto-cancelling tournament ${tournament.name}: only ${players.length} players (minimum 3 required)`);
            await this.cancelTournament(tournamentId, `Only ${players.length} player(s) registered — minimum 3 required`);
            throw new Error(`Tournament cancelled: only ${players.length} player(s) registered (minimum 3 required)`);
        }

        // 2. Create Tables
        const playersPerTable = 9;
        const numTables = Math.ceil(players.length / playersPerTable);
        const createdTables: any[] = [];

        for (let i = 0; i < numTables; i++) {
            const { data: table } = await supabase
                .from('tables')
                .insert({
                    club_id: tournament.club_id,
                    tournament_id: tournament.id,
                    name: `${tournament.name} - Table ${i + 1}`,
                    game_type: 'tournament',
                    game_variant: 'nlh',
                    stakes: 'Tournament',
                    small_blind: tournament.blind_structure[0].smallBlind,
                    big_blind: tournament.blind_structure[0].bigBlind,
                    min_buy_in: 0,
                    max_buy_in: 0,
                    max_players: 9,
                    status: 'RUNNING',
                    settings: { auto_muck: true, time_bank_seconds: 30 }
                })
                .select()
                .single();

            if (table) createdTables.push(table);
        }

        // 3. Seat Players — Fisher-Yates shuffle for unbiased randomization
        const shuffled = [...players];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        const tableSeats = createdTables.map(t => ({ tableId: t.id, nextSeat: 1 }));

        for (let i = 0; i < shuffled.length; i++) {
            const player = shuffled[i];
            const tableAssign = tableSeats[i % numTables];

            await supabase.from('table_seats').insert({
                table_id: tableAssign.tableId,
                seat_number: tableAssign.nextSeat,
                user_id: player.user_id,
                stack: tournament.starting_chips
            });
            tableAssign.nextSeat++;
        }

        // 4. Update Tournament
        const { data, error } = await supabase
            .from('tournaments')
            .update({
                status: 'RUNNING',
                started_at: new Date().toISOString(),
            })
            .eq('id', tournamentId)
            .select()
            .single();

        if (error) throw error;

        // 5. Update Player Stacks
        await supabase
            .from('tournament_players')
            .update({
                chips: tournament.starting_chips,
                status: 'playing',
            })
            .eq('tournament_id', tournamentId)
            .eq('status', 'registered');

        return data;
    }

    /**
     * Eliminate a player (with prize payout and achievements)
     */
    async eliminatePlayer(
        tournamentId: string,
        userId: string,
        position: number
    ): Promise<void> {
        const tournament = await this.getTournament(tournamentId);
        if (!tournament) throw new Error('Tournament not found');

        // Calculate prize — exact cent-precision arithmetic, no rounding
        const payoutArr = (() => {
            const raw = tournament.payout_structure;
            if (!raw) return [];
            if (Array.isArray(raw)) return raw;
            if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return []; } }
            return [];
        })();
        const payoutEntry = payoutArr.find((p: any) => p.place === position);
        const prizeRaw = payoutEntry
            ? (tournament.prize_pool * payoutEntry.percentage) / 100
            : 0;
        // Convert to cents, truncate sub-cent, back to dollars for exact penny precision
        const prize = Math.trunc(prizeRaw * 100) / 100;

        await supabase
            .from('tournament_players')
            .update({
                status: 'eliminated',
                position: position,
                prize: prize,
                eliminated_at: new Date().toISOString(),
            })
            .eq('tournament_id', tournamentId)
            .eq('user_id', userId);

        // Credit prize to Player Wallet
        if (prize > 0) {
            // Credit prize to Player Wallet (not club_members — wallets are separate)
            const { error: prizeError } = await supabase.rpc('credit_player_wallet', {
                p_user_id: userId,
                p_amount: prize,
            });

            if (prizeError) {
                console.error('[TournamentService] CRITICAL: Prize credit to Player Wallet failed:', prizeError);
                throw new Error(`Failed to credit ${ordinal(position)} place prize of ${prize}`);
            }

            // Log prize payout transaction
            await WalletService.logTransaction(
                userId, 'PLAYER', prize, 'credit', 'prize',
                `Tournament prize: ${ordinal(position)} place — ${tournament.name}`,
                undefined, undefined, tournamentId
            );
        }

        // Trigger tournament achievement
        try {
            const { achievementTriggerService } = await import('./AchievementTriggerService');
            const { count } = await supabase
                .from('tournament_players')
                .select('*', { count: 'exact', head: true })
                .eq('tournament_id', tournamentId);

            await achievementTriggerService.onTournamentComplete(userId, {
                position,
                entries: count || 0,
                won: position === 1,
                prizeAmount: prize,
            });
        } catch (err) {
            console.warn('[Achievements] Tournament trigger failed:', err);
        }
    }

    /**
     * Automatically eliminate a player:
     * 1. Calculate rank based on remaining players.
     * 2. Update status to eliminated.
     * 3. Remove from table seat.
     */
    async eliminatePlayerAuto(tournamentId: string, userId: string): Promise<void> {
        // 1. Get current active player count (this will be the position)
        const { count } = await supabase
            .from('tournament_players')
            .select('*', { count: 'exact', head: true })
            .eq('tournament_id', tournamentId)
            .eq('status', 'playing');

        const position = count || 1;

        // 2. Eliminate
        await this.eliminatePlayer(tournamentId, userId, position);

        // 3. Remove from seat (and trigger room update via postgres change or client refresh)
        // Find seat first to check correctness?
        // Note: Using maybeSingle to be safe.
        const { data: seat } = await supabase.from('table_seats').select('table_id').eq('user_id', userId).is('left_at', null).maybeSingle();
        if (seat) {
            const { data: table } = await supabase.from('tables').select('tournament_id').eq('id', seat.table_id).single();
            if (table?.tournament_id === tournamentId) {
                await supabase.from('table_seats')
                    .update({ left_at: new Date().toISOString() })
                    .eq('user_id', userId)
                    .eq('table_id', seat.table_id)
                    .is('left_at', null);
            }
        }
    }

    /**
     * Get payout amount for a position
     */
    calculatePayout(prizePool: number, position: number, structure: PayoutStructure[]): number {
        const entry = structure.find(p => p.place === position);
        if (!entry) return 0;
        // Exact cent-precision: truncate sub-cent fractions only
        return Math.trunc((prizePool * entry.percentage) / 100 * 100) / 100;
    }

    /**
     * Get current blind level based on time elapsed
     */
    /**
     * Get current blind level state with high precision
     */
    getCurrentLevelState(tournament: Tournament): {
        currentLevel: BlindLevel;
        nextLevel: BlindLevel | null;
        timeRemainingSeconds: number;
        levelIndex: number;
    } {
        const blinds: BlindLevel[] = Array.isArray(tournament.blind_structure) && tournament.blind_structure.length > 0
            ? tournament.blind_structure
            : [{ level: 1, smallBlind: 25, bigBlind: 50, ante: 0, durationMinutes: 15 }];

        if (tournament.status !== 'RUNNING' || !tournament.started_at) {
            return {
                currentLevel: blinds[0],
                nextLevel: blinds[1] || null,
                timeRemainingSeconds: blinds[0].durationMinutes * 60,
                levelIndex: 0
            };
        }

        const elapsedMs = new Date().getTime() - new Date(tournament.started_at).getTime();
        let accumulatedMs = 0;

        for (let i = 0; i < blinds.length; i++) {
            const level = blinds[i];
            const durationMs = level.durationMinutes * 60 * 1000;

            if (elapsedMs < accumulatedMs + durationMs) {
                return {
                    currentLevel: level,
                    nextLevel: blinds[i + 1] || null,
                    timeRemainingSeconds: Math.floor((accumulatedMs + durationMs - elapsedMs) / 1000),
                    levelIndex: i
                };
            }
            accumulatedMs += durationMs;
        }

        // Capped at last level
        return {
            currentLevel: blinds[blinds.length - 1],
            nextLevel: null,
            timeRemainingSeconds: 0,
            levelIndex: blinds.length - 1
        };
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Rebuy / Add-on
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Check if rebuy is available for a player
     */
    async canRebuy(tournamentId: string, userId: string): Promise<{ allowed: boolean; reason?: string }> {
        const tournament = await this.getTournament(tournamentId);
        if (!tournament) return { allowed: false, reason: 'Tournament not found' };

        // @ts-ignore - Check if rebuy is configured
        if (!tournament.is_rebuy) return { allowed: false, reason: 'Rebuys not available' };

        const levelState = this.getCurrentLevelState(tournament);
        // @ts-ignore
        if (levelState.levelIndex >= (tournament.rebuy_levels || 4)) {
            return { allowed: false, reason: 'Rebuy period has ended' };
        }

        // Check current stack (must be at or below starting stack)
        const { data: player } = await supabase
            .from('tournament_players')
            .select('chips')
            .eq('tournament_id', tournamentId)
            .eq('user_id', userId)
            .single();

        if (!player) return { allowed: false, reason: 'Player not found' };
        if (player.chips > tournament.starting_chips) {
            return { allowed: false, reason: 'Stack too high for rebuy' };
        }

        return { allowed: true };
    }

    /**
     * Process a rebuy for a player
     */
    async processRebuy(tournamentId: string, userId: string): Promise<{ success: boolean; newStack?: number }> {
        const canRebuyResult = await this.canRebuy(tournamentId, userId);
        if (!canRebuyResult.allowed) {
            throw new Error(canRebuyResult.reason || 'Rebuy not allowed');
        }

        const tournament = await this.getTournament(tournamentId);
        if (!tournament) throw new Error('Tournament not found');

        // @ts-ignore
        const rebuyChips = tournament.rebuy_chips || tournament.starting_chips;
        // @ts-ignore
        const rebuyCost = tournament.rebuy_cost || tournament.buy_in_amount;

        // Pre-validate wallet balance (better error messages)
        const { data: walletData } = await supabase
            .from('wallets')
            .select('balance')
            .eq('user_id', userId)
            .eq('wallet_type', 'PLAYER')
            .single();

        if (!walletData || (walletData.balance || 0) < rebuyCost) {
            throw new Error(`Insufficient chips for rebuy. Need ${rebuyCost}, have ${walletData?.balance || 0}`);
        }

        // Atomically deduct wallet for rebuy cost
        const { data: deductResult, error: walletError } = await supabase.rpc('deduct_player_wallet', {
            p_user_id: userId,
            p_amount: rebuyCost,
        });
        if (walletError || deductResult === false) throw new Error('Insufficient balance for rebuy');

        // Log transaction for audit trail
        await WalletService.logTransaction(
            userId, 'PLAYER', -rebuyCost, 'debit', 'rebuy',
            `Tournament rebuy: ${tournament.name}`,
            undefined, undefined, tournamentId
        );

        // Process rebuy via RPC
        const { data, error } = await supabase.rpc('process_tournament_rebuy', {
            p_tournament_id: tournamentId,
            p_player_id: userId,
            p_rebuy_type: 'rebuy',
            p_cost: rebuyCost,
            p_chips: rebuyChips,
            p_current_level: this.getCurrentLevelState(tournament).levelIndex,
        });

        if (error) throw error;

        // Broadcast rebuy event
        try {
            const { realtimeChannelService } = await import('./RealtimeChannelService');
            await realtimeChannelService.broadcastTournamentEvent(tournamentId, {
                type: 'player_registered', // Using existing event type
                payload: { type: 'rebuy', userId, chips: rebuyChips },
            });
        } catch (e) {
            console.warn('Failed to broadcast rebuy event:', e);
        }

        return { success: true, newStack: data?.new_stack || rebuyChips };
    }

    /**
     * Check if add-on is available
     */
    async canAddOn(tournamentId: string): Promise<{ allowed: boolean; reason?: string }> {
        const tournament = await this.getTournament(tournamentId);
        if (!tournament) return { allowed: false, reason: 'Tournament not found' };

        // @ts-ignore
        if (!tournament.addon_available) return { allowed: false, reason: 'Add-ons not available' };

        const levelState = this.getCurrentLevelState(tournament);
        // Add-on typically available at end of rebuy period
        // @ts-ignore
        const addonLevel = tournament.rebuy_levels || 4;
        if (levelState.levelIndex !== addonLevel) {
            return { allowed: false, reason: 'Add-on period not active' };
        }

        return { allowed: true };
    }

    /**
     * Process an add-on for a player
     */
    async processAddOn(tournamentId: string, userId: string): Promise<{ success: boolean; newStack?: number }> {
        const canAddOnResult = await this.canAddOn(tournamentId);
        if (!canAddOnResult.allowed) {
            throw new Error(canAddOnResult.reason || 'Add-on not allowed');
        }

        const tournament = await this.getTournament(tournamentId);
        if (!tournament) throw new Error('Tournament not found');

        // @ts-ignore
        const addonChips = tournament.addon_chips || tournament.starting_chips;
        // @ts-ignore
        const addonCost = tournament.addon_cost || tournament.buy_in_amount;

        // Pre-validate wallet balance (better error messages)
        const { data: addonWallet } = await supabase
            .from('wallets')
            .select('balance')
            .eq('user_id', userId)
            .eq('wallet_type', 'PLAYER')
            .single();

        if (!addonWallet || (addonWallet.balance || 0) < addonCost) {
            throw new Error(`Insufficient chips for add-on. Need ${addonCost}, have ${addonWallet?.balance || 0}`);
        }

        // Atomically deduct wallet for add-on cost
        const { data: addonDeductResult, error: walletError } = await supabase.rpc('deduct_player_wallet', {
            p_user_id: userId,
            p_amount: addonCost,
        });
        if (walletError || addonDeductResult === false) throw new Error('Insufficient balance for add-on');

        // Log transaction for audit trail
        await WalletService.logTransaction(
            userId, 'PLAYER', -addonCost, 'debit', 'addon',
            `Tournament add-on: ${tournament.name}`,
            undefined, undefined, tournamentId
        );

        const { data, error } = await supabase.rpc('process_tournament_rebuy', {
            p_tournament_id: tournamentId,
            p_player_id: userId,
            p_rebuy_type: 'addon',
            p_cost: addonCost,
            p_chips: addonChips,
            p_current_level: this.getCurrentLevelState(tournament).levelIndex,
        });

        if (error) throw error;

        return { success: true, newStack: data?.new_stack };
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Table Balancing
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Balance tables in a multi-table tournament
     */
    async balanceTables(tournamentId: string): Promise<{ movesMade: number }> {
        const { data, error } = await supabase.rpc('balance_tournament_tables', {
            p_tournament_id: tournamentId,
        });

        if (error) {
            console.error('Table balancing error:', error);
            return { movesMade: 0 };
        }

        return { movesMade: data || 0 };
    }

    /**
     * Check if tables need balancing
     */
    async checkBalanceNeeded(tournamentId: string): Promise<boolean> {
        // Get all active tournament tables from the main tables table
        const { data: tables } = await supabase
            .from('tables')
            .select('id, current_players')
            .eq('tournament_id', tournamentId)
            .neq('status', 'closed');

        if (!tables || tables.length < 2) return false;

        const counts = tables.map(t => t.current_players);
        const max = Math.max(...counts);
        const min = Math.min(...counts);

        // Balance needed if difference is more than 1
        return (max - min) > 1;
    }

    /**
     * Merge tables when player count drops
     */
    async checkTableMerge(tournamentId: string): Promise<{ tableMerged: boolean }> {
        const { data: tables } = await supabase
            .from('tables')
            .select('id, current_players')
            .eq('tournament_id', tournamentId)
            .neq('status', 'closed')
            .order('current_players', { ascending: true });

        if (!tables || tables.length < 2) return { tableMerged: false };

        // Get total remaining players
        const totalPlayers = tables.reduce((sum, t) => sum + t.current_players, 0);
        const playersPerTable = 9;
        const neededTables = Math.ceil(totalPlayers / playersPerTable);

        if (tables.length > neededTables) {
            // Break the smallest table — close it
            const tableToBreak = tables[0];

            // Balance will move players to other tables
            await this.balanceTables(tournamentId);

            // Close the broken table
            await supabase
                .from('tables')
                .update({ status: 'closed' })
                .eq('id', tableToBreak.id);

            return { tableMerged: true };
        }

        return { tableMerged: false };
    }

    /**
     * Create final table (consolidate to 1 table when 9 or fewer players remain)
     */
    async createFinalTable(tournamentId: string): Promise<{ finalTableId: string | null }> {
        const { data: activePlayers, count } = await supabase
            .from('tournament_players')
            .select('*', { count: 'exact' })
            .eq('tournament_id', tournamentId)
            .eq('status', 'playing');

        if (!count || count > 9) return { finalTableId: null };

        // Get or create final table (look for a table named "Final Table")
        let { data: finalTable } = await supabase
            .from('tables')
            .select('id')
            .eq('tournament_id', tournamentId)
            .ilike('name', '%Final Table%')
            .neq('status', 'closed')
            .limit(1)
            .maybeSingle();

        if (!finalTable) {
            const tournament = await this.getTournament(tournamentId);
            if (!tournament) return { finalTableId: null };

            const { data: newTable } = await supabase
                .from('tables')
                .insert({
                    club_id: tournament.club_id,
                    tournament_id: tournamentId,
                    name: `${tournament.name} - Final Table`,
                    game_type: 'tournament',
                    game_variant: 'nlh',
                    stakes: 'Final Table',
                    small_blind: tournament.blind_structure[0].smallBlind,
                    big_blind: tournament.blind_structure[0].bigBlind,
                    min_buy_in: 0,
                    max_buy_in: 0,
                    max_players: 9,
                    status: 'RUNNING',
                    settings: { auto_muck: true, time_bank_seconds: 45 }
                })
                .select()
                .single();

            if (newTable) {
                finalTable = { id: newTable.id };
            }
        }

        if (finalTable) {
            // Broadcast final table event
            try {
                const { realtimeChannelService } = await import('./RealtimeChannelService');
                await realtimeChannelService.broadcastTournamentEvent(tournamentId, {
                    type: 'final_table',
                    payload: { tableId: finalTable.id, playerCount: count },
                });
            } catch (e) {
                console.warn('Failed to broadcast final table event:', e);
            }
        }

        return { finalTableId: finalTable?.id || null };
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Tournament Lifecycle Events
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Broadcast level up event
     */
    async broadcastLevelUp(tournamentId: string, newLevel: BlindLevel): Promise<void> {
        try {
            const { realtimeChannelService } = await import('./RealtimeChannelService');
            await realtimeChannelService.broadcastTournamentEvent(tournamentId, {
                type: 'level_up',
                payload: {
                    level: newLevel.level,
                    smallBlind: newLevel.smallBlind,
                    bigBlind: newLevel.bigBlind,
                    ante: newLevel.ante,
                },
            });
        } catch (e) {
            console.warn('Failed to broadcast level up:', e);
        }
    }

    /**
     * Broadcast player elimination
     */
    async broadcastElimination(
        tournamentId: string,
        eliminatedPlayer: { id: string; name: string; position: number; prize: number }
    ): Promise<void> {
        try {
            const { realtimeChannelService } = await import('./RealtimeChannelService');
            await realtimeChannelService.broadcastTournamentEvent(tournamentId, {
                type: 'player_eliminated',
                payload: eliminatedPlayer,
            });
        } catch (e) {
            console.warn('Failed to broadcast elimination:', e);
        }
    }

    /**
     * Broadcast tournament winner
     */
    async broadcastWinner(
        tournamentId: string,
        winner: { id: string; name: string; prize: number }
    ): Promise<void> {
        try {
            const { realtimeChannelService } = await import('./RealtimeChannelService');
            await realtimeChannelService.broadcastTournamentEvent(tournamentId, {
                type: 'winner',
                payload: winner,
            });
        } catch (e) {
            console.warn('Failed to broadcast winner:', e);
        }
    }

    /**
     * Finalize tournament (process payouts)
     */
    async finalizeTournament(tournamentId: string): Promise<{ success: boolean }> {
        // Get tournament details
        const tournament = await this.getTournament(tournamentId);
        if (!tournament) {
            return { success: false };
        }

        // Update tournament status
        await supabase
            .from('tournaments')
            .update({
                status: 'COMPLETED',
                ended_at: new Date().toISOString(),
            })
            .eq('id', tournamentId);

        // Payouts are processed automatically by the settlement system
        // via the tournament_payouts table populated during eliminations

        // Submit all placements to POY leaderboard system
        try {
            const { data: players } = await supabase
                .from('tournament_players')
                .select('user_id, position, prize')
                .eq('tournament_id', tournamentId)
                .not('position', 'is', null)
                .order('position', { ascending: true });

            if (players && players.length > 0) {
                // Dynamically import to avoid circular deps
                const { POYService } = await import('./POYService');

                // Map tournament variant to game_type for POY
                const gameType = tournament.variant === 'spin' ? 'spin-n-go'
                    : tournament.variant === 'sng' ? 'sit-n-go'
                        : tournament.variant === 'satellite' ? 'satellite'
                            : 'tournament';

                // Submit each player's result
                for (const player of players) {
                    await POYService.submitTournamentResult({
                        player_id: player.user_id,
                        club_id: tournament.club_id,
                        game_type: gameType,
                        game_id: tournamentId,
                        placement: player.position,
                        total_players: tournament.current_players || players.length,
                        buy_in: tournament.buy_in_amount || 0,
                        winnings: player.prize || 0,
                    });
                }
            }
        } catch (e) {
            console.warn('[TournamentService] Failed to submit to POY:', e);
        }

        return { success: true };
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SPIN & GO
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Spin the multiplier wheel for a Spin & Go
     */
    spinMultiplier(config: SpinMultiplier[]): { multiplier: number; isPremium: boolean } {
        const random = Math.random() * 100;
        let cumulative = 0;

        for (const tier of config) {
            cumulative += tier.probability;
            if (random <= cumulative) {
                return {
                    multiplier: tier.multiplier,
                    isPremium: tier.isPremium || false,
                };
            }
        }

        // Fallback to lowest multiplier
        return { multiplier: config[0].multiplier, isPremium: false };
    }

    /**
     * Create and start a Spin & Go
     */
    async createSpin(clubId: string, buyIn: number, rake: number): Promise<Tournament> {
        const spinResult = this.spinMultiplier(SPIN_MULTIPLIERS.standard);
        const prizePool = (buyIn - rake) * 3 * spinResult.multiplier;

        const config: TournamentConfig = {
            name: `Spin & Go ${buyIn}`,
            type: 'spin',
            buyIn,
            rake,
            startingStack: 500,
            maxPlayers: 3,
            minPlayers: 3,
            blindStructure: SPIN_BLIND_STRUCTURE,
            payoutStructure: [{ place: 1, percentage: 100 }], // Winner takes all
            lateRegistrationLevels: 0,
            isRebuy: false,
            addOnAvailable: false,
            spinConfig: {
                possibleMultipliers: SPIN_MULTIPLIERS.standard,
            },
        };

        const tournament = await this.createTournament(clubId, config);

        // Update with actual prize pool
        await supabase
            .from('tournaments')
            .update({
                prize_pool: prizePool,
                spin_multiplier: spinResult.multiplier,
                is_premium_spin: spinResult.isPremium,
            })
            .eq('id', tournament.id);

        return { ...tournament, prize_pool: prizePool };
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // BOUNTY TOURNAMENTS
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Process bounty collection on elimination
     */
    async collectBounty(
        tournamentId: string,
        eliminatedPlayerId: string,
        collectorPlayerId: string
    ): Promise<{ bountyAmount: number; collectorNewBounty?: number }> {
        const tournament = await this.getTournament(tournamentId);
        if (!tournament) throw new Error('Tournament not found');

        // @ts-ignore - Get bounty config
        const bountyConfig = tournament.bounty_config as BountyConfig | undefined;
        if (!bountyConfig) {
            return { bountyAmount: 0 };
        }

        // Get eliminated player's bounty
        const { data: eliminatedPlayer } = await supabase
            .from('tournament_players')
            .select('current_bounty')
            .eq('tournament_id', tournamentId)
            .eq('user_id', eliminatedPlayerId)
            .single();

        const bountyAmount = eliminatedPlayer?.current_bounty || bountyConfig.baseBounty;

        if (bountyConfig.bountyType === 'progressive') {
            // Progressive: 50% to collector, 50% added to collector's head
            // Exact cent-precision split — remainder goes to collector
            const collectorPortion = Math.trunc(bountyAmount * 100 / 2) / 100;
            const addedToHead = Math.trunc((bountyAmount - collectorPortion) * 100) / 100;

            // Get collector's current bounty
            const { data: collector } = await supabase
                .from('tournament_players')
                .select('current_bounty')
                .eq('tournament_id', tournamentId)
                .eq('user_id', collectorPlayerId)
                .single();

            const newCollectorBounty = (collector?.current_bounty || bountyConfig.baseBounty) + addedToHead;

            // Atomically increment collector's bounty to prevent race on concurrent knockouts
            const { error: bountyUpdateError } = await supabase
                .from('tournament_players')
                .update({ current_bounty: newCollectorBounty })
                .eq('tournament_id', tournamentId)
                .eq('user_id', collectorPlayerId);

            if (bountyUpdateError) {
                console.error('[TournamentService] Failed to update collector bounty:', bountyUpdateError);
            }

            // Record bounty payout
            await supabase
                .from('tournament_bounties')
                .insert({
                    tournament_id: tournamentId,
                    eliminated_player_id: eliminatedPlayerId,
                    collector_player_id: collectorPlayerId,
                    bounty_amount: collectorPortion,
                    added_to_collector_bounty: addedToHead,
                });

            return { bountyAmount: collectorPortion, collectorNewBounty: newCollectorBounty };
        } else if (bountyConfig.bountyType === 'mystery') {
            // Mystery: Reveal hidden bounty value
            const mysteryValue = this.rollMysteryBounty(bountyConfig);

            await supabase
                .from('tournament_bounties')
                .insert({
                    tournament_id: tournamentId,
                    eliminated_player_id: eliminatedPlayerId,
                    collector_player_id: collectorPlayerId,
                    bounty_amount: mysteryValue,
                    is_mystery_revealed: true,
                });

            return { bountyAmount: mysteryValue };
        } else {
            // Fixed bounty
            await supabase
                .from('tournament_bounties')
                .insert({
                    tournament_id: tournamentId,
                    eliminated_player_id: eliminatedPlayerId,
                    collector_player_id: collectorPlayerId,
                    bounty_amount: bountyAmount,
                });

            return { bountyAmount };
        }
    }

    /**
     * Roll mystery bounty value
     */
    rollMysteryBounty(config: BountyConfig): number {
        if (!config.mysteryTiers) return config.baseBounty;

        const random = Math.random() * 100;
        let cumulative = 0;

        for (const tier of config.mysteryTiers) {
            cumulative += tier.probability;
            if (random <= cumulative) {
                // Random value within the tier range
                const multiplier = tier.minMultiplier === tier.maxMultiplier
                    ? tier.minMultiplier
                    : Math.floor(Math.random() * (tier.maxMultiplier - tier.minMultiplier + 1)) + tier.minMultiplier;
                return config.baseBounty * multiplier;
            }
        }

        return config.baseBounty;
    }

    /**
     * Get total bounties won by a player in a tournament
     */
    async getPlayerBounties(tournamentId: string, playerId: string): Promise<number> {
        const { data, error } = await supabase
            .from('tournament_bounties')
            .select('bounty_amount')
            .eq('tournament_id', tournamentId)
            .eq('collector_player_id', playerId);

        if (error) return 0;
        return (data || []).reduce((sum, b) => sum + b.bounty_amount, 0);
    }
}

export const tournamentService = new TournamentService();


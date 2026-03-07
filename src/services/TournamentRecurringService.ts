/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TOURNAMENT RECURRING SERVICE — 24/7 Automated Tournament Schedule
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Ensures tournaments run continuously across both clubs:
 * - Checks every 5 minutes for tournament availability
 * - Creates new tournaments when previous ones finish
 * - Runs different tournament types at different times (24/7 coverage)
 * - Registers available horses automatically
 * - Handles day boundary transitions
 * - Launches SNGs and Spins on a continuous loop
 */

import { supabase } from '../lib/supabase';
import { horseBugReporter } from './HorseBugReporter';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface TournamentConfig {
    name: string;
    type: 'mtt' | 'bounty' | 'progressive_bounty' | 'mystery_bounty';
    gameVariant: string;
    buyIn: number;
    rake: number;
    guarantee: number;
    startingStack: number;
    maxPlayers: number;
    minPlayers: number;
    horsesToRegister: number;
    blindStructure: any[];
    payoutStructure: any[];
}

interface SNGConfig {
    name: string;
    type: 'sng';
    gameVariant: string;
    buyIn: number;
    rake: number;
    startingStack: number;
    maxPlayers: number;
    minPlayers: number;
    horsesToRegister: number;
    blindStructure: any[];
    payoutStructure: any[];
}

interface SpinConfig {
    name: string;
    type: 'spin';
    gameVariant: string;
    buyIn: number;
    rake: number;
    startingStack: number;
    maxPlayers: number;
    minPlayers: number;
    horsesToRegister: number;
    blindStructure: any[];
    payoutStructure: any[];
    spinMultipliers: any[];
}

interface HourlyTournamentBlock {
    hours: number[];
    tournaments: TournamentConfig[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const SHARK_CLUB_ID = 'a41434bb-8d0c-400a-8f0d-e8b3d65afed4';
const JAQK_CLUB_ID = 'a0000000-0000-0000-0000-000000000001';

const BLIND_STRUCTURES = {
    TURBO: [
        { level: 1, smallBlind: 25, bigBlind: 50, ante: 5, durationMinutes: 4 },
        { level: 2, smallBlind: 50, bigBlind: 100, ante: 10, durationMinutes: 4 },
        { level: 3, smallBlind: 100, bigBlind: 200, ante: 20, durationMinutes: 3 },
        { level: 4, smallBlind: 150, bigBlind: 300, ante: 30, durationMinutes: 3 },
        { level: 5, smallBlind: 200, bigBlind: 400, ante: 50, durationMinutes: 3 },
        { level: 6, smallBlind: 300, bigBlind: 600, ante: 75, durationMinutes: 2 },
        { level: 7, smallBlind: 500, bigBlind: 1000, ante: 100, durationMinutes: 2 },
        { level: 8, smallBlind: 750, bigBlind: 1500, ante: 150, durationMinutes: 2 },
    ],
    STANDARD: [
        { level: 1, smallBlind: 25, bigBlind: 50, ante: 0, durationMinutes: 10 },
        { level: 2, smallBlind: 50, bigBlind: 100, ante: 10, durationMinutes: 10 },
        { level: 3, smallBlind: 75, bigBlind: 150, ante: 15, durationMinutes: 10 },
        { level: 4, smallBlind: 100, bigBlind: 200, ante: 25, durationMinutes: 8 },
        { level: 5, smallBlind: 150, bigBlind: 300, ante: 30, durationMinutes: 8 },
        { level: 6, smallBlind: 200, bigBlind: 400, ante: 50, durationMinutes: 8 },
        { level: 7, smallBlind: 300, bigBlind: 600, ante: 60, durationMinutes: 6 },
        { level: 8, smallBlind: 400, bigBlind: 800, ante: 80, durationMinutes: 6 },
        { level: 9, smallBlind: 500, bigBlind: 1000, ante: 100, durationMinutes: 5 },
        { level: 10, smallBlind: 750, bigBlind: 1500, ante: 150, durationMinutes: 5 },
    ],
    HYPER_TURBO: [
        { level: 1, smallBlind: 50, bigBlind: 100, ante: 10, durationMinutes: 2 },
        { level: 2, smallBlind: 100, bigBlind: 200, ante: 25, durationMinutes: 2 },
        { level: 3, smallBlind: 200, bigBlind: 400, ante: 50, durationMinutes: 2 },
        { level: 4, smallBlind: 400, bigBlind: 800, ante: 100, durationMinutes: 1 },
        { level: 5, smallBlind: 800, bigBlind: 1600, ante: 200, durationMinutes: 1 },
    ],
    SNG_6MAX: [
        { level: 1, smallBlind: 10, bigBlind: 20, ante: 0, durationMinutes: 3 },
        { level: 2, smallBlind: 15, bigBlind: 30, ante: 0, durationMinutes: 3 },
        { level: 3, smallBlind: 25, bigBlind: 50, ante: 5, durationMinutes: 3 },
        { level: 4, smallBlind: 50, bigBlind: 100, ante: 10, durationMinutes: 3 },
        { level: 5, smallBlind: 75, bigBlind: 150, ante: 15, durationMinutes: 3 },
        { level: 6, smallBlind: 100, bigBlind: 200, ante: 25, durationMinutes: 2 },
        { level: 7, smallBlind: 150, bigBlind: 300, ante: 30, durationMinutes: 2 },
        { level: 8, smallBlind: 200, bigBlind: 400, ante: 50, durationMinutes: 2 },
    ],
    SPIN: [
        { level: 1, smallBlind: 10, bigBlind: 20, ante: 0, durationMinutes: 2 },
        { level: 2, smallBlind: 15, bigBlind: 30, ante: 0, durationMinutes: 2 },
        { level: 3, smallBlind: 25, bigBlind: 50, ante: 0, durationMinutes: 2 },
        { level: 4, smallBlind: 50, bigBlind: 100, ante: 0, durationMinutes: 1 },
        { level: 5, smallBlind: 100, bigBlind: 200, ante: 0, durationMinutes: 1 },
    ],
};

const PAYOUT_STRUCTURES = {
    THREE: [
        { place: 1, percentage: 50 },
        { place: 2, percentage: 30 },
        { place: 3, percentage: 20 },
    ],
    FIVE: [
        { place: 1, percentage: 40 },
        { place: 2, percentage: 25 },
        { place: 3, percentage: 18 },
        { place: 4, percentage: 10 },
        { place: 5, percentage: 7 },
    ],
    NINE: [
        { place: 1, percentage: 30 },
        { place: 2, percentage: 20 },
        { place: 3, percentage: 15 },
        { place: 4, percentage: 10 },
        { place: 5, percentage: 8 },
        { place: 6, percentage: 6 },
        { place: 7, percentage: 5 },
        { place: 8, percentage: 3.5 },
        { place: 9, percentage: 2.5 },
    ],
};

const SPIN_MULTIPLIERS = [
    { multiplier: 2, weight: 75 },
    { multiplier: 3, weight: 15 },
    { multiplier: 5, weight: 7 },
    { multiplier: 10, weight: 2.5 },
    { multiplier: 25, weight: 0.4 },
    { multiplier: 100, weight: 0.1 },
];

// ═══════════════════════════════════════════════════════════════════════════════
// HOURLY TOURNAMENT SCHEDULE (24/7 COVERAGE)
// ═══════════════════════════════════════════════════════════════════════════════

const HOURLY_SCHEDULE: HourlyTournamentBlock[] = [
    {
        hours: [0, 1, 2],
        tournaments: [
            {
                name: 'Midnight Bounty (NLH)',
                type: 'bounty',
                gameVariant: 'nlh',
                buyIn: 5,
                rake: 0.50,
                guarantee: 100,
                startingStack: 3000,
                maxPlayers: 50,
                minPlayers: 8,
                horsesToRegister: 12,
                blindStructure: BLIND_STRUCTURES.TURBO,
                payoutStructure: PAYOUT_STRUCTURES.FIVE,
            },
            {
                name: 'Late Night Grind (PLO4)',
                type: 'mtt',
                gameVariant: 'plo4',
                buyIn: 3,
                rake: 0.30,
                guarantee: 50,
                startingStack: 2000,
                maxPlayers: 30,
                minPlayers: 6,
                horsesToRegister: 10,
                blindStructure: BLIND_STRUCTURES.TURBO,
                payoutStructure: PAYOUT_STRUCTURES.FIVE,
            },
        ],
    },
    {
        hours: [3, 4, 5],
        tournaments: [
            {
                name: 'Early Bird Freeroll (NLH)',
                type: 'mtt',
                gameVariant: 'nlh',
                buyIn: 0,
                rake: 0,
                guarantee: 75,
                startingStack: 2500,
                maxPlayers: 100,
                minPlayers: 10,
                horsesToRegister: 20,
                blindStructure: BLIND_STRUCTURES.HYPER_TURBO,
                payoutStructure: PAYOUT_STRUCTURES.FIVE,
            },
            {
                name: 'Pre-Dawn Mystery Bounty (PLO5)',
                type: 'mystery_bounty',
                gameVariant: 'plo5',
                buyIn: 7,
                rake: 0.70,
                guarantee: 80,
                startingStack: 3500,
                maxPlayers: 50,
                minPlayers: 10,
                horsesToRegister: 15,
                blindStructure: BLIND_STRUCTURES.TURBO,
                payoutStructure: PAYOUT_STRUCTURES.FIVE,
            },
        ],
    },
    {
        hours: [6, 7, 8],
        tournaments: [
            {
                name: 'Morning Grinder (PLO)',
                type: 'mtt',
                gameVariant: 'plo4',
                buyIn: 4,
                rake: 0.40,
                guarantee: 120,
                startingStack: 3000,
                maxPlayers: 50,
                minPlayers: 8,
                horsesToRegister: 14,
                blindStructure: BLIND_STRUCTURES.TURBO,
                payoutStructure: PAYOUT_STRUCTURES.FIVE,
            },
            {
                name: 'Sunrise Bounty (NLH)',
                type: 'bounty',
                gameVariant: 'nlh',
                buyIn: 6,
                rake: 0.60,
                guarantee: 90,
                startingStack: 3500,
                maxPlayers: 60,
                minPlayers: 10,
                horsesToRegister: 16,
                blindStructure: BLIND_STRUCTURES.TURBO,
                payoutStructure: PAYOUT_STRUCTURES.FIVE,
            },
        ],
    },
    {
        hours: [9, 10, 11],
        tournaments: [
            {
                name: 'Mid-Morning Turbo (6-Max NLH)',
                type: 'mtt',
                gameVariant: 'nlh',
                buyIn: 8,
                rake: 0.80,
                guarantee: 150,
                startingStack: 4000,
                maxPlayers: 36,
                minPlayers: 6,
                horsesToRegister: 12,
                blindStructure: BLIND_STRUCTURES.TURBO,
                payoutStructure: PAYOUT_STRUCTURES.FIVE,
            },
            {
                name: 'Brunch Special PKO (PLO8)',
                type: 'progressive_bounty',
                gameVariant: 'plo8',
                buyIn: 10,
                rake: 1.00,
                guarantee: 180,
                startingStack: 4500,
                maxPlayers: 50,
                minPlayers: 10,
                horsesToRegister: 15,
                blindStructure: BLIND_STRUCTURES.STANDARD,
                payoutStructure: PAYOUT_STRUCTURES.FIVE,
            },
        ],
    },
    {
        hours: [12, 13, 14],
        tournaments: [
            {
                name: 'Lunch Rush (NLH Deep)',
                type: 'mtt',
                gameVariant: 'nlh',
                buyIn: 12,
                rake: 1.20,
                guarantee: 300,
                startingStack: 6000,
                maxPlayers: 100,
                minPlayers: 12,
                horsesToRegister: 20,
                blindStructure: BLIND_STRUCTURES.STANDARD,
                payoutStructure: PAYOUT_STRUCTURES.NINE,
            },
            {
                name: 'Noon Grinder (Pineapple)',
                type: 'mtt',
                gameVariant: 'ofc_pineapple',
                buyIn: 5,
                rake: 0.50,
                guarantee: 100,
                startingStack: 3000,
                maxPlayers: 30,
                minPlayers: 6,
                horsesToRegister: 12,
                blindStructure: BLIND_STRUCTURES.TURBO,
                payoutStructure: PAYOUT_STRUCTURES.FIVE,
            },
        ],
    },
    {
        hours: [15, 16, 17],
        tournaments: [
            {
                name: 'Afternoon Bounty (NLH)',
                type: 'bounty',
                gameVariant: 'nlh',
                buyIn: 10,
                rake: 1.00,
                guarantee: 200,
                startingStack: 4500,
                maxPlayers: 75,
                minPlayers: 10,
                horsesToRegister: 18,
                blindStructure: BLIND_STRUCTURES.TURBO,
                payoutStructure: PAYOUT_STRUCTURES.FIVE,
            },
            {
                name: 'Coffee Break Freeroll (PLO4)',
                type: 'mtt',
                gameVariant: 'plo4',
                buyIn: 0,
                rake: 0,
                guarantee: 80,
                startingStack: 3000,
                maxPlayers: 50,
                minPlayers: 8,
                horsesToRegister: 14,
                blindStructure: BLIND_STRUCTURES.HYPER_TURBO,
                payoutStructure: PAYOUT_STRUCTURES.FIVE,
            },
        ],
    },
    {
        hours: [18, 19, 20],
        tournaments: [
            {
                name: 'Prime Time Main Event (NLH)',
                type: 'mtt',
                gameVariant: 'nlh',
                buyIn: 25,
                rake: 2.50,
                guarantee: 1000,
                startingStack: 10000,
                maxPlayers: 150,
                minPlayers: 20,
                horsesToRegister: 30,
                blindStructure: BLIND_STRUCTURES.STANDARD,
                payoutStructure: PAYOUT_STRUCTURES.NINE,
            },
            {
                name: 'Evening Mystery Bounty (PLO5)',
                type: 'mystery_bounty',
                gameVariant: 'plo5',
                buyIn: 15,
                rake: 1.50,
                guarantee: 400,
                startingStack: 5000,
                maxPlayers: 60,
                minPlayers: 12,
                horsesToRegister: 18,
                blindStructure: BLIND_STRUCTURES.TURBO,
                payoutStructure: PAYOUT_STRUCTURES.FIVE,
            },
        ],
    },
    {
        hours: [21, 22, 23],
        tournaments: [
            {
                name: 'Night Owl Special (NLH)',
                type: 'bounty',
                gameVariant: 'nlh',
                buyIn: 20,
                rake: 2.00,
                guarantee: 600,
                startingStack: 8000,
                maxPlayers: 100,
                minPlayers: 15,
                horsesToRegister: 25,
                blindStructure: BLIND_STRUCTURES.TURBO,
                payoutStructure: PAYOUT_STRUCTURES.NINE,
            },
            {
                name: 'Late Night PKO (PLO4)',
                type: 'progressive_bounty',
                gameVariant: 'plo4',
                buyIn: 18,
                rake: 1.80,
                guarantee: 450,
                startingStack: 7500,
                maxPlayers: 70,
                minPlayers: 12,
                horsesToRegister: 20,
                blindStructure: BLIND_STRUCTURES.TURBO,
                payoutStructure: PAYOUT_STRUCTURES.FIVE,
            },
        ],
    },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SNG CONFIGS
// ═══════════════════════════════════════════════════════════════════════════════

const SNG_CONFIGS: SNGConfig[] = [
    { name: '5 Chip Turbo SNG 6-Max NLH', type: 'sng', gameVariant: 'nlh', buyIn: 5, rake: 0.50, startingStack: 1500, maxPlayers: 6, minPlayers: 6, horsesToRegister: 6, blindStructure: BLIND_STRUCTURES.SNG_6MAX, payoutStructure: [{ place: 1, percentage: 65 }, { place: 2, percentage: 35 }] },
    { name: '10 Chip SNG 9-Max NLH', type: 'sng', gameVariant: 'nlh', buyIn: 10, rake: 1.00, startingStack: 2000, maxPlayers: 9, minPlayers: 9, horsesToRegister: 9, blindStructure: BLIND_STRUCTURES.SNG_6MAX, payoutStructure: PAYOUT_STRUCTURES.THREE },
    { name: '5 Chip Turbo SNG 6-Max PLO4', type: 'sng', gameVariant: 'plo4', buyIn: 5, rake: 0.50, startingStack: 1500, maxPlayers: 6, minPlayers: 6, horsesToRegister: 6, blindStructure: BLIND_STRUCTURES.SNG_6MAX, payoutStructure: [{ place: 1, percentage: 65 }, { place: 2, percentage: 35 }] },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SPIN CONFIGS
// ═══════════════════════════════════════════════════════════════════════════════

const SPIN_CONFIGS: SpinConfig[] = [
    { name: '1 Chip Spin NLH', type: 'spin', gameVariant: 'nlh', buyIn: 1, rake: 0.10, startingStack: 500, maxPlayers: 3, minPlayers: 3, horsesToRegister: 3, blindStructure: BLIND_STRUCTURES.SPIN, payoutStructure: [{ place: 1, percentage: 100 }], spinMultipliers: SPIN_MULTIPLIERS },
    { name: '3 Chip Spin NLH', type: 'spin', gameVariant: 'nlh', buyIn: 3, rake: 0.30, startingStack: 500, maxPlayers: 3, minPlayers: 3, horsesToRegister: 3, blindStructure: BLIND_STRUCTURES.SPIN, payoutStructure: [{ place: 1, percentage: 100 }], spinMultipliers: SPIN_MULTIPLIERS },
    { name: '5 Chip Spin PLO4', type: 'spin', gameVariant: 'plo4', buyIn: 5, rake: 0.50, startingStack: 500, maxPlayers: 3, minPlayers: 3, horsesToRegister: 3, blindStructure: BLIND_STRUCTURES.SPIN, payoutStructure: [{ place: 1, percentage: 100 }], spinMultipliers: SPIN_MULTIPLIERS },
];

// ═══════════════════════════════════════════════════════════════════════════════
// TOURNAMENT RECURRING SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class TournamentRecurringService {
    private tournamentInterval: ReturnType<typeof setInterval> | null = null;
    private sngInterval: ReturnType<typeof setInterval> | null = null;
    private spinInterval: ReturnType<typeof setInterval> | null = null;
    private isRunning = false;

    private clubIds = [SHARK_CLUB_ID, JAQK_CLUB_ID];
    private clubIndex = 0;

    private getNextClubId(): string {
        const id = this.clubIds[this.clubIndex % this.clubIds.length];
        this.clubIndex++;
        return id;
    }

    /**
     * Start all recurring tournament checks
     */
    start(): void {
        if (this.isRunning) {
            console.log('[TournamentRecurring] Already running');
            return;
        }

        this.isRunning = true;
        console.log('[TournamentRecurring] Service started — checking tournaments every 5 min, SNGs every 15 min, Spins every 10 min');

        // Tournament check: every 5 minutes
        this.tournamentInterval = setInterval(
            () => this.checkAndLaunchTournaments(),
            5 * 60 * 1000
        );

        // SNG check: every 15 minutes
        this.sngInterval = setInterval(
            () => this.checkAndLaunchSNGs(),
            15 * 60 * 1000
        );

        // Spin check: every 10 minutes
        this.spinInterval = setInterval(
            () => this.checkAndLaunchSpins(),
            10 * 60 * 1000
        );

        // Run checks immediately on start
        this.checkAndLaunchTournaments();
        this.checkAndLaunchSNGs();
        this.checkAndLaunchSpins();
    }

    /**
     * Stop all recurring checks
     */
    stop(): void {
        if (!this.isRunning) {
            console.log('[TournamentRecurring] Already stopped');
            return;
        }

        if (this.tournamentInterval) clearInterval(this.tournamentInterval);
        if (this.sngInterval) clearInterval(this.sngInterval);
        if (this.spinInterval) clearInterval(this.spinInterval);

        this.tournamentInterval = null;
        this.sngInterval = null;
        this.spinInterval = null;
        this.isRunning = false;

        console.log('[TournamentRecurring] Service stopped');
    }

    /**
     * Check current hour and launch appropriate tournaments
     */
    private async checkAndLaunchTournaments(): Promise<void> {
        try {
            const now = new Date();
            const hour = now.getHours();

            // Find tournaments for this hour
            const block = HOURLY_SCHEDULE.find(b => b.hours.includes(hour));
            if (!block) {
                console.log(`[TournamentRecurring] No tournaments scheduled for hour ${hour}`);
                return;
            }

            console.log(`[TournamentRecurring] Checking tournaments for hour ${hour}`);

            for (const config of block.tournaments) {
                // Check if a similar tournament is already REGISTERING
                const existing = await this.getActiveCount('mtt', config.name);
                if (existing > 0) {
                    console.log(`[TournamentRecurring] Tournament "${config.name}" already active (${existing} running)`);
                    continue;
                }

                // Launch new tournament
                const result = await this.createTournament(config);
                if (result.tournamentId) {
                    console.log(`[TournamentRecurring] Launched: "${config.name}" (${result.registered} horses)`);
                }
            }
        } catch (err: any) {
            const message = `[TournamentRecurring] Tournament check error: ${err.message}`;
            console.error(message);
            horseBugReporter.report({
                horseName: 'TournamentRecurring',
                horseId: 'system',
                tableId: 'system',
                tableName: 'System',
                handNumber: 0,
                category: 'tournament_bug',
                severity: 'high',
                title: 'Tournament check error',
                description: message,
                context: { error: err.message },
            });
        }
    }

    /**
     * Check active SNG count and launch if below threshold
     */
    private async checkAndLaunchSNGs(): Promise<void> {
        try {
            const activeCount = await this.getActiveCount('sng');
            const threshold = 3;

            if (activeCount >= threshold) {
                console.log(`[TournamentRecurring] SNGs OK: ${activeCount} active (threshold: ${threshold})`);
                return;
            }

            console.log(`[TournamentRecurring] SNG count low (${activeCount}), launching more...`);

            // Launch SNGs until we meet threshold
            const toLaunch = threshold - activeCount;
            let launched = 0;

            for (let i = 0; i < toLaunch; i++) {
                const config = SNG_CONFIGS[i % SNG_CONFIGS.length];
                const result = await this.createSNG(config);
                if (result.tournamentId) {
                    launched++;
                }
            }

            console.log(`[TournamentRecurring] Launched ${launched} SNGs`);
        } catch (err: any) {
            const message = `[TournamentRecurring] SNG check error: ${err.message}`;
            console.error(message);
            horseBugReporter.report({
                horseName: 'TournamentRecurring',
                horseId: 'system',
                tableId: 'system',
                tableName: 'System',
                handNumber: 0,
                category: 'tournament_bug',
                severity: 'high',
                title: 'SNG check error',
                description: message,
                context: { error: err.message },
            });
        }
    }

    /**
     * Check active Spin count and launch if below threshold
     */
    private async checkAndLaunchSpins(): Promise<void> {
        try {
            const activeCount = await this.getActiveCount('spin');
            const threshold = 5;

            if (activeCount >= threshold) {
                console.log(`[TournamentRecurring] Spins OK: ${activeCount} active (threshold: ${threshold})`);
                return;
            }

            console.log(`[TournamentRecurring] Spin count low (${activeCount}), launching more...`);

            // Launch Spins until we meet threshold
            const toLaunch = threshold - activeCount;
            let launched = 0;

            for (let i = 0; i < toLaunch; i++) {
                const config = SPIN_CONFIGS[i % SPIN_CONFIGS.length];
                const result = await this.createSpin(config);
                if (result.tournamentId) {
                    launched++;
                }
            }

            console.log(`[TournamentRecurring] Launched ${launched} Spins`);
        } catch (err: any) {
            const message = `[TournamentRecurring] Spin check error: ${err.message}`;
            console.error(message);
            horseBugReporter.report({
                horseName: 'TournamentRecurring',
                horseId: 'system',
                tableId: 'system',
                tableName: 'System',
                handNumber: 0,
                category: 'tournament_bug',
                severity: 'high',
                title: 'Spin check error',
                description: message,
                context: { error: err.message },
            });
        }
    }

    /**
     * Get count of active tournaments by type
     */
    private async getActiveCount(type: string, name?: string): Promise<number> {
        try {
            let query = supabase
                .from('tournaments')
                .select('id', { count: 'exact', head: true })
                .in('status', ['ANNOUNCED', 'REGISTERING', 'RUNNING']);

            if (type === 'mtt' || type === 'bounty' || type === 'progressive_bounty' || type === 'mystery_bounty') {
                query = query.in('variant', ['freezeout', 'bounty', 'progressive_bounty', 'mystery_bounty']);
            } else if (type === 'sng') {
                query = query.eq('variant', 'sng');
            } else if (type === 'spin') {
                query = query.eq('variant', 'spin');
            }

            if (name) {
                query = query.ilike('name', name);
            }

            const { count, error } = await query;

            if (error) {
                console.error(`[TournamentRecurring] getActiveCount error: ${error.message}`);
                return 0;
            }

            return count || 0;
        } catch (err: any) {
            console.error(`[TournamentRecurring] getActiveCount exception: ${err.message}`);
            return 0;
        }
    }

    /**
     * Create a tournament and register horses
     */
    private async createTournament(config: TournamentConfig): Promise<{ tournamentId: string | null; registered: number }> {
        try {
            const startTime = new Date(Date.now() + 60 * 1000); // Start in 60 seconds

            const gameTypeMap: Record<string, string> = {
                'nlh': 'NLH',
                'plo4': 'PLO4',
                'plo5': 'PLO5',
                'plo8': 'PLO8',
                'ofc_pineapple': 'OFC_PINEAPPLE',
                'short_deck': 'SHORT_DECK',
            };

            const dbGameType = gameTypeMap[config.gameVariant] || 'NLH';

            // Create tournament (buy_in_amount and buy_in_fee are INTEGER columns)
            const { data: tournament, error } = await supabase
                .from('tournaments')
                .insert({
                    club_id: this.getNextClubId(),
                    name: config.name,
                    game_type: dbGameType,
                    variant: config.type === 'mtt' ? 'freezeout' : config.type,
                    buy_in_amount: Math.round(config.buyIn),
                    buy_in_fee: Math.round(config.rake),
                    guaranteed_prize: config.guarantee || 0,
                    starting_chips: config.startingStack,
                    max_players: config.maxPlayers,
                    current_players: 0,
                    status: 'ANNOUNCED',
                    blind_structure: config.blindStructure,
                    payout_structure: config.payoutStructure || [],
                    start_time: startTime.toISOString(),
                    late_reg_mins: 30,
                })
                .select()
                .single();

            if (error) {
                console.error(`[TournamentRecurring] Tournament creation failed: ${error.message}`);
                return { tournamentId: null, registered: 0 };
            }

            // Register horses
            const registered = await this.registerHorsesForTournament(tournament.id, config.horsesToRegister);

            // Update tournament status to REGISTERING
            await supabase
                .from('tournaments')
                .update({
                    current_players: registered,
                    status: 'REGISTERING',
                })
                .eq('id', tournament.id);

            return { tournamentId: tournament.id, registered };
        } catch (err: any) {
            console.error(`[TournamentRecurring] createTournament error: ${err.message}`);
            return { tournamentId: null, registered: 0 };
        }
    }

    /**
     * Create an SNG
     */
    private async createSNG(config: SNGConfig): Promise<{ tournamentId: string | null; registered: number }> {
        try {
            const startTime = new Date(Date.now() + 60 * 1000);

            const gameTypeMap: Record<string, string> = {
                'nlh': 'NLH',
                'plo4': 'PLO4',
                'plo5': 'PLO5',
                'plo8': 'PLO8',
                'ofc_pineapple': 'OFC_PINEAPPLE',
            };

            const dbGameType = gameTypeMap[config.gameVariant] || 'NLH';

            const { data: sng, error } = await supabase
                .from('tournaments')
                .insert({
                    club_id: this.getNextClubId(),
                    name: config.name,
                    game_type: dbGameType,
                    variant: 'sng',
                    buy_in_amount: Math.round(config.buyIn),
                    buy_in_fee: Math.round(config.rake),
                    guaranteed_prize: 0,
                    starting_chips: config.startingStack,
                    max_players: config.maxPlayers,
                    current_players: 0,
                    status: 'ANNOUNCED',
                    blind_structure: config.blindStructure,
                    payout_structure: config.payoutStructure || [],
                    start_time: startTime.toISOString(),
                    late_reg_mins: 30,
                })
                .select()
                .single();

            if (error) {
                console.error(`[TournamentRecurring] SNG creation failed: ${error.message}`);
                return { tournamentId: null, registered: 0 };
            }

            const registered = await this.registerHorsesForTournament(sng.id, config.horsesToRegister);

            await supabase
                .from('tournaments')
                .update({
                    current_players: registered,
                    status: 'REGISTERING',
                })
                .eq('id', sng.id);

            return { tournamentId: sng.id, registered };
        } catch (err: any) {
            console.error(`[TournamentRecurring] createSNG error: ${err.message}`);
            return { tournamentId: null, registered: 0 };
        }
    }

    /**
     * Create a Spin
     */
    private async createSpin(config: SpinConfig): Promise<{ tournamentId: string | null; registered: number; multiplier: number }> {
        try {
            const startTime = new Date(Date.now() + 60 * 1000);

            // Roll multiplier
            const multiplier = this.rollSpinMultiplier(config.spinMultipliers);
            const prizePool = config.buyIn * config.horsesToRegister * multiplier;

            const gameTypeMap: Record<string, string> = {
                'nlh': 'NLH',
                'plo4': 'PLO4',
                'plo5': 'PLO5',
                'plo8': 'PLO8',
                'ofc_pineapple': 'OFC_PINEAPPLE',
            };

            const dbGameType = gameTypeMap[config.gameVariant] || 'NLH';

            const { data: spin, error } = await supabase
                .from('tournaments')
                .insert({
                    club_id: this.getNextClubId(),
                    name: `${config.name} (${multiplier}x)`,
                    game_type: dbGameType,
                    variant: 'spin',
                    buy_in_amount: Math.round(config.buyIn),
                    buy_in_fee: Math.round(config.rake),
                    guaranteed_prize: Math.round(prizePool),
                    starting_chips: config.startingStack,
                    max_players: config.maxPlayers,
                    current_players: 0,
                    status: 'ANNOUNCED',
                    blind_structure: config.blindStructure,
                    payout_structure: config.payoutStructure || [],
                    start_time: startTime.toISOString(),
                    late_reg_mins: 0,
                })
                .select()
                .single();

            if (error) {
                console.error(`[TournamentRecurring] Spin creation failed: ${error.message}`);
                return { tournamentId: null, registered: 0, multiplier: 0 };
            }

            const registered = await this.registerHorsesForTournament(spin.id, config.horsesToRegister);

            await supabase
                .from('tournaments')
                .update({
                    current_players: registered,
                    status: 'REGISTERING',
                })
                .eq('id', spin.id);

            return { tournamentId: spin.id, registered, multiplier };
        } catch (err: any) {
            console.error(`[TournamentRecurring] createSpin error: ${err.message}`);
            return { tournamentId: null, registered: 0, multiplier: 0 };
        }
    }

    /**
     * Register available horses for a tournament
     */
    private async registerHorsesForTournament(tournamentId: string, count: number): Promise<number> {
        try {
            // Get available horses
            const { data: horses, error } = await supabase
                .from('profiles')
                .select('id, display_name, username')
                .eq('is_horse', true)
                .eq('horse_status', 'available')
                .limit(count);

            if (error) {
                console.error(`[TournamentRecurring] Failed to fetch horses: ${error.message}`);
                return 0;
            }

            if (!horses || horses.length === 0) {
                console.warn(`[TournamentRecurring] No available horses found`);
                return 0;
            }

            let registered = 0;

            for (const horse of horses) {
                const { error: regError } = await supabase
                    .from('tournament_players')
                    .insert({
                        tournament_id: tournamentId,
                        user_id: horse.id,
                        username: horse.username || horse.display_name,
                        status: 'registered',
                        chips: 0,
                    });

                if (!regError) {
                    registered++;
                }
            }

            return registered;
        } catch (err: any) {
            console.error(`[TournamentRecurring] registerHorsesForTournament error: ${err.message}`);
            return 0;
        }
    }

    /**
     * Roll a random spin multiplier based on weights
     */
    private rollSpinMultiplier(multipliers: Array<{ multiplier: number; weight: number }>): number {
        const totalWeight = multipliers.reduce((sum, m) => sum + m.weight, 0);
        let random = Math.random() * totalWeight;

        for (const { multiplier, weight } of multipliers) {
            random -= weight;
            if (random <= 0) {
                return multiplier;
            }
        }

        return multipliers[multipliers.length - 1].multiplier;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export const tournamentRecurringService = new TournamentRecurringService();

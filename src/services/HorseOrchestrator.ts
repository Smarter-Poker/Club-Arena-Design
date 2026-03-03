/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  HORSE ORCHESTRATOR — Fleet-Wide Coordination Engine
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Manages 100 horses across 4+ concurrent cash game tables, plus tournament,
 * SNG, and Spin registrations. Produces real-time hand history data, validates
 * rake calculations, and verifies Supabase persistence.
 *
 * ARCHITECTURE:
 * - Each table runs its own HandController instance
 * - Horses are distributed across tables based on stake level
 * - Auto-rebuy keeps horses at 100 BB between hands
 * - Hand events persist to Supabase in real-time
 * - MasterBus broadcasts updates across all pages
 */

import { supabase } from '../lib/supabase';
import { HydraService } from './HydraService';
import { tournamentService } from './TournamentService';
import { RakeService } from './RakeService';
import { masterBus } from '../core/MasterBus';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface OrchestratorTable {
    tableId: string;
    name: string;
    smallBlind: number;
    bigBlind: number;
    maxPlayers: number;
    horseCount: number;
    handsPlayed: number;
    totalRake: number;
    totalBBJ: number;
    status: 'seeding' | 'running' | 'stopping' | 'stopped';
    errors: string[];
}

interface OrchestratorStats {
    totalHorses: number;
    totalTables: number;
    totalHandsPlayed: number;
    totalRakeCollected: number;
    totalBBJCollected: number;
    handsPerMinute: number;
    errors: string[];
    uptime: number;
    startedAt: string;
}

interface TableConfig {
    name: string;
    smallBlind: number;
    bigBlind: number;
    maxPlayers: number;
    horsesPerTable: number;
    gameVariant?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT TABLE CONFIGURATIONS — 4 stakes levels, 25 horses each = 100 horses
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_TABLES: TableConfig[] = [
    { name: 'Micro Stakes NLH',   smallBlind: 0.25, bigBlind: 0.50, maxPlayers: 9, horsesPerTable: 8, gameVariant: 'nlh' },
    { name: 'Low Stakes NLH',     smallBlind: 0.50, bigBlind: 1.00, maxPlayers: 9, horsesPerTable: 8, gameVariant: 'nlh' },
    { name: 'Mid Stakes NLH',     smallBlind: 1.00, bigBlind: 2.00, maxPlayers: 9, horsesPerTable: 8, gameVariant: 'nlh' },
    { name: 'High Stakes NLH',    smallBlind: 2.00, bigBlind: 5.00, maxPlayers: 9, horsesPerTable: 8, gameVariant: 'nlh' },
    { name: 'PLO Action',         smallBlind: 0.25, bigBlind: 0.50, maxPlayers: 9, horsesPerTable: 8, gameVariant: 'plo4' },
    { name: 'Micro NLH 6-Max',    smallBlind: 0.10, bigBlind: 0.20, maxPlayers: 6, horsesPerTable: 6, gameVariant: 'nlh' },
    { name: 'Low NLH 6-Max',      smallBlind: 0.50, bigBlind: 1.00, maxPlayers: 6, horsesPerTable: 6, gameVariant: 'nlh' },
    { name: 'Mid PLO5',           smallBlind: 1.00, bigBlind: 2.00, maxPlayers: 6, horsesPerTable: 6, gameVariant: 'plo5' },
    { name: 'Short Deck Action',  smallBlind: 0.50, bigBlind: 1.00, maxPlayers: 6, horsesPerTable: 6, gameVariant: 'short_deck' },
    { name: 'High NLH 9-Max',     smallBlind: 2.00, bigBlind: 4.00, maxPlayers: 9, horsesPerTable: 8, gameVariant: 'nlh' },
    { name: 'Nosebleed NLH',      smallBlind: 5.00, bigBlind: 10.0, maxPlayers: 6, horsesPerTable: 6, gameVariant: 'nlh' },
    { name: 'Bomb Pot NLH',       smallBlind: 0.25, bigBlind: 0.50, maxPlayers: 9, horsesPerTable: 8, gameVariant: 'nlh' },
    { name: 'PLO8 Mixed',         smallBlind: 0.50, bigBlind: 1.00, maxPlayers: 9, horsesPerTable: 8, gameVariant: 'plo8' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// TOURNAMENT / SNG / SPIN CONFIGS
// ═══════════════════════════════════════════════════════════════════════════════

const TOURNAMENT_CONFIGS = [
    {
        name: '$10 Daily Grinder MTT',
        type: 'mtt' as const,
        buyIn: 10, rake: 1,
        startingStack: 5000, maxPlayers: 100, minPlayers: 10,
        horsesToRegister: 20,
        blindStructure: [
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
        payoutStructure: [
            { position: 1, percentage: 30 },
            { position: 2, percentage: 20 },
            { position: 3, percentage: 15 },
            { position: 4, percentage: 10 },
            { position: 5, percentage: 8 },
            { position: 6, percentage: 6 },
            { position: 7, percentage: 5 },
            { position: 8, percentage: 3.5 },
            { position: 9, percentage: 2.5 },
        ],
    },
    {
        name: '$25 Bounty Hunter MTT',
        type: 'bounty' as const,
        buyIn: 25, rake: 2.50,
        startingStack: 10000, maxPlayers: 50, minPlayers: 10,
        horsesToRegister: 15,
        blindStructure: [
            { level: 1, smallBlind: 25, bigBlind: 50, ante: 0, durationMinutes: 12 },
            { level: 2, smallBlind: 50, bigBlind: 100, ante: 10, durationMinutes: 12 },
            { level: 3, smallBlind: 75, bigBlind: 150, ante: 15, durationMinutes: 10 },
            { level: 4, smallBlind: 100, bigBlind: 200, ante: 25, durationMinutes: 10 },
            { level: 5, smallBlind: 150, bigBlind: 300, ante: 30, durationMinutes: 8 },
            { level: 6, smallBlind: 200, bigBlind: 400, ante: 50, durationMinutes: 8 },
            { level: 7, smallBlind: 300, bigBlind: 600, ante: 75, durationMinutes: 6 },
            { level: 8, smallBlind: 500, bigBlind: 1000, ante: 100, durationMinutes: 6 },
        ],
        payoutStructure: [
            { position: 1, percentage: 35 },
            { position: 2, percentage: 22 },
            { position: 3, percentage: 15 },
            { position: 4, percentage: 10 },
            { position: 5, percentage: 8 },
            { position: 6, percentage: 5.5 },
            { position: 7, percentage: 4.5 },
        ],
    },
];

const SNG_CONFIGS = [
    {
        name: '$5 Turbo SNG 6-Max',
        type: 'sng' as const,
        buyIn: 5, rake: 0.50,
        startingStack: 1500, maxPlayers: 6, minPlayers: 6,
        horsesToRegister: 6,
        blindStructure: [
            { level: 1, smallBlind: 10, bigBlind: 20, ante: 0, durationMinutes: 3 },
            { level: 2, smallBlind: 15, bigBlind: 30, ante: 0, durationMinutes: 3 },
            { level: 3, smallBlind: 25, bigBlind: 50, ante: 5, durationMinutes: 3 },
            { level: 4, smallBlind: 50, bigBlind: 100, ante: 10, durationMinutes: 3 },
            { level: 5, smallBlind: 75, bigBlind: 150, ante: 15, durationMinutes: 3 },
            { level: 6, smallBlind: 100, bigBlind: 200, ante: 25, durationMinutes: 2 },
            { level: 7, smallBlind: 150, bigBlind: 300, ante: 30, durationMinutes: 2 },
            { level: 8, smallBlind: 200, bigBlind: 400, ante: 50, durationMinutes: 2 },
        ],
        payoutStructure: [
            { position: 1, percentage: 65 },
            { position: 2, percentage: 35 },
        ],
    },
    {
        name: '$10 SNG 9-Max',
        type: 'sng' as const,
        buyIn: 10, rake: 1,
        startingStack: 2000, maxPlayers: 9, minPlayers: 9,
        horsesToRegister: 9,
        blindStructure: [
            { level: 1, smallBlind: 10, bigBlind: 20, ante: 0, durationMinutes: 5 },
            { level: 2, smallBlind: 20, bigBlind: 40, ante: 0, durationMinutes: 5 },
            { level: 3, smallBlind: 30, bigBlind: 60, ante: 5, durationMinutes: 5 },
            { level: 4, smallBlind: 50, bigBlind: 100, ante: 10, durationMinutes: 4 },
            { level: 5, smallBlind: 75, bigBlind: 150, ante: 15, durationMinutes: 4 },
            { level: 6, smallBlind: 100, bigBlind: 200, ante: 25, durationMinutes: 3 },
            { level: 7, smallBlind: 150, bigBlind: 300, ante: 30, durationMinutes: 3 },
            { level: 8, smallBlind: 200, bigBlind: 400, ante: 50, durationMinutes: 3 },
        ],
        payoutStructure: [
            { position: 1, percentage: 50 },
            { position: 2, percentage: 30 },
            { position: 3, percentage: 20 },
        ],
    },
];

const SPIN_CONFIGS = [
    {
        name: '$3 Spin & Go',
        type: 'spin' as const,
        buyIn: 3, rake: 0.30,
        startingStack: 500, maxPlayers: 3, minPlayers: 3,
        horsesToRegister: 3,
        blindStructure: [
            { level: 1, smallBlind: 10, bigBlind: 20, ante: 0, durationMinutes: 2 },
            { level: 2, smallBlind: 15, bigBlind: 30, ante: 0, durationMinutes: 2 },
            { level: 3, smallBlind: 25, bigBlind: 50, ante: 0, durationMinutes: 2 },
            { level: 4, smallBlind: 50, bigBlind: 100, ante: 0, durationMinutes: 1 },
            { level: 5, smallBlind: 100, bigBlind: 200, ante: 0, durationMinutes: 1 },
        ],
        payoutStructure: [
            { position: 1, percentage: 100 },
        ],
        spinMultipliers: [
            { multiplier: 2, weight: 75 },    // 2x = $6 prize pool (75% chance)
            { multiplier: 3, weight: 15 },    // 3x = $9 (15%)
            { multiplier: 5, weight: 7 },     // 5x = $15 (7%)
            { multiplier: 10, weight: 2.5 },  // 10x = $30 (2.5%)
            { multiplier: 25, weight: 0.4 },  // 25x = $75 (0.4%)
            { multiplier: 100, weight: 0.1 }, // 100x = $300 (0.1%)
        ],
    },
];

// ═══════════════════════════════════════════════════════════════════════════════
// ORCHESTRATOR SINGLETON
// ═══════════════════════════════════════════════════════════════════════════════

class HorseOrchestrator {
    private tables: Map<string, OrchestratorTable> = new Map();
    private startedAt: string | null = null;
    private isRunning = false;
    private handCount = 0;
    private totalRake = 0;
    private totalBBJ = 0;
    private errors: string[] = [];
    private clubId = 'a0000000-0000-0000-0000-000000000001'; // JAQK Club

    /** Launch the full orchestrator — 100 horses across multiple tables */
    async launch(configs: TableConfig[] = DEFAULT_TABLES): Promise<{ success: boolean; tablesCreated: number; horsesSeated: number }> {
        if (this.isRunning) {
            console.warn('[Orchestrator] Already running');
            return { success: false, tablesCreated: 0, horsesSeated: 0 };
        }

        this.isRunning = true;
        this.startedAt = new Date().toISOString();
        console.log(`[Orchestrator] Launching with ${configs.length} table configs`);

        let tablesCreated = 0;
        let horsesSeated = 0;

        for (const config of configs) {
            try {
                // Create table in Supabase
                const { data: table, error } = await supabase
                    .from('tables')
                    .insert({
                        club_id: this.clubId,
                        name: config.name,
                        game_type: 'cash',
                        game_variant: config.gameVariant || 'nlh',
                        stakes: `${config.smallBlind}/${config.bigBlind}`,
                        small_blind: config.smallBlind,
                        big_blind: config.bigBlind,
                        min_buy_in: config.bigBlind * 40,
                        max_buy_in: config.bigBlind * 200,
                        max_players: config.maxPlayers,
                        current_players: 0,
                        status: 'active',
                        settings: {
                            straddle_enabled: true,
                            straddle_type: 'utg',
                            run_it_twice: false,
                            bomb_pot_enabled: config.name.includes('Bomb'),
                            bomb_pot_frequency: 10,
                            bomb_pot_ante_bb: 2,
                            time_bank_seconds: 30,
                            auto_muck: true,
                        },
                    })
                    .select()
                    .single();

                if (error) {
                    this.logError(`Failed to create table "${config.name}": ${error.message}`);
                    continue;
                }

                const tableId = table.id;
                this.tables.set(tableId, {
                    tableId,
                    name: config.name,
                    smallBlind: config.smallBlind,
                    bigBlind: config.bigBlind,
                    maxPlayers: config.maxPlayers,
                    horseCount: 0,
                    handsPlayed: 0,
                    totalRake: 0,
                    totalBBJ: 0,
                    status: 'seeding',
                    errors: [],
                });

                tablesCreated++;

                // Seed horses onto table
                const seatedCount = await this.seedTableWithHorses(tableId, config);
                horsesSeated += seatedCount;

                // Mark table as running
                const tbl = this.tables.get(tableId);
                if (tbl) {
                    tbl.status = 'running';
                    tbl.horseCount = seatedCount;
                }

                console.log(`[Orchestrator] Table "${config.name}" created: ${tableId} with ${seatedCount} horses`);
            } catch (err: any) {
                this.logError(`Table "${config.name}" creation error: ${err.message}`);
            }
        }

        // Broadcast launch event
        masterBus.emit('BALANCE_UPDATED', { source: 'orchestrator', tablesCreated, horsesSeated });

        console.log(`[Orchestrator] Launch complete: ${tablesCreated} tables, ${horsesSeated} horses`);
        return { success: true, tablesCreated, horsesSeated };
    }

    /** Seed a table with horses from the fleet */
    private async seedTableWithHorses(tableId: string, config: TableConfig): Promise<number> {
        let seated = 0;
        const horses = await HydraService.getAvailableHorses(config.horsesPerTable);

        for (const horse of horses) {
            try {
                const buyIn = config.bigBlind * 100; // 100 BB

                // Insert seat
                const { error: seatError } = await supabase
                    .from('table_seats')
                    .insert({
                        table_id: tableId,
                        user_id: horse.id,
                        seat_number: seated + 1,
                        stack: buyIn,
                        is_sitting_out: false,
                        is_away: false,
                    });

                if (seatError) {
                    console.warn(`[Orchestrator] Failed to seat horse ${horse.name}: ${seatError.message}`);
                    continue;
                }

                // Mark horse as seated
                await supabase
                    .from('profiles')
                    .update({ horse_status: 'seated' })
                    .eq('id', horse.id);

                seated++;
            } catch (err: any) {
                console.warn(`[Orchestrator] Horse seating error: ${err.message}`);
            }
        }

        // Update table player count
        await supabase
            .from('tables')
            .update({ current_players: seated })
            .eq('id', tableId);

        return seated;
    }

    /** Create and register horses for a tournament */
    async launchTournament(configIndex: number = 0): Promise<{ tournamentId: string | null; registered: number }> {
        const config = TOURNAMENT_CONFIGS[configIndex];
        if (!config) return { tournamentId: null, registered: 0 };

        try {
            // Create tournament in DB
            const { data: tournament, error } = await supabase
                .from('tournaments')
                .insert({
                    club_id: this.clubId,
                    name: config.name,
                    type: config.type,
                    buy_in: config.buyIn,
                    rake: config.rake,
                    starting_chips: config.startingStack,
                    max_players: config.maxPlayers,
                    current_players: 0,
                    status: 'registering',
                    blind_structure: config.blindStructure,
                    payout_structure: config.payoutStructure,
                    prize_pool: 0,
                    start_time: new Date(Date.now() + 5 * 60000).toISOString(), // 5 mins from now
                })
                .select()
                .single();

            if (error) {
                this.logError(`Tournament creation failed: ${error.message}`);
                return { tournamentId: null, registered: 0 };
            }

            // Register horses
            const horses = await HydraService.getAvailableHorses(config.horsesToRegister);
            let registered = 0;

            for (const horse of horses) {
                const { error: regError } = await supabase
                    .from('tournament_players')
                    .insert({
                        tournament_id: tournament.id,
                        user_id: horse.id,
                        username: horse.name,
                        chips: config.startingStack,
                        status: 'registered',
                    });

                if (!regError) registered++;
            }

            // Update tournament player count and prize pool
            const prizePool = registered * config.buyIn;
            await supabase
                .from('tournaments')
                .update({
                    current_players: registered,
                    prize_pool: prizePool,
                })
                .eq('id', tournament.id);

            console.log(`[Orchestrator] Tournament "${config.name}" created: ${tournament.id} with ${registered} horses, $${prizePool} prize pool`);
            return { tournamentId: tournament.id, registered };
        } catch (err: any) {
            this.logError(`Tournament launch error: ${err.message}`);
            return { tournamentId: null, registered: 0 };
        }
    }

    /** Create and fill a SNG table */
    async launchSNG(configIndex: number = 0): Promise<{ tournamentId: string | null; registered: number }> {
        const config = SNG_CONFIGS[configIndex];
        if (!config) return { tournamentId: null, registered: 0 };

        try {
            const { data: sng, error } = await supabase
                .from('tournaments')
                .insert({
                    club_id: this.clubId,
                    name: config.name,
                    type: config.type,
                    buy_in: config.buyIn,
                    rake: config.rake,
                    starting_chips: config.startingStack,
                    max_players: config.maxPlayers,
                    current_players: 0,
                    status: 'registering',
                    blind_structure: config.blindStructure,
                    payout_structure: config.payoutStructure,
                    prize_pool: 0,
                })
                .select()
                .single();

            if (error) {
                this.logError(`SNG creation failed: ${error.message}`);
                return { tournamentId: null, registered: 0 };
            }

            const horses = await HydraService.getAvailableHorses(config.horsesToRegister);
            let registered = 0;

            for (const horse of horses) {
                const { error: regError } = await supabase
                    .from('tournament_players')
                    .insert({
                        tournament_id: sng.id,
                        user_id: horse.id,
                        username: horse.name,
                        chips: config.startingStack,
                        status: 'registered',
                    });
                if (!regError) registered++;
            }

            const prizePool = registered * config.buyIn;
            await supabase
                .from('tournaments')
                .update({
                    current_players: registered,
                    prize_pool: prizePool,
                    // Auto-start if full
                    status: registered >= config.minPlayers ? 'running' : 'registering',
                    started_at: registered >= config.minPlayers ? new Date().toISOString() : null,
                })
                .eq('id', sng.id);

            console.log(`[Orchestrator] SNG "${config.name}" created: ${sng.id} with ${registered} horses`);
            return { tournamentId: sng.id, registered };
        } catch (err: any) {
            this.logError(`SNG launch error: ${err.message}`);
            return { tournamentId: null, registered: 0 };
        }
    }

    /** Create a Spin & Go with random multiplier */
    async launchSpin(configIndex: number = 0): Promise<{ tournamentId: string | null; registered: number; multiplier: number }> {
        const config = SPIN_CONFIGS[configIndex];
        if (!config) return { tournamentId: null, registered: 0, multiplier: 0 };

        // Roll multiplier
        const multiplier = this.rollSpinMultiplier(config.spinMultipliers);
        const prizePool = config.buyIn * config.horsesToRegister * multiplier;

        try {
            const { data: spin, error } = await supabase
                .from('tournaments')
                .insert({
                    club_id: this.clubId,
                    name: `${config.name} (${multiplier}x)`,
                    type: 'spin',
                    buy_in: config.buyIn,
                    rake: config.rake,
                    starting_chips: config.startingStack,
                    max_players: config.maxPlayers,
                    current_players: 0,
                    status: 'registering',
                    blind_structure: config.blindStructure,
                    payout_structure: [{ position: 1, percentage: 100 }],
                    prize_pool: prizePool,
                })
                .select()
                .single();

            if (error) {
                this.logError(`Spin creation failed: ${error.message}`);
                return { tournamentId: null, registered: 0, multiplier };
            }

            const horses = await HydraService.getAvailableHorses(config.horsesToRegister);
            let registered = 0;

            for (const horse of horses) {
                const { error: regError } = await supabase
                    .from('tournament_players')
                    .insert({
                        tournament_id: spin.id,
                        user_id: horse.id,
                        username: horse.name,
                        chips: config.startingStack,
                        status: 'registered',
                    });
                if (!regError) registered++;
            }

            await supabase
                .from('tournaments')
                .update({
                    current_players: registered,
                    status: registered >= config.minPlayers ? 'running' : 'registering',
                    started_at: registered >= config.minPlayers ? new Date().toISOString() : null,
                })
                .eq('id', spin.id);

            console.log(`[Orchestrator] Spin "${config.name}" (${multiplier}x = $${prizePool}) created with ${registered} horses`);
            return { tournamentId: spin.id, registered, multiplier };
        } catch (err: any) {
            this.logError(`Spin launch error: ${err.message}`);
            return { tournamentId: null, registered: 0, multiplier: 0 };
        }
    }

    /** Roll weighted random multiplier for Spin */
    private rollSpinMultiplier(multipliers: { multiplier: number; weight: number }[]): number {
        const totalWeight = multipliers.reduce((sum, m) => sum + m.weight, 0);
        let roll = Math.random() * totalWeight;
        for (const m of multipliers) {
            roll -= m.weight;
            if (roll <= 0) return m.multiplier;
        }
        return multipliers[0].multiplier;
    }

    /** Record a completed hand's rake data */
    recordHandComplete(tableId: string, rakeAmount: number, bbjAmount: number): void {
        this.handCount++;
        this.totalRake += rakeAmount;
        this.totalBBJ += bbjAmount;

        const table = this.tables.get(tableId);
        if (table) {
            table.handsPlayed++;
            table.totalRake += rakeAmount;
            table.totalBBJ += bbjAmount;
        }
    }

    /** Get orchestrator statistics */
    getStats(): OrchestratorStats {
        const uptimeMs = this.startedAt ? Date.now() - new Date(this.startedAt).getTime() : 0;
        const uptimeMin = uptimeMs / 60000;

        return {
            totalHorses: Array.from(this.tables.values()).reduce((sum, t) => sum + t.horseCount, 0),
            totalTables: this.tables.size,
            totalHandsPlayed: this.handCount,
            totalRakeCollected: Math.round(this.totalRake * 100) / 100,
            totalBBJCollected: Math.round(this.totalBBJ * 100) / 100,
            handsPerMinute: uptimeMin > 0 ? Math.round(this.handCount / uptimeMin * 10) / 10 : 0,
            errors: this.errors.slice(-20), // Last 20 errors
            uptime: Math.round(uptimeMs / 1000),
            startedAt: this.startedAt || '',
        };
    }

    /** Get all table statuses */
    getTableStatuses(): OrchestratorTable[] {
        return Array.from(this.tables.values());
    }

    /** Stop all tables and release horses */
    async shutdown(): Promise<void> {
        console.log('[Orchestrator] Shutting down...');
        this.isRunning = false;

        for (const [tableId, table] of this.tables) {
            table.status = 'stopping';

            // Remove all horse seats
            await supabase
                .from('table_seats')
                .delete()
                .eq('table_id', tableId);

            // Close table
            await supabase
                .from('tables')
                .update({ status: 'closed', current_players: 0 })
                .eq('id', tableId);

            // Reset horse statuses
            await supabase
                .from('profiles')
                .update({ horse_status: 'available' })
                .eq('is_horse', true)
                .eq('horse_status', 'seated');

            table.status = 'stopped';
        }

        console.log(`[Orchestrator] Shutdown complete. ${this.handCount} hands played, $${this.totalRake.toFixed(2)} rake collected`);
    }

    private logError(msg: string): void {
        console.error(`[Orchestrator] ${msg}`);
        this.errors.push(`${new Date().toISOString()} - ${msg}`);
    }
}

// Singleton
export const horseOrchestrator = new HorseOrchestrator();
export { DEFAULT_TABLES, TOURNAMENT_CONFIGS, SNG_CONFIGS, SPIN_CONFIGS };
export type { OrchestratorTable, OrchestratorStats, TableConfig };

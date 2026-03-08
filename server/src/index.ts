/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SMARTER POKER GAME SERVER — 24/7 Server-Side Game Engine
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This is the PRODUCTION game server that replaces DealerPage.
 * It runs 24/7 on the server with ZERO browser dependency.
 *
 * Features:
 * - Creates and manages ALL cash game tables with horse fleet
 * - Creates and manages tournaments on 24/7 schedule (MTTs, SNGs, Spins)
 * - Runs horse AI with millisecond-level response times
 * - Broadcasts hand state via Supabase Realtime
 * - Horse lifecycle management (stuck detection, cleanup)
 * - Auto-recovers from crashes
 * - Health check endpoint for monitoring
 *
 * Deploy to: Fly.io ($3-5/month), Railway, or any Node.js host
 */

import { createServer } from 'http';
import { ServerTableEngine } from './engine/ServerTableEngine.js';
import { supabase, cleanupAllChannels } from './services/supabase.js';
import { HorseFleetManager } from './services/HorseFleetManager.js';
import { TournamentRecurringService } from './services/TournamentRecurringService.js';
import { HorseLifecycleManager } from './services/HorseLifecycleManager.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const PORT = parseInt(process.env.PORT || '8080', 10);
const TABLE_DISCOVERY_INTERVAL = 5000;      // Check for new tables every 5 seconds
const TOURNAMENT_DISCOVERY_INTERVAL = 5000; // Check for tournaments every 5 seconds

// ═══════════════════════════════════════════════════════════════════════════════
// GAME SERVER — Main Orchestrator
// ═══════════════════════════════════════════════════════════════════════════════

class GameServer {
    private tableEngines: Map<string, ServerTableEngine> = new Map();
    private tournamentEngines: Map<string, TournamentManager> = new Map();
    private running: boolean = false;
    private startTime: number = Date.now();

    // Server-side services (replaces browser-based DealerPage services)
    private horseFleet = new HorseFleetManager();
    private tournamentRecurring = new TournamentRecurringService();
    private lifecycle = new HorseLifecycleManager();

    async start(): Promise<void> {
        this.running = true;
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(' SMARTER POKER GAME SERVER — Starting...');
        console.log(' All game logic runs HERE — no browser needed');
        console.log('═══════════════════════════════════════════════════════════════');

        // Step 1: Clean up stale data from previous runs
        await this.cleanupStaleData();

        // Step 2: Start horse fleet manager (creates tables, seats horses)
        await this.horseFleet.start();

        // Step 3: Start tournament recurring service (creates MTTs, SNGs, Spins)
        this.tournamentRecurring.start();

        // Step 4: Start lifecycle manager (stuck horse detection, cleanup)
        this.lifecycle.start();

        // Step 5: Start discovery loops (finds tables with players, starts engines)
        this.discoverCashTables();
        this.discoverTournaments();

        console.log('[GameServer] Running. All services started.');
    }

    async stop(): Promise<void> {
        this.running = false;
        console.log('[GameServer] Shutting down...');

        // Stop services
        this.horseFleet.stop();
        this.tournamentRecurring.stop();
        this.lifecycle.stop();

        // Stop all table engines
        for (const [id, engine] of this.tableEngines) {
            await engine.stop();
        }
        this.tableEngines.clear();

        // Stop all tournament engines
        for (const [id, tm] of this.tournamentEngines) {
            tm.stop();
        }
        this.tournamentEngines.clear();

        // Clean up Realtime channels
        cleanupAllChannels();
        console.log('[GameServer] Shutdown complete.');
    }

    getStatus() {
        let totalHands = 0;
        for (const engine of this.tableEngines.values()) {
            totalHands += engine.getHandCount();
        }
        return {
            running: this.running,
            uptime: Math.floor((Date.now() - this.startTime) / 1000),
            activeTables: this.tableEngines.size,
            activeTournaments: this.tournamentEngines.size,
            totalHandsDealt: totalHands,
        };
    }

    // ═════════════════════════════════════════════════════════════════════════════
    // STALE DATA CLEANUP — Run on startup
    // ═════════════════════════════════════════════════════════════════════════════

    private async cleanupStaleData(): Promise<void> {
        console.log('[GameServer] Cleaning up stale data from previous runs...');
        try {
            // 1. Batch-reset ALL stuck horses to available (fast single query)
            //    Any horse not at an active table will get re-seated by HorseFleetManager
            await supabase
                .from('profiles')
                .update({ horse_status: 'available', updated_at: new Date().toISOString() })
                .eq('is_horse', true)
                .neq('horse_status', 'available');
            console.log('[GameServer] Reset stuck horses to available');

            // 2. DELETE ALL table_seats (clean slate — the unique constraint on
            //    (table_id, seat_number) prevents re-seating if old rows exist)
            //    HorseFleetManager will re-seat horses at all tables
            await supabase
                .from('table_seats')
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000');
            console.log('[GameServer] Deleted all table seats');

            // 3. Reset all cash table player counts to 0
            await supabase
                .from('tables')
                .update({ current_players: 0, status: 'waiting' })
                .is('tournament_id', null)
                .in('status', ['waiting', 'running']);
            console.log('[GameServer] Reset all cash table player counts');

            // 4. Cancel stale REGISTERING/ANNOUNCED tournaments older than 4 hours
            const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
            await supabase
                .from('tournaments')
                .update({ status: 'CANCELLED' })
                .in('status', ['ANNOUNCED', 'REGISTERING'])
                .lt('created_at', fourHoursAgo);

            // 5. Cancel stale RUNNING tournaments older than 12 hours (likely stuck from crashed server)
            const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
            await supabase
                .from('tournaments')
                .update({ status: 'CANCELLED' })
                .eq('status', 'RUNNING')
                .lt('created_at', twelveHoursAgo);
            console.log('[GameServer] Cancelled stale RUNNING tournaments');

            console.log('[GameServer] Stale data cleanup complete');
        } catch (err) {
            console.error('[GameServer] Stale data cleanup error:', err);
        }
    }

    // ═════════════════════════════════════════════════════════════════════════════
    // CASH TABLE DISCOVERY — Every 5 seconds, find tables needing engines
    // ═════════════════════════════════════════════════════════════════════════════

    private async discoverCashTables(): Promise<void> {
        while (this.running) {
            try {
                // Find all cash tables (no tournament_id) that have 2+ seated players
                const { data: tables, error } = await supabase
                    .from('tables')
                    .select('id, status')
                    .is('tournament_id', null)
                    .in('status', ['waiting', 'running']);

                if (error) {
                    console.error('[GameServer] Cash table discovery error:', error);
                    await this.sleep(TABLE_DISCOVERY_INTERVAL);
                    continue;
                }

                for (const table of tables || []) {
                    // Skip if already running
                    if (this.tableEngines.has(table.id)) continue;

                    // Check if table has 2+ players
                    const { count } = await supabase
                        .from('table_seats')
                        .select('*', { count: 'exact', head: true })
                        .eq('table_id', table.id)
                        .is('left_at', null);

                    if ((count || 0) >= 2) {
                        console.log(`[GameServer] Starting engine for cash table ${table.id} (${count} players)`);
                        const engine = new ServerTableEngine(table.id);
                        this.tableEngines.set(table.id, engine);
                        engine.start().catch(err => {
                            console.error(`[GameServer] Engine start failed for ${table.id}:`, err);
                            this.tableEngines.delete(table.id);
                        });
                    }
                }

                // Clean up engines for tables that stopped
                for (const [id, engine] of this.tableEngines) {
                    if (!engine.isRunning()) {
                        this.tableEngines.delete(id);
                    }
                }

            } catch (err) {
                console.error('[GameServer] Cash table discovery error:', err);
            }

            await this.sleep(TABLE_DISCOVERY_INTERVAL);
        }
    }

    // ═════════════════════════════════════════════════════════════════════════════
    // TOURNAMENT DISCOVERY — Find and manage tournaments
    // ═════════════════════════════════════════════════════════════════════════════

    private async discoverTournaments(): Promise<void> {
        while (this.running) {
            try {
                // Find REGISTERING tournaments ready to start
                const { data: registering } = await supabase
                    .from('tournaments')
                    .select('id, name, start_time, current_players, min_players, max_players, variant, buy_in_amount, buy_in_fee, guaranteed_prize')
                    .eq('status', 'REGISTERING');

                for (const tournament of registering || []) {
                    if (this.tournamentEngines.has(tournament.id)) continue;

                    const startTime = new Date(tournament.start_time).getTime();
                    const now = Date.now();
                    const minPlayers = tournament.min_players || 2;

                    // Auto-cancel: if 30+ mins past start time and not enough players
                    if (startTime <= now - 30 * 60 * 1000 && tournament.current_players < minPlayers) {
                        console.log(`[GameServer] Cancelling tournament: ${tournament.name} — only ${tournament.current_players}/${minPlayers} players after 30min`);
                        // Refund all registered players
                        const { data: players } = await supabase
                            .from('tournament_players')
                            .select('user_id')
                            .eq('tournament_id', tournament.id)
                            .eq('status', 'registered');

                        const refundAmount = (tournament.buy_in_amount || 0) + (tournament.buy_in_fee || 0);
                        for (const p of players || []) {
                            await supabase.rpc('credit_player_wallet', { p_user_id: p.user_id, p_amount: refundAmount });
                            await supabase.rpc('log_wallet_transaction', {
                                p_user_id: p.user_id, p_wallet_type: 'PLAYER', p_amount: refundAmount,
                                p_type: 'credit', p_category: 'refund',
                                p_description: `Tournament cancelled (insufficient players): ${tournament.name}`,
                                p_table_id: null, p_hand_id: null, p_related_entity_id: tournament.id,
                            });
                        }
                        await supabase.from('tournament_players').delete().eq('tournament_id', tournament.id);
                        await supabase.from('tournaments').update({ status: 'CANCELLED' }).eq('id', tournament.id);
                        continue;
                    }

                    // Start if past start_time AND minimum players met
                    if (startTime <= now && tournament.current_players >= minPlayers) {
                        console.log(`[GameServer] Starting tournament: ${tournament.name} (${tournament.current_players} players)`);
                        const tm = new TournamentManager(tournament.id, this);
                        this.tournamentEngines.set(tournament.id, tm);
                        tm.start().catch(err => {
                            console.error(`[GameServer] Tournament start failed for ${tournament.name}:`, err);
                            this.tournamentEngines.delete(tournament.id);
                        });
                    }
                }

                // Find RUNNING tournaments that need resuming
                const { data: running } = await supabase
                    .from('tournaments')
                    .select('id, name')
                    .eq('status', 'RUNNING');

                for (const tournament of running || []) {
                    if (this.tournamentEngines.has(tournament.id)) continue;

                    console.log(`[GameServer] Resuming tournament: ${tournament.name}`);
                    const tm = new TournamentManager(tournament.id, this);
                    this.tournamentEngines.set(tournament.id, tm);
                    tm.resume().catch(err => {
                        console.error(`[GameServer] Tournament resume failed for ${tournament.name}:`, err);
                        this.tournamentEngines.delete(tournament.id);
                    });
                }

                // Clean up completed tournaments
                for (const [id, tm] of this.tournamentEngines) {
                    if (!tm.isRunning()) {
                        this.tournamentEngines.delete(id);
                    }
                }

            } catch (err) {
                console.error('[GameServer] Tournament discovery error:', err);
            }

            await this.sleep(TOURNAMENT_DISCOVERY_INTERVAL);
        }
    }

    /**
     * Register a table engine (used by TournamentManager for tournament tables)
     */
    registerTableEngine(tableId: string, engine: ServerTableEngine): void {
        this.tableEngines.set(tableId, engine);
    }

    /**
     * Get a table engine by ID (used by HTTP action endpoint)
     */
    getTableEngine(tableId: string): ServerTableEngine | undefined {
        return this.tableEngines.get(tableId);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOURNAMENT MANAGER — Server-Side Tournament Lifecycle
// ═══════════════════════════════════════════════════════════════════════════════

class TournamentManager {
    private tournamentId: string;
    private gameServer: GameServer;
    private running: boolean = false;
    private blindTimer: NodeJS.Timeout | null = null;
    private eliminationTimer: NodeJS.Timeout | null = null;
    private tableEngines: Map<string, ServerTableEngine> = new Map();
    private currentLevel: number = 0;

    constructor(tournamentId: string, gameServer: GameServer) {
        this.tournamentId = tournamentId;
        this.gameServer = gameServer;
    }

    isRunning(): boolean { return this.running; }

    async start(): Promise<void> {
        this.running = true;
        console.log(`[Tournament:${this.tournamentId.slice(0, 8)}] Starting...`);

        try {
            const { data: tournament } = await supabase
                .from('tournaments')
                .select('*')
                .eq('id', this.tournamentId)
                .single();

            if (!tournament) throw new Error('Tournament not found');

            // Migrate registrations (registered -> playing)
            await supabase
                .from('tournament_players')
                .update({ status: 'playing', chips: tournament.starting_chips })
                .eq('tournament_id', this.tournamentId)
                .eq('status', 'registered');

            // Create tables and seat players
            await this.createTablesAndSeatPlayers(tournament);

            // Set tournament to RUNNING
            await supabase
                .from('tournaments')
                .update({ status: 'RUNNING', started_at: new Date().toISOString() })
                .eq('id', this.tournamentId);

            // Start table engines
            for (const [tableId, engine] of this.tableEngines) {
                this.gameServer.registerTableEngine(tableId, engine);
                engine.start().catch(err =>
                    console.error(`[Tournament:${this.tournamentId.slice(0, 8)}] Table engine error:`, err)
                );
            }

            // Start blind timer
            this.startBlindTimer(tournament.blind_structure || []);

            // Start elimination checker
            this.startEliminationChecker();

            console.log(`[Tournament:${this.tournamentId.slice(0, 8)}] RUNNING — ${this.tableEngines.size} tables`);
        } catch (err) {
            console.error(`[Tournament:${this.tournamentId.slice(0, 8)}] Start failed:`, err);
            this.running = false;
        }
    }

    async resume(): Promise<void> {
        this.running = true;
        console.log(`[Tournament:${this.tournamentId.slice(0, 8)}] Resuming...`);

        try {
            const { data: tournament } = await supabase
                .from('tournaments')
                .select('*')
                .eq('id', this.tournamentId)
                .single();

            if (!tournament) throw new Error('Tournament not found');

            // Find existing tables
            const { data: tables } = await supabase
                .from('tables')
                .select('id')
                .eq('tournament_id', this.tournamentId)
                .in('status', ['running', 'waiting']);

            for (const table of tables || []) {
                const engine = new ServerTableEngine(table.id);
                this.tableEngines.set(table.id, engine);
                this.gameServer.registerTableEngine(table.id, engine);
                engine.start().catch(err =>
                    console.error(`[Tournament:${this.tournamentId.slice(0, 8)}] Resume table error:`, err)
                );
            }

            // Restore blind level
            this.currentLevel = tournament.current_level || 0;
            this.startBlindTimer(tournament.blind_structure || []);
            this.startEliminationChecker();

            console.log(`[Tournament:${this.tournamentId.slice(0, 8)}] Resumed — ${this.tableEngines.size} tables, level ${this.currentLevel}`);
        } catch (err) {
            console.error(`[Tournament:${this.tournamentId.slice(0, 8)}] Resume failed:`, err);
            this.running = false;
        }
    }

    stop(): void {
        this.running = false;
        if (this.blindTimer) clearInterval(this.blindTimer);
        if (this.eliminationTimer) clearInterval(this.eliminationTimer);
        for (const engine of this.tableEngines.values()) {
            engine.stop();
        }
        this.tableEngines.clear();
    }

    private async createTablesAndSeatPlayers(tournament: any): Promise<void> {
        const { data: players } = await supabase
            .from('tournament_players')
            .select('user_id, chips')
            .eq('tournament_id', this.tournamentId)
            .eq('status', 'playing');

        if (!players || players.length === 0) throw new Error('No players');

        const maxPerTable = 9;
        const numTables = Math.ceil(players.length / maxPerTable);

        for (let i = 0; i < numTables; i++) {
            const blindStructure = tournament.blind_structure || [];
            const firstLevel = blindStructure[0] || { smallBlind: 10, bigBlind: 20 };

            const { data: table, error } = await supabase
                .from('tables')
                .insert({
                    club_id: tournament.club_id,
                    tournament_id: this.tournamentId,
                    name: `${tournament.name} - Table ${i + 1}`,
                    game_type: 'tournament',
                    game_variant: tournament.game_type?.toLowerCase() || 'nlh',
                    stakes: `${firstLevel.smallBlind}/${firstLevel.bigBlind}`,
                    small_blind: firstLevel.smallBlind,
                    big_blind: firstLevel.bigBlind,
                    min_buy_in: 0,
                    max_buy_in: 0,
                    max_players: maxPerTable,
                    current_players: 0,
                    status: 'running',
                })
                .select()
                .single();

            if (error || !table) {
                console.error(`[Tournament:${this.tournamentId.slice(0, 8)}] Failed to create table:`, error);
                continue;
            }

            const engine = new ServerTableEngine(table.id);
            this.tableEngines.set(table.id, engine);
        }

        // Round-robin seat players
        const tableIds = [...this.tableEngines.keys()];
        for (let i = 0; i < players.length; i++) {
            const tableId = tableIds[i % tableIds.length];
            const seatNumber = Math.floor(i / tableIds.length) + 1;

            await supabase.from('table_seats').insert({
                table_id: tableId,
                user_id: players[i].user_id,
                seat_number: seatNumber,
                stack: players[i].chips || tournament.starting_chips,
                joined_at: new Date().toISOString(),
            });
        }

        // Update player counts
        for (const tableId of tableIds) {
            const { count } = await supabase
                .from('table_seats')
                .select('*', { count: 'exact', head: true })
                .eq('table_id', tableId)
                .is('left_at', null);
            await supabase.from('tables').update({ current_players: count || 0 }).eq('id', tableId);
        }
    }

    private startBlindTimer(blindStructure: any[]): void {
        if (blindStructure.length === 0) return;

        const advanceBlinds = async () => {
            if (!this.running) return;
            this.currentLevel++;

            if (this.currentLevel >= blindStructure.length) return; // Stay at max

            const level = blindStructure[this.currentLevel];
            console.log(`[Tournament:${this.tournamentId.slice(0, 8)}] Level ${this.currentLevel}: ${level.smallBlind}/${level.bigBlind}`);

            for (const tableId of this.tableEngines.keys()) {
                await supabase
                    .from('tables')
                    .update({
                        small_blind: level.smallBlind,
                        big_blind: level.bigBlind,
                        ante: level.ante || 0,
                    })
                    .eq('id', tableId);
            }

            await supabase
                .from('tournaments')
                .update({ current_level: this.currentLevel })
                .eq('id', this.tournamentId);
        };

        const currentLevelData = blindStructure[this.currentLevel] || blindStructure[0];
        const durationMs = (currentLevelData?.durationMinutes || 10) * 60 * 1000;

        this.blindTimer = setInterval(advanceBlinds, durationMs);
    }

    private isProcessingEliminations = false;

    private startEliminationChecker(): void {
        this.eliminationTimer = setInterval(async () => {
            if (!this.running || this.isProcessingEliminations) return;
            this.isProcessingEliminations = true;

            try {
                // Find ALL busted players (0 chips) in a single query
                const { data: busted } = await supabase
                    .from('tournament_players')
                    .select('user_id, chips')
                    .eq('tournament_id', this.tournamentId)
                    .eq('status', 'playing')
                    .lte('chips', 0);

                if (busted && busted.length > 0) {
                    // Get current remaining count BEFORE processing any eliminations
                    const { count: playingCount } = await supabase
                        .from('tournament_players')
                        .select('*', { count: 'exact', head: true })
                        .eq('tournament_id', this.tournamentId)
                        .eq('status', 'playing');

                    const { count: totalCount } = await supabase
                        .from('tournament_players')
                        .select('*', { count: 'exact', head: true })
                        .eq('tournament_id', this.tournamentId);

                    // All busted players in same batch get the SAME position
                    // (like being eliminated on the same hand — they split the position)
                    // Position = number of players still playing (including the busted ones about to be removed)
                    const position = playingCount || busted.length;

                    // Process each busted player at the same position
                    for (const player of busted) {
                        await this.eliminatePlayer(player.user_id, position);
                    }
                }

                // Check remaining players AFTER all eliminations processed
                const { count: remainingCount } = await supabase
                    .from('tournament_players')
                    .select('*', { count: 'exact', head: true })
                    .eq('tournament_id', this.tournamentId)
                    .eq('status', 'playing');

                if ((remainingCount || 0) <= 1) {
                    // Use maybeSingle to handle edge case where 0 players remain
                    const { data: winner } = await supabase
                        .from('tournament_players')
                        .select('user_id')
                        .eq('tournament_id', this.tournamentId)
                        .eq('status', 'playing')
                        .maybeSingle();

                    if (winner) {
                        await this.finishTournament(winner.user_id);
                    } else if ((remainingCount || 0) === 0) {
                        // All players busted simultaneously — pick the last eliminated as winner
                        const { data: lastEliminated } = await supabase
                            .from('tournament_players')
                            .select('user_id')
                            .eq('tournament_id', this.tournamentId)
                            .eq('status', 'eliminated')
                            .order('eliminated_at', { ascending: false })
                            .limit(1)
                            .maybeSingle();

                        if (lastEliminated) {
                            console.log(`[Tournament:${this.tournamentId.slice(0, 8)}] All busted simultaneously — last eliminated wins`);
                            await this.finishTournament(lastEliminated.user_id);
                        }
                    }
                }

                await this.checkTableBalance();
            } catch (err) {
                console.error(`[Tournament:${this.tournamentId.slice(0, 8)}] Elimination check error:`, err);
            } finally {
                this.isProcessingEliminations = false;
            }
        }, 5000);
    }

    private async eliminatePlayer(userId: string, position: number): Promise<void> {
        // Guard: check if already eliminated (prevents double-processing)
        const { data: playerCheck } = await supabase
            .from('tournament_players')
            .select('status')
            .eq('tournament_id', this.tournamentId)
            .eq('user_id', userId)
            .single();

        if (playerCheck?.status === 'eliminated' || playerCheck?.status === 'winner') {
            return; // Already processed
        }

        const { data: tournament } = await supabase
            .from('tournaments')
            .select('payout_structure, prize_pool')
            .eq('id', this.tournamentId)
            .single();

        let prize = 0;
        if (tournament?.payout_structure) {
            let payouts = tournament.payout_structure;
            if (typeof payouts === 'string') {
                try { payouts = JSON.parse(payouts); } catch { payouts = []; }
            }
            if (Array.isArray(payouts)) {
                const payoutEntry = payouts.find((p: any) => p.place === position);
                if (payoutEntry) {
                    // Exact cent-precision: truncate sub-cent fractions
                    prize = Math.trunc((tournament.prize_pool || 0) * payoutEntry.percentage / 100 * 100) / 100;
                }
            }
        }

        await supabase
            .from('tournament_players')
            .update({
                status: 'eliminated',
                position,
                prize,
                eliminated_at: new Date().toISOString(),
            })
            .eq('tournament_id', this.tournamentId)
            .eq('user_id', userId)
            .eq('status', 'playing'); // Only update if still playing (prevents double-processing)

        if (prize > 0) {
            const { error: creditErr } = await supabase.rpc('credit_player_wallet', {
                p_user_id: userId,
                p_amount: prize,
            });

            if (creditErr) {
                console.error(`[Tournament:${this.tournamentId.slice(0, 8)}] CRITICAL: Prize credit failed for ${userId.slice(0, 8)}: ${creditErr.message}`);
            } else {
                // Log prize payout via RPC (SECURITY DEFINER bypasses RLS)
                await supabase.rpc('log_wallet_transaction', {
                    p_user_id: userId,
                    p_wallet_type: 'PLAYER',
                    p_amount: prize,
                    p_type: 'credit',
                    p_category: 'prize',
                    p_description: `Tournament prize: position ${position}`,
                    p_table_id: null,
                    p_hand_id: null,
                    p_related_entity_id: this.tournamentId,
                });
            }
        }

        await supabase
            .from('table_seats')
            .update({ left_at: new Date().toISOString() })
            .eq('user_id', userId)
            .is('left_at', null);

        console.log(`[Tournament:${this.tournamentId.slice(0, 8)}] Eliminated: ${userId.slice(0, 8)} at position ${position} (prize: ${prize})`);
    }

    private tournamentFinished = false;

    private async finishTournament(winnerId: string): Promise<void> {
        // Guard: prevent double-finishing (race between elimination checker cycles)
        if (this.tournamentFinished) return;
        this.tournamentFinished = true;

        console.log(`[Tournament:${this.tournamentId.slice(0, 8)}] COMPLETE! Winner: ${winnerId.slice(0, 8)}`);

        const { data: tournament } = await supabase
            .from('tournaments')
            .select('payout_structure, prize_pool, buy_in_fee, current_players, club_id, name, status')
            .eq('id', this.tournamentId)
            .single();

        // Guard: don't process already completed tournaments
        if (tournament?.status === 'COMPLETED' || tournament?.status === 'CANCELLED') {
            console.log(`[Tournament:${this.tournamentId.slice(0, 8)}] Already ${tournament.status}, skipping`);
            return;
        }

        if (tournament?.payout_structure) {
            let payouts = tournament.payout_structure;
            if (typeof payouts === 'string') {
                try { payouts = JSON.parse(payouts); } catch { payouts = []; }
            }
            const firstPlace = Array.isArray(payouts) ? payouts.find((p: any) => p.place === 1) : null;
            if (firstPlace) {
                // Exact cent-precision: truncate sub-cent fractions
                const prize = Math.trunc((tournament.prize_pool || 0) * firstPlace.percentage / 100 * 100) / 100;
                await supabase.rpc('credit_player_wallet', {
                    p_user_id: winnerId,
                    p_amount: prize,
                });

                // Log winner prize via RPC (SECURITY DEFINER bypasses RLS)
                await supabase.rpc('log_wallet_transaction', {
                    p_user_id: winnerId,
                    p_wallet_type: 'PLAYER',
                    p_amount: prize,
                    p_type: 'credit',
                    p_category: 'prize',
                    p_description: `Tournament winner prize: 1st place`,
                    p_table_id: null,
                    p_hand_id: null,
                    p_related_entity_id: this.tournamentId,
                });

                await supabase
                    .from('tournament_players')
                    .update({ status: 'winner', position: 1, prize })
                    .eq('tournament_id', this.tournamentId)
                    .eq('user_id', winnerId);
            }
        }

        // ── TOURNAMENT RAKE SETTLEMENT ──
        // Rake is held by union (if club is in a union) or by standalone club owner.
        // Union distributes 90% rake back to clubs weekly. Union holds all BBJ & promo.
        const rakePerEntry = tournament?.buy_in_fee || 0;
        const totalEntries = tournament?.current_players || 0;
        const totalRake = Math.trunc(rakePerEntry * totalEntries * 100) / 100;

        if (totalRake > 0 && tournament?.club_id) {
            // Get club + union info
            const { data: club } = await supabase
                .from('clubs')
                .select('owner_id, name, union_id')
                .eq('id', tournament.club_id)
                .single();

            if (club) {
                let rakeRecipientId: string | null = null;
                let rakeDescription = '';

                if (club.union_id) {
                    // Club is in a union — rake goes to union owner (held until weekly settlement)
                    const { data: union } = await supabase
                        .from('unions')
                        .select('owner_id, name')
                        .eq('id', club.union_id)
                        .single();

                    if (union?.owner_id) {
                        rakeRecipientId = union.owner_id;
                        rakeDescription = `Tournament rake held by ${union.name || 'Union'}: ${tournament.name || 'tournament'} (${totalEntries} entries x ${rakePerEntry}) — ${club.name || 'club'}`;
                    }
                } else {
                    // Standalone club — rake goes directly to club owner
                    rakeRecipientId = club.owner_id;
                    rakeDescription = `Tournament rake: ${tournament.name || 'tournament'} (${totalEntries} entries x ${rakePerEntry})`;
                }

                if (rakeRecipientId) {
                    await supabase.rpc('credit_player_wallet', {
                        p_user_id: rakeRecipientId,
                        p_amount: totalRake,
                    });

                    await supabase.rpc('log_wallet_transaction', {
                        p_user_id: rakeRecipientId,
                        p_wallet_type: 'PLAYER',
                        p_amount: totalRake,
                        p_type: 'credit',
                        p_category: 'rake',
                        p_description: rakeDescription,
                        p_table_id: null,
                        p_hand_id: null,
                        p_related_entity_id: this.tournamentId,
                    });

                    console.log(`[Tournament:${this.tournamentId.slice(0, 8)}] Rake settled: ${totalRake} to ${club.union_id ? 'union' : 'club'} owner ${rakeRecipientId.slice(0, 8)}`);
                }
            }
        }

        // Update tournament with total_rake and mark completed
        await supabase
            .from('tournaments')
            .update({
                status: 'COMPLETED',
                ended_at: new Date().toISOString(),
                total_rake: totalRake,
            })
            .eq('id', this.tournamentId);

        for (const [tableId, engine] of this.tableEngines) {
            await engine.stop();
            await supabase.from('tables').update({ status: 'closed' }).eq('id', tableId);
        }

        this.stop();
    }

    private async checkTableBalance(): Promise<void> {
        if (this.tableEngines.size <= 1) return;

        const tableCounts: { tableId: string; count: number }[] = [];
        for (const tableId of this.tableEngines.keys()) {
            const { count } = await supabase
                .from('table_seats')
                .select('*', { count: 'exact', head: true })
                .eq('table_id', tableId)
                .is('left_at', null);
            tableCounts.push({ tableId, count: count || 0 });
        }

        for (const tc of tableCounts) {
            if (tc.count < 3 && tc.count > 0 && tableCounts.length > 1) {
                const target = tableCounts.find(t => t.tableId !== tc.tableId && t.count > 0);
                if (target && target.count + tc.count <= 9) {
                    console.log(`[Tournament:${this.tournamentId.slice(0, 8)}] Merging tables`);

                    const { data: seats } = await supabase
                        .from('table_seats')
                        .select('user_id, stack, seat_number')
                        .eq('table_id', tc.tableId)
                        .is('left_at', null);

                    let nextSeat = target.count + 1;
                    for (const seat of seats || []) {
                        // Mark old seat as left FIRST to prevent duplicate active seats
                        await supabase
                            .from('table_seats')
                            .update({ left_at: new Date().toISOString() })
                            .eq('table_id', tc.tableId)
                            .eq('user_id', seat.user_id)
                            .is('left_at', null);

                        // Then insert new seat at target table
                        await supabase.from('table_seats').insert({
                            table_id: target.tableId,
                            user_id: seat.user_id,
                            seat_number: nextSeat++,
                            stack: seat.stack,
                            joined_at: new Date().toISOString(),
                        });

                        // Update tournament_players table_id
                        await supabase
                            .from('tournament_players')
                            .update({ table_id: target.tableId })
                            .eq('tournament_id', this.tournamentId)
                            .eq('user_id', seat.user_id);
                    }

                    const engine = this.tableEngines.get(tc.tableId);
                    if (engine) await engine.stop();
                    this.tableEngines.delete(tc.tableId);
                    await supabase.from('tables').update({ status: 'closed' }).eq('id', tc.tableId);

                    break; // One merge per cycle
                }
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HTTP HEALTH CHECK SERVER — Required for Fly.io / monitoring
// ═══════════════════════════════════════════════════════════════════════════════

const gameServer = new GameServer();

// ═══════════════════════════════════════════════════════════════════════════════
// CORS HEADERS — Allow frontend to call action endpoints
// ═══════════════════════════════════════════════════════════════════════════════

const CORS_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
};

function sendJSON(res: import('http').ServerResponse, statusCode: number, data: unknown): void {
    res.writeHead(statusCode, { 'Content-Type': 'application/json', ...CORS_HEADERS });
    res.end(JSON.stringify(data));
}

function readBody(req: import('http').IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

const httpServer = createServer(async (req, res) => {
    const method = req.method || 'GET';
    const url = req.url || '/';

    // Handle CORS preflight
    if (method === 'OPTIONS') {
        res.writeHead(204, CORS_HEADERS);
        res.end();
        return;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET /health — Health check for monitoring / Fly.io
    // ─────────────────────────────────────────────────────────────────────────
    if (url === '/health' || url === '/') {
        return sendJSON(res, 200, gameServer.getStatus());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // POST /action — Submit a player action (fold/call/raise/check/all-in)
    // Body: { tableId, userId, action, amount? }
    // ─────────────────────────────────────────────────────────────────────────
    if (method === 'POST' && url === '/action') {
        try {
            const body = JSON.parse(await readBody(req));
            const { tableId, userId, action, amount } = body;

            if (!tableId || !userId || !action) {
                return sendJSON(res, 400, { success: false, error: 'Missing tableId, userId, or action' });
            }

            const engine = gameServer.getTableEngine(tableId);
            if (!engine) {
                return sendJSON(res, 404, { success: false, error: 'Table engine not found' });
            }

            const result = engine.handlePlayerAction(userId, action, amount);
            return sendJSON(res, result.success ? 200 : 400, result);
        } catch (err) {
            return sendJSON(res, 500, { success: false, error: 'Invalid request body' });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET /actions/:tableId/:userId — Get available actions for a player
    // ─────────────────────────────────────────────────────────────────────────
    const actionsMatch = url.match(/^\/actions\/([^/]+)\/([^/]+)$/);
    if (method === 'GET' && actionsMatch) {
        const tableId = actionsMatch[1];
        const userId = actionsMatch[2];

        const engine = gameServer.getTableEngine(tableId);
        if (!engine) {
            return sendJSON(res, 404, { canAct: false, error: 'Table engine not found' });
        }

        const actions = engine.getPlayerActions(userId);
        return sendJSON(res, 200, actions);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 404 — Not Found
    // ─────────────────────────────────────────────────────────────────────────
    sendJSON(res, 404, { error: 'Not Found' });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STARTUP
// ═══════════════════════════════════════════════════════════════════════════════

httpServer.listen(PORT, () => {
    console.log(`[HTTP] Health check server listening on port ${PORT}`);
    gameServer.start().catch(err => {
        console.error('[GameServer] Fatal error:', err);
        process.exit(1);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ═══════════════════════════════════════════════════════════════════════════════

const shutdown = async () => {
    console.log('\n[GameServer] Received shutdown signal...');
    await gameServer.stop();
    httpServer.close();
    process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', (err) => {
    console.error('[GameServer] Uncaught exception:', err);
    // Don't crash — keep running
});
process.on('unhandledRejection', (err) => {
    console.error('[GameServer] Unhandled rejection:', err);
    // Don't crash — keep running
});

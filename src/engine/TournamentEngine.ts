/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TOURNAMENT ENGINE — Headless tournament orchestrator
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Manages the full lifecycle of a poker tournament:
 * 1. REGISTERING → RUNNING transition
 * 2. Creates tournament tables and seats players
 * 3. Deals hands via HeadlessTableEngine (tournament mode)
 * 4. Tracks blind level advancement
 * 5. Eliminates busted players, awards prizes
 * 6. Handles table balancing when players bust
 * 7. Detects winner (last player standing)
 *
 * Used by DealerPage to orchestrate all active tournaments.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { HeadlessTableEngine } from './HeadlessTableEngine';
import { BLIND_STRUCTURES, PAYOUT_STRUCTURES } from '../services/TournamentService';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface BlindLevel {
    level: number;
    smallBlind: number;
    bigBlind: number;
    ante: number;
    durationMinutes: number;
}

interface PayoutEntry {
    place: number;
    percentage: number;
}

interface TournamentInfo {
    id: string;
    name: string;
    club_id: string;
    game_type: string;
    buy_in_amount: number;
    starting_chips: number;
    max_players: number;
    current_players: number;
    prize_pool: number;
    blind_structure: BlindLevel[];
    payout_structure: PayoutEntry[];
    started_at: string;
}

interface TournamentTable {
    tableId: string;
    engine: HeadlessTableEngine;
    playerCount: number;
}

interface TournamentPlayer {
    user_id: string;
    username: string;
    chips: number;
    status: 'playing' | 'eliminated' | 'winner';
    tableId?: string;
    seatNumber?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLIND STRUCTURE RESOLVER
// ═══════════════════════════════════════════════════════════════════════════════

function resolveBlindStructure(raw: any): BlindLevel[] {
    if (Array.isArray(raw) && raw.length > 0) return raw;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch { /* not JSON */ }

        // Resolve named structures
        const key = raw.toLowerCase().replace(/\s+/g, '');
        if (key === 'turbo') return BLIND_STRUCTURES.turbo;
        if (key === 'regular' || key === 'standard') return BLIND_STRUCTURES.regular;
        if (key === 'deepstack' || key === 'deep') return BLIND_STRUCTURES.deepStack;
    }
    // Default to regular (covers empty arrays, null, undefined, unrecognized strings)
    return BLIND_STRUCTURES.regular;
}

function resolvePayoutStructure(raw: any, playerCount: number): PayoutEntry[] {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
        } catch { /* not JSON */ }
    }

    // Auto-select based on player count
    if (playerCount <= 6) return PAYOUT_STRUCTURES.sng6;
    if (playerCount <= 9) return PAYOUT_STRUCTURES.sng9;
    if (playerCount <= 18) return PAYOUT_STRUCTURES.mtt10;
    if (playerCount <= 35) return PAYOUT_STRUCTURES.mtt20;
    return PAYOUT_STRUCTURES.mtt50;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOURNAMENT ENGINE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class TournamentEngine {
    private tournamentId: string;
    private supabase: SupabaseClient;
    private tournamentInfo: TournamentInfo | null = null;
    private tables: TournamentTable[] = [];
    private players: Map<string, TournamentPlayer> = new Map();
    private running = false;
    private currentLevel = 0;
    private blindCheckInterval: ReturnType<typeof setInterval> | null = null;
    private eliminationCheckInterval: ReturnType<typeof setInterval> | null = null;
    private handsDealt = 0;

    constructor(tournamentId: string, supabase: SupabaseClient) {
        this.tournamentId = tournamentId;
        this.supabase = supabase;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════════════════════════════════════

    async start(): Promise<void> {
        if (this.running) return;
        this.running = true;

        console.log(`[TournamentEngine:${this.tournamentId.slice(0, 8)}] Starting tournament...`);

        try {
            // Step 1: Load tournament info
            await this.loadTournament();
            if (!this.tournamentInfo) throw new Error('Failed to load tournament');

            // Step 2: Migrate registrations → tournament_players
            await this.migrateRegistrations();

            // Step 3: Create tournament tables
            await this.createTournamentTables();

            // Step 4: Seat players at tables
            await this.seatPlayers();

            // Step 5: Update tournament status to RUNNING
            await this.setTournamentRunning();

            // Step 6: Start dealing on each table
            for (const table of this.tables) {
                await table.engine.start();
            }

            // Step 7: Start blind level timer
            this.startBlindTimer();

            // Step 8: Start elimination checker
            this.startEliminationChecker();

            console.log(`[TournamentEngine:${this.tournamentId.slice(0, 8)}] Tournament RUNNING — ${this.players.size} players, ${this.tables.length} tables`);
        } catch (err) {
            console.error(`[TournamentEngine:${this.tournamentId.slice(0, 8)}] Failed to start:`, err);
            this.running = false;
            throw err;
        }
    }

    stop(): void {
        this.running = false;
        if (this.blindCheckInterval) clearInterval(this.blindCheckInterval);
        if (this.eliminationCheckInterval) clearInterval(this.eliminationCheckInterval);
        for (const table of this.tables) {
            table.engine.stop();
        }
        console.log(`[TournamentEngine:${this.tournamentId.slice(0, 8)}] Stopped`);
    }

    isRunning(): boolean { return this.running; }
    getHandCount(): number { return this.handsDealt; }
    getPlayerCount(): number {
        return Array.from(this.players.values()).filter(p => p.status === 'playing').length;
    }
    getTableCount(): number { return this.tables.length; }
    getCurrentLevel(): number { return this.currentLevel; }
    getTournamentName(): string { return this.tournamentInfo?.name || 'Unknown'; }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 1: LOAD TOURNAMENT
    // ═══════════════════════════════════════════════════════════════════════════

    private async loadTournament(): Promise<void> {
        const { data, error } = await this.supabase
            .from('tournaments')
            .select('*')
            .eq('id', this.tournamentId)
            .single();

        if (error || !data) {
            throw new Error(`Failed to load tournament: ${error?.message}`);
        }

        const blinds = resolveBlindStructure(data.blind_structure);
        const playerCount = data.current_players || 0;
        const payouts = resolvePayoutStructure(data.payout_structure, playerCount);

        this.tournamentInfo = {
            id: data.id,
            name: data.name,
            club_id: data.club_id,
            game_type: data.game_type || 'NLH',
            buy_in_amount: data.buy_in_amount || 0,
            starting_chips: data.starting_chips || 10000,
            max_players: data.max_players || 50,
            current_players: playerCount,
            prize_pool: data.prize_pool || (playerCount * (data.buy_in_amount || 0)),
            blind_structure: blinds,
            payout_structure: payouts,
            started_at: '', // Will be set when we transition to RUNNING
        };

        console.log(`[TournamentEngine:${this.tournamentId.slice(0, 8)}] Loaded: ${data.name}, ${playerCount} players, ${blinds.length} blind levels`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 2: MIGRATE REGISTRATIONS → TOURNAMENT_PLAYERS
    // ═══════════════════════════════════════════════════════════════════════════

    private async migrateRegistrations(): Promise<void> {
        if (!this.tournamentInfo) return;

        // Check if tournament_players already has entries for this tournament
        const { data: existingPlayers } = await this.supabase
            .from('tournament_players')
            .select('user_id')
            .eq('tournament_id', this.tournamentId);

        if (existingPlayers && existingPlayers.length > 0) {
            console.log(`[TournamentEngine:${this.tournamentId.slice(0, 8)}] Already has ${existingPlayers.length} tournament_players — skipping migration`);
            // Load existing players
            const { data: fullPlayers } = await this.supabase
                .from('tournament_players')
                .select('user_id, username, chips, status')
                .eq('tournament_id', this.tournamentId);
            if (fullPlayers) {
                for (const p of fullPlayers) {
                    this.players.set(p.user_id, {
                        user_id: p.user_id,
                        username: p.username || p.user_id.slice(0, 8),
                        chips: p.chips || this.tournamentInfo.starting_chips,
                        status: p.status || 'playing',
                    });
                }
            }
            return;
        }

        // Load tournament_registrations
        const { data: registrations, error } = await this.supabase
            .from('tournament_registrations')
            .select('user_id, display_name')
            .eq('tournament_id', this.tournamentId);

        if (error || !registrations || registrations.length === 0) {
            // No registrations — mark tournament as COMPLETED and bail
            console.warn(`[TournamentEngine:${this.tournamentId.slice(0, 8)}] No registrations found — marking COMPLETED`);
            await this.supabase
                .from('tournaments')
                .update({ status: 'COMPLETED', current_players: 0 })
                .eq('id', this.tournamentId);
            throw new Error(`No registrations found for tournament ${this.tournamentId}`);
        }

        // Need at least 2 players for a tournament
        if (registrations.length < 2) {
            console.warn(`[TournamentEngine:${this.tournamentId.slice(0, 8)}] Only ${registrations.length} registration — marking COMPLETED`);
            await this.supabase
                .from('tournaments')
                .update({ status: 'COMPLETED', current_players: registrations.length })
                .eq('id', this.tournamentId);
            throw new Error(`Not enough players (${registrations.length}) for tournament ${this.tournamentId}`);
        }

        console.log(`[TournamentEngine:${this.tournamentId.slice(0, 8)}] Migrating ${registrations.length} registrations to tournament_players`);

        // Insert into tournament_players
        const playerRows = registrations.map(r => ({
            tournament_id: this.tournamentId,
            user_id: r.user_id,
            username: r.display_name || r.user_id.slice(0, 8),
            chips: this.tournamentInfo!.starting_chips,
            status: 'registered',
            rebuys: 0,
            add_on: false,
        }));

        const { error: insertError } = await this.supabase
            .from('tournament_players')
            .insert(playerRows);

        if (insertError) {
            console.error(`[TournamentEngine] Migration insert error:`, insertError.message);
            throw new Error(`Failed to migrate registrations: ${insertError.message}`);
        }

        // Populate local player map
        for (const r of registrations) {
            this.players.set(r.user_id, {
                user_id: r.user_id,
                username: r.display_name || r.user_id.slice(0, 8),
                chips: this.tournamentInfo.starting_chips,
                status: 'playing',
            });
        }

        console.log(`[TournamentEngine:${this.tournamentId.slice(0, 8)}] Migrated ${registrations.length} players`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 3: CREATE TOURNAMENT TABLES
    // ═══════════════════════════════════════════════════════════════════════════

    private async createTournamentTables(): Promise<void> {
        if (!this.tournamentInfo) return;

        const activePlayers = Array.from(this.players.values()).filter(p => p.status === 'playing');
        const numTables = Math.max(1, Math.ceil(activePlayers.length / 9));
        const firstBlinds = this.tournamentInfo.blind_structure[0] || { smallBlind: 10, bigBlind: 20, ante: 0 };

        console.log(`[TournamentEngine:${this.tournamentId.slice(0, 8)}] Creating ${numTables} tournament tables`);

        // Map game_type to game_variant
        const gameVariant = this.mapGameVariant(this.tournamentInfo.game_type);

        for (let i = 0; i < numTables; i++) {
            const tableRow = {
                club_id: this.tournamentInfo.club_id,
                tournament_id: this.tournamentId,
                name: `${this.tournamentInfo.name} — Table ${i + 1}`,
                game_type: 'tournament',
                game_variant: gameVariant,
                stakes: 'Tournament',
                small_blind: firstBlinds.smallBlind,
                big_blind: firstBlinds.bigBlind,
                ante: firstBlinds.ante || 0,
                max_players: 9,
                status: 'running',
            };

            const { data, error } = await this.supabase
                .from('tables')
                .insert(tableRow)
                .select('id')
                .single();

            if (error || !data) {
                console.error(`[TournamentEngine] Failed to create table ${i + 1}:`, error?.message);
                continue;
            }

            const engine = new HeadlessTableEngine(data.id, this.supabase);
            this.tables.push({
                tableId: data.id,
                engine,
                playerCount: 0,
            });
        }

        console.log(`[TournamentEngine:${this.tournamentId.slice(0, 8)}] Created ${this.tables.length} tables`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 4: SEAT PLAYERS AT TABLES
    // ═══════════════════════════════════════════════════════════════════════════

    private async seatPlayers(): Promise<void> {
        if (!this.tournamentInfo) return;

        const activePlayers = Array.from(this.players.values()).filter(p => p.status === 'playing');

        // Fisher-Yates shuffle
        for (let i = activePlayers.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [activePlayers[i], activePlayers[j]] = [activePlayers[j], activePlayers[i]];
        }

        // Distribute round-robin across tables
        const seatInserts: any[] = [];
        for (let i = 0; i < activePlayers.length; i++) {
            const tableIdx = i % this.tables.length;
            const table = this.tables[tableIdx];
            const seatNumber = Math.floor(i / this.tables.length) + 1;

            activePlayers[i].tableId = table.tableId;
            activePlayers[i].seatNumber = seatNumber;
            table.playerCount++;

            seatInserts.push({
                table_id: table.tableId,
                seat_number: seatNumber,
                user_id: activePlayers[i].user_id,
                stack: activePlayers[i].chips,
                is_sitting_out: false,
                is_away: false,
                // Note: horse_id omitted — tournament players are registered users, not horses
                // The horse_id FK constraint would reject non-horse user_ids
            });
        }

        // Batch insert all seats
        const { error } = await this.supabase
            .from('table_seats')
            .insert(seatInserts);

        if (error) {
            console.error(`[TournamentEngine] Failed to seat players:`, error.message);
            throw new Error(`Seating failed: ${error.message}`);
        }

        console.log(`[TournamentEngine:${this.tournamentId.slice(0, 8)}] Seated ${activePlayers.length} players across ${this.tables.length} tables`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 5: SET TOURNAMENT RUNNING
    // ═══════════════════════════════════════════════════════════════════════════

    private async setTournamentRunning(): Promise<void> {
        const now = new Date().toISOString();
        this.tournamentInfo!.started_at = now;

        const { error } = await this.supabase
            .from('tournaments')
            .update({
                status: 'RUNNING',
                started_at: now,
                current_level: 1,
            })
            .eq('id', this.tournamentId);

        if (error) {
            console.error(`[TournamentEngine] Failed to update tournament status:`, error.message);
        }

        // Update all tournament_players to 'playing'
        await this.supabase
            .from('tournament_players')
            .update({ status: 'playing', chips: this.tournamentInfo!.starting_chips })
            .eq('tournament_id', this.tournamentId)
            .eq('status', 'registered');

        console.log(`[TournamentEngine:${this.tournamentId.slice(0, 8)}] Tournament now RUNNING`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BLIND LEVEL TIMER
    // ═══════════════════════════════════════════════════════════════════════════

    private startBlindTimer(): void {
        if (!this.tournamentInfo) return;

        this.currentLevel = 0;

        // Check blind levels every 30 seconds
        this.blindCheckInterval = setInterval(() => {
            this.checkBlindLevel();
        }, 30_000);

        // Initial check
        this.checkBlindLevel();
    }

    private checkBlindLevel(): void {
        if (!this.tournamentInfo || !this.running) return;

        const blinds = this.tournamentInfo.blind_structure;
        const startedAt = new Date(this.tournamentInfo.started_at).getTime();
        const elapsed = Date.now() - startedAt;
        const elapsedMinutes = elapsed / 60_000;

        // Find current level based on elapsed time
        let accumulated = 0;
        let newLevel = 0;
        for (let i = 0; i < blinds.length; i++) {
            accumulated += blinds[i].durationMinutes;
            if (elapsedMinutes < accumulated) {
                newLevel = i;
                break;
            }
            if (i === blinds.length - 1) {
                newLevel = i; // Cap at last level
            }
        }

        if (newLevel !== this.currentLevel) {
            this.currentLevel = newLevel;
            const level = blinds[newLevel];
            console.log(`[TournamentEngine:${this.tournamentId.slice(0, 8)}] BLIND LEVEL UP → Level ${level.level}: ${level.smallBlind}/${level.bigBlind} ante ${level.ante}`);

            // Update all tournament tables with new blinds
            this.updateTableBlinds(level);
        }
    }

    private async updateTableBlinds(level: BlindLevel): Promise<void> {
        for (const table of this.tables) {
            const { error } = await this.supabase
                .from('tables')
                .update({
                    small_blind: level.smallBlind,
                    big_blind: level.bigBlind,
                    ante: level.ante,
                })
                .eq('id', table.tableId);

            if (error) {
                console.error(`[TournamentEngine] Failed to update blinds for table ${table.tableId.slice(0, 8)}:`, error.message);
            }
        }

        // Also update tournament current_level
        await this.supabase
            .from('tournaments')
            .update({ current_level: level.level })
            .eq('id', this.tournamentId);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ELIMINATION CHECKER
    // ═══════════════════════════════════════════════════════════════════════════

    private startEliminationChecker(): void {
        // Check for busted players every 5 seconds
        this.eliminationCheckInterval = setInterval(() => {
            this.checkEliminations();
        }, 5_000);
    }

    private async checkEliminations(): Promise<void> {
        if (!this.running || !this.tournamentInfo) return;

        // Check each tournament table for players with 0 chips
        for (const table of this.tables) {
            const { data: seats } = await this.supabase
                .from('table_seats')
                .select('user_id, stack')
                .eq('table_id', table.tableId)
                .is('left_at', null);

            if (!seats) continue;

            for (const seat of seats) {
                if (seat.stack <= 0) {
                    await this.eliminatePlayer(seat.user_id, table.tableId);
                }
            }

            // Update local table player count
            const activeSeats = seats.filter(s => s.stack > 0);
            table.playerCount = activeSeats.length;
        }

        // Update hand count
        this.handsDealt = this.tables.reduce((sum, t) => sum + t.engine.getHandCount(), 0);

        // Check if tournament is over
        const remainingPlayers = Array.from(this.players.values()).filter(p => p.status === 'playing');
        if (remainingPlayers.length <= 1) {
            await this.finishTournament(remainingPlayers[0]);
        }

        // Check if any tables need to be merged (< 3 players)
        await this.checkTableBalance();
    }

    private async eliminatePlayer(userId: string, tableId: string): Promise<void> {
        const player = this.players.get(userId);
        if (!player || player.status === 'eliminated') return;

        const remainingBefore = Array.from(this.players.values()).filter(p => p.status === 'playing').length;
        const position = remainingBefore; // e.g., if 10 playing, eliminated player gets 10th place

        player.status = 'eliminated';

        // Calculate prize
        const prize = this.calculatePrize(position);

        console.log(`[TournamentEngine:${this.tournamentId.slice(0, 8)}] ELIMINATED: ${player.username} in ${position}${this.getOrdinal(position)} place${prize > 0 ? ` — wins $${prize.toFixed(2)}` : ''}`);

        // Update tournament_players
        await this.supabase
            .from('tournament_players')
            .update({
                status: 'eliminated',
                position,
                prize,
                chips: 0,
                eliminated_at: new Date().toISOString(),
            })
            .eq('tournament_id', this.tournamentId)
            .eq('user_id', userId);

        // Remove from table_seats
        await this.supabase
            .from('table_seats')
            .update({ left_at: new Date().toISOString() })
            .eq('table_id', tableId)
            .eq('user_id', userId)
            .is('left_at', null);

        // Credit prize to player wallet (if any)
        if (prize > 0) {
            await this.creditPrize(userId, prize);
        }
    }

    private calculatePrize(position: number): number {
        if (!this.tournamentInfo) return 0;

        const payoutEntry = this.tournamentInfo.payout_structure.find(p => p.place === position);
        if (!payoutEntry) return 0;

        return Math.floor((this.tournamentInfo.prize_pool * payoutEntry.percentage) / 100 * 100) / 100;
    }

    private async creditPrize(userId: string, amount: number): Promise<void> {
        if (!this.tournamentInfo) return;

        // Try direct club_members update (same pattern as leaveTable)
        const { data: member } = await this.supabase
            .from('club_members')
            .select('chip_balance')
            .eq('club_id', this.tournamentInfo.club_id)
            .eq('user_id', userId)
            .single();

        if (member) {
            const newBalance = (member.chip_balance || 0) + amount;
            await this.supabase
                .from('club_members')
                .update({ chip_balance: newBalance })
                .eq('club_id', this.tournamentInfo.club_id)
                .eq('user_id', userId);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TABLE BALANCING
    // ═══════════════════════════════════════════════════════════════════════════

    private async checkTableBalance(): Promise<void> {
        if (this.tables.length <= 1) return;

        // Find tables with too few players
        const activeTables = this.tables.filter(t => t.playerCount > 0);
        if (activeTables.length <= 1) return;

        // Find the smallest table
        const smallest = activeTables.reduce((a, b) => a.playerCount < b.playerCount ? a : b);

        // If smallest table has < 3 players, merge into other tables
        if (smallest.playerCount < 3 && activeTables.length > 1) {
            await this.mergeTable(smallest);
        }
    }

    private async mergeTable(sourceTable: TournamentTable): Promise<void> {
        console.log(`[TournamentEngine:${this.tournamentId.slice(0, 8)}] Merging table ${sourceTable.tableId.slice(0, 8)} (${sourceTable.playerCount} players)`);

        // Stop the source table engine
        sourceTable.engine.stop();

        // Get remaining players at the source table
        const { data: seats } = await this.supabase
            .from('table_seats')
            .select('user_id, stack')
            .eq('table_id', sourceTable.tableId)
            .is('left_at', null);

        if (!seats || seats.length === 0) {
            this.removeTable(sourceTable);
            return;
        }

        // Find the target table with the most room
        const otherTables = this.tables.filter(t => t.tableId !== sourceTable.tableId && t.playerCount > 0);
        if (otherTables.length === 0) return;

        const target = otherTables.reduce((a, b) => a.playerCount < b.playerCount ? a : b);

        // Move each player
        for (const seat of seats) {
            // Mark old seat as left
            await this.supabase
                .from('table_seats')
                .update({ left_at: new Date().toISOString() })
                .eq('table_id', sourceTable.tableId)
                .eq('user_id', seat.user_id)
                .is('left_at', null);

            // Find next available seat number at target
            const { data: targetSeats } = await this.supabase
                .from('table_seats')
                .select('seat_number')
                .eq('table_id', target.tableId)
                .is('left_at', null);

            const usedSeats = new Set((targetSeats || []).map(s => s.seat_number));
            let newSeat = 1;
            while (usedSeats.has(newSeat) && newSeat <= 9) newSeat++;

            // Insert at target
            await this.supabase
                .from('table_seats')
                .insert({
                    table_id: target.tableId,
                    seat_number: newSeat,
                    user_id: seat.user_id,
                    stack: seat.stack,
                    is_sitting_out: false,
                    is_away: false,
                    horse_id: seat.user_id,
                });

            target.playerCount++;

            // Update local player record
            const player = this.players.get(seat.user_id);
            if (player) {
                player.tableId = target.tableId;
                player.seatNumber = newSeat;
            }
        }

        // Remove source table
        this.removeTable(sourceTable);

        // Mark source table as closed
        await this.supabase
            .from('tables')
            .update({ status: 'closed' })
            .eq('id', sourceTable.tableId);

        console.log(`[TournamentEngine:${this.tournamentId.slice(0, 8)}] Merged into table ${target.tableId.slice(0, 8)}`);
    }

    private removeTable(table: TournamentTable): void {
        const idx = this.tables.indexOf(table);
        if (idx !== -1) {
            this.tables.splice(idx, 1);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FINISH TOURNAMENT
    // ═══════════════════════════════════════════════════════════════════════════

    private async finishTournament(winner?: TournamentPlayer): Promise<void> {
        if (!this.running) return;
        this.running = false;

        console.log(`[TournamentEngine:${this.tournamentId.slice(0, 8)}] TOURNAMENT COMPLETE!`);

        // Stop all table engines
        for (const table of this.tables) {
            table.engine.stop();
        }

        // Award 1st place to winner
        if (winner) {
            winner.status = 'winner';
            const firstPrize = this.calculatePrize(1);

            console.log(`[TournamentEngine:${this.tournamentId.slice(0, 8)}] WINNER: ${winner.username} — $${firstPrize.toFixed(2)}`);

            await this.supabase
                .from('tournament_players')
                .update({
                    status: 'winner',
                    position: 1,
                    prize: firstPrize,
                })
                .eq('tournament_id', this.tournamentId)
                .eq('user_id', winner.user_id);

            if (firstPrize > 0) {
                await this.creditPrize(winner.user_id, firstPrize);
            }
        }

        // Update tournament status
        await this.supabase
            .from('tournaments')
            .update({
                status: 'COMPLETED',
                ended_at: new Date().toISOString(),
            })
            .eq('id', this.tournamentId);

        // Close all tournament tables
        for (const table of this.tables) {
            await this.supabase
                .from('tables')
                .update({ status: 'closed' })
                .eq('id', table.tableId);
        }

        // Clear intervals
        if (this.blindCheckInterval) clearInterval(this.blindCheckInterval);
        if (this.eliminationCheckInterval) clearInterval(this.eliminationCheckInterval);

        console.log(`[TournamentEngine:${this.tournamentId.slice(0, 8)}] All cleanup complete. Total hands: ${this.handsDealt}`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // UTILITIES
    // ═══════════════════════════════════════════════════════════════════════════

    private mapGameVariant(gameType: string): string {
        const map: Record<string, string> = {
            'NLH': 'nlh',
            'PLO': 'plo4',
            'PLO4': 'plo4',
            'PLO5': 'plo5',
            'PLO6': 'plo6',
            'SHORT_DECK': 'short_deck',
        };
        return map[gameType?.toUpperCase()] || 'nlh';
    }

    private getOrdinal(n: number): string {
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return s[(v - 20) % 10] || s[v] || s[0];
    }
}

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
import { WalletService } from '../services/WalletService';
import { masterBus } from '../core/MasterBus';

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
  position?: number; // DB may use 'position' instead of 'place'
  percentage: number;
}

interface TournamentInfo {
  id: string;
  name: string;
  club_id: string;
  game_type: string;
  variant?: string;
  tournament_type?: string;
  buy_in_amount: number;
  buy_in_fee?: number;
  starting_chips: number;
  max_players: number;
  current_players: number;
  prize_pool: number;
  blind_structure: BlindLevel[];
  payout_structure: PayoutEntry[];
  started_at: string;
  current_level?: number;
  // Late reg / rebuy / add-on (level-based)
  late_reg_levels?: number;
  late_reg_mins?: number; // Legacy
  add_on_available?: boolean;
  rebuy_levels?: number;
  is_reentry?: boolean;
  prize_pool_finalized?: boolean;
  // Add-on details
  addon_cost?: number;
  addon_chips?: number;
  addon_levels?: number;
  // Bounty fields
  is_bounty?: boolean;
  is_pko?: boolean;
  is_mystery_bounty?: boolean;
  bounty_amount?: number;
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
    } catch {
      /* not JSON */
    }

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
  // Normalize: ensure every entry has 'place' (DB may use 'position' instead)
  const normalize = (arr: any[]): PayoutEntry[] =>
    arr.map((p) => ({
      place: p.place || p.position || 0,
      position: p.position || p.place || 0,
      percentage: p.percentage || 0,
    }));

  if (Array.isArray(raw)) return normalize(raw);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return normalize(parsed);
    } catch {
      /* not JSON */
    }
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
  private finishing = false; // Guard against concurrent finishTournament calls
  private currentLevel = 0;
  private blindCheckInterval: ReturnType<typeof setInterval> | null = null;
  private eliminationCheckInterval: ReturnType<typeof setInterval> | null = null;
  private handsDealt = 0;
  // Hand-for-hand mode (money bubble)
  private handForHandActive = false;
  private handForHandAnnounced = false;
  // Add-on period (60s after rebuy levels end)
  private addOnPeriodTriggered = false;
  private addOnPeriodActive = false;
  private addOnAbortController: AbortController | null = null;

  constructor(tournamentId: string, supabase: SupabaseClient) {
    this.tournamentId = tournamentId;
    this.supabase = supabase;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  async start(): Promise<void> {
    if (this.running) return;

    // Set running immediately to prevent stale cleanup from killing us during async startup
    this.running = true;

    // Check tournament status — only start if REGISTERING or ANNOUNCED
    const { data: statusCheck, error: statusErr } = await this.supabase
      .from('tournaments')
      .select('status')
      .eq('id', this.tournamentId)
      .maybeSingle();

    if (statusErr || !statusCheck) {
      console.log(
        `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Cannot start — tournament not found`
      );
      this.running = false;
      return;
    }

    if (statusCheck.status === 'RUNNING') {
      // Already running — resume tracking instead of starting fresh
      console.log(
        `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Resuming RUNNING tournament...`
      );
      try {
        await this.resumeRunning();
      } catch (err) {
        console.error(`[TournamentEngine:${this.tournamentId.slice(0, 8)}] Failed to resume:`, err);
        this.running = false;
      }
      return;
    }

    if (statusCheck.status !== 'REGISTERING' && statusCheck.status !== 'ANNOUNCED') {
      // COMPLETED or CANCELLED — nothing to do
      console.log(
        `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Cannot start — current status: ${statusCheck.status}`
      );
      this.running = false;
      return;
    }

    console.log(`[TournamentEngine:${this.tournamentId.slice(0, 8)}] Starting tournament...`);

    try {
      // Step 1: Load tournament info
      await this.loadTournament();
      if (!this.tournamentInfo) throw new Error('Failed to load tournament');

      // Step 2: Migrate registrations → tournament_players
      await this.migrateRegistrations();

      // Step 2b: Enforce minimum 3 players
      if (this.players.size < 3) {
        console.log(
          `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Only ${this.players.size} player(s) — cancelling (minimum 3 required)`
        );
        // Use TournamentService for proper refund + cancel flow
        const { tournamentService } = await import('../services/TournamentService');
        await tournamentService.cancelTournament(
          this.tournamentId,
          `Only ${this.players.size} player(s) registered — minimum 3 required`
        );
        this.running = false;
        return;
      }

      // Step 2c: For Spin & Go tournaments, roll the multiplier now (at game start, not creation)
      if (
        this.tournamentInfo.variant === 'spin' ||
        this.tournamentInfo.tournament_type === 'SPIN'
      ) {
        const { tournamentService, SPIN_MULTIPLIERS } =
          await import('../services/TournamentService');
        const spinResult = tournamentService.spinMultiplier(SPIN_MULTIPLIERS.standard);
        // Prize pool = buy_in * multiplier (NOT net * players * multiplier)
        // Club profit = (3 * buy_in) - prize_pool + (3 * fee)
        const buyIn = this.tournamentInfo.buy_in_amount || 0;
        const prizePool = Math.trunc(buyIn * spinResult.multiplier * 100) / 100;

        await this.supabase
          .from('tournaments')
          .update({
            prize_pool: prizePool,
            spin_multiplier: spinResult.multiplier,
            is_premium_spin: spinResult.isPremium || false,
          })
          .eq('id', this.tournamentId);

        this.tournamentInfo.prize_pool = prizePool;
        console.log(
          `[TournamentEngine:${this.tournamentId.slice(0, 8)}] SPIN MULTIPLIER: ${spinResult.multiplier}x — Prize Pool: ${prizePool}`
        );
      }

      // Step 3: Create tournament tables
      await this.createTournamentTables();

      // Step 4: Seat players at tables
      await this.seatPlayers();

      // Step 5: Update tournament status to RUNNING
      await this.setTournamentRunning();

      // Step 6: Start dealing on each table
      for (const table of this.tables) {
        try {
          await table.engine.start();
        } catch (err) {
          console.error(
            `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Failed to start table engine ${table.tableId.slice(0, 8)}:`,
            err
          );
        }
      }

      // Step 7: Start blind level timer
      this.startBlindTimer();

      // Step 8: Start elimination checker
      this.startEliminationChecker();

      console.log(
        `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Tournament RUNNING — ${this.players.size} players, ${this.tables.length} tables`
      );
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
    // Cancel any pending add-on period timeout
    if (this.addOnAbortController) {
      this.addOnAbortController.abort();
      this.addOnAbortController = null;
    }
    for (const table of this.tables) {
      table.engine.stop();
    }
    console.log(`[TournamentEngine:${this.tournamentId.slice(0, 8)}] Stopped`);
  }

  isRunning(): boolean {
    return this.running;
  }
  getHandCount(): number {
    return this.handsDealt;
  }
  getPlayerCount(): number {
    return Array.from(this.players.values()).filter((p) => p.status === 'playing').length;
  }
  getTableCount(): number {
    return this.tables.length;
  }
  getCurrentLevel(): number {
    return this.currentLevel;
  }
  getTournamentName(): string {
    return this.tournamentInfo?.name || 'Unknown';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESUME: Pick up an already-RUNNING tournament
  // ═══════════════════════════════════════════════════════════════════════════

  private async resumeRunning(): Promise<void> {
    // Step 1: Load tournament info
    await this.loadTournament();
    if (!this.tournamentInfo) throw new Error('Failed to load tournament');

    // Step 2: Load existing players from tournament_players
    const { data: existingPlayers } = await this.supabase
      .from('tournament_players')
      .select('user_id, chips, status, username')
      .eq('tournament_id', this.tournamentId);

    if (existingPlayers) {
      for (const p of existingPlayers) {
        this.players.set(p.user_id, {
          user_id: p.user_id,
          username: p.username || p.user_id.slice(0, 8),
          chips: p.chips || this.tournamentInfo.starting_chips,
          status: p.status || 'playing',
        });
      }
    }

    const activePlayers = Array.from(this.players.values()).filter((p) => p.status === 'playing');
    console.log(
      `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Loaded ${this.players.size} players (${activePlayers.length} active)`
    );

    // If no active players left, mark as COMPLETED
    if (activePlayers.length === 0) {
      console.log(
        `[TournamentEngine:${this.tournamentId.slice(0, 8)}] No active players — marking COMPLETED`
      );
      await this.supabase
        .from('tournaments')
        .update({ status: 'COMPLETED', ended_at: new Date().toISOString() })
        .eq('id', this.tournamentId);
      this.running = false;
      return;
    }

    // Step 3: Find existing tournament tables
    const { data: existingTables } = await this.supabase
      .from('tables')
      .select('id, name, current_players')
      .eq('tournament_id', this.tournamentId)
      .eq('status', 'running');

    if (!existingTables || existingTables.length === 0) {
      // No tables exist — need to create them and seat players
      console.log(
        `[TournamentEngine:${this.tournamentId.slice(0, 8)}] No tables found — creating and seating`
      );
      await this.createTournamentTables();
      await this.seatPlayers();
    } else {
      // Tables exist — attach engines
      for (const t of existingTables) {
        const engine = new HeadlessTableEngine(t.id, this.supabase);
        engine.onHandComplete((tId, players) => this.syncChipsAfterHand(tId, players));
        this.tables.push({
          tableId: t.id,
          engine,
          playerCount: t.current_players || 0,
        });
      }
      console.log(
        `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Attached to ${this.tables.length} existing tables`
      );

      // Check if tables have seats — if not, seat players
      const { data: anySeats } = await this.supabase
        .from('table_seats')
        .select('id')
        .eq('table_id', existingTables[0].id)
        .limit(1);

      if (!anySeats || anySeats.length === 0) {
        console.log(
          `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Tables have no seats — seating players`
        );
        await this.seatPlayers();
      }
    }

    // Step 4: Restore blind level
    this.currentLevel = this.tournamentInfo.current_level || 1;

    // Step 5: Start dealing on each table
    for (const table of this.tables) {
      try {
        await table.engine.start();
      } catch (err) {
        console.error(
          `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Failed to start table engine ${table.tableId.slice(0, 8)}:`,
          err
        );
      }
    }

    // Step 6: Start blind level timer
    this.startBlindTimer();

    // Step 7: Start elimination checker
    this.startEliminationChecker();

    console.log(
      `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Resumed — ${activePlayers.length} active players, ${this.tables.length} tables`
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: LOAD TOURNAMENT
  // ═══════════════════════════════════════════════════════════════════════════

  private async loadTournament(): Promise<void> {
    const { data, error } = await this.supabase
      .from('tournaments')
      .select('*')
      .eq('id', this.tournamentId)
      .maybeSingle();

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
      starting_chips: data.starting_chips || 0,
      max_players: data.max_players || 0,
      current_players: playerCount,
      prize_pool: data.prize_pool || playerCount * (data.buy_in_amount || 0),
      blind_structure: blinds,
      payout_structure: payouts,
      started_at: data.started_at || '',
      current_level: data.current_level || 1,
      // Tournament type/variant for Spin & Bounty detection
      variant: data.variant || 'freezeout',
      tournament_type: data.tournament_type || 'MTT',
      buy_in_fee: data.buy_in_fee || 0,
      // Late reg / rebuy / add-on (level-based)
      late_reg_levels: data.late_reg_levels || data.late_reg_mins || 0,
      late_reg_mins: data.late_reg_mins || 0,
      add_on_available: data.add_on_available || false,
      rebuy_levels: data.rebuy_levels || 0,
      is_reentry: data.is_reentry || false,
      prize_pool_finalized: data.prize_pool_finalized || false,
      addon_cost: data.addon_cost || data.buy_in_amount || 0,
      addon_chips: data.addon_chips || data.starting_chips || 0,
      addon_levels: data.addon_levels || 1,
      // Bounty fields
      is_bounty: data.is_bounty || false,
      is_pko: data.is_pko || false,
      is_mystery_bounty: data.is_mystery_bounty || false,
      bounty_amount: data.bounty_amount || 0,
    };

    console.log(
      `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Loaded: ${data.name}, ${playerCount} players, ${blinds.length} blind levels`
    );
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
      console.log(
        `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Already has ${existingPlayers.length} tournament_players — activating`
      );

      // Activate any 'registered' players to 'playing' (they haven't been seated yet)
      await this.supabase
        .from('tournament_players')
        .update({ status: 'playing', chips: this.tournamentInfo.starting_chips })
        .eq('tournament_id', this.tournamentId)
        .eq('status', 'registered');

      // Load all players with updated status
      const { data: fullPlayers } = await this.supabase
        .from('tournament_players')
        .select('user_id, chips, status, username')
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

      // Update prize pool
      const activeCount = Array.from(this.players.values()).filter(
        (p) => p.status === 'playing'
      ).length;
      const actualPrizePool = activeCount * this.tournamentInfo.buy_in_amount;
      this.tournamentInfo.prize_pool = actualPrizePool;
      this.tournamentInfo.current_players = existingPlayers.length;

      await this.supabase
        .from('tournaments')
        .update({ prize_pool: actualPrizePool, current_players: existingPlayers.length })
        .eq('id', this.tournamentId);

      console.log(
        `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Activated ${activeCount} players — prize pool: ${actualPrizePool.toFixed(2)}`
      );
      return;
    }

    // Load registered players from tournament_players (inserted by TournamentService.registerPlayer)
    const { data: registrations, error } = await this.supabase
      .from('tournament_players')
      .select('user_id, username, chips, status')
      .eq('tournament_id', this.tournamentId)
      .eq('status', 'registered');

    if (error || !registrations || registrations.length === 0) {
      // No registrations — mark tournament as COMPLETED and bail
      console.warn(
        `[TournamentEngine:${this.tournamentId.slice(0, 8)}] No registrations found — marking COMPLETED`
      );
      await this.supabase
        .from('tournaments')
        .update({ status: 'COMPLETED', current_players: 0 })
        .eq('id', this.tournamentId);
      throw new Error(`No registrations found for tournament ${this.tournamentId}`);
    }

    // Need at least 2 players for a tournament
    if (registrations.length < 2) {
      console.warn(
        `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Only ${registrations.length} registration — marking COMPLETED`
      );
      await this.supabase
        .from('tournaments')
        .update({ status: 'COMPLETED', current_players: registrations.length })
        .eq('id', this.tournamentId);
      throw new Error(
        `Not enough players (${registrations.length}) for tournament ${this.tournamentId}`
      );
    }

    console.log(
      `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Activating ${registrations.length} registered players`
    );

    // Update tournament_players status to 'playing' and set starting chips
    const { error: updateError } = await this.supabase
      .from('tournament_players')
      .update({ status: 'playing', chips: this.tournamentInfo!.starting_chips })
      .eq('tournament_id', this.tournamentId)
      .eq('status', 'registered');

    if (updateError) {
      console.error(`[TournamentEngine] Player activation error:`, updateError.message);
      throw new Error(`Failed to activate players: ${updateError.message}`);
    }

    // Populate local player map (buy-ins already deducted during registration by TournamentService.registerPlayer)
    for (const r of registrations) {
      this.players.set(r.user_id, {
        user_id: r.user_id,
        username: r.username || r.user_id.slice(0, 8),
        chips: this.tournamentInfo.starting_chips,
        status: 'playing',
      });
    }

    // Update prize pool based on actual player count (not stale DB value)
    const actualPrizePool = registrations.length * this.tournamentInfo.buy_in_amount;
    this.tournamentInfo.prize_pool = actualPrizePool;
    this.tournamentInfo.current_players = registrations.length;

    await this.supabase
      .from('tournaments')
      .update({
        prize_pool: actualPrizePool,
        current_players: registrations.length,
      })
      .eq('id', this.tournamentId);

    console.log(
      `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Migrated ${registrations.length} players — prize pool: ${actualPrizePool.toFixed(2)}`
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: CREATE TOURNAMENT TABLES
  // ═══════════════════════════════════════════════════════════════════════════

  private async createTournamentTables(): Promise<void> {
    if (!this.tournamentInfo) return;

    const activePlayers = Array.from(this.players.values()).filter((p) => p.status === 'playing');
    const numTables = Math.max(1, Math.ceil(activePlayers.length / 9));
    const firstBlinds = this.tournamentInfo.blind_structure[0] || {
      smallBlind: 10,
      bigBlind: 20,
      ante: 0,
    };

    console.log(
      `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Creating ${numTables} tournament tables`
    );

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
        .maybeSingle();

      if (error || !data) {
        console.error(`[TournamentEngine] Failed to create table ${i + 1}:`, error?.message);
        continue;
      }

      const engine = new HeadlessTableEngine(data.id, this.supabase);
      engine.onHandComplete((tId, players) => this.syncChipsAfterHand(tId, players));
      this.tables.push({
        tableId: data.id,
        engine,
        playerCount: 0,
      });
    }

    console.log(
      `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Created ${this.tables.length} tables`
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: SEAT PLAYERS AT TABLES
  // ═══════════════════════════════════════════════════════════════════════════

  private async seatPlayers(): Promise<void> {
    if (!this.tournamentInfo) return;

    const activePlayers = Array.from(this.players.values()).filter((p) => p.status === 'playing');
    console.log(
      `[TournamentEngine:${this.tournamentId.slice(0, 8)}] seatPlayers: ${activePlayers.length} active out of ${this.players.size} total`
    );

    if (activePlayers.length === 0) {
      console.error(
        `[TournamentEngine:${this.tournamentId.slice(0, 8)}] No active players to seat!`
      );
      return;
    }

    // Fisher-Yates shuffle
    for (let i = activePlayers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [activePlayers[i], activePlayers[j]] = [activePlayers[j], activePlayers[i]];
    }

    // Distribute round-robin across tables
    if (this.tables.length === 0) {
      console.error(
        `[TournamentEngine:${this.tournamentId}] No tables created — cannot seat players`
      );
      return;
    }
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
        // Note: horse_id omitted — tournament players are registered users, not horses
        // The horse_id FK constraint would reject non-horse user_ids
      });
    }

    // Batch insert all seats
    const { error } = await this.supabase.from('table_seats').insert(seatInserts);

    if (error) {
      console.error(`[TournamentEngine] Failed to seat players:`, error.message);
      throw new Error(`Seating failed: ${error.message}`);
    }

    console.log(
      `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Seated ${activePlayers.length} players across ${this.tables.length} tables`
    );
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
    let newLevel = blinds.length - 1; // Default to last level (cap)
    for (let i = 0; i < blinds.length; i++) {
      accumulated += blinds[i].durationMinutes;
      if (elapsedMinutes < accumulated) {
        newLevel = i;
        break;
      }
    }

    if (newLevel !== this.currentLevel) {
      const prevLevel = this.currentLevel;
      this.currentLevel = newLevel;
      const level = blinds[newLevel];
      console.log(
        `[TournamentEngine:${this.tournamentId.slice(0, 8)}] BLIND LEVEL UP → Level ${level.level}: ${level.smallBlind}/${level.bigBlind} ante ${level.ante}`
      );

      // Update all tournament tables with new blinds
      this.updateTableBlinds(level);

      // ── ADD-ON PERIOD TRIGGER ──
      // When we advance past the rebuy_levels threshold and add-on is available,
      // pause the tournament for 60 seconds and broadcast ADDON_PERIOD_START
      if (this.tournamentInfo.add_on_available && !this.addOnPeriodTriggered) {
        const rebuyLevelCap =
          this.tournamentInfo.late_reg_levels ?? this.tournamentInfo.rebuy_levels ?? 8;
        // Trigger when we pass from within rebuy period to beyond it
        if (prevLevel < rebuyLevelCap && newLevel >= rebuyLevelCap) {
          this.triggerAddOnPeriod();
        }
      }
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
        console.error(
          `[TournamentEngine] Failed to update blinds for table ${table.tableId.slice(0, 8)}:`,
          error.message
        );
      }
    }

    // Also update tournament current_level
    await this.supabase
      .from('tournaments')
      .update({ current_level: level.level })
      .eq('id', this.tournamentId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADD-ON PERIOD (60 seconds after rebuy levels end)
  // ═══════════════════════════════════════════════════════════════════════════

  private async triggerAddOnPeriod(): Promise<void> {
    if (!this.tournamentInfo || this.addOnPeriodTriggered) return;

    this.addOnPeriodTriggered = true;
    this.addOnPeriodActive = true;

    const addonCost = this.tournamentInfo.addon_cost || this.tournamentInfo.buy_in_amount;
    const addonChips = this.tournamentInfo.addon_chips || this.tournamentInfo.starting_chips;

    console.log(
      `[TournamentEngine:${this.tournamentId.slice(0, 8)}] ADD-ON PERIOD STARTED — 60 seconds, cost: ${addonCost}, chips: ${addonChips}`
    );

    // Pause all table engines during add-on period
    for (const table of this.tables) {
      if (table.engine.setHandForHand) table.engine.setHandForHand(true);
    }

    // Broadcast ADDON_PERIOD_START to all tables via tournament channel
    try {
      const { realtimeChannelService } = await import('../services/RealtimeChannelService');
      await realtimeChannelService.broadcastTournamentEvent(this.tournamentId, {
        type: 'ADDON_PERIOD_START' as any,
        payload: {
          addOnCost: addonCost,
          addOnChips: addonChips,
          durationSeconds: 60,
        },
      });
    } catch (e) {
      console.error(
        `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Failed to broadcast addon period:`,
        e
      );
    }

    // Also broadcast on the addon-specific channel for direct table pickup
    try {
      const chan = this.supabase.channel(`t-addon-${this.tournamentId}`);
      await chan.subscribe();
      await chan.send({
        type: 'broadcast',
        event: 'addon_event',
        payload: {
          type: 'ADDON_PERIOD_START',
          addOnCost: addonCost,
          addOnChips: addonChips,
          durationSeconds: 60,
        },
      });
      // Clean up after a brief delay to ensure delivery
      setTimeout(async () => {
        try {
          await chan.unsubscribe();
        } catch {
          /* best effort */
        }
      }, 3000);
    } catch (e) {
      /* noop */
    }

    // Wait 60 seconds for all players to accept/decline (cancellable via AbortController)
    this.addOnAbortController = new AbortController();
    const abortSignal = this.addOnAbortController.signal;

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => resolve(), 60_000);
      // If abort() is called (e.g., stop()), resolve immediately and clear the timer
      abortSignal.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    });

    this.addOnAbortController = null;

    // If the engine was stopped during the add-on period, bail out silently
    if (!this.running) return;

    // Add-on period ended — resume tournament
    this.addOnPeriodActive = false;

    console.log(
      `[TournamentEngine:${this.tournamentId.slice(0, 8)}] ADD-ON PERIOD ENDED — resuming tournament`
    );

    // Release all table engines
    for (const table of this.tables) {
      if (table.engine.setHandForHand) table.engine.setHandForHand(false);
      if (table.engine.releaseHandForHand) table.engine.releaseHandForHand();
    }

    // Finalize prize pool after add-on period
    try {
      const { tournamentService } = await import('../services/TournamentService');
      await tournamentService.finalizePrizePool(this.tournamentId);
      if (this.tournamentInfo) this.tournamentInfo.prize_pool_finalized = true;
    } catch (e) {
      console.error(
        `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Failed to finalize after addon:`,
        e
      );
    }

    // Broadcast ADDON_PERIOD_END
    try {
      const { realtimeChannelService } = await import('../services/RealtimeChannelService');
      await realtimeChannelService.broadcastTournamentEvent(this.tournamentId, {
        type: 'ADDON_PERIOD_END' as any,
        payload: {},
      });
    } catch (e) {
      /* noop */
    }
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

  private eliminationCheckRunning = false;
  private prizePoolRefreshCounter = 0;
  private async checkEliminations(): Promise<void> {
    if (!this.running || !this.tournamentInfo) return;
    // Prevent overlapping elimination checks (async race condition guard)
    if (this.eliminationCheckRunning) return;
    this.eliminationCheckRunning = true;
    try {
      // Refresh prize pool from DB every ~30s (6 ticks × 5s) to catch late reg additions
      this.prizePoolRefreshCounter++;
      if (this.prizePoolRefreshCounter % 6 === 0) {
        const { data: freshT } = await this.supabase
          .from('tournaments')
          .select('prize_pool, current_players, prize_pool_finalized')
          .eq('id', this.tournamentId)
          .maybeSingle();
        if (freshT && freshT.prize_pool !== this.tournamentInfo.prize_pool) {
          console.log(
            `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Prize pool updated: ${this.tournamentInfo.prize_pool} → ${freshT.prize_pool} (late reg)`
          );
          this.tournamentInfo.prize_pool = freshT.prize_pool;
          this.tournamentInfo.current_players = freshT.current_players;
        }
        if (freshT) {
          this.tournamentInfo.prize_pool_finalized = freshT.prize_pool_finalized || false;
        }

        // Check if late reg period has ended (level-based) — finalize prize pool if not yet done
        const lateRegLevelCap =
          this.tournamentInfo.late_reg_levels || this.tournamentInfo.late_reg_mins || 0;
        if (!this.tournamentInfo.prize_pool_finalized && lateRegLevelCap > 0) {
          const currentLevel = this.tournamentInfo.current_level || 0;
          if (currentLevel >= lateRegLevelCap) {
            console.log(
              `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Late registration closed at level ${currentLevel} — finalizing prize pool`
            );
            try {
              const { tournamentService } = await import('../services/TournamentService');
              await tournamentService.finalizePrizePool(this.tournamentId);
              this.tournamentInfo.prize_pool_finalized = true;
            } catch (e) {
              console.error(
                `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Failed to finalize prize pool:`,
                e
              );
            }
          }
        }
      }

      // Check each tournament table for players with 0 chips
      for (const table of this.tables) {
        const { data: seats } = await this.supabase
          .from('table_seats')
          .select('user_id, stack')
          .eq('table_id', table.tableId)
          .is('left_at', null);

        if (!seats) continue;

        // Get last hand winners for bounty knockout attribution
        const lastWinners = table.engine.getLastHandWinnerIds
          ? table.engine.getLastHandWinnerIds()
          : [];
        const knockerId = lastWinners.length > 0 ? lastWinners[0] : undefined;

        for (const seat of seats) {
          if (seat.stack <= 0) {
            // Pass the knocker ID (winner of last hand) for bounty crediting
            await this.eliminatePlayer(
              seat.user_id,
              table.tableId,
              knockerId !== seat.user_id ? knockerId : undefined
            );
          }
        }

        // Update local table player count
        const activeSeats = seats.filter((s) => s.stack > 0);
        table.playerCount = activeSeats.length;
      }

      // Update hand count
      this.handsDealt = this.tables.reduce((sum, t) => sum + t.engine.getHandCount(), 0);

      // Check if tournament is over
      const remainingPlayers = Array.from(this.players.values()).filter(
        (p) => p.status === 'playing'
      );
      if (remainingPlayers.length <= 1) {
        await this.finishTournament(remainingPlayers[0]);
      }

      // Check if any tables need to be merged (< 3 players)
      await this.checkTableBalance();

      // ── HAND-FOR-HAND BUBBLE MODE ──
      // Applies to multi-table tournaments only (not Spin/SNG single-table)
      if (this.tournamentInfo && this.tables.length > 1) {
        const isSpin =
          this.tournamentInfo.variant === 'spin' || this.tournamentInfo.tournament_type === 'SPIN';
        if (!isSpin) {
          const payoutCount = this.tournamentInfo.payout_structure?.length || 0;
          const playingNow = Array.from(this.players.values()).filter(
            (p) => p.status === 'playing'
          ).length;

          if (payoutCount > 0 && playingNow === payoutCount + 1 && !this.handForHandActive) {
            // Entering the money bubble — activate hand-for-hand
            this.handForHandActive = true;
            if (!this.handForHandAnnounced) {
              this.handForHandAnnounced = true;
              console.log(
                `[TournamentEngine:${this.tournamentId.slice(0, 8)}] HAND-FOR-HAND MODE ACTIVATED — ${playingNow} players, ${payoutCount} paid`
              );
              // Broadcast bubble event
              try {
                const { realtimeChannelService } =
                  await import('../services/RealtimeChannelService');
                await realtimeChannelService.broadcastTournamentEvent(this.tournamentId, {
                  type: 'hand_for_hand',
                  payload: {
                    active: true,
                    playersRemaining: playingNow,
                    paidPositions: payoutCount,
                  },
                });
              } catch (e) {
                /* noop */
              }
            }
            // Enable hand-for-hand sync on all table engines
            for (const table of this.tables) {
              if (table.engine.setHandForHand) table.engine.setHandForHand(true);
            }
          } else if (this.handForHandActive && playingNow === payoutCount + 1) {
            // Still on bubble — release all tables to deal next synchronized hand
            for (const table of this.tables) {
              if (table.engine.releaseHandForHand) table.engine.releaseHandForHand();
            }
          } else if (this.handForHandActive && playingNow <= payoutCount) {
            // Bubble burst — someone busted, now in the money
            this.handForHandActive = false;
            console.log(
              `[TournamentEngine:${this.tournamentId.slice(0, 8)}] BUBBLE BURST — Hand-for-hand deactivated, ${playingNow} players ITM`
            );
            // Disable hand-for-hand on all table engines
            for (const table of this.tables) {
              if (table.engine.setHandForHand) table.engine.setHandForHand(false);
            }
            try {
              const { realtimeChannelService } = await import('../services/RealtimeChannelService');
              await realtimeChannelService.broadcastTournamentEvent(this.tournamentId, {
                type: 'hand_for_hand',
                payload: { active: false, playersRemaining: playingNow, bubbleBurst: true },
              });
            } catch (e) {
              /* noop */
            }
          }
        }
      }
    } finally {
      this.eliminationCheckRunning = false;
    }
  }

  /**
   * Real-time chip sync — called by HeadlessTableEngine callback the instant a hand completes.
   * Updates tournament_players.chips in the DB so lobby/table pages reflect live stacks.
   */
  private async syncChipsAfterHand(
    tableId: string,
    playerStacks: { user_id: string; stack: number }[]
  ): Promise<void> {
    if (!this.running || !this.tournamentInfo) return;

    // Update local player map + batch DB updates
    const updates: PromiseLike<any>[] = [];

    for (const { user_id, stack } of playerStacks) {
      const player = this.players.get(user_id);
      if (player && player.status === 'playing') {
        player.chips = stack;
        // tournament_players.chips is INTEGER — truncate to whole number (never round up)
        const rounded = Math.trunc(stack);
        updates.push(
          this.supabase
            .from('tournament_players')
            .update({ chips: rounded })
            .eq('tournament_id', this.tournamentId)
            .eq('user_id', user_id)
            .then((result: any) => {
              if (result.error) {
                console.error(
                  `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Chip sync failed for ${player.username}: ${result.error.message}`
                );
              }
              return result;
            })
        );
      }
    }

    // Fire all updates in parallel for speed
    if (updates.length > 0) {
      await Promise.all(updates);
    }

    // Update hand count
    this.handsDealt = this.tables.reduce((sum, t) => sum + t.engine.getHandCount(), 0);
  }

  private async eliminatePlayer(
    userId: string,
    tableId: string,
    knockerId?: string
  ): Promise<void> {
    const player = this.players.get(userId);
    if (!player || player.status === 'eliminated') return;

    const remainingBefore = Array.from(this.players.values()).filter(
      (p) => p.status === 'playing'
    ).length;
    const position = remainingBefore; // e.g., if 10 playing, eliminated player gets 10th place

    player.status = 'eliminated';

    // Calculate prize
    const prize = this.calculatePrize(position);

    console.log(
      `[TournamentEngine:${this.tournamentId.slice(0, 8)}] ELIMINATED: ${player.username} in ${position}${this.getOrdinal(position)} place${prize > 0 ? ` — wins ${prize.toFixed(2)}` : ''}`
    );

    // Update tournament_players
    await this.supabase
      .from('tournament_players')
      .update({
        status: 'eliminated',
        position: position,
        prize: prize,
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

    // Emit bus event for immediate cross-page updates
    try {
      masterBus.emit('PLAYER_ELIMINATED', {
        tournamentId: this.tournamentId,
        userId,
        position,
        prize,
        username: player.username,
      });
    } catch {
      /* bus not initialized yet */
    }

    // Handle bounty crediting if this is a bounty tournament and we know the knocker
    if (
      knockerId &&
      this.tournamentInfo &&
      (this.tournamentInfo.is_bounty ||
        this.tournamentInfo.is_pko ||
        this.tournamentInfo.is_mystery_bounty)
    ) {
      try {
        const { tournamentService } = await import('../services/TournamentService');
        const bountyResult = await tournamentService.collectBounty(
          this.tournamentId,
          userId,
          knockerId
        );

        if (bountyResult.bountyAmount > 0) {
          // Credit bounty winnings to knocker's wallet
          await this.creditPrize(knockerId, bountyResult.bountyAmount);

          // Update knocker's bounty stats — manual update (no RPC needed)
          try {
            const { data: knockerStats } = await this.supabase
              .from('tournament_players')
              .select('bounties_collected, bounty_winnings')
              .eq('tournament_id', this.tournamentId)
              .eq('user_id', knockerId)
              .maybeSingle();

            if (knockerStats) {
              const { error: updateErr } = await this.supabase
                .from('tournament_players')
                .update({
                  bounties_collected: (knockerStats.bounties_collected || 0) + 1,
                  bounty_winnings:
                    Math.trunc(
                      ((knockerStats.bounty_winnings || 0) + bountyResult.bountyAmount) * 100
                    ) / 100,
                })
                .eq('tournament_id', this.tournamentId)
                .eq('user_id', knockerId);

              if (updateErr) {
                console.error(
                  `[TournamentEngine] Failed to update bounty stats for ${knockerId.slice(0, 8)}:`,
                  updateErr
                );
              }
            }
          } catch (statsErr) {
            console.error(`[TournamentEngine] Bounty stats update failed:`, statsErr);
          }

          console.log(
            `[TournamentEngine:${this.tournamentId.slice(0, 8)}] BOUNTY: ${knockerId.slice(0, 8)} collected ${bountyResult.bountyAmount} bounty from ${player.username}`
          );
        }
      } catch (err) {
        console.error(
          `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Bounty collection failed:`,
          err
        );
      }
    }
  }

  private calculatePrize(position: number): number {
    if (!this.tournamentInfo) return 0;
    if (
      !this.tournamentInfo.payout_structure ||
      !Array.isArray(this.tournamentInfo.payout_structure)
    )
      return 0;

    const payoutEntry = this.tournamentInfo.payout_structure.find(
      (p) => (p.place || p.position) === position
    );
    if (!payoutEntry) return 0;

    // Exact penny precision — convert to cents first to avoid floating point errors
    // prize = pool * (percentage / 100), then truncate to 2 decimal places
    const prizeRaw = (this.tournamentInfo.prize_pool * payoutEntry.percentage) / 100;
    return Math.trunc(prizeRaw * 100) / 100;
  }

  private async creditPrize(userId: string, amount: number): Promise<void> {
    if (!this.tournamentInfo) return;

    // Validate userId — skip zero UUIDs or invalid IDs
    const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
    if (
      !userId ||
      userId === ZERO_UUID ||
      userId.length < 8 ||
      userId.replace(/0/g, '').replace(/-/g, '').length === 0
    ) {
      console.warn(
        `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Skipping prize credit — invalid userId: ${userId}`
      );
      return;
    }

    const clubId = this.tournamentInfo.club_id;

    // Credit prize to Player Wallet via SECURITY DEFINER RPC
    const { data: creditResult, error: creditError } = await this.supabase.rpc(
      'credit_player_wallet',
      {
        p_user_id: userId,
        p_amount: amount,
      }
    );

    if (creditError) {
      console.error(
        `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Failed to credit Player Wallet for ${userId.slice(0, 8)} — prize ${amount.toFixed(2)}:`,
        creditError
      );
      return;
    }

    console.log(
      `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Credited ${amount} chips to Player Wallet for ${userId.slice(0, 8)}`
    );

    // Log prize in wallet_transactions via centralized RPC
    await WalletService.logTransaction(
      userId,
      'PLAYER',
      amount,
      'credit',
      'prize',
      `Tournament prize — ${this.tournamentInfo.name}`,
      undefined,
      undefined,
      this.tournamentId
    );

    // Log in chip_transactions for club accounting
    await this.supabase.from('chip_transactions').insert({
      club_id: clubId,
      from_user_id: null,
      to_user_id: userId,
      amount: amount,
      transaction_type: 'cash_out',
      notes: `Tournament prize: ${this.tournamentInfo.name}`,
    });

    console.log(
      `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Credited ${amount.toFixed(2)} prize to ${userId.slice(0, 8)}`
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TABLE BALANCING
  // ═══════════════════════════════════════════════════════════════════════════

  private async checkTableBalance(): Promise<void> {
    if (this.tables.length <= 1) return;

    // Find tables with active players
    const activeTables = this.tables.filter((t) => t.playerCount > 0);
    if (activeTables.length <= 1) return;

    // Clean up empty tables first (0 players)
    const emptyTables = activeTables.filter((t) => t.playerCount === 0);
    for (const empty of emptyTables) {
      empty.engine.stop();
      await this.supabase
        .from('tables')
        .update({ status: 'closed', current_players: 0 })
        .eq('id', empty.tableId);
      this.removeTable(empty);
    }

    // Re-check active tables after cleanup
    const remainingTables = this.tables.filter((t) => t.playerCount > 0);
    if (remainingTables.length <= 1) return;

    // Sort by player count ascending — merge smallest first
    remainingTables.sort((a, b) => a.playerCount - b.playerCount);

    // Merge tables that are too small (< 3 players) into larger ones
    // Also merge if total remaining players can fit at fewer tables
    const totalPlayers = remainingTables.reduce((s, t) => s + t.playerCount, 0);
    const minTablesNeeded = Math.ceil(totalPlayers / 9);

    if (remainingTables.length > minTablesNeeded || remainingTables[0].playerCount < 3) {
      // Merge the smallest table
      await this.mergeTable(remainingTables[0]);
    }
  }

  private async mergeTable(sourceTable: TournamentTable): Promise<void> {
    console.log(
      `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Merging table ${sourceTable.tableId.slice(0, 8)} (${sourceTable.playerCount} players)`
    );

    // Stop the source table engine
    sourceTable.engine.stop();

    // Get remaining players at the source table
    const { data: seats } = await this.supabase
      .from('table_seats')
      .select('user_id, stack')
      .eq('table_id', sourceTable.tableId)
      .is('left_at', null);

    if (!seats || seats.length === 0) {
      // Close the empty table in DB and remove from engine tracking
      await this.supabase
        .from('tables')
        .update({ status: 'closed', current_players: 0 })
        .eq('id', sourceTable.tableId);
      this.removeTable(sourceTable);
      return;
    }

    // Find the target table with the most room
    const otherTables = this.tables.filter(
      (t) => t.tableId !== sourceTable.tableId && t.playerCount > 0
    );
    if (otherTables.length === 0) return;

    // Select target table with most available room (fewest players = most seats open)
    const target = otherTables.reduce((a, b) => {
      const aRoom = 9 - a.playerCount;
      const bRoom = 9 - b.playerCount;
      return aRoom > bRoom ? a : b;
    });

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

      const usedSeats = new Set((targetSeats || []).map((s) => s.seat_number));
      let newSeat = 1;
      while (usedSeats.has(newSeat) && newSeat <= 9) newSeat++;

      // Guard: if all 9 seats are full, skip this move
      if (newSeat > 9) {
        console.error(
          `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Cannot move player — target table ${target.tableId.slice(0, 8)} is full (9/9)`
        );
        continue;
      }

      // First clear any existing record at this seat (left-over from previous occupant)
      await this.supabase
        .from('table_seats')
        .update({ left_at: new Date().toISOString(), status: 'left' })
        .eq('table_id', target.tableId)
        .eq('seat_number', newSeat)
        .is('left_at', null);

      // Insert at target table
      const { error: insertErr } = await this.supabase.from('table_seats').insert({
        table_id: target.tableId,
        seat_number: newSeat,
        user_id: seat.user_id,
        stack: seat.stack,
        is_sitting_out: false,
      });

      if (insertErr) {
        console.error(
          `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Failed to insert merged seat for ${seat.user_id.slice(0, 8)}:`,
          insertErr.message
        );
        continue;
      }

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
    await this.supabase.from('tables').update({ status: 'closed' }).eq('id', sourceTable.tableId);

    console.log(
      `[TournamentEngine:${this.tournamentId.slice(0, 8)}] Merged into table ${target.tableId.slice(0, 8)}`
    );

    // Emit bus event for immediate cross-page table merge notification
    try {
      masterBus.emit('TABLE_MERGED', {
        tournamentId: this.tournamentId,
        sourceTableId: sourceTable.tableId,
        targetTableId: target.tableId,
        playersMoved: seats.length,
      });
    } catch {
      /* bus not initialized yet */
    }
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
    if (!this.running || this.finishing) return;
    this.finishing = true;
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

      console.log(
        `[TournamentEngine:${this.tournamentId.slice(0, 8)}] WINNER: ${winner.username} — ${firstPrize.toFixed(2)}`
      );

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
      await this.supabase.from('tables').update({ status: 'closed' }).eq('id', table.tableId);
    }

    // Clear intervals
    if (this.blindCheckInterval) clearInterval(this.blindCheckInterval);
    if (this.eliminationCheckInterval) clearInterval(this.eliminationCheckInterval);

    console.log(
      `[TournamentEngine:${this.tournamentId.slice(0, 8)}] All cleanup complete. Total hands: ${this.handsDealt}`
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  private mapGameVariant(gameType: string): string {
    const map: Record<string, string> = {
      NLH: 'nlh',
      PLO: 'plo4',
      PLO4: 'plo4',
      PLO5: 'plo5',
      PLO6: 'plo6',
      PLO8: 'plo8',
      OFC_PINEAPPLE: 'ofc_pineapple',
      SHORT_DECK: 'short_deck',
    };
    return map[gameType?.toUpperCase()] || 'nlh';
  }

  private getOrdinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  }
}

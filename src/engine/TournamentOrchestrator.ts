import { supabase } from '../lib/supabase';
import { TournamentEngine } from './TournamentEngine';

/**
 * TOURNAMENT ORCHESTRATOR
 * Master service that watches for active tournaments, spins up TournamentEngine instances,
 * and manages their lifecycle.
 * Designed to be run from an active Admin / Node context.
 */
export class TournamentOrchestrator {
  private activeEngines: Map<string, TournamentEngine> = new Map();
  private isRunning: boolean = false;
  private pollInterval: any = null;
  // Enhancement #3: Dedup notification emissions
  private notifiedTournaments: Set<string> = new Set();

  // Singleton instance
  private static instance: TournamentOrchestrator;

  private constructor() {}

  static getInstance(): TournamentOrchestrator {
    if (!TournamentOrchestrator.instance) {
      TournamentOrchestrator.instance = new TournamentOrchestrator();
    }
    return TournamentOrchestrator.instance;
  }

  /**
   * Start the global orchestrator
   */
  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[TournamentOrchestrator] Starting global tournament engine...');

    // 1. Initial spin up of all running/starting tournaments
    await this.syncActiveTournaments();

    // 2. Start polling for new tournaments every 30 seconds
    this.pollInterval = setInterval(() => {
      this.syncActiveTournaments();
    }, 30_000);
  }

  /**
   * Stop the orchestrator and all engines gracefully
   */
  async stop() {
    this.isRunning = false;
    if (this.pollInterval) clearInterval(this.pollInterval);

    console.log(
      `[TournamentOrchestrator] Stopping ${this.activeEngines.size} active tournament engines...`
    );

    for (const [tournamentId, engine] of this.activeEngines.entries()) {
      engine.stop(); // Synchronous stop
      this.activeEngines.delete(tournamentId);
    }
  }

  /**
   * Check stats
   */
  getStats() {
    return {
      running: this.isRunning,
      activeTournaments: this.activeEngines.size,
      totalPlayers: Array.from(this.activeEngines.values()).reduce(
        (acc, e) => acc + e.getPlayerCount(),
        0
      ),
      totalTables: Array.from(this.activeEngines.values()).reduce(
        (acc, e) => acc + e.getTableCount(),
        0
      ),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════════════════

  private async syncActiveTournaments() {
    if (!this.isRunning) return;

    try {
      // Find all tournaments that are registering, announced, or running
      const { data, error } = await supabase
        .from('tournaments')
        .select('id, status, started_at')
        .in('status', ['REGISTERING', 'ANNOUNCED', 'RUNNING']);

      if (error) throw error;

      const currentTournaments = new Map((data || []).map((t) => [t.id, t]));

      // 1. Start engines for new tournaments
      for (const [tournamentId, tInfo] of currentTournaments.entries()) {
        if (!this.activeEngines.has(tournamentId)) {
          // For REGISTERING/ANNOUNCED, determine if it's time to start
          if (tInfo.status === 'REGISTERING' || tInfo.status === 'ANNOUNCED') {
            if (tInfo.started_at) {
              const startTime = new Date(tInfo.started_at).getTime();
              const now = Date.now();
              // If it's within 1 minute of starting, or already past, boot it up
              if (now >= startTime - 60_000) {
                this.spinUpTournament(tournamentId);
              }
            }
          } else if (tInfo.status === 'RUNNING') {
            // Always re-hydrate running tournaments
            this.spinUpTournament(tournamentId);
          }
        }
      }

      // 2. Stop and remove engines for closed tournaments
      for (const [tournamentId, engine] of Array.from(this.activeEngines.entries())) {
        if (!currentTournaments.has(tournamentId) || !engine.isRunning()) {
          console.log(
            `[TournamentOrchestrator] Tournament ${tournamentId} finished. Cleaning up...`
          );
          engine.stop();
          this.activeEngines.delete(tournamentId);
        }
      }

      // 3. Check for upcoming tournament notification windows (24h / 1h)
      await this.checkNotificationHooks();
    } catch (err) {
      console.error('[TournamentOrchestrator] Error syncing active tournaments:', err);
    }
  }

  private spinUpTournament(tournamentId: string) {
    console.log(`[TournamentOrchestrator] Spinning up TournamentEngine for: ${tournamentId}`);
    const engine = new TournamentEngine(tournamentId, supabase);
    this.activeEngines.set(tournamentId, engine);

    // Fire and forget start
    engine.start().catch((err) => {
      console.error(`[TournamentOrchestrator] Engine failed to start for ${tournamentId}:`, err);
      this.activeEngines.delete(tournamentId);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // MULTI-DAY FLIGHT SUPPORT (Day 1 bag-and-tag → Day 2 resume)
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Bag-and-tag: Save all remaining players' chip counts at end of Day 1.
   * Creates entries in `tournament_flights` with status 'bagged'.
   */
  async handleMultiDayFlight(tournamentId: string): Promise<void> {
    const engine = this.activeEngines.get(tournamentId);
    if (!engine) {
      console.warn(`[TournamentOrchestrator] No active engine for ${tournamentId}`);
      return;
    }

    try {
      // 1. Get all remaining players and their chip stacks
      const { data: players, error } = await supabase
        .from('tournament_players')
        .select('user_id, chips')
        .eq('tournament_id', tournamentId)
        .eq('status', 'playing');

      if (error) throw error;

      if (!players || players.length === 0) {
        console.warn(`[TournamentOrchestrator] No active players to bag for ${tournamentId}`);
        return;
      }

      // 2. Insert bagged chip counts into tournament_flights
      const flightRecords = players.map((p) => ({
        tournament_id: tournamentId,
        user_id: p.user_id,
        bagged_chips: p.chips,
        flight_day: 1,
        status: 'bagged',
        bagged_at: new Date().toISOString(),
      }));

      const { error: insertError } = await supabase
        .from('tournament_flights')
        .upsert(flightRecords, { onConflict: 'tournament_id,user_id' });

      if (insertError) {
        console.error(`[TournamentOrchestrator] Failed to bag flights:`, insertError);
        return;
      }

      // 3. Pause the tournament
      await supabase
        .from('tournaments')
        .update({ status: 'DAY_BREAK', day1_ended_at: new Date().toISOString() })
        .eq('id', tournamentId);

      // 4. Stop the engine for this tournament
      engine.stop();
      this.activeEngines.delete(tournamentId);

      console.log(
        `[TournamentOrchestrator] Day 1 bagged for ${tournamentId}: ${players.length} players`
      );

      // 5. Emit bus event
      try {
        const { masterBus } = await import('../core/MasterBus');
        masterBus.emit('FLIGHT_BAGGED', {
          tournamentId,
          playersCount: players.length,
          avgStack: Math.round(
            players.reduce((sum, p) => sum + (p.chips || 0), 0) / players.length
          ),
        });
      } catch {
        /* best effort */
      }
    } catch (err) {
      console.error(`[TournamentOrchestrator] Error bagging flight ${tournamentId}:`, err);
    }
  }

  /**
   * Resume Day 2: Restore players with their bagged chip stacks.
   */
  async scheduleDayTwoStart(tournamentId: string): Promise<void> {
    try {
      // 1. Load bagged flights
      const { data: flights, error } = await supabase
        .from('tournament_flights')
        .select('user_id, bagged_chips')
        .eq('tournament_id', tournamentId)
        .eq('status', 'bagged');

      if (error) throw error;
      if (!flights || flights.length === 0) {
        console.warn(`[TournamentOrchestrator] No bagged players for ${tournamentId}`);
        return;
      }

      // 2. Restore chip stacks in tournament_players
      for (const flight of flights) {
        await supabase
          .from('tournament_players')
          .update({ chips: flight.bagged_chips, status: 'playing' })
          .eq('tournament_id', tournamentId)
          .eq('user_id', flight.user_id);
      }

      // 3. Mark flights as resumed
      await supabase
        .from('tournament_flights')
        .update({ status: 'resumed', resumed_at: new Date().toISOString() })
        .eq('tournament_id', tournamentId)
        .eq('status', 'bagged');

      // 4. Update tournament status
      await supabase
        .from('tournaments')
        .update({ status: 'RUNNING', day2_started_at: new Date().toISOString() })
        .eq('id', tournamentId);

      // 5. Spin up the engine
      this.spinUpTournament(tournamentId);

      console.log(
        `[TournamentOrchestrator] Day 2 started for ${tournamentId}: ${flights.length} players restored`
      );

      // 6. Emit bus event
      try {
        const { masterBus } = await import('../core/MasterBus');
        masterBus.emit('FLIGHT_RESUMED', {
          tournamentId,
          playersResumed: flights.length,
        });
      } catch {
        /* best effort */
      }
    } catch (err) {
      console.error(`[TournamentOrchestrator] Error starting Day 2 for ${tournamentId}:`, err);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // NOTIFICATION HOOKS — 24h and 1h pre-tournament alerts
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Check all ANNOUNCED tournaments and emit notification events
   * if within 24h or 1h of start time.
   * Call this from the regular sync poll.
   */
  async checkNotificationHooks(): Promise<void> {
    try {
      const now = Date.now();
      const { data: upcoming } = await supabase
        .from('tournaments')
        .select('id, name, started_at, status')
        .eq('status', 'ANNOUNCED')
        .not('started_at', 'is', null);

      if (!upcoming) return;

      const { masterBus } = await import('../core/MasterBus');

      for (const t of upcoming) {
        const startTime = new Date(t.started_at).getTime();
        const diff = startTime - now;

        // 24h notification window (between 24h and 23h before start)
        const key24 = `${t.id}_24h`;
        if (
          diff > 23 * 60 * 60 * 1000 &&
          diff <= 24 * 60 * 60 * 1000 &&
          !this.notifiedTournaments.has(key24)
        ) {
          this.notifiedTournaments.add(key24);
          masterBus.emit('TOURNAMENT_STARTING_24H', {
            tournamentId: t.id,
            name: t.name,
            startsAt: t.started_at,
          });
        }

        // 1h notification window (between 1h and 55m before start)
        const key1h = `${t.id}_1h`;
        if (
          diff > 55 * 60 * 1000 &&
          diff <= 60 * 60 * 1000 &&
          !this.notifiedTournaments.has(key1h)
        ) {
          this.notifiedTournaments.add(key1h);
          masterBus.emit('TOURNAMENT_STARTING_1H', {
            tournamentId: t.id,
            name: t.name,
            startsAt: t.started_at,
          });
        }
      }
    } catch (err) {
      console.error('[TournamentOrchestrator] Error checking notification hooks:', err);
    }
  }
}

export const tournamentOrchestrator = TournamentOrchestrator.getInstance();

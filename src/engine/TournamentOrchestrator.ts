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
}

export const tournamentOrchestrator = TournamentOrchestrator.getInstance();

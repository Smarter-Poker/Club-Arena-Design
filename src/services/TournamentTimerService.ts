/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  TOURNAMENT TIMER SERVICE — Blind Level Advancement Engine
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Manages automatic blind level advancement for running tournaments.
 * Features:
 * - Tick-based level checking
 * - Database sync when levels change
 * - Real-time broadcast to all connected clients
 * - Break handling
 */

import { supabase } from '../lib/supabase';
import { tournamentService } from './TournamentService';
import { masterBus } from '../core/MasterBus';
import type { Tournament } from '../types/database.types';

interface TournamentTimerState {
  tournamentId: string;
  currentLevel: number;
  intervalId: ReturnType<typeof setInterval>;
  isPaused: boolean;
  lastTick: number;
  breakTimeoutId?: ReturnType<typeof setTimeout>;
}

class TournamentTimerServiceClass {
  private activeTimers: Map<string, TournamentTimerState> = new Map();
  private readonly TICK_INTERVAL_MS = 1000; // Check every second
  private breakIntervals: Map<string, number> = new Map(); // configurable break every N levels

  /**
   * Start monitoring a tournament for level changes
   */
  startTimer(tournamentId: string): void {
    if (this.activeTimers.has(tournamentId)) {
      console.warn(`[TournamentTimer] Timer already running for ${tournamentId}`);
      return;
    }

    const intervalId = setInterval(() => {
      this.tick(tournamentId);
    }, this.TICK_INTERVAL_MS);

    this.activeTimers.set(tournamentId, {
      tournamentId,
      currentLevel: 0,
      intervalId,
      isPaused: false,
      lastTick: Date.now(),
    });

    // Initial tick to set up state
    this.tick(tournamentId);
  }

  /**
   * Stop monitoring a tournament
   */
  stopTimer(tournamentId: string): void {
    const timer = this.activeTimers.get(tournamentId);
    if (timer) {
      clearInterval(timer.intervalId);
      if (timer.breakTimeoutId) {
        clearTimeout(timer.breakTimeoutId);
      }
      this.activeTimers.delete(tournamentId);
    }
  }

  /**
   * Pause a tournament timer (for breaks)
   */
  pauseTimer(tournamentId: string): void {
    const timer = this.activeTimers.get(tournamentId);
    if (timer) {
      timer.isPaused = true;
    }
  }

  /**
   * Resume a tournament timer
   */
  resumeTimer(tournamentId: string): void {
    const timer = this.activeTimers.get(tournamentId);
    if (timer) {
      timer.isPaused = false;
    }
  }

  /**
   * Get current timer state for a tournament
   */
  getTimerState(tournamentId: string): TournamentTimerState | null {
    return this.activeTimers.get(tournamentId) || null;
  }

  /**
   * Core tick function — called every second for each active tournament
   */
  private async tick(tournamentId: string): Promise<void> {
    const timer = this.activeTimers.get(tournamentId);
    if (!timer || timer.isPaused) return;

    try {
      // Fetch current tournament state
      const tournament = await tournamentService.getTournament(tournamentId);
      if (!tournament || tournament.status !== 'RUNNING') {
        this.stopTimer(tournamentId);
        return;
      }

      // Calculate current level based on elapsed time
      const levelState = tournamentService.getCurrentLevelState(tournament);
      const newLevel = levelState.levelIndex + 1; // 1-indexed for display

      // Check if level changed
      if (newLevel !== timer.currentLevel) {
        await this.handleLevelChange(tournament, timer.currentLevel, newLevel, levelState);
        timer.currentLevel = newLevel;
      }

      timer.lastTick = Date.now();
    } catch (error) {
      console.error(`[TournamentTimer] Error in tick for ${tournamentId}:`, error);
    }
  }

  /**
   * Handle blind level advancement
   */
  private async handleLevelChange(
    tournament: Tournament,
    oldLevel: number,
    newLevel: number,
    levelState: ReturnType<typeof tournamentService.getCurrentLevelState>
  ): Promise<void> {
    const { currentLevel } = levelState;

    // 1. Update database with new level
    await supabase
      .from('tournaments')
      .update({
        current_level: newLevel,
      })
      .eq('id', tournament.id);

    // 2. Update all tournament tables with new blinds
    await supabase
      .from('tables')
      .update({
        small_blind: currentLevel.smallBlind,
        big_blind: currentLevel.bigBlind,
      })
      .eq('tournament_id', tournament.id);

    // 3. Broadcast level change to all clients
    await this.broadcastLevelChange(tournament.id, {
      level: newLevel,
      smallBlind: currentLevel.smallBlind,
      bigBlind: currentLevel.bigBlind,
      ante: currentLevel.ante,
      nextLevel: levelState.nextLevel,
      timeRemainingSeconds: levelState.timeRemainingSeconds,
    });

    // 3.5. Emit specific bus event for TournamentClock and other listeners
    masterBus.emit('BLIND_LEVEL_CHANGE', {
      tournamentId: tournament.id,
      level: newLevel,
      smallBlind: currentLevel.smallBlind,
      bigBlind: currentLevel.bigBlind,
      ante: currentLevel.ante,
    });

    // 3.6. Also emit general tournament update for page-level refresh
    masterBus.emit('TOURNAMENT_UPDATED', {
      tournamentId: tournament.id,
      status: `blind_level_${newLevel}`,
    });

    // 4. Check for break times (configurable interval, default every 6 levels)
    const breakInterval = this.breakIntervals.get(tournament.id) || 6;
    if (newLevel % breakInterval === 0 && levelState.nextLevel) {
      await this.handleBreak(tournament.id, 5); // 5-minute break
    }
  }

  /**
   * Handle tournament break
   */
  private async handleBreak(tournamentId: string, durationMinutes: number): Promise<void> {
    // Pause the timer locally (tournament stays RUNNING in DB — 'paused' is not a valid DB status)
    this.pauseTimer(tournamentId);

    // Broadcast break notification
    await this.broadcastEvent(tournamentId, 'BREAK_START', {
      durationMinutes,
      resumeAt: new Date(Date.now() + durationMinutes * 60 * 1000).toISOString(),
    });

    // Schedule resume and store the timeout ID for cleanup
    const breakTimeoutId = setTimeout(
      async () => {
        this.resumeTimer(tournamentId);

        // Clear the stored timeout ID
        const t = this.activeTimers.get(tournamentId);
        if (t) t.breakTimeoutId = undefined;

        await this.broadcastEvent(tournamentId, 'BREAK_END', {});
      },
      durationMinutes * 60 * 1000
    );

    // Store timeout ID so stopTimer can clear it
    const timer = this.activeTimers.get(tournamentId);
    if (timer) timer.breakTimeoutId = breakTimeoutId;
  }

  /**
   * Broadcast blind level change to all connected clients
   */
  private async broadcastLevelChange(
    tournamentId: string,
    data: {
      level: number;
      smallBlind: number;
      bigBlind: number;
      ante: number;
      nextLevel: { smallBlind: number; bigBlind: number; ante: number } | null;
      timeRemainingSeconds: number;
    }
  ): Promise<void> {
    await this.broadcastEvent(tournamentId, 'LEVEL_CHANGE', data);
  }

  /**
   * Generic event broadcast via Supabase Realtime
   */
  private async broadcastEvent(
    tournamentId: string,
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    try {
      // Use MasterBus channel registry to avoid orphaned channel leaks
      const channelKey = `tournament:${tournamentId}`;
      const channel = masterBus.getOrCreateChannel(channelKey);
      await channel.send({
        type: 'broadcast',
        event: eventType,
        payload: {
          tournamentId,
          timestamp: new Date().toISOString(),
          ...payload,
        },
      });
    } catch (error) {
      console.error(`[TournamentTimer] Broadcast error:`, error);
    }
  }

  /**
   * Start timers for all running tournaments (called on app init)
   */
  async initializeAllTimers(): Promise<void> {
    const { data: runningTournaments } = await supabase
      .from('tournaments')
      .select('id')
      .eq('status', 'RUNNING');

    if (runningTournaments) {
      for (const t of runningTournaments) {
        this.startTimer(t.id);
      }
    }
  }

  /**
   * Stop all active timers (called on app shutdown)
   */
  stopAllTimers(): void {
    // Copy keys first to avoid Map-delete-during-iteration skip bug
    const ids = [...this.activeTimers.keys()];
    for (const id of ids) {
      this.stopTimer(id);
    }
  }

  /**
   * Get formatted time remaining string (MM:SS)
   */
  formatTimeRemaining(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Set configurable break interval for a tournament
   */
  setBreakInterval(tournamentId: string, everyNLevels: number): void {
    this.breakIntervals.set(tournamentId, Math.max(1, everyNLevels));
  }

  /**
   * Get full clock state for UI binding (TournamentClock component)
   */
  async getFullClockState(tournamentId: string): Promise<{
    tournamentId: string;
    currentLevel: number;
    smallBlind: number;
    bigBlind: number;
    ante: number;
    nextSmallBlind: number;
    nextBigBlind: number;
    nextAnte: number;
    timeRemainingSeconds: number;
    isPaused: boolean;
    breakInterval: number;
  } | null> {
    const timer = this.activeTimers.get(tournamentId);
    if (!timer) return null;

    const tournament = await tournamentService.getTournament(tournamentId);
    if (!tournament) return null;

    const levelState = tournamentService.getCurrentLevelState(tournament);

    return {
      tournamentId,
      currentLevel: levelState.levelIndex + 1,
      smallBlind: levelState.currentLevel.smallBlind,
      bigBlind: levelState.currentLevel.bigBlind,
      ante: levelState.currentLevel.ante,
      nextSmallBlind: levelState.nextLevel?.smallBlind || 0,
      nextBigBlind: levelState.nextLevel?.bigBlind || 0,
      nextAnte: levelState.nextLevel?.ante || 0,
      timeRemainingSeconds: levelState.timeRemainingSeconds,
      isPaused: timer.isPaused,
      breakInterval: this.breakIntervals.get(tournamentId) || 6,
    };
  }
}

export const tournamentTimerService = new TournamentTimerServiceClass();
export default tournamentTimerService;

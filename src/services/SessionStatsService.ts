/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  SESSION STATS SERVICE — Real-time cash game session analytics
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * In-memory tracking per session:
 * - P&L (profit/loss from initial buy-in)
 * - Hands played, hands/hour
 * - VPIP% and PFR%
 * - Session trajectory data points for mini-graph
 * - Resets on table leave
 */

import { masterBus } from '../core/MasterBus';
import { supabase } from '../lib/supabase';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface SessionStats {
  tableId: string;
  userId: string;
  sessionStartTime: number;
  initialStack: number;
  currentStack: number;
  buyInTotal: number;
  handsPlayed: number;
  handsWon: number;
  handsPerHour: number;
  vpipHands: number; // Hands where player voluntarily put chips in preflop
  vpipPercent: number;
  pfrHands: number; // Hands where player raised preflop
  pfrPercent: number;
  profitLoss: number;
  bigBlindsWon: number;
  bigBlind: number;
  /** Data points for session trajectory graph: [timestamp, stack] */
  trajectory: [number, number][];
}

// ═══════════════════════════════════════════════════════════════════════════════
// SESSION STATS SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

class SessionStatsServiceClass {
  private sessions: Map<string, SessionStats> = new Map(); // key = tableId
  /** Feature 8: Debounce timers for SESSION_STATS_UPDATE emissions */
  private emitTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  /**
   * Start tracking a new session at a table
   */
  startSession(tableId: string, userId: string, initialStack: number, bigBlind: number): void {
    const now = Date.now();
    const session: SessionStats = {
      tableId,
      userId,
      sessionStartTime: now,
      initialStack,
      currentStack: initialStack,
      buyInTotal: initialStack,
      handsPlayed: 0,
      handsWon: 0,
      handsPerHour: 0,
      vpipHands: 0,
      vpipPercent: 0,
      pfrHands: 0,
      pfrPercent: 0,
      profitLoss: 0,
      bigBlindsWon: 0,
      bigBlind,
      trajectory: [[now, initialStack]],
    };

    this.sessions.set(tableId, session);
    console.log(
      `[SessionStats] Started tracking — table: ${tableId.slice(0, 8)}, stack: ${initialStack}`
    );
  }

  /**
   * Feature 8: Debounced emission — batches rapid SESSION_STATS_UPDATE bus events
   * within a 500ms window to reduce bus traffic during high-volume play.
   */
  private debouncedEmit(tableId: string, session: SessionStats): void {
    // Clear existing timer for this table
    const existing = this.emitTimers.get(tableId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.emitTimers.delete(tableId);
      masterBus.emit('SESSION_STATS_UPDATE', {
        tableId,
        stats: { ...session, trajectory: [...session.trajectory] },
      });
    }, 500);
    this.emitTimers.set(tableId, timer);
  }

  /**
   * Record a completed hand
   */
  recordHand(tableId: string, finalStack: number, won: boolean, vpip: boolean, pfr: boolean): void {
    const session = this.sessions.get(tableId);
    if (!session) return;

    session.handsPlayed++;
    if (won) session.handsWon++;
    if (vpip) session.vpipHands++;
    if (pfr) session.pfrHands++;

    session.currentStack = finalStack;
    session.profitLoss = finalStack - session.buyInTotal;
    session.bigBlindsWon =
      session.bigBlind > 0 ? Math.round((session.profitLoss / session.bigBlind) * 100) / 100 : 0;

    // Calculate rates
    const elapsedHours = (Date.now() - session.sessionStartTime) / 3_600_000;
    session.handsPerHour = elapsedHours > 0 ? Math.round(session.handsPlayed / elapsedHours) : 0;
    session.vpipPercent =
      session.handsPlayed > 0 ? Math.round((session.vpipHands / session.handsPlayed) * 100) : 0;
    session.pfrPercent =
      session.handsPlayed > 0 ? Math.round((session.pfrHands / session.handsPlayed) * 100) : 0;

    // Add trajectory data point (max 200 points to prevent memory bloat)
    session.trajectory.push([Date.now(), finalStack]);
    if (session.trajectory.length > 200) {
      // Thin out older points — keep first, last, and every 4th
      const thinned: [number, number][] = [session.trajectory[0]];
      for (let i = 1; i < session.trajectory.length - 1; i += 4) {
        thinned.push(session.trajectory[i]);
      }
      thinned.push(session.trajectory[session.trajectory.length - 1]);
      session.trajectory = thinned;
    }

    // Feature 8: Debounced broadcast to reduce bus traffic
    this.debouncedEmit(tableId, session);
  }

  /**
   * Record a top-up / rebuy during session
   */
  recordRebuy(tableId: string, amount: number): void {
    const session = this.sessions.get(tableId);
    if (!session) return;

    session.buyInTotal += amount;
    session.currentStack += amount;
    session.profitLoss = session.currentStack - session.buyInTotal;
    session.bigBlindsWon =
      session.bigBlind > 0 ? Math.round((session.profitLoss / session.bigBlind) * 100) / 100 : 0;
    session.trajectory.push([Date.now(), session.currentStack]);

    // Rebuys emit immediately (user expects instant feedback)
    masterBus.emit('SESSION_STATS_UPDATE', {
      tableId,
      stats: { ...session, trajectory: [...session.trajectory] },
    });
  }

  /**
   * Get current session stats for a table
   */
  getStats(tableId: string): SessionStats | null {
    return this.sessions.get(tableId) || null;
  }

  /**
   * Feature 6: End session tracking, persist to Supabase, and return final stats.
   * Writes session data to `session_history` table for permanent analytics.
   */
  endSession(tableId: string): SessionStats | null {
    const session = this.sessions.get(tableId);
    if (!session) return null;

    // Clear any pending debounce timer for this table
    const pendingTimer = this.emitTimers.get(tableId);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      this.emitTimers.delete(tableId);
    }

    this.sessions.delete(tableId);

    const durationMs = Date.now() - session.sessionStartTime;
    const durationMinutes = Math.round(durationMs / 60_000);

    console.log(
      `[SessionStats] Session ended — table: ${tableId.slice(0, 8)}, P/L: ${session.profitLoss}, hands: ${session.handsPlayed}, duration: ${durationMinutes}m`
    );

    // Feature 6: Persist to Supabase (fire-and-forget, non-blocking)
    if (session.handsPlayed > 0) {
      supabase
        .from('session_history')
        .insert({
          user_id: session.userId,
          table_id: tableId,
          started_at: new Date(session.sessionStartTime).toISOString(),
          ended_at: new Date().toISOString(),
          duration_minutes: durationMinutes,
          initial_stack: session.initialStack,
          final_stack: session.currentStack,
          buy_in_total: session.buyInTotal,
          profit_loss: session.profitLoss,
          hands_played: session.handsPlayed,
          hands_won: session.handsWon,
          vpip_percent: session.vpipPercent,
          pfr_percent: session.pfrPercent,
          big_blind: session.bigBlind,
          bb_won: session.bigBlindsWon,
          trajectory: session.trajectory,
        })
        .then(({ error }) => {
          if (error) {
            console.warn('[SessionStats] Failed to persist session:', error.message);
          } else {
            console.log(`[SessionStats] Session persisted to DB — table: ${tableId.slice(0, 8)}`);
          }
        });
    }

    return session;
  }

  /**
   * Reset all sessions (cleanup on unmount)
   */
  resetAll(): void {
    // Clear all debounce timers
    this.emitTimers.forEach((timer) => clearTimeout(timer));
    this.emitTimers.clear();
    this.sessions.clear();
  }
}

export const sessionStatsService = new SessionStatsServiceClass();
export default sessionStatsService;

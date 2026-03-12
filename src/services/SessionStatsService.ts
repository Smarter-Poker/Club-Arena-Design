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

    // Broadcast update — deep-copy trajectory to prevent shared reference mutation
    masterBus.emit('SESSION_STATS_UPDATE', {
      tableId,
      stats: { ...session, trajectory: [...session.trajectory] },
    });
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
  }

  /**
   * Get current session stats for a table
   */
  getStats(tableId: string): SessionStats | null {
    return this.sessions.get(tableId) || null;
  }

  /**
   * End session tracking and return final stats
   */
  endSession(tableId: string): SessionStats | null {
    const session = this.sessions.get(tableId);
    if (!session) return null;
    this.sessions.delete(tableId);
    console.log(
      `[SessionStats] Session ended — table: ${tableId.slice(0, 8)}, P/L: ${session.profitLoss}, hands: ${session.handsPlayed}`
    );
    return session;
  }

  /**
   * Reset all sessions (cleanup on unmount)
   */
  resetAll(): void {
    this.sessions.clear();
  }
}

export const sessionStatsService = new SessionStatsServiceClass();
export default sessionStatsService;

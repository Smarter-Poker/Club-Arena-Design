/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  DISCONNECT PROTECTION SERVICE — Reconnect grace, auto-actions, connection quality
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Features:
 * - Disconnect insurance: configurable auto-check/fold on DC
 * - 30-second reconnection grace period before timing out
 * - Connection quality tracking (heartbeat-based)
 * - Offline action queue: store actions locally, replay on reconnect
 */

import { masterBus } from '../core/MasterBus';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type DCAction = 'check_fold' | 'fold' | 'check' | 'timeout';

export interface DisconnectConfig {
  graceSeconds: number; // Reconnection grace period (default 30)
  defaultAction: DCAction; // What to do on disconnect
  showLatency: boolean; // Show latency indicator to player
  maxQueuedActions: number; // Max offline-queued actions
}

export interface ConnectionState {
  userId: string;
  tableId: string;
  isConnected: boolean;
  lastHeartbeat: number;
  latencyMs: number;
  latencyHistory: number[]; // Last 10 latency readings
  averageLatencyMs: number;
  disconnectedAt: number | null;
  graceExpiresAt: number | null;
  quality: 'excellent' | 'good' | 'fair' | 'poor' | 'disconnected';
}

interface QueuedAction {
  tableId: string;
  action: string;
  amount?: number;
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DISCONNECT PROTECTION SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

class DisconnectProtectionServiceClass {
  private connections: Map<string, ConnectionState> = new Map(); // key = `${tableId}:${userId}`
  private configs: Map<string, DisconnectConfig> = new Map(); // key = tableId
  private actionQueue: QueuedAction[] = [];
  private heartbeatTimers: Map<string, ReturnType<typeof setInterval>> = new Map();

  private defaultConfig: DisconnectConfig = {
    graceSeconds: 30,
    defaultAction: 'check_fold',
    showLatency: true,
    maxQueuedActions: 5,
  };

  /**
   * Initialize disconnect protection for a player at a table
   */
  initialize(tableId: string, userId: string, config?: Partial<DisconnectConfig>): void {
    const key = `${tableId}:${userId}`;
    const mergedConfig = { ...this.defaultConfig, ...config };
    this.configs.set(tableId, mergedConfig);

    this.connections.set(key, {
      userId,
      tableId,
      isConnected: true,
      lastHeartbeat: Date.now(),
      latencyMs: 0,
      latencyHistory: [],
      averageLatencyMs: 0,
      disconnectedAt: null,
      graceExpiresAt: null,
      quality: 'excellent',
    });

    // Start heartbeat monitoring
    this.startHeartbeat(key, mergedConfig);
  }

  /**
   * Record a heartbeat from the player (proves they're connected)
   */
  recordHeartbeat(tableId: string, userId: string, roundTripMs: number): void {
    const key = `${tableId}:${userId}`;
    const conn = this.connections.get(key);
    if (!conn) return;

    conn.lastHeartbeat = Date.now();
    conn.latencyMs = roundTripMs;

    // Update latency history (keep last 10)
    conn.latencyHistory.push(roundTripMs);
    if (conn.latencyHistory.length > 10) conn.latencyHistory.shift();
    conn.averageLatencyMs = Math.round(
      conn.latencyHistory.reduce((s, v) => s + v, 0) / conn.latencyHistory.length
    );

    // Update quality classification
    conn.quality = this.classifyQuality(conn.averageLatencyMs);

    // If was disconnected, mark as reconnected
    if (!conn.isConnected) {
      conn.isConnected = true;
      conn.disconnectedAt = null;
      conn.graceExpiresAt = null;
      masterBus.emit('PLAYER_RECONNECTED', { tableId, userId });
    }
  }

  /**
   * Check if a player is currently disconnected
   */
  isDisconnected(tableId: string, userId: string): boolean {
    const key = `${tableId}:${userId}`;
    const conn = this.connections.get(key);
    return conn ? !conn.isConnected : true;
  }

  /**
   * Check if a player is in grace period (disconnected but still has time)
   */
  isInGracePeriod(tableId: string, userId: string): boolean {
    const key = `${tableId}:${userId}`;
    const conn = this.connections.get(key);
    if (!conn || conn.isConnected) return false;
    return conn.graceExpiresAt !== null && Date.now() < conn.graceExpiresAt;
  }

  /**
   * Get the default action for a disconnected player
   */
  getDisconnectAction(tableId: string): DCAction {
    return this.configs.get(tableId)?.defaultAction || 'check_fold';
  }

  /**
   * Get connection state for UI display
   */
  getConnectionState(tableId: string, userId: string): ConnectionState | null {
    return this.connections.get(`${tableId}:${userId}`) || null;
  }

  /**
   * Queue an action while offline
   */
  queueAction(tableId: string, action: string, amount?: number): void {
    const config = this.configs.get(tableId) || this.defaultConfig;
    if (this.actionQueue.length >= config.maxQueuedActions) {
      this.actionQueue.shift(); // Remove oldest
    }
    this.actionQueue.push({ tableId, action, amount, timestamp: Date.now() });
  }

  /**
   * Replay queued actions on reconnect
   */
  drainActionQueue(tableId: string): QueuedAction[] {
    const actions = this.actionQueue.filter((a) => a.tableId === tableId);
    this.actionQueue = this.actionQueue.filter((a) => a.tableId !== tableId);
    return actions;
  }

  /**
   * Cleanup when player leaves table
   */
  dispose(tableId: string, userId: string): void {
    const key = `${tableId}:${userId}`;
    this.connections.delete(key);

    const timer = this.heartbeatTimers.get(key);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(key);
    }

    this.actionQueue = this.actionQueue.filter((a) => a.tableId !== tableId);
  }

  /**
   * Cleanup all for a table
   */
  disposeTable(tableId: string): void {
    for (const [key] of this.connections) {
      if (key.startsWith(`${tableId}:`)) {
        this.connections.delete(key);
        const timer = this.heartbeatTimers.get(key);
        if (timer) clearInterval(timer);
        this.heartbeatTimers.delete(key);
      }
    }
    this.configs.delete(tableId);
  }

  // ── Private Methods ──

  private startHeartbeat(key: string, config: DisconnectConfig): void {
    // Check for disconnect every 5 seconds
    const timer = setInterval(() => {
      const conn = this.connections.get(key);
      if (!conn) {
        clearInterval(timer);
        return;
      }

      const elapsed = Date.now() - conn.lastHeartbeat;

      // If no heartbeat for 10 seconds, mark as disconnected
      if (conn.isConnected && elapsed > 10_000) {
        conn.isConnected = false;
        conn.disconnectedAt = Date.now();
        conn.graceExpiresAt = Date.now() + config.graceSeconds * 1000;
        conn.quality = 'disconnected';

        masterBus.emit('PLAYER_DISCONNECTED', {
          tableId: conn.tableId,
          userId: conn.userId,
          graceSeconds: config.graceSeconds,
        });
      }

      // If grace period expired, force default action
      if (!conn.isConnected && conn.graceExpiresAt && Date.now() >= conn.graceExpiresAt) {
        masterBus.emit('DISCONNECT_TIMEOUT', {
          tableId: conn.tableId,
          userId: conn.userId,
          action: config.defaultAction,
        });
        conn.graceExpiresAt = null; // Don't re-emit
      }
    }, 5000);

    this.heartbeatTimers.set(key, timer);
  }

  private classifyQuality(avgLatency: number): ConnectionState['quality'] {
    if (avgLatency < 50) return 'excellent';
    if (avgLatency < 150) return 'good';
    if (avgLatency < 300) return 'fair';
    return 'poor';
  }
}

export const disconnectProtectionService = new DisconnectProtectionServiceClass();
export default disconnectProtectionService;

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  DISCONNECT ENGINE — Player Timeout & Reconnection Management
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Manages player disconnect detection and automated responses:
 * - Per-player disconnect timer (configurable, default 30s)
 * - Auto-fold on timeout (auto-check if free action available)
 * - Reconnection state recovery
 * - Integration with HeadlessTableEngine via turn-change hook
 * - Bus emissions for UI synchronization
 */

import { masterBus } from '../core/MasterBus';
import { preciseActionTimer } from './PreciseActionTimer';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface DisconnectConfig {
  /** Seconds before auto-action on disconnect (default: 30) */
  disconnectTimeoutSeconds: number;
  /** Number of consecutive timeouts before auto-sit-out (default: 3) */
  maxConsecutiveTimeouts: number;
  /** If true, auto-check when possible instead of auto-fold (default: true) */
  preferCheckOverFold: boolean;
  /** Grace period in seconds for reconnection after timeout (default: 5) */
  reconnectGraceSeconds: number;
}

export interface PlayerConnectionState {
  playerId: string;
  tableId: string;
  isConnected: boolean;
  lastHeartbeat: number;
  consecutiveTimeouts: number;
  isSittingOut: boolean;
  /** Active timer for current disconnect */
  timeoutTimer?: ReturnType<typeof setTimeout>;
  /** Timestamp when disconnect was detected */
  disconnectedAt?: number;
}

export interface DisconnectAction {
  playerId: string;
  tableId: string;
  action: 'fold' | 'check';
  reason: 'timeout' | 'sitting_out';
}

// ═══════════════════════════════════════════════════════════════════════════════
// DISCONNECT ENGINE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class DisconnectEngineClass {
  private tableConfigs: Map<string, DisconnectConfig> = new Map();
  private playerStates: Map<string, PlayerConnectionState> = new Map();
  private actionCallbacks: Map<string, (action: DisconnectAction) => void> = new Map();

  private readonly DEFAULT_CONFIG: DisconnectConfig = {
    disconnectTimeoutSeconds: 30,
    maxConsecutiveTimeouts: 3,
    preferCheckOverFold: true,
    reconnectGraceSeconds: 5,
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Configure disconnect handling for a table
   */
  configure(tableId: string, config: Partial<DisconnectConfig>): void {
    this.tableConfigs.set(tableId, { ...this.DEFAULT_CONFIG, ...config });
  }

  /**
   * Register a callback for when an auto-action should be performed.
   * Called by HeadlessTableEngine to wire disconnect actions into the hand.
   */
  onAutoAction(tableId: string, callback: (action: DisconnectAction) => void): void {
    this.actionCallbacks.set(tableId, callback);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PLAYER TRACKING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Register a player at a table for disconnect tracking
   */
  registerPlayer(tableId: string, playerId: string): void {
    const key = `${tableId}:${playerId}`;
    this.playerStates.set(key, {
      playerId,
      tableId,
      isConnected: true,
      lastHeartbeat: Date.now(),
      consecutiveTimeouts: 0,
      isSittingOut: false,
    });
  }

  /**
   * Remove a player from disconnect tracking (left table)
   */
  unregisterPlayer(tableId: string, playerId: string): void {
    const key = `${tableId}:${playerId}`;
    // Cancel PreciseActionTimer deadline for this player
    preciseActionTimer.cancelTimer(tableId, `disconnect:${playerId}`);
    this.playerStates.delete(key);
  }

  /**
   * Process a heartbeat from a connected player.
   * Should be called periodically (e.g., every 5s via WebSocket ping).
   */
  heartbeat(tableId: string, playerId: string): void {
    const key = `${tableId}:${playerId}`;
    const state = this.playerStates.get(key);
    if (!state) return;

    const wasDisconnected = !state.isConnected;
    state.isConnected = true;
    state.lastHeartbeat = Date.now();

    if (wasDisconnected) {
      state.disconnectedAt = undefined;
      state.consecutiveTimeouts = 0;

      // Cancel the disconnect timeout timer — player is back
      preciseActionTimer.cancelTimer(tableId, `disconnect:${playerId}`);

      masterBus.emit('PLAYER_RECONNECTED', {
        tableId,
        userId: playerId,
      });
    }
  }

  /**
   * Mark a player as disconnected.
   * Called when WebSocket connection drops or heartbeat times out.
   */
  markDisconnected(tableId: string, playerId: string): void {
    const key = `${tableId}:${playerId}`;
    const state = this.playerStates.get(key);
    if (!state || !state.isConnected) return;

    state.isConnected = false;
    state.disconnectedAt = Date.now();

    masterBus.emit('PLAYER_DISCONNECTED', {
      tableId,
      userId: playerId,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TURN MANAGEMENT (called by HeadlessTableEngine)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Called when it becomes a player's turn to act.
   * If the player is disconnected, starts the timeout countdown.
   *
   * @param canCheck - Whether the player can check (no outstanding bet)
   * @returns true if player is connected and can act normally
   */
  onPlayerTurn(tableId: string, playerId: string, canCheck: boolean): boolean {
    const key = `${tableId}:${playerId}`;
    const state = this.playerStates.get(key);
    const config = this.tableConfigs.get(tableId) || this.DEFAULT_CONFIG;

    if (!state) return true; // Untracked player — let them act

    // Player is sitting out — auto-fold immediately
    if (state.isSittingOut) {
      this.executeAutoAction(tableId, playerId, canCheck, 'sitting_out');
      return false;
    }

    // Player is connected — they can act normally
    if (state.isConnected) {
      // Cancel any lingering disconnect timeout (PreciseActionTimer is sole timer)
      preciseActionTimer.cancelTimer(tableId, `disconnect:${playerId}`);
      return true;
    }

    // Player is disconnected — start timeout countdown
    this.startTimeoutCountdown(tableId, playerId, canCheck, config);
    return false;
  }

  /**
   * Cancel any active timeout for a player (e.g., they reconnected and acted)
   */
  cancelTimeout(tableId: string, playerId: string): void {
    // Cancel the PreciseActionTimer deadline (sole timer mechanism)
    preciseActionTimer.cancelTimer(tableId, `disconnect:${playerId}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SIT OUT MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Player requests to sit out (voluntary or forced by consecutive timeouts)
   */
  sitOut(tableId: string, playerId: string, reason: 'voluntary' | 'forced' = 'voluntary'): void {
    const key = `${tableId}:${playerId}`;
    const state = this.playerStates.get(key);
    if (!state) return;

    state.isSittingOut = true;

    masterBus.emit('PLAYER_SAT_OUT', {
      tableId,
      playerId,
      reason,
      consecutiveTimeouts: state.consecutiveTimeouts,
    });
  }

  /**
   * Player returns from sitting out
   */
  sitBack(tableId: string, playerId: string): void {
    const key = `${tableId}:${playerId}`;
    const state = this.playerStates.get(key);
    if (!state) return;

    state.isSittingOut = false;
    state.consecutiveTimeouts = 0;

    masterBus.emit('PLAYER_SAT_BACK', { tableId, playerId });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE QUERIES
  // ═══════════════════════════════════════════════════════════════════════════

  isConnected(tableId: string, playerId: string): boolean {
    const key = `${tableId}:${playerId}`;
    return this.playerStates.get(key)?.isConnected ?? true;
  }

  isSittingOut(tableId: string, playerId: string): boolean {
    const key = `${tableId}:${playerId}`;
    return this.playerStates.get(key)?.isSittingOut ?? false;
  }

  getState(tableId: string, playerId: string): PlayerConnectionState | null {
    const key = `${tableId}:${playerId}`;
    return this.playerStates.get(key) ?? null;
  }

  getConnectedPlayers(tableId: string): string[] {
    const connected: string[] = [];
    for (const [key, state] of this.playerStates) {
      if (key.startsWith(`${tableId}:`) && state.isConnected && !state.isSittingOut) {
        connected.push(state.playerId);
      }
    }
    return connected;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Remove all state for a table
   */
  dispose(tableId: string): void {
    // Cancel all PreciseActionTimer deadlines for this table's disconnect timers
    for (const [key, state] of this.playerStates) {
      if (key.startsWith(`${tableId}:`)) {
        preciseActionTimer.cancelTimer(tableId, `disconnect:${state.playerId}`);
        this.playerStates.delete(key);
      }
    }
    this.tableConfigs.delete(tableId);
    this.actionCallbacks.delete(tableId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE
  // ═══════════════════════════════════════════════════════════════════════════

  private startTimeoutCountdown(
    tableId: string,
    playerId: string,
    canCheck: boolean,
    config: DisconnectConfig
  ): void {
    const key = `${tableId}:${playerId}`;
    const state = this.playerStates.get(key);
    if (!state) return;

    masterBus.emit('DISCONNECT_TIMER_STARTED', {
      tableId,
      playerId,
      timeoutSeconds: config.disconnectTimeoutSeconds,
    });

    // Use PreciseActionTimer as the sole execution mechanism:
    // it has a 100ms polling loop that fires onExpiry and emits ACTION_TIMER_EXPIRED
    const durationMs = config.disconnectTimeoutSeconds * 1000;
    preciseActionTimer.startTimer(tableId, `disconnect:${playerId}`, durationMs, () => {
      // Check if player reconnected during the countdown
      if (state.isConnected) return;

      this.executeAutoAction(tableId, playerId, canCheck, 'timeout');
    });
  }

  private executeAutoAction(
    tableId: string,
    playerId: string,
    canCheck: boolean,
    reason: 'timeout' | 'sitting_out'
  ): void {
    const key = `${tableId}:${playerId}`;
    const state = this.playerStates.get(key);
    const config = this.tableConfigs.get(tableId) || this.DEFAULT_CONFIG;

    const action: 'fold' | 'check' = canCheck && config.preferCheckOverFold ? 'check' : 'fold';

    if (state && reason === 'timeout') {
      state.consecutiveTimeouts++;

      // Auto sit-out after too many consecutive timeouts
      if (state.consecutiveTimeouts >= config.maxConsecutiveTimeouts) {
        this.sitOut(tableId, playerId, 'forced');
      }
    }

    const disconnectAction: DisconnectAction = {
      playerId,
      tableId,
      action,
      reason,
    };

    masterBus.emit('PLAYER_TIMED_OUT', {
      tableId,
      playerId,
      action,
      reason,
      consecutiveTimeouts: state?.consecutiveTimeouts ?? 0,
    });

    // Execute the callback to perform the action in the hand
    const callback = this.actionCallbacks.get(tableId);
    if (callback) {
      callback(disconnectAction);
    }
  }
}

export const disconnectEngine = new DisconnectEngineClass();
export default disconnectEngine;

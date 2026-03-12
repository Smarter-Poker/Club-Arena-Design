/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  BOMB POT ENGINE — Scheduling, Execution, and Double Board Support
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Features:
 * - Schedule bomb pots every N hands or N minutes
 * - Force all players to contribute configurable ante (2x-5x BB)
 * - Skip preflop action, deal flop directly
 * - Double board option (two separate boards, split pot)
 * - Emit bus events for UI overlay
 */

import { masterBus } from '../core/MasterBus';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface BombPotConfig {
  enabled: boolean;
  frequency: number; // Every N hands (0 = disabled)
  frequencyMinutes: number; // Every N minutes (0 = disabled, takes priority if > 0)
  anteBBMultiplier: number; // 2x, 3x, 5x BB
  doubleBoard: boolean; // Two separate boards
  startAfterHand?: number; // Don't trigger before this hand number
}

export interface BombPotState {
  isActive: boolean;
  anteAmount: number; // Actual chip amount each player pays
  doubleBoard: boolean;
  handsSinceLastBombPot: number;
  timeSinceLastBombPot: number;
  nextBombPotHand?: number;
}

export interface BombPotResult {
  triggered: boolean;
  anteAmount: number;
  doubleBoard: boolean;
  board1?: string[]; // First board community cards
  board2?: string[]; // Second board (if double board)
}

// ═══════════════════════════════════════════════════════════════════════════════
// BOMB POT ENGINE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class BombPotEngineClass {
  private tableStates: Map<string, BombPotState> = new Map();
  private tableConfigs: Map<string, BombPotConfig> = new Map();

  /**
   * Initialize bomb pot tracking for a table
   */
  initialize(tableId: string, config: BombPotConfig): void {
    this.tableConfigs.set(tableId, config);
    this.tableStates.set(tableId, {
      isActive: false,
      anteAmount: 0,
      doubleBoard: config.doubleBoard,
      handsSinceLastBombPot: 0,
      timeSinceLastBombPot: Date.now(),
    });
  }

  /**
   * Check if a bomb pot should trigger before the next hand
   * Called by HeadlessTableEngine before each deal
   */
  shouldTrigger(tableId: string, bigBlind: number, handNumber: number): BombPotResult {
    const config = this.tableConfigs.get(tableId);
    const state = this.tableStates.get(tableId);

    if (!config || !state || !config.enabled) {
      return { triggered: false, anteAmount: 0, doubleBoard: false };
    }

    // Don't trigger before minimum hand count
    if (config.startAfterHand && handNumber < config.startAfterHand) {
      // Still increment hand counter even when not eligible yet
      state.handsSinceLastBombPot++;
      return { triggered: false, anteAmount: 0, doubleBoard: false };
    }

    let shouldTrigger = false;

    // Check time-frequency trigger first (takes priority)
    if (config.frequencyMinutes > 0) {
      const elapsed = (Date.now() - state.timeSinceLastBombPot) / 60_000;
      if (elapsed >= config.frequencyMinutes) {
        shouldTrigger = true;
      }
    }

    // Check hand-frequency trigger (only if time didn't already trigger)
    if (!shouldTrigger && config.frequency > 0) {
      state.handsSinceLastBombPot++;
      if (state.handsSinceLastBombPot >= config.frequency) {
        shouldTrigger = true;
      }
    } else if (config.frequency > 0) {
      // Still increment counter even when time-triggered, for accurate tracking
      state.handsSinceLastBombPot++;
    }

    if (!shouldTrigger) {
      return { triggered: false, anteAmount: 0, doubleBoard: false };
    }

    // Calculate ante amount
    const anteAmount = bigBlind * config.anteBBMultiplier;

    // Reset all tracking counters
    state.handsSinceLastBombPot = 0;
    state.timeSinceLastBombPot = Date.now();
    state.isActive = true;
    state.anteAmount = anteAmount;

    // Emit bomb pot triggered event
    masterBus.emit('BOMB_POT_TRIGGERED', {
      tableId,
      anteAmount,
      doubleBoard: config.doubleBoard,
      bbMultiplier: config.anteBBMultiplier,
    });

    return {
      triggered: true,
      anteAmount,
      doubleBoard: config.doubleBoard,
    };
  }

  /**
   * Mark bomb pot as completed
   */
  complete(tableId: string): void {
    const state = this.tableStates.get(tableId);
    if (state) {
      state.isActive = false;
    }
    masterBus.emit('BOMB_POT_COMPLETED', { tableId });
  }

  /**
   * Generate two independent boards for double board bomb pot
   * Returns [board1, board2] each with 5 community cards
   */
  generateDoubleBoard(deck: string[]): [string[], string[]] {
    // Need 10 community cards total (5 + 5)
    // Cards should be drawn from the remaining deck after player hole cards
    const board1 = deck.splice(0, 5);
    const board2 = deck.splice(0, 5);
    return [board1, board2];
  }

  /**
   * Calculate double board pot distribution
   * Each board gets half the pot; if a player wins both boards, they get everything
   */
  distributePot(totalPot: number, board1Winner: string, board2Winner: string): Map<string, number> {
    const distribution = new Map<string, number>();

    if (board1Winner === board2Winner) {
      // Same player wins both boards — they get entire pot
      distribution.set(board1Winner, totalPot);
    } else {
      // Split pot between the two board winners
      const halfPot = Math.trunc((totalPot / 2) * 100) / 100;
      distribution.set(board1Winner, halfPot);
      distribution.set(board2Winner, totalPot - halfPot); // Remainder to avoid rounding loss
    }

    return distribution;
  }

  /**
   * Get current bomb pot state for a table
   */
  getState(tableId: string): BombPotState | null {
    return this.tableStates.get(tableId) || null;
  }

  /**
   * Update bomb pot config live (admin setting change)
   */
  updateConfig(tableId: string, config: Partial<BombPotConfig>): void {
    const existing = this.tableConfigs.get(tableId);
    if (existing) {
      this.tableConfigs.set(tableId, { ...existing, ...config });
    }
  }

  /**
   * Cleanup when table closes
   */
  dispose(tableId: string): void {
    this.tableStates.delete(tableId);
    this.tableConfigs.delete(tableId);
  }
}

export const bombPotEngine = new BombPotEngineClass();
export default bombPotEngine;

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  PRE-ACTION ENGINE — Queued Actions Before Player's Turn
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Allows players to set actions before their turn arrives:
 * - Auto-fold: fold when it's your turn (regardless of action)
 * - Auto-check/fold: check if free, fold if there's a bet
 * - Auto-check: check if free (clear if there's a bet)
 * - Auto-call: call any bet when it's your turn
 * - Validates queued actions are still legal when turn arrives
 * - Bus emissions for UI synchronization
 */

import { masterBus } from '../core/MasterBus';
import type { ActionType } from '../types/database.types';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type PreActionType =
  | 'auto_fold' // Always fold
  | 'auto_check_fold' // Check if free, fold if bet
  | 'auto_check' // Check if free, clear if bet
  | 'auto_call' // Call any bet
  | 'auto_call_any'; // Call any amount (dangerous!)

export interface PreActionEntry {
  playerId: string;
  tableId: string;
  action: PreActionType;
  setAt: number;
  /** If the action involves calling, the max amount the player agreed to */
  maxCallAmount?: number;
}

export interface PreActionResult {
  executed: boolean;
  action?: ActionType;
  amount?: number;
  invalidated?: boolean;
  reason?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRE-ACTION ENGINE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class PreActionEngineClass {
  private queuedActions: Map<string, PreActionEntry> = new Map(); // key: tableId:playerId

  // ═══════════════════════════════════════════════════════════════════════════
  // SET / CLEAR PRE-ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Set a pre-action for a player
   */
  setPreAction(
    tableId: string,
    playerId: string,
    action: PreActionType,
    maxCallAmount?: number
  ): void {
    const key = `${tableId}:${playerId}`;

    this.queuedActions.set(key, {
      playerId,
      tableId,
      action,
      setAt: Date.now(),
      maxCallAmount,
    });

    masterBus.emit('PRE_ACTION_SET', {
      tableId,
      playerId,
      action,
    });
  }

  /**
   * Clear a pre-action for a player
   */
  clearPreAction(tableId: string, playerId: string): void {
    const key = `${tableId}:${playerId}`;
    this.queuedActions.delete(key);
  }

  /**
   * Get the current pre-action for a player
   */
  getPreAction(tableId: string, playerId: string): PreActionEntry | null {
    const key = `${tableId}:${playerId}`;
    return this.queuedActions.get(key) ?? null;
  }

  /**
   * Check if a player has a pre-action set
   */
  hasPreAction(tableId: string, playerId: string): boolean {
    return this.queuedActions.has(`${tableId}:${playerId}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXECUTION (called when it's the player's turn)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Try to execute the pre-action when a player's turn arrives.
   * Validates the action is still legal given the current game state.
   *
   * @param canCheck - Whether checking is a legal action
   * @param amountToCall - Amount needed to call (0 if can check)
   * @param playerStack - Player's current stack
   * @returns What action to take, or null if no pre-action / invalidated
   */
  executePreAction(
    tableId: string,
    playerId: string,
    canCheck: boolean,
    amountToCall: number,
    playerStack: number
  ): PreActionResult {
    const key = `${tableId}:${playerId}`;
    const entry = this.queuedActions.get(key);
    if (!entry) return { executed: false };

    // Always clear the pre-action after processing
    this.queuedActions.delete(key);

    let action: ActionType | undefined;
    let amount = 0;

    switch (entry.action) {
      case 'auto_fold':
        action = 'fold';
        break;

      case 'auto_check_fold':
        if (canCheck) {
          action = 'check';
        } else {
          action = 'fold';
        }
        break;

      case 'auto_check':
        if (canCheck) {
          action = 'check';
        } else {
          // Bet came in — invalidate the pre-action
          masterBus.emit('PRE_ACTION_INVALIDATED', {
            tableId,
            playerId,
            reason: 'bet_placed',
          });
          return {
            executed: false,
            invalidated: true,
            reason: 'Bet was placed — auto-check cleared',
          };
        }
        break;

      case 'auto_call':
        if (canCheck) {
          action = 'check';
        } else if (amountToCall <= playerStack) {
          // Check if the call amount exceeds what the player agreed to
          if (entry.maxCallAmount !== undefined && amountToCall > entry.maxCallAmount) {
            masterBus.emit('PRE_ACTION_INVALIDATED', {
              tableId,
              playerId,
              reason: 'call_exceeds_max',
            });
            return {
              executed: false,
              invalidated: true,
              reason: `Call amount (${amountToCall}) exceeds pre-set max (${entry.maxCallAmount})`,
            };
          }
          action = 'call';
          amount = amountToCall;
        } else {
          // All-in call
          action = 'call';
          amount = playerStack;
        }
        break;

      case 'auto_call_any':
        if (canCheck) {
          action = 'check';
        } else {
          action = 'call';
          amount = Math.min(amountToCall, playerStack);
        }
        break;

      default:
        return { executed: false };
    }

    if (action) {
      masterBus.emit('PRE_ACTION_EXECUTED', {
        tableId,
        playerId,
        action,
        amount,
      });
      return { executed: true, action, amount };
    }

    return { executed: false };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INVALIDATION (called when game state changes)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Invalidate all auto-check pre-actions when a bet is placed.
   * Called by HandController when any player bets or raises.
   */
  onBetPlaced(tableId: string, bettingPlayerId: string): void {
    for (const [key, entry] of this.queuedActions) {
      if (!key.startsWith(`${tableId}:`)) continue;
      if (entry.playerId === bettingPlayerId) continue;

      if (entry.action === 'auto_check') {
        this.queuedActions.delete(key);
        masterBus.emit('PRE_ACTION_INVALIDATED', {
          tableId,
          playerId: entry.playerId,
          reason: 'bet_placed',
        });
      }
    }
  }

  /**
   * Clear all pre-actions for a table (new hand, etc.)
   */
  clearTable(tableId: string): void {
    for (const key of this.queuedActions.keys()) {
      if (key.startsWith(`${tableId}:`)) {
        this.queuedActions.delete(key);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════════════════

  dispose(tableId: string): void {
    this.clearTable(tableId);
  }
}

export const preActionEngine = new PreActionEngineClass();
export default preActionEngine;

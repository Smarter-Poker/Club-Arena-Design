/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  SERVER ACTION VALIDATOR — Server-Authoritative Action Validation
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Validates every player action before it is applied to game state:
 * - Action legality (can they check/fold/raise in this context?)
 * - Amount bounds (min raise, max raise, stack sufficiency)
 * - Turn order (is it actually this player's turn?)
 * - Timing (action submitted within time limit)
 * - Duplicate suppression (reject if player already acted this round)
 *
 * Returns sanitized action data or rejection with reason.
 * All rejections emit ACTION_REJECTED bus events for logging/monitoring.
 */

import { masterBus } from '../core/MasterBus';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type ValidatedActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in';

export interface ActionRequest {
  tableId: string;
  handId: string;
  playerId: string;
  action: ValidatedActionType;
  amount?: number;
  timestamp: number; // Client-sent timestamp (ms)
}

export interface ValidationContext {
  currentPlayerId: string; // Whose turn it is
  stage: string; // preflop | flop | turn | river
  currentBet: number; // Current highest bet
  playerBet: number; // Player's current bet this street
  playerStack: number; // Player's remaining stack
  bigBlind: number;
  minRaise: number; // Minimum legal raise amount
  pot: number;
  canCheck: boolean; // Is check a legal action?
  actionDeadline: number; // Timestamp (ms) when timer expires
  playerActedThisRound: boolean; // Has this player already taken action?
  isAllIn: boolean; // Is the player already all-in?
  isFolded: boolean; // Has the player already folded?
  numActivePlayers: number; // Non-folded, non-all-in players
}

export interface ValidationResult {
  valid: boolean;
  sanitizedAction?: ValidatedActionType;
  sanitizedAmount?: number;
  reason?: string;
  code?: ValidationErrorCode;
}

export type ValidationErrorCode =
  | 'NOT_YOUR_TURN'
  | 'ALREADY_ACTED'
  | 'ALREADY_FOLDED'
  | 'ALREADY_ALL_IN'
  | 'ACTION_EXPIRED'
  | 'INVALID_ACTION'
  | 'INSUFFICIENT_STACK'
  | 'BELOW_MIN_RAISE'
  | 'ABOVE_MAX_RAISE'
  | 'CANNOT_CHECK'
  | 'NOTHING_TO_CALL'
  | 'INVALID_AMOUNT';

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATOR CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class ServerActionValidatorClass {
  // Track last action per player to suppress duplicates
  private lastActionIds: Map<string, string> = new Map(); // key: tableId:playerId, value: handId:action

  /**
   * Validate an action request against the current game context.
   * Returns a sanitized result or rejection with reason.
   */
  validate(request: ActionRequest, context: ValidationContext): ValidationResult {
    const { tableId, handId, playerId, action, amount, timestamp } = request;

    // ── 1. Turn Order Check ──
    if (playerId !== context.currentPlayerId) {
      return this.reject('NOT_YOUR_TURN', `It is not ${playerId}'s turn`, tableId, playerId);
    }

    // ── 2. Player State Checks ──
    if (context.isFolded) {
      return this.reject('ALREADY_FOLDED', 'Player has already folded', tableId, playerId);
    }

    if (context.isAllIn) {
      return this.reject('ALREADY_ALL_IN', 'Player is already all-in', tableId, playerId);
    }

    // ── 3. Duplicate Suppression ──
    const actionKey = `${tableId}:${playerId}`;
    const actionId = `${handId}:${action}:${amount ?? 0}:${timestamp}`;
    if (this.lastActionIds.get(actionKey) === actionId) {
      return this.reject('ALREADY_ACTED', 'Duplicate action suppressed', tableId, playerId);
    }

    // ── 4. Timing Check ──
    const now = Date.now();
    // Allow 2-second grace period for network latency
    if (context.actionDeadline > 0 && now > context.actionDeadline + 2000) {
      return this.reject('ACTION_EXPIRED', 'Action submitted after time limit', tableId, playerId);
    }

    // ── 5. Action-Specific Validation ──
    let result: ValidationResult;

    switch (action) {
      case 'fold':
        result = this.validateFold(context);
        break;
      case 'check':
        result = this.validateCheck(context);
        break;
      case 'call':
        result = this.validateCall(context);
        break;
      case 'bet':
        result = this.validateBet(amount, context);
        break;
      case 'raise':
        result = this.validateRaise(amount, context);
        break;
      case 'all_in':
        result = this.validateAllIn(context);
        break;
      default:
        result = this.reject('INVALID_ACTION', `Unknown action: ${action}`, tableId, playerId);
    }

    // Record successful action for duplicate suppression
    if (result.valid) {
      this.lastActionIds.set(actionKey, actionId);
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTION VALIDATORS
  // ═══════════════════════════════════════════════════════════════════════════

  private validateFold(_context: ValidationContext): ValidationResult {
    // Fold is always valid (player may fold even when they can check)
    return { valid: true, sanitizedAction: 'fold' };
  }

  private validateCheck(context: ValidationContext): ValidationResult {
    if (!context.canCheck) {
      return {
        valid: false,
        reason: 'Cannot check when there is a bet to call',
        code: 'CANNOT_CHECK',
      };
    }
    return { valid: true, sanitizedAction: 'check' };
  }

  private validateCall(context: ValidationContext): ValidationResult {
    const toCall = context.currentBet - context.playerBet;
    if (toCall <= 0) {
      return { valid: false, reason: 'Nothing to call', code: 'NOTHING_TO_CALL' };
    }

    // If calling would put player all-in, sanitize to all_in
    if (toCall >= context.playerStack) {
      return {
        valid: true,
        sanitizedAction: 'all_in',
        sanitizedAmount: context.playerStack,
      };
    }

    return { valid: true, sanitizedAction: 'call', sanitizedAmount: toCall };
  }

  private validateBet(amount: number | undefined, context: ValidationContext): ValidationResult {
    if (context.currentBet > 0) {
      return {
        valid: false,
        reason: 'Cannot bet when there is already a bet (use raise)',
        code: 'INVALID_ACTION',
      };
    }

    if (!amount || amount <= 0) {
      return { valid: false, reason: 'Bet amount required', code: 'INVALID_AMOUNT' };
    }

    // Min bet = big blind
    if (amount < context.bigBlind && amount < context.playerStack) {
      return {
        valid: false,
        reason: `Minimum bet is ${context.bigBlind}`,
        code: 'BELOW_MIN_RAISE',
      };
    }

    // All-in if amount >= stack
    if (amount >= context.playerStack) {
      return {
        valid: true,
        sanitizedAction: 'all_in',
        sanitizedAmount: context.playerStack,
      };
    }

    return { valid: true, sanitizedAction: 'bet', sanitizedAmount: amount };
  }

  private validateRaise(amount: number | undefined, context: ValidationContext): ValidationResult {
    if (context.currentBet <= 0) {
      return {
        valid: false,
        reason: 'Cannot raise when there is no bet (use bet)',
        code: 'INVALID_ACTION',
      };
    }

    if (!amount || amount <= 0) {
      return { valid: false, reason: 'Raise amount required', code: 'INVALID_AMOUNT' };
    }

    const toCall = context.currentBet - context.playerBet;
    const maxRaiseTo = context.playerBet + context.playerStack;
    const raiseIncrement = amount - context.currentBet;

    // All-in: always valid (even if below min raise)
    if (amount >= maxRaiseTo) {
      return {
        valid: true,
        sanitizedAction: 'all_in',
        sanitizedAmount: context.playerStack,
      };
    }

    // Must raise at least the minimum
    if (raiseIncrement < context.minRaise) {
      return {
        valid: false,
        reason: `Minimum raise is ${context.minRaise} (raise to at least ${context.currentBet + context.minRaise})`,
        code: 'BELOW_MIN_RAISE',
      };
    }

    // Insufficient stack
    const cost = amount - context.playerBet;
    if (cost > context.playerStack) {
      return { valid: false, reason: 'Insufficient chips', code: 'INSUFFICIENT_STACK' };
    }

    return { valid: true, sanitizedAction: 'raise', sanitizedAmount: amount };
  }

  private validateAllIn(context: ValidationContext): ValidationResult {
    if (context.playerStack <= 0) {
      return {
        valid: false,
        reason: 'No chips to go all-in with',
        code: 'INSUFFICIENT_STACK',
      };
    }

    return {
      valid: true,
      sanitizedAction: 'all_in',
      sanitizedAmount: context.playerStack,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private reject(
    code: ValidationErrorCode,
    reason: string,
    tableId: string,
    playerId: string
  ): ValidationResult {
    masterBus.emit('ACTION_REJECTED', {
      tableId,
      playerId,
      code,
      reason,
      timestamp: Date.now(),
    });

    return { valid: false, reason, code };
  }

  /**
   * Clear tracked actions for a table (call between hands)
   */
  clearTable(tableId: string): void {
    for (const key of this.lastActionIds.keys()) {
      if (key.startsWith(`${tableId}:`)) {
        this.lastActionIds.delete(key);
      }
    }
  }

  /**
   * Clear all state
   */
  dispose(): void {
    this.lastActionIds.clear();
  }
}

export const serverActionValidator = new ServerActionValidatorClass();
export default serverActionValidator;

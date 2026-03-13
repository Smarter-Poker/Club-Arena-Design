/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  HAND REPLAY ENGINE — Step-by-Step Hand History Replayer
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Loads completed hand data and replays it step-by-step:
 * - Reconstructs game state from action history
 * - Playback controls: play/pause, step forward/back, speed control
 * - Emits bus events for each replay step for UI consumption
 * - Supports replay from any hand ID via HandPersistenceService
 */

import { masterBus } from '../core/MasterBus';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ReplayAction {
  type: 'deal_hole' | 'deal_community' | 'post_blind' | 'action' | 'showdown' | 'winners';
  playerId?: string;
  action?: string; // fold | check | call | raise | all_in
  amount?: number;
  cards?: string[];
  stage?: string; // preflop | flop | turn | river
  timestamp?: number;
}

export interface ReplayPlayerState {
  userId: string;
  username: string;
  stack: number;
  bet: number;
  cards: string[];
  isFolded: boolean;
  isAllIn: boolean;
  seat: number;
}

export interface ReplaySnapshot {
  stepIndex: number;
  totalSteps: number;
  stage: string;
  pot: number;
  communityCards: string[];
  players: ReplayPlayerState[];
  currentAction: ReplayAction | null;
  isPlaying: boolean;
}

export interface HandReplayData {
  handId: string;
  tableId: string;
  handNumber: number;
  actions: ReplayAction[];
  players: ReplayPlayerState[];
  initialPot: number;
}

export type ReplaySpeed = 1 | 2 | 4;

// ═══════════════════════════════════════════════════════════════════════════════
// HAND REPLAY ENGINE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class HandReplayEngineClass {
  private currentHand: HandReplayData | null = null;
  private stepIndex: number = 0;
  private isPlaying: boolean = false;
  private speed: ReplaySpeed = 1;
  private playTimer: ReturnType<typeof setTimeout> | null = null;

  // Live state being reconstructed
  private currentStage: string = 'preflop';
  private currentPot: number = 0;
  private communityCards: string[] = [];
  private playerStates: Map<string, ReplayPlayerState> = new Map();

  // ═══════════════════════════════════════════════════════════════════════════
  // LOADING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Load hand data for replay.
   * In production, this would fetch from HandPersistenceService.
   * Here we accept pre-loaded data.
   */
  loadHand(data: HandReplayData): void {
    this.reset();
    this.currentHand = data;
    this.currentPot = data.initialPot || 0;

    // Initialize player states
    for (const player of data.players) {
      this.playerStates.set(player.userId, { ...player });
    }

    masterBus.emit('HAND_REPLAY_LOADED', {
      handId: data.handId,
      tableId: data.tableId,
      handNumber: data.handNumber,
      totalSteps: data.actions.length,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PLAYBACK CONTROLS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start or resume playback
   */
  play(): void {
    if (!this.currentHand || this.isPlaying) return;
    this.isPlaying = true;
    this.scheduleNextStep();
  }

  /**
   * Pause playback
   */
  pause(): void {
    this.isPlaying = false;
    if (this.playTimer) {
      clearTimeout(this.playTimer);
      this.playTimer = null;
    }
  }

  /**
   * Step forward one action
   */
  stepForward(): boolean {
    if (!this.currentHand) return false;
    if (this.stepIndex >= this.currentHand.actions.length) return false;

    const action = this.currentHand.actions[this.stepIndex];
    this.applyAction(action);
    this.stepIndex++;

    this.emitSnapshot(action);
    return true;
  }

  /**
   * Step backward one action (by replaying from beginning to stepIndex - 1)
   */
  stepBack(): boolean {
    if (!this.currentHand || this.stepIndex <= 0) return false;

    const targetStep = this.stepIndex - 1;
    this.replayToStep(targetStep);
    return true;
  }

  /**
   * Jump to a specific step
   */
  jumpToStep(step: number): void {
    if (!this.currentHand) return;
    const clamped = Math.max(0, Math.min(step, this.currentHand.actions.length));
    this.replayToStep(clamped);
  }

  /**
   * Set playback speed
   */
  setSpeed(speed: ReplaySpeed): void {
    this.speed = speed;
  }

  /**
   * Get current snapshot
   */
  getSnapshot(): ReplaySnapshot | null {
    if (!this.currentHand) return null;

    return {
      stepIndex: this.stepIndex,
      totalSteps: this.currentHand.actions.length,
      stage: this.currentStage,
      pot: this.currentPot,
      communityCards: [...this.communityCards],
      players: Array.from(this.playerStates.values()).map((p) => ({ ...p })),
      currentAction: this.stepIndex > 0 ? this.currentHand.actions[this.stepIndex - 1] : null,
      isPlaying: this.isPlaying,
    };
  }

  /**
   * Check if replay is complete
   */
  isComplete(): boolean {
    return !!(this.currentHand && this.stepIndex >= this.currentHand.actions.length);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: ACTION APPLICATION
  // ═══════════════════════════════════════════════════════════════════════════

  private applyAction(action: ReplayAction): void {
    switch (action.type) {
      case 'deal_hole':
        if (action.playerId && action.cards) {
          const player = this.playerStates.get(action.playerId);
          if (player) player.cards = [...action.cards];
        }
        break;

      case 'deal_community':
        if (action.cards) {
          this.communityCards.push(...action.cards);
          if (action.stage) this.currentStage = action.stage;
        }
        break;

      case 'post_blind':
        if (action.playerId && action.amount) {
          const player = this.playerStates.get(action.playerId);
          if (player) {
            player.stack -= action.amount;
            player.bet += action.amount;
            this.currentPot += action.amount;
          }
        }
        break;

      case 'action':
        if (action.playerId) {
          const player = this.playerStates.get(action.playerId);
          if (!player) break;

          switch (action.action) {
            case 'fold':
              player.isFolded = true;
              break;
            case 'check':
              // No state change
              break;
            case 'call':
              if (action.amount) {
                player.stack -= action.amount;
                player.bet += action.amount;
                this.currentPot += action.amount;
              }
              break;
            case 'raise':
            case 'bet':
              if (action.amount) {
                const raiseAmount = action.amount - player.bet;
                player.stack -= raiseAmount;
                this.currentPot += raiseAmount;
                player.bet = action.amount;
              }
              break;
            case 'all_in':
              this.currentPot += player.stack;
              player.bet += player.stack;
              player.stack = 0;
              player.isAllIn = true;
              break;
          }
        }
        break;

      case 'showdown':
        // Reveal cards
        if (action.playerId && action.cards) {
          const player = this.playerStates.get(action.playerId);
          if (player) player.cards = [...action.cards];
        }
        break;

      case 'winners':
        // Award pot
        if (action.playerId && action.amount) {
          const player = this.playerStates.get(action.playerId);
          if (player) player.stack += action.amount;
        }
        break;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: REPLAY HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private replayToStep(targetStep: number): void {
    if (!this.currentHand) return;

    // Reset state
    this.currentStage = 'preflop';
    this.currentPot = this.currentHand.initialPot || 0;
    this.communityCards = [];
    for (const player of this.currentHand.players) {
      this.playerStates.set(player.userId, { ...player });
    }

    // Replay from beginning to target
    for (let i = 0; i < targetStep; i++) {
      this.applyAction(this.currentHand.actions[i]);
    }

    this.stepIndex = targetStep;
    const lastAction = targetStep > 0 ? this.currentHand.actions[targetStep - 1] : null;
    this.emitSnapshot(lastAction);
  }

  private scheduleNextStep(): void {
    if (!this.isPlaying || !this.currentHand) return;
    if (this.stepIndex >= this.currentHand.actions.length) {
      this.isPlaying = false;
      masterBus.emit('HAND_REPLAY_COMPLETE', {
        handId: this.currentHand.handId,
      });
      return;
    }

    // Base delay 1000ms, scaled by speed
    const delay = 1000 / this.speed;

    this.playTimer = setTimeout(() => {
      this.stepForward();
      this.scheduleNextStep();
    }, delay);
  }

  private emitSnapshot(action: ReplayAction | null): void {
    const snapshot = this.getSnapshot();
    if (snapshot) {
      masterBus.emit('HAND_REPLAY_STEP', {
        handId: this.currentHand!.handId,
        step: this.stepIndex,
        totalSteps: this.currentHand!.actions.length,
        action,
        snapshot,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════════════════

  reset(): void {
    this.pause();
    this.currentHand = null;
    this.stepIndex = 0;
    this.currentStage = 'preflop';
    this.currentPot = 0;
    this.communityCards = [];
    this.playerStates.clear();
  }

  dispose(): void {
    this.reset();
  }
}

export const handReplayEngine = new HandReplayEngineClass();
export default handReplayEngine;

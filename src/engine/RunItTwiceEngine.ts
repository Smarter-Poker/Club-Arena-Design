/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  RUN IT TWICE ENGINE — Dual-Board Card Dealing for All-In Scenarios
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Handles the complete Run It Twice (RIT) lifecycle:
 * - Detects all-in scenarios where RIT can be offered
 * - Manages accept/decline responses from both players
 * - Deals two independent board runouts from remaining deck
 * - Calculates pot division based on dual board results
 * - Emits bus events for UI synchronization
 */

import { masterBus } from '../core/MasterBus';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface RITConfig {
  enabled: boolean;
  autoDeclineTimeout: number; // Seconds before auto-declining
}

export interface RITState {
  tableId: string;
  handId: string;
  status: 'idle' | 'offered' | 'accepted' | 'declined' | 'resolved';
  offeredBy: string; // Player who initiated the offer
  offeredTo: string; // Player who needs to respond
  acceptedBy: Set<string>; // Players who accepted
  pot: number;
  board1: string[]; // First runout
  board2: string[]; // Second runout
  board1Winner?: string;
  board2Winner?: string;
  timeoutTimer?: ReturnType<typeof setTimeout>;
}

export interface RITResult {
  board1: string[];
  board2: string[];
  pot1: number; // Half pot awarded from board 1
  pot2: number; // Half pot awarded from board 2
  board1Winner: string;
  board2Winner: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RUN IT TWICE ENGINE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class RunItTwiceEngineClass {
  private activeOffers: Map<string, RITState> = new Map();
  private tableConfigs: Map<string, RITConfig> = new Map();

  /**
   * Configure RIT for a table
   */
  configure(tableId: string, config: RITConfig): void {
    this.tableConfigs.set(tableId, config);
  }

  /**
   * Check if RIT is enabled for a table
   */
  isEnabled(tableId: string): boolean {
    return this.tableConfigs.get(tableId)?.enabled ?? false;
  }

  /**
   * Offer Run It Twice when all-in is detected.
   * Called by HeadlessTableEngine when 2+ players are all-in.
   */
  offer(tableId: string, handId: string, offeredBy: string, offeredTo: string, pot: number): void {
    const config = this.tableConfigs.get(tableId);
    if (!config?.enabled) return;

    // Clear any existing offer for this table
    this.clearOffer(tableId);

    const state: RITState = {
      tableId,
      handId,
      status: 'offered',
      offeredBy,
      offeredTo,
      acceptedBy: new Set([offeredBy]), // Offerer auto-accepts
      pot,
      board1: [],
      board2: [],
    };

    // Auto-decline timeout
    state.timeoutTimer = setTimeout(
      () => {
        if (state.status === 'offered') {
          this.decline(tableId, offeredTo);
        }
      },
      (config.autoDeclineTimeout || 10) * 1000
    );

    this.activeOffers.set(tableId, state);

    masterBus.emit('RIT_OFFERED', {
      tableId,
      handId,
      offeredBy,
      offeredTo,
      pot,
    });
  }

  /**
   * Accept the RIT offer
   */
  accept(tableId: string, playerId: string): boolean {
    const state = this.activeOffers.get(tableId);
    if (!state || state.status !== 'offered') return false;

    state.acceptedBy.add(playerId);

    // Both players accepted — RIT is on
    if (state.acceptedBy.has(state.offeredBy) && state.acceptedBy.has(state.offeredTo)) {
      state.status = 'accepted';
      if (state.timeoutTimer) clearTimeout(state.timeoutTimer);

      masterBus.emit('RIT_ACCEPTED', {
        tableId,
        handId: state.handId,
      });
      return true;
    }

    return false;
  }

  /**
   * Decline the RIT offer
   */
  decline(tableId: string, playerId: string): void {
    const state = this.activeOffers.get(tableId);
    if (!state || state.status !== 'offered') return;

    state.status = 'declined';
    if (state.timeoutTimer) clearTimeout(state.timeoutTimer);

    masterBus.emit('RIT_DECLINED', {
      tableId,
      handId: state.handId,
      declinedBy: playerId,
    });
  }

  /**
   * Deal two independent boards from the remaining deck.
   * Called after RIT is accepted, before the engine deals community cards.
   *
   * @param tableId - The table
   * @param remainingDeck - Cards not yet dealt (hole cards removed)
   * @param existingBoard - Community cards already dealt (e.g. flop)
   * @returns Two complete 5-card boards, or null if RIT not accepted
   */
  dealDualBoards(
    tableId: string,
    remainingDeck: string[],
    existingBoard: string[]
  ): RITResult | null {
    const state = this.activeOffers.get(tableId);
    if (!state || state.status !== 'accepted') return null;

    const cardsNeeded = 5 - existingBoard.length;
    if (remainingDeck.length < cardsNeeded * 2) {
      // Not enough cards for two runouts — shouldn't happen but guard
      console.warn(`[RITEngine] Not enough cards for dual boards at ${tableId}`);
      return null;
    }

    // Deal two sets of remaining community cards
    const run1Cards = remainingDeck.slice(0, cardsNeeded);
    const run2Cards = remainingDeck.slice(cardsNeeded, cardsNeeded * 2);

    state.board1 = [...existingBoard, ...run1Cards];
    state.board2 = [...existingBoard, ...run2Cards];

    return {
      board1: state.board1,
      board2: state.board2,
      pot1: Math.trunc((state.pot / 2) * 100) / 100,
      pot2: state.pot - Math.trunc((state.pot / 2) * 100) / 100,
      board1Winner: '', // To be filled by hand evaluator
      board2Winner: '', // To be filled by hand evaluator
    };
  }

  /**
   * Resolve RIT with board winners (called after hand evaluation)
   */
  resolve(tableId: string, board1Winner: string, board2Winner: string): Map<string, number> {
    const state = this.activeOffers.get(tableId);
    if (!state) return new Map();

    state.board1Winner = board1Winner;
    state.board2Winner = board2Winner;
    state.status = 'resolved';

    const distribution = new Map<string, number>();
    const halfPot = Math.trunc((state.pot / 2) * 100) / 100;
    const otherHalf = state.pot - halfPot;

    if (board1Winner === board2Winner) {
      // Same player wins both — gets entire pot
      distribution.set(board1Winner, state.pot);
    } else {
      distribution.set(board1Winner, halfPot);
      distribution.set(board2Winner, otherHalf);
    }

    masterBus.emit('RIT_RESOLVED', {
      tableId,
      handId: state.handId,
      board1: state.board1,
      board2: state.board2,
      board1Winner,
      board2Winner,
      distribution: Object.fromEntries(distribution),
    });

    // Cleanup after resolved
    this.clearOffer(tableId);

    return distribution;
  }

  /**
   * Check if RIT is currently active for a table
   */
  isActive(tableId: string): boolean {
    const state = this.activeOffers.get(tableId);
    return state?.status === 'accepted';
  }

  /**
   * Get current RIT state for a table
   */
  getState(tableId: string): RITState | null {
    return this.activeOffers.get(tableId) ?? null;
  }

  /**
   * Clear offer and cleanup
   */
  private clearOffer(tableId: string): void {
    const state = this.activeOffers.get(tableId);
    if (state?.timeoutTimer) clearTimeout(state.timeoutTimer);
    this.activeOffers.delete(tableId);
  }

  /**
   * Dispose all state for a table
   */
  dispose(tableId: string): void {
    this.clearOffer(tableId);
    this.tableConfigs.delete(tableId);
  }
}

export const runItTwiceEngine = new RunItTwiceEngineClass();
export default runItTwiceEngine;

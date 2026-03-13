/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  OFC DEALING ORCHESTRATOR — Chinese Poker Dealing Loop
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Drives the Open Face Chinese Pineapple dealing flow:
 * 1. Initial deal: 5 cards to each player (13 for Fantasyland players)
 * 2. Pineapple rounds: 3 cards dealt, player places 2 and discards 1
 * 3. After all rounds: score hands, apply royalties, check for Fantasyland
 * 4. Uses OFCPineappleEngine for game logic
 */

import { masterBus } from '../core/MasterBus';
import {
  OFCPineappleEngine,
  type OFCGameState,
  type OFCPlayer,
  type OFCCard,
  type OFCSuit,
  type OFCRank,
  type OFCRow,
} from './OFCPineappleEngine';
import { secureShuffle } from './CryptoRandom';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface OFCOrchestratorConfig {
  tableId: string;
  /** Seconds per placement decision (default: 30) */
  placementTimeoutSeconds: number;
  /** Whether Fantasyland is enabled (default: true) */
  fantasylandEnabled: boolean;
  /** Auto-foul on timeout (default: true) */
  autoFoulOnTimeout: boolean;
}

export interface OFCDealingState {
  config: OFCOrchestratorConfig;
  game: OFCGameState | null;
  handNumber: number;
  currentRound: number;
  isActive: boolean;
  fantasylandPlayers: Set<string>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// OFC DEALING ORCHESTRATOR CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class OFCDealingOrchestratorClass {
  private tables: Map<string, OFCDealingState> = new Map();
  private turnTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════

  configure(config: OFCOrchestratorConfig): void {
    const existing = this.tables.get(config.tableId);
    if (existing) {
      existing.config = config;
    } else {
      this.tables.set(config.tableId, {
        config,
        game: null,
        handNumber: 0,
        currentRound: 0,
        isActive: false,
        fantasylandPlayers: new Set(),
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEALING LOOP
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start a new OFC hand using OFCPineappleEngine's createGame().
   */
  startHand(tableId: string, playerIds: string[], playerNames: string[]): void {
    const state = this.tables.get(tableId);
    if (!state || playerIds.length < 2) return;

    state.handNumber++;
    state.isActive = true;
    state.currentRound = 0;

    // Use the OFCPineappleEngine to create the game state
    const game = OFCPineappleEngine.createGame(playerIds, playerNames);

    // Mark Fantasyland players
    for (const player of game.players) {
      if (state.fantasylandPlayers.has(player.id)) {
        player.isFantasyland = true;
      }
    }

    state.game = game;

    masterBus.emit('OFC_HAND_STARTED', {
      tableId,
      handNumber: state.handNumber,
      players: playerIds,
    });

    // Deal initial cards using the engine
    state.game = OFCPineappleEngine.dealInitialCards(state.game);

    // Emit dealt events
    for (const player of state.game.players) {
      masterBus.emit('OFC_CARDS_DEALT', {
        tableId,
        playerId: player.id,
        cardCount: player.currentCards.length,
        isFantasyland: player.isFantasyland,
      });
    }

    // Start placement timer for first player
    this.startPlacementTimer(tableId);
  }

  /**
   * Start a pineapple round: deal 3 cards to each non-FL player
   */
  startPineappleRound(tableId: string): void {
    const state = this.tables.get(tableId);
    if (!state?.game) return;

    state.currentRound++;

    if (state.currentRound > 4) {
      // All 4 pineapple rounds complete — score
      this.scoreHands(tableId);
      return;
    }

    // Deal pineapple cards using engine
    state.game = OFCPineappleEngine.dealPineappleCards(state.game);

    for (const player of state.game.players) {
      if (!player.isFantasyland && player.currentCards.length > 0) {
        masterBus.emit('OFC_CARDS_DEALT', {
          tableId,
          playerId: player.id,
          cardCount: player.currentCards.length,
          isFantasyland: false,
        });
      }
    }

    state.game.currentPlayerIndex = 0;
    this.startPlacementTimer(tableId);
  }

  /**
   * Process a player placing cards into their rows.
   */
  processPlacement(
    tableId: string,
    playerId: string,
    placements: Array<{ card: OFCCard; row: OFCRow }>
  ): boolean {
    const state = this.tables.get(tableId);
    if (!state?.game) return false;

    const playerIndex = state.game.players.findIndex((p) => p.id === playerId);
    if (playerIndex < 0) return false;

    // Apply placements using the engine
    for (const { card, row } of placements) {
      state.game = OFCPineappleEngine.placeCard(state.game, playerIndex, card, row);
    }

    // Clear timer and advance
    this.clearPlacementTimer(tableId);

    state.game.currentPlayerIndex++;

    if (state.game.currentPlayerIndex >= state.game.players.length) {
      if (state.currentRound === 0) {
        this.startPineappleRound(tableId);
      } else if (state.currentRound >= 4) {
        this.scoreHands(tableId);
      } else {
        this.startPineappleRound(tableId);
      }
    } else {
      this.startPlacementTimer(tableId);
    }

    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCORING
  // ═══════════════════════════════════════════════════════════════════════════

  private scoreHands(tableId: string): void {
    const state = this.tables.get(tableId);
    if (!state?.game) return;

    const scores: Record<string, number> = {};
    const nextFantasyland: Set<string> = new Set();

    // Score using the engine
    state.game = OFCPineappleEngine.scoreGame(state.game);

    for (const player of state.game.players) {
      scores[player.id] = player.score;

      // Check Fantasyland qualification
      if (state.config.fantasylandEnabled && player.isFantasyland) {
        // Already in FL — check if they stay
      }
      const qualifies = OFCPineappleEngine.checkFantasylandQualification(player);
      if (qualifies) {
        nextFantasyland.add(player.id);
        masterBus.emit('OFC_FANTASYLAND_ENTERED', { tableId, playerId: player.id });
      }
    }

    state.fantasylandPlayers = nextFantasyland;
    state.isActive = false;
    state.game.status = 'finished';

    masterBus.emit('OFC_SCORING_COMPLETE', { tableId, scores });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TIMER MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  private startPlacementTimer(tableId: string): void {
    const state = this.tables.get(tableId);
    if (!state?.game) return;

    const player = state.game.players[state.game.currentPlayerIndex];
    if (!player) return;

    masterBus.emit('OFC_TURN_CHANGE', { tableId, playerId: player.id });

    const timer = setTimeout(() => {
      if (state.config.autoFoulOnTimeout) {
        const p = state.game!.players[state.game!.currentPlayerIndex];
        if (p) p.isFouled = true;
      }

      state.game!.currentPlayerIndex++;
      if (state.game!.currentPlayerIndex >= state.game!.players.length) {
        if (state.currentRound >= 4 || state.currentRound === 0) {
          this.scoreHands(tableId);
        } else {
          this.startPineappleRound(tableId);
        }
      } else {
        this.startPlacementTimer(tableId);
      }
    }, state.config.placementTimeoutSeconds * 1000);

    this.turnTimers.set(tableId, timer);
  }

  private clearPlacementTimer(tableId: string): void {
    const timer = this.turnTimers.get(tableId);
    if (timer) {
      clearTimeout(timer);
      this.turnTimers.delete(tableId);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE QUERIES
  // ═══════════════════════════════════════════════════════════════════════════

  getState(tableId: string): OFCDealingState | null {
    return this.tables.get(tableId) ?? null;
  }

  isActive(tableId: string): boolean {
    return this.tables.get(tableId)?.isActive ?? false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════════════════

  dispose(tableId: string): void {
    this.clearPlacementTimer(tableId);
    this.tables.delete(tableId);
  }
}

export const ofcDealingOrchestrator = new OFCDealingOrchestratorClass();
export default ofcDealingOrchestrator;

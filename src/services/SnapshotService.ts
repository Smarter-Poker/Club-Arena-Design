/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  SNAPSHOT SERVICE — Table state capture for replay and dispute resolution
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Features:
 * - Capture complete table state at each action point
 * - Store stacks, positions, board, pot, actions
 * - Visual replay: step-through with action annotations
 * - Export as shareable hand notation
 * - Admin dispute resolution: exact game state review
 */

import { masterBus } from '../core/MasterBus';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface PlayerSnapshot {
  userId: string;
  displayName: string;
  seatIndex: number;
  chips: number;
  holeCards?: string[];
  isActive: boolean;
  isFolded: boolean;
  isAllIn: boolean;
  currentBet: number;
}

export interface ActionSnapshot {
  playerUserId: string;
  action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in';
  amount: number;
  timestamp: number;
}

export interface HandSnapshot {
  handId: string;
  tableId: string;
  handNumber: number;
  timestamp: number;

  // Game state
  gameType: string;
  smallBlind: number;
  bigBlind: number;
  ante: number;

  // Players
  players: PlayerSnapshot[];
  dealerSeat: number;

  // Street states
  streets: StreetSnapshot[];

  // Final result
  winners: {
    userId: string;
    amount: number;
    handRank?: string;
  }[];
  totalPot: number;
}

export interface StreetSnapshot {
  street: 'preflop' | 'flop' | 'turn' | 'river';
  board: string[];
  pot: number;
  actions: ActionSnapshot[];
  players: {
    userId: string;
    chips: number;
    currentBet: number;
  }[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// SNAPSHOT SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

class SnapshotServiceClass {
  /** In-memory buffer: keep last N hands per table */
  private snapshots: Map<string, HandSnapshot[]> = new Map(); // key = tableId
  private maxPerTable = 50;

  /** Current hand being built */
  private currentHands: Map<string, Partial<HandSnapshot>> = new Map(); // key = tableId

  /**
   * Begin capturing a new hand
   */
  startHand(
    tableId: string,
    handId: string,
    handNumber: number,
    config: {
      gameType: string;
      smallBlind: number;
      bigBlind: number;
      ante: number;
      dealerSeat: number;
      players: PlayerSnapshot[];
    }
  ): void {
    this.currentHands.set(tableId, {
      handId,
      tableId,
      handNumber,
      timestamp: Date.now(),
      gameType: config.gameType,
      smallBlind: config.smallBlind,
      bigBlind: config.bigBlind,
      ante: config.ante,
      dealerSeat: config.dealerSeat,
      players: config.players.map((p) => ({ ...p })),
      streets: [],
      winners: [],
      totalPot: 0,
    });
  }

  /**
   * Record a new street starting
   */
  startStreet(
    tableId: string,
    street: StreetSnapshot['street'],
    board: string[],
    pot: number,
    players: { userId: string; chips: number; currentBet: number }[]
  ): void {
    const hand = this.currentHands.get(tableId);
    if (!hand || !hand.streets) return;

    hand.streets.push({
      street,
      board: [...board],
      pot,
      actions: [],
      players: players.map((p) => ({ ...p })),
    });
  }

  /**
   * Record a player action within the current street
   */
  recordAction(tableId: string, action: ActionSnapshot): void {
    const hand = this.currentHands.get(tableId);
    if (!hand || !hand.streets || hand.streets.length === 0) return;

    const currentStreet = hand.streets[hand.streets.length - 1];
    currentStreet.actions.push({ ...action, timestamp: Date.now() });
  }

  /**
   * Complete a hand and store the snapshot
   */
  completeHand(
    tableId: string,
    winners: HandSnapshot['winners'],
    totalPot: number
  ): HandSnapshot | null {
    const hand = this.currentHands.get(tableId) as HandSnapshot | undefined;
    if (!hand) return null;

    hand.winners = winners;
    hand.totalPot = totalPot;

    // Store in buffer
    if (!this.snapshots.has(tableId)) {
      this.snapshots.set(tableId, []);
    }
    const buffer = this.snapshots.get(tableId)!;
    buffer.push(hand);
    if (buffer.length > this.maxPerTable) {
      buffer.shift(); // Remove oldest
    }

    // Cleanup current
    this.currentHands.delete(tableId);

    return hand;
  }

  /**
   * Get all snapshots for a table (for replay viewer)
   */
  getSnapshots(tableId: string): HandSnapshot[] {
    return this.snapshots.get(tableId) || [];
  }

  /**
   * Get a specific hand snapshot by ID
   */
  getSnapshot(tableId: string, handId: string): HandSnapshot | null {
    const buffer = this.snapshots.get(tableId);
    if (!buffer) return null;
    return buffer.find((s) => s.handId === handId) || null;
  }

  /**
   * Export a hand as text notation (for sharing)
   */
  exportAsText(snapshot: HandSnapshot): string {
    const lines: string[] = [];

    lines.push(`=== Hand #${snapshot.handNumber} ===`);
    lines.push(`${snapshot.gameType} — Blinds ${snapshot.smallBlind}/${snapshot.bigBlind}`);
    if (snapshot.ante > 0) lines.push(`Ante: ${snapshot.ante}`);
    lines.push('');

    // Player stacks
    lines.push('--- Players ---');
    for (const p of snapshot.players) {
      lines.push(`Seat ${p.seatIndex}: ${p.displayName} (${p.chips.toLocaleString()})`);
    }
    lines.push('');

    // Streets
    for (const street of snapshot.streets) {
      lines.push(`--- ${street.street.toUpperCase()} ---`);
      if (street.board.length > 0) {
        lines.push(`Board: [${street.board.join(' ')}]`);
      }
      lines.push(`Pot: ${street.pot.toLocaleString()}`);
      for (const action of street.actions) {
        const player = snapshot.players.find((p) => p.userId === action.playerUserId);
        const name = player?.displayName || 'Unknown';
        const amtStr = action.amount > 0 ? ` ${action.amount.toLocaleString()}` : '';
        lines.push(`  ${name}: ${action.action}${amtStr}`);
      }
      lines.push('');
    }

    // Winners
    lines.push('--- RESULT ---');
    for (const w of snapshot.winners) {
      const player = snapshot.players.find((p) => p.userId === w.userId);
      const name = player?.displayName || 'Unknown';
      const hand = w.handRank ? ` [${w.handRank}]` : '';
      lines.push(`${name} wins ${w.amount.toLocaleString()}${hand}`);
    }
    lines.push(`Total pot: ${snapshot.totalPot.toLocaleString()}`);

    return lines.join('\n');
  }

  /**
   * Get replay steps for a hand (for visual replay component)
   * Returns an ordered array of steps with state at each point
   */
  getReplaySteps(snapshot: HandSnapshot): {
    step: number;
    description: string;
    board: string[];
    pot: number;
    players: PlayerSnapshot[];
    action?: ActionSnapshot;
  }[] {
    const steps: ReturnType<typeof this.getReplaySteps> = [];
    let stepNum = 0;

    // Initial state
    steps.push({
      step: stepNum++,
      description: 'Hand dealt',
      board: [],
      pot: snapshot.smallBlind + snapshot.bigBlind + snapshot.ante * snapshot.players.length,
      players: [...snapshot.players],
    });

    // Walk through each street and action
    for (const street of snapshot.streets) {
      // Street start
      if (street.street !== 'preflop') {
        steps.push({
          step: stepNum++,
          description: `${street.street.charAt(0).toUpperCase() + street.street.slice(1)}: ${street.board.join(' ')}`,
          board: [...street.board],
          pot: street.pot,
          players: [...snapshot.players],
        });
      }

      // Each action
      for (const action of street.actions) {
        const player = snapshot.players.find((p) => p.userId === action.playerUserId);
        const name = player?.displayName || 'Unknown';
        const amtStr = action.amount > 0 ? ` ${action.amount.toLocaleString()}` : '';
        steps.push({
          step: stepNum++,
          description: `${name} ${action.action}${amtStr}`,
          board: [...street.board],
          pot: street.pot,
          players: [...snapshot.players],
          action,
        });
      }
    }

    // Showdown
    if (snapshot.winners.length > 0) {
      const winDesc = snapshot.winners
        .map((w) => {
          const p = snapshot.players.find((pl) => pl.userId === w.userId);
          return `${p?.displayName || 'Unknown'} wins ${w.amount.toLocaleString()}`;
        })
        .join(', ');

      steps.push({
        step: stepNum++,
        description: `Result: ${winDesc}`,
        board: snapshot.streets[snapshot.streets.length - 1]?.board || [],
        pot: snapshot.totalPot,
        players: [...snapshot.players],
      });
    }

    return steps;
  }

  /**
   * Cleanup when table closes
   */
  dispose(tableId: string): void {
    this.snapshots.delete(tableId);
    this.currentHands.delete(tableId);
  }
}

export const snapshotService = new SnapshotServiceClass();
export default snapshotService;

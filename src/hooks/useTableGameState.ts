/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  useTableGameState — Core Table Game State
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Extracted from TablePage.tsx.
 * Manages the core game state: table config, players, community cards,
 * pot, dealer position, hero seat, action state (raise/fold/call),
 * and winner info.
 *
 * This hook owns the TableState object and action-related state.
 * It does NOT manage modals, chat, or animations (those are separate hooks).
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import type { SeatPlayer, Card, LastAction, PositionBadge } from '../components/table/SeatSlot';
import type { SidePot } from '../components/table/PotDisplay';
import type { BoardStage } from '../components/table/CommunityCards';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface TableState {
  tableId: string;
  tableName: string;
  gameType: string;
  blinds: string;
  maxPlayers: number;
  pot: number;
  sidePots: SidePot[];
  communityCards: Card[];
  boardStage: BoardStage;
  dealerSeat: number;
  currentPlayerSeat: number;
  heroSeat: number;
  players: (SeatPlayer | null)[];
  jackpotAmount: number;
  isHandInProgress: boolean;
  positions: (PositionBadge | null)[];
  lastActions: (LastAction | null)[];
  isTournament: boolean;
  bountyMap: Record<string, number>;
  isBountyTournament: boolean;
}

export type PotDisplayMode = 'chips' | 'bb';

export interface WinnerInfo {
  playerIds: string[];
  handName: string;
  cardIndices: number[];
  amounts: Record<string, number>;
}

export interface UseTableGameStateReturn {
  // Core state
  tableState: TableState;
  setTableState: React.Dispatch<React.SetStateAction<TableState>>;

  // Action state
  raiseAmount: number;
  setRaiseAmount: React.Dispatch<React.SetStateAction<number>>;
  showRaiseSlider: boolean;
  setShowRaiseSlider: React.Dispatch<React.SetStateAction<boolean>>;
  actionTimeRemaining: number;
  setActionTimeRemaining: React.Dispatch<React.SetStateAction<number>>;
  preAction: 'fold' | 'check' | 'callAny' | null;
  setPreAction: React.Dispatch<React.SetStateAction<'fold' | 'check' | 'callAny' | null>>;

  // Pot display
  potDisplayMode: PotDisplayMode;
  handleTogglePotDisplay: () => void;

  // Board
  boardStageKey: number;
  setBoardStageKey: React.Dispatch<React.SetStateAction<number>>;

  // Winner
  winnerInfo: WinnerInfo;
  setWinnerInfo: React.Dispatch<React.SetStateAction<WinnerInfo>>;

  // Session tracking refs
  sessionStartRef: React.MutableRefObject<number>;
  handsPlayedRef: React.MutableRefObject<number>;
  biggestPotRef: React.MutableRefObject<number>;
  peakStackRef: React.MutableRefObject<number>;
  sessionPLRef: React.MutableRefObject<number>;
  totalBuyInRef: React.MutableRefObject<number>;
  buyInProcessingRef: React.MutableRefObject<boolean>;
  actualClubIdRef: React.MutableRefObject<string>;

  // Board state for rabbit hunt
  currentBoard: Array<{ rank: string; suit: 'h' | 'd' | 'c' | 's' }>;
  setCurrentBoard: React.Dispatch<
    React.SetStateAction<Array<{ rank: string; suit: 'h' | 'd' | 'c' | 's' }>>
  >;

  // Waitlist
  waitListPlayers: Array<{
    playerId: string;
    playerName: string;
    avatar?: string;
    position: number;
    joinedAt: Date;
  }>;
  setWaitListPlayers: React.Dispatch<
    React.SetStateAction<
      Array<{
        playerId: string;
        playerName: string;
        avatar?: string;
        position: number;
        joinedAt: Date;
      }>
    >
  >;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function createEmptySeats(count: number): (SeatPlayer | null)[] {
  return new Array(count).fill(null);
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════════

export function useTableGameState(tableId: string | undefined): UseTableGameStateReturn {
  // Core table state
  const [tableState, setTableState] = useState<TableState>({
    tableId: tableId || '',
    tableName: 'Loading...',
    gameType: 'NLH',
    blinds: '?/?',
    maxPlayers: 6,
    pot: 0,
    sidePots: [],
    communityCards: [],
    boardStage: 'preflop',
    dealerSeat: 0,
    currentPlayerSeat: 0,
    heroSeat: 0,
    players: createEmptySeats(6),
    jackpotAmount: 0,
    isHandInProgress: false,
    positions: [null, null, null, null, null, null],
    lastActions: [null, null, null, null, null, null],
    isTournament: false,
    bountyMap: {},
    isBountyTournament: false,
  });

  // Action state
  const [raiseAmount, setRaiseAmount] = useState(20);
  const [showRaiseSlider, setShowRaiseSlider] = useState(false);
  const [actionTimeRemaining, setActionTimeRemaining] = useState(15);
  const [preAction, setPreAction] = useState<'fold' | 'check' | 'callAny' | null>(null);

  // Pot display
  const [potDisplayMode, setPotDisplayMode] = useState<PotDisplayMode>('chips');
  const handleTogglePotDisplay = useCallback(() => {
    setPotDisplayMode((prev) => (prev === 'chips' ? 'bb' : 'chips'));
  }, []);

  // Board transition key
  const [boardStageKey, setBoardStageKey] = useState(0);

  // Winner state
  const [winnerInfo, setWinnerInfo] = useState<WinnerInfo>({
    playerIds: [],
    handName: '',
    cardIndices: [],
    amounts: {},
  });

  // Session tracking refs
  const sessionStartRef = useRef(Date.now());
  const handsPlayedRef = useRef(0);
  const biggestPotRef = useRef(0);
  const peakStackRef = useRef(0);
  const sessionPLRef = useRef(0);
  const totalBuyInRef = useRef(0);
  const buyInProcessingRef = useRef(false);
  const actualClubIdRef = useRef<string>('');

  // Board state for rabbit hunt
  const [currentBoard, setCurrentBoard] = useState<
    Array<{ rank: string; suit: 'h' | 'd' | 'c' | 's' }>
  >([]);

  // Waitlist
  const [waitListPlayers, setWaitListPlayers] = useState<
    Array<{
      playerId: string;
      playerName: string;
      avatar?: string;
      position: number;
      joinedAt: Date;
    }>
  >([]);

  return {
    tableState,
    setTableState,
    raiseAmount,
    setRaiseAmount,
    showRaiseSlider,
    setShowRaiseSlider,
    actionTimeRemaining,
    setActionTimeRemaining,
    preAction,
    setPreAction,
    potDisplayMode,
    handleTogglePotDisplay,
    boardStageKey,
    setBoardStageKey,
    winnerInfo,
    setWinnerInfo,
    sessionStartRef,
    handsPlayedRef,
    biggestPotRef,
    peakStackRef,
    sessionPLRef,
    totalBuyInRef,
    buyInProcessingRef,
    actualClubIdRef,
    currentBoard,
    setCurrentBoard,
    waitListPlayers,
    setWaitListPlayers,
  };
}

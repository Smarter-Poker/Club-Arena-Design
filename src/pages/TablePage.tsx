/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CLUB ARENA — Premium Poker Table Page
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * PokerBros-style table interface with Facebook color scheme
 * Features:
 * - Oval table with premium rail
 * - 6-max or 9-max seating
 * - Real-time pot and community cards
 * - Action panel with raise slider
 * - Jackpot banner
 * - WebSocket connection for real-time game state
 */

import { useState, useEffect, useCallback, useRef, startTransition, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SeatSlot, PotDisplay, CommunityCards } from '../components/table';
import type { SeatPlayer, Card, LastAction, PositionBadge } from '../components/table/SeatSlot';
import type { SidePot } from '../components/table/PotDisplay';
import type { BoardStage } from '../components/table/CommunityCards';
import { useTableWebSocket } from '../services/TableWebSocket';
import { supabase, subscribeToHandState, broadcastHandState } from '../lib/supabase';
import { masterBus } from '../core/MasterBus';
import { avatarService } from '../services/AvatarService';
import PlayerNotesPanel from '../components/gameplay/PlayerNotesPanel';
import HandReplay from '../components/replay/HandReplay';
import { GameRulesModal } from '../components/table/GameRulesModal';
import { ChipAnimationManager } from '../components/table/ChipAnimation';
import SitOutModal from '../components/table/SitOutModal';
import WaitListModal from '../components/table/WaitListModal';
import { waitlistService } from '../services/WaitlistService';
import { roomService, type RoomMessage } from '../services/RoomService';
import { HydraService } from '../services/HydraService';
import TableChat, { type ChatMessage } from '../components/table/TableChat';
import InsuranceModal, { type InsuranceOffer } from '../components/table/InsuranceModal';
import { RunItTwicePrompt } from '../components/table/RunItTwice';
import BadBeatJackpot from '../components/table/BadBeatJackpot';
import { ThrowableSelector } from '../components/table/ThrowableSelector';
import { ThrowAnimationContainer } from '../components/table/ThrowAnimation';
import { throwableService, type Throwable, type ThrowEvent } from '../services/ThrowableService';
import { useTabKeepAlive, workerTimeout } from '../hooks/useTabKeepAlive';
import TipDealer from '../components/table/TipDealer';
import StraddleToggle from '../components/table/StraddleToggle';
import TimeBank from '../components/table/TimeBank';
import CashierModal from '../components/table/CashierModal';
import BuyInModal from '../components/table/BuyInModal';
import { BBJService } from '../services/BBJService';
import RabbitHunt from '../components/table/RabbitHunt';
import LeaderboardPanel from '../components/table/LeaderboardPanel';
import HandNotation from '../components/table/HandNotation';
import { soundService, haptic } from '../services/SoundService';
import { ConfettiCanvas } from '../components/table/ConfettiCanvas';
import {
  createChipToPotEvent,
  createPotToWinnerEvent,
  type ChipAnimationEvent,
} from '../components/table/ChipAnimation';
import MiniHUD from '../components/table/MiniHUD';
// PotOddsDisplay intentionally NOT used on live tables — available for practice/training mode only
import HandHistoryPanel from '../components/table/HandHistoryPanel';
import type {
  HandRecord,
  HandHistoryAction,
  HandHistoryStreet,
} from '../components/table/HandHistoryPanel';
import { usePlayerStats } from '../hooks/usePlayerStats';
import { useTableSettings } from '../hooks/useTableSettings';
import { useTableTimer } from '../hooks/useTableTimer';
import { useTableModals } from '../hooks/useTableModals';
import { GTOQueryService, type GTOSolution } from '../services/GTOQueryService';
import { RakeService, type RakeCalculation } from '../services/RakeService';
import { tableService } from '../services/TableService';
import { WalletService } from '../services/WalletService';
import ActionPanel from '../components/table/ActionPanel';
import PreActionBar from '../components/table/PreActionBar';
import ShareHand from '../components/table/ShareHand';
import SettingsPanel from '../components/table/SettingsPanel';
import TableMenu from '../components/table/TableMenu';
import PresenceIndicator from '../components/social/PresenceIndicator';
import { useTableStore } from '../stores/useTableStore';
import { useToast } from '../components/common/Toast';
import TournamentBreakScreen from '../components/table/TournamentBreakScreen';
import AddOnModal from '../components/table/AddOnModal';
import TournamentAnnouncementOverlay from '../components/table/TournamentAnnouncementOverlay';
import RebuyModal from '../components/table/RebuyModal';
import TournamentWinnerOverlay from '../components/table/TournamentWinnerOverlay';
// RealtimeChannelService imported if needed for future use
import ChipStack from '../components/table/ChipStack';
import { tournamentService } from '../services/TournamentService';
import TimerBar from '../components/table/TimerBar';
import PremiumCard from '../components/table/PremiumCard';
import RealTimeResults from '../components/table/RealTimeResults';
import PlayerCard from '../components/table/PlayerCard';
import {
  Deck,
  evaluateHand,
  compareHands,
  calculatePots,
  determineWinners,
} from '../engine/PokerEngine';
import { HandController } from '../engine/HandController';
import { RakeWaterfallEngine } from '../engines/financial/RakeWaterfallEngine';
import { OFCPineappleEngine } from '../engine/OFCPineappleEngine';
import { handPersistenceService } from '../services/HandPersistenceService';
import { achievementTriggerService } from '../services/AchievementTriggerService';
import SpectatorBadge from '../components/table/SpectatorBadge';
import HandStrengthIndicator from '../components/table/HandStrengthIndicator';
import SessionTimer from '../components/table/SessionTimer';
import { horseBugReporter } from '../services/HorseBugReporter';
import { submitAction } from '../services/GameServerAPI';
import './TablePage.css';
import SessionSummary from '../components/table/SessionSummary';

// ═══════════════════════════════════════════════════════════════════════════════
// RAKE CONFIG HELPER — Derives HandController rake from official chart
// ═══════════════════════════════════════════════════════════════════════════════

/** Official rake chart caps by blind level (mirrors RakeService.RAKE_CHART) */
function getRakeConfigForBlinds(
  sb: number,
  bb: number
): { percent: number; cap: number; noFlop: boolean } {
  // Official chart: 10% rake, tier-based cap, no flop no drop
  const CAPS: [number, number, number][] = [
    // [sb, bb, cap]
    [0.1, 0.2, 3],
    [0.2, 0.4, 3],
    [0.25, 0.5, 3],
    [0.3, 0.6, 5],
    [0.5, 1.0, 5],
    [1.0, 2.0, 5],
    [2.0, 4.0, 7.5],
    [2.0, 5.0, 7.5],
    [5.0, 5.0, 7.5],
    [3.0, 6.0, 8],
    [4.0, 8.0, 10],
    [5.0, 10.0, 12.5],
    [10.0, 20.0, 15],
    [10.0, 25.0, 15],
  ];
  const exact = CAPS.find(([s, b]) => s === sb && b === bb);
  if (exact) return { percent: 10, cap: exact[2], noFlop: true };
  // Fallback: closest by BB
  let closest = CAPS[0];
  let minDiff = Math.abs(bb - closest[1]);
  for (const tier of CAPS) {
    const diff = Math.abs(bb - tier[1]);
    if (diff < minDiff) {
      minDiff = diff;
      closest = tier;
    }
  }
  return { percent: 10, cap: closest[2], noFlop: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// GAME VARIANT LABEL HELPER
// ═══════════════════════════════════════════════════════════════════════════════

const GAME_VARIANT_LABELS: Record<string, string> = {
  NLH: "NO LIMIT HOLD'EM",
  nlh: "NO LIMIT HOLD'EM",
  PLO4: 'POT LIMIT OMAHA (4)',
  plo4: 'POT LIMIT OMAHA (4)',
  PLO5: 'POT LIMIT OMAHA (5)',
  plo5: 'POT LIMIT OMAHA (5)',
  PLO6: 'POT LIMIT OMAHA (6)',
  plo6: 'POT LIMIT OMAHA (6)',
  PLO8: 'PLO HI-LO (8+)',
  plo8: 'PLO HI-LO (8+)',
  SHORT_DECK: 'SHORT DECK 6+',
  short_deck: 'SHORT DECK 6+',
  OFC_PINEAPPLE: 'OFC PINEAPPLE',
  ofc_pineapple: 'OFC PINEAPPLE',
  FLH: "FIXED LIMIT HOLD'EM",
  flh: "FIXED LIMIT HOLD'EM",
  FLO: 'FIXED LIMIT OMAHA',
  flo: 'FIXED LIMIT OMAHA',
  MIXED: 'MIXED GAME',
  mixed: 'MIXED GAME',
};

function getGameVariantLabel(gameType: string): string {
  return GAME_VARIANT_LABELS[gameType] || gameType.toUpperCase().replace(/_/g, ' ');
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface TableState {
  tableId: string;
  tableName: string;
  gameType: 'NLH' | 'PLO4' | 'PLO5' | 'PLO6' | 'PLO8' | 'SHORT_DECK' | 'OFC_PINEAPPLE' | string;
  blinds: string;
  maxPlayers: 6 | 9;
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
  positions: PositionBadge[];
  lastActions: LastAction[];
  isTournament: boolean;
  tournamentId?: string;
  bountyMap: Record<string, number>; // userId → current bounty value (for KO/PKO display)
  isBountyTournament: boolean;
  spinMultiplier?: number;
  handForHand?: boolean;
  bubbleInfo?: { playersRemaining: number; paidPositions: number };
  lateRegOpen?: boolean;
  currentLevel?: number;
  refreshTrigger?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════
// SEAT POSITIONS — Fixed percentages for vertical table layout (never move)
// ═══════════════════════════════════════════════════════════════════════════════

// Seat positions — PokerBros-style tight oval hugging the felt edge
const SEAT_POSITIONS_6MAX = [
  { x: 50, y: 93 }, // Seat 1 (Hero — bottom center)
  { x: 10, y: 72 }, // Seat 2 (bottom left)
  { x: 10, y: 32 }, // Seat 3 (top left)
  { x: 50, y: 7 }, // Seat 4 (top center)
  { x: 90, y: 32 }, // Seat 5 (top right)
  { x: 90, y: 72 }, // Seat 6 (bottom right)
];

const SEAT_POSITIONS_9MAX = [
  { x: 50, y: 95 }, // Seat 1 (Hero — bottom center)
  { x: 17, y: 87 }, // Seat 2 (bottom left)
  { x: 10, y: 64 }, // Seat 3 (left middle) — shifted inward to prevent label clipping
  { x: 10, y: 38 }, // Seat 4 (left upper) — shifted inward to prevent label clipping
  { x: 22, y: 12 }, // Seat 5 (top left)
  { x: 50, y: 5 }, // Seat 6 (top center)
  { x: 78, y: 12 }, // Seat 7 (top right)
  { x: 90, y: 38 }, // Seat 8 (right upper) — shifted inward to prevent label clipping
  { x: 90, y: 64 }, // Seat 9 (right middle) — shifted inward to prevent label clipping
];

// HORSE AVATARS — Assign custom avatars to horse players using DiceBear API
const HORSE_AVATARS: Record<string, string> = {
  'Solver Steve':
    'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=SolverSteve&backgroundColor=b6e3f4',
  SmallBlind:
    'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=SmallBlind&backgroundColor=c0aede',
  'SlowRoll Sid':
    'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=SlowRollSid&backgroundColor=d1d4f9',
  KingFish: 'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=KingFish&backgroundColor=ffd5dc',
  'TAG Tyler':
    'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=TAGTyler&backgroundColor=ffdfbf',
  'Maniac Mike':
    'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=ManiacMike&backgroundColor=ff9999',
  NitNat: 'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=NitNat&backgroundColor=c1f0c1',
  'Bluff Queen':
    'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=BluffQueen&backgroundColor=e8c1f0',
  AceHigh: 'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=AceHigh&backgroundColor=f0e6c1',
  TiltMaster:
    'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=TiltMaster&backgroundColor=f0c1c1',
};

// Create empty player slots for a table
const createEmptySeats = (count: 6 | 9): (SeatPlayer | null)[] => {
  return Array(count).fill(null);
};

// ═══════════════════════════════════════════════════════════════════════════════
// WINDOW-LEVEL LOCKS — TRUE singletons that survive module reloads, lazy-load
// chunk duplication, and React component remounts. Using window.* guarantees
// only ONE HandController exists regardless of how many module instances load.
// ═══════════════════════════════════════════════════════════════════════════════
const _horsesLoadedForTable: Record<string, boolean> = {};
const _win = window as any;
if (!_win.__pokerLocks) {
  _win.__pokerLocks = {
    handActive: false,
    activeHC: null as any,
    firstHandTriggered: false,
    horsesLoaded: {} as Record<string, boolean>,
    lastHandStartMs: 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

// Props for embedded multi-table mode
interface TablePageProps {
  /** When set, overrides the URL :tableId param (used by MultiTablePage) */
  embeddedTableId?: string;
  /** Callback to report table info updates to the multi-table container */
  onTableInfoUpdate?: (info: {
    name?: string;
    stakes?: string;
    isMyTurn?: boolean;
    timeRemaining?: number;
    pot?: number;
  }) => void;
  /** Whether this table is part of a multi-table session (hides own header if tab bar is shown) */
  isMultiTable?: boolean;
}

export default function TablePage({
  embeddedTableId,
  onTableInfoUpdate,
  isMultiTable = false,
}: TablePageProps = {}) {
  const { tableId: routeTableId } = useParams<{ tableId: string }>();
  const tableId = embeddedTableId || routeTableId;
  const navigate = useNavigate();
  const toast = useToast();

  // Prevent Chrome from throttling this tab (keeps horse AI timers alive)
  useTabKeepAlive();

  // Get current user
  const [userId, setUserId] = useState<string>('guest');
  const [username, setUsername] = useState<string>('Player');
  const [isLoading, setIsLoading] = useState(true);
  const [boardStageKey, setBoardStageKey] = useState(0); // Trigger board transitions

  // Initialize user on mount
  useEffect(() => {
    async function initUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, username')
          .eq('id', user.id)
          .maybeSingle();
        setUsername(profile?.display_name || profile?.username || 'Player');
      }
      setIsLoading(false);
    }
    initUser();

    // Start Horse Mini-Agent bug reporting system
    horseBugReporter.startCapturing();
    return () => horseBugReporter.stopCapturing();
  }, []);

  // WebSocket connection for real-time game state
  const { isConnected, presence, lastEvent, sendAction, sendChat, updateSeat } = useTableWebSocket(
    tableId || '',
    userId,
    username
  );

  // State - initialize with empty data (no demo data!)
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

  const [raiseAmount, setRaiseAmount] = useState(20);
  const [showRaiseSlider, setShowRaiseSlider] = useState(false);
  const [actionTimeRemaining, setActionTimeRemaining] = useState(15);
  const [preAction, setPreAction] = useState<'fold' | 'check' | 'callAny' | null>(null);

  // Pot display mode — toggle between chip amounts and BB count
  type PotDisplayMode = 'chips' | 'bb';
  const [potDisplayMode, setPotDisplayMode] = useState<PotDisplayMode>('chips');
  const handleTogglePotDisplay = useCallback(() => {
    setPotDisplayMode((prev) => (prev === 'chips' ? 'bb' : 'chips'));
  }, []);
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [showBuyInModal, setShowBuyInModal] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [showPlayerNotes, setShowPlayerNotes] = useState(false);
  const [selectedPlayerForNotes, setSelectedPlayerForNotes] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [showHandReplay, setShowHandReplay] = useState(false);
  const [lastHandId, setLastHandId] = useState<string | null>(null);
  const [showGameRules, setShowGameRules] = useState(false);
  const [chipAnimations, setChipAnimations] = useState<
    Array<{
      id: string;
      from: { x: number; y: number };
      to: { x: number; y: number };
      amount: number;
      chipColor?: 'red' | 'green' | 'blue' | 'black' | 'gold';
    }>
  >([]);
  const [showSitOut, setShowSitOut] = useState(false);
  const [sitOutTimeRemaining, setSitOutTimeRemaining] = useState(300); // 5 min default
  const [showWaitList, setShowWaitList] = useState(false);

  // Session tracking for end-of-session summary
  const [showSessionSummary, setShowSessionSummary] = useState(false);
  const sessionStartRef = useRef(Date.now());
  const handsPlayedRef = useRef(0);
  const biggestPotRef = useRef(0);
  const peakStackRef = useRef(0);
  const sessionPLRef = useRef(0);
  const totalBuyInRef = useRef(0); // Track total chips invested for accurate session P/L
  const [waitListPlayers, setWaitListPlayers] = useState<
    Array<{
      playerId: string;
      playerName: string;
      avatar?: string;
      position: number;
      joinedAt: Date;
    }>
  >([]);

  // Tournament rebuy state
  const [showTournamentRebuy, setShowTournamentRebuy] = useState(false);
  const [rebuyProcessing, setRebuyProcessing] = useState(false);

  // Tournament break state
  const [tournamentBreak, setTournamentBreak] = useState<{
    active: boolean;
    timeRemaining: number;
    nextLevel?: {
      level: number;
      smallBlind: number;
      bigBlind: number;
      ante?: number;
      duration: number;
    };
  }>({ active: false, timeRemaining: 0 });
  const breakChannelRef = useRef<any>(null);

  // Tournament announcement overlay state
  const [announcement, setAnnouncement] = useState<{ type: string; data?: any } | null>(null);

  // Rebuy modal state
  const [showRebuyModal, setShowRebuyModal] = useState(false);
  const [rebuyData, setRebuyData] = useState<{ cost: number; chips: number } | null>(null);

  // Add-on period state
  const [addOnPeriod, setAddOnPeriod] = useState<{
    active: boolean;
    addOnCost: number;
    addOnChips: number;
    walletBalance: number;
    timeRemaining: number;
  }>({ active: false, addOnCost: 0, addOnChips: 0, walletBalance: 0, timeRemaining: 60 });
  const addOnChannelRef = useRef<any>(null);
  const bountyChannelRef = useRef<any>(null);

  // Buy-in processing lock to prevent double-click
  const buyInProcessingRef = useRef(false);

  // Actual club_id from the table record (NOT the tableId)
  const actualClubIdRef = useRef<string>('');

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatCollapsed, setIsChatCollapsed] = useState(true);
  const [isChatMuted, setIsChatMuted] = useState(false);

  // Send chat message via RoomService
  const handleSendChatMessage = (message: string) => {
    if (!tableId || !userId) return;

    roomService.sendChat(tableId, userId, message);

    // Optimistically add to local state
    setChatMessages((prev) => [
      ...prev,
      {
        id: `msg_${Date.now()}`,
        type: 'PLAYER' as const,
        playerId: userId,
        playerName: tableState.players[tableState.heroSeat - 1]?.name || 'You',
        content: message,
        timestamp: new Date(),
      },
    ]);
  };

  // Insurance Modal state
  const [showInsurance, setShowInsurance] = useState(false);
  const [insuranceOffer, setInsuranceOffer] = useState<InsuranceOffer | null>(null);

  // Tournament Winner state
  const [tournamentWinner, setTournamentWinner] = useState<{ prize: number; name: string } | null>(
    null
  );

  // Run It Twice state
  const [showRIT, setShowRIT] = useState(false);
  const [ritTimer, setRitTimer] = useState(10);
  const [ritOpponent, setRitOpponent] = useState('Opponent');

  // Winner state — tracks winning players, hand names, amounts for highlighting + hand history
  const [winnerInfo, setWinnerInfo] = useState<{
    playerIds: string[];
    handName: string;
    cardIndices: number[];
    amounts: Record<string, number>;
  }>({
    playerIds: [],
    handName: '',
    cardIndices: [],
    amounts: {},
  });

  // ─── Multi-table info reporting ─────────────────────────────────────
  // When embedded in MultiTablePage, report table name/pot/turn status
  useEffect(() => {
    if (!onTableInfoUpdate) return;
    const isHeroTurn =
      tableState.currentPlayerSeat === tableState.heroSeat && tableState.isHandInProgress;
    onTableInfoUpdate({
      name:
        tableState.tableName !== 'Loading...'
          ? `${tableState.gameType} ${tableState.blinds}`
          : undefined,
      stakes: tableState.blinds !== '?/?' ? tableState.blinds : undefined,
      isMyTurn: isHeroTurn,
      timeRemaining: isHeroTurn ? actionTimeRemaining : undefined,
      pot: tableState.pot,
    });
  }, [
    tableState.tableName,
    tableState.gameType,
    tableState.blinds,
    tableState.pot,
    tableState.currentPlayerSeat,
    tableState.heroSeat,
    tableState.isHandInProgress,
    actionTimeRemaining,
    onTableInfoUpdate,
  ]);

  // Bad Beat Jackpot state
  const [showBBJ, setShowBBJ] = useState(false);
  const [bbjAmount, setBbjAmount] = useState(0);

  // Handle insurance offer (triggered by game engine)
  const handleInsuranceAccept = async (coverageAmount: number) => {
    if (userId && tableId) {
      try {
        // Process insurance payment via WalletService
        const premium = coverageAmount * 0.1; // 10% premium
        await WalletService.processInsurance(userId, tableId, `hand-${Date.now()}`, premium);
      } catch (error) {
        console.error('Insurance processing failed:', error);
      }
    }
    setShowInsurance(false);
  };

  const handleInsuranceDecline = () => {
    setShowInsurance(false);
    // After insurance decision, show RIT prompt if set up
    if (ritOpponent !== 'Opponent') {
      setShowRIT(true);
    }
  };

  // Run It Twice handlers
  const handleRITAccept = () => {
    setShowRIT(false);
    // Broadcast RIT acceptance to WebSocket
    sendAction('rit_accept', { seat: tableState.heroSeat });
  };

  const handleRITDecline = () => {
    setShowRIT(false);
    sendAction('rit_decline', { seat: tableState.heroSeat });
  };

  // Throwable Panel state
  const [showThrowableSelector, setShowThrowableSelector] = useState(false);
  const [throwTargetSeat, setThrowTargetSeat] = useState<number | null>(null);
  const [activeThrows, setActiveThrows] = useState<ThrowEvent[]>([]);

  // Tip Dealer state
  const [showTipDealer, setShowTipDealer] = useState(false);

  // Straddle state
  const [isStraddleEnabled, setIsStraddleEnabled] = useState(false);
  const [straddleAmount] = useState(4); // 2x big blind
  const [isStraddleAvailable] = useState(true); // Set based on position

  // Handle throwable selection
  const handleThrowableSelect = async (throwable: Throwable) => {
    if (!tableId || !userId || throwTargetSeat === null) return;

    // Create throw event
    const event = throwableService.createThrowEvent(
      tableState.heroSeat,
      throwTargetSeat,
      throwable.id
    );

    if (event) {
      // Add to active throws for animation
      setActiveThrows((prev) => [...prev, event]);

      // Broadcast via room service
      roomService.sendChat(tableId, userId, `[THROW:${throwable.id}:${throwTargetSeat}]`);
    }

    setShowThrowableSelector(false);
    setThrowTargetSeat(null);
  };

  // Remove completed throw animations
  const handleThrowComplete = (eventId: string) => {
    setActiveThrows((prev) => prev.filter((e) => e.id !== eventId));
  };

  // Get seat positions for throw animation targeting
  const getSeatPositions = (): Map<number, { x: number; y: number }> => {
    const positions = new Map<number, { x: number; y: number }>();
    const centerX = 400;
    const centerY = 250;
    const radiusX = 300;
    const radiusY = 150;
    const maxSeats = tableState.maxPlayers || 6;

    for (let i = 0; i < maxSeats; i++) {
      const angle = (i * (360 / maxSeats) - 90) * (Math.PI / 180);
      positions.set(i, {
        x: centerX + radiusX * Math.cos(angle),
        y: centerY + radiusY * Math.sin(angle),
      });
    }
    return positions;
  };

  // Handle dealer tip
  const handleTipDealer = async (amount: number) => {
    if (userId && tableId) {
      try {
        await WalletService.processDealerTip(userId, tableId, amount);
      } catch (error) {
        console.error('Tip processing failed:', error);
      }
    }
    setShowTipDealer(false);
  };

  // Time Bank state
  const [showTimeBank, setShowTimeBank] = useState(false);
  const [timeBankActive, setTimeBankActive] = useState(false);
  const [timeBanksRemaining, setTimeBanksRemaining] = useState(3);
  const [timeBankTimeRemaining, setTimeBankTimeRemaining] = useState(0);

  // Cashier state
  const [showCashier, setShowCashier] = useState(false);
  const [accountBalance, setAccountBalance] = useState(0); // Player Wallet balance from wallets table

  // Handle Time Bank activation — wrapped in startTransition to avoid INP
  const handleActivateTimeBank = () => {
    if (timeBanksRemaining > 0) {
      startTransition(() => {
        setTimeBankActive(true);
        setTimeBanksRemaining((prev) => prev - 1);
        setTimeBankTimeRemaining(30);
      });
    }
  };

  // Handle cashier add chips (deducts from wallet, adds to table stack)
  const handleAddChips = async (amount: number) => {
    if (!userId || userId === 'guest' || !tableId) {
      console.error('Cannot add chips: not authenticated');
      return;
    }
    try {
      await WalletService.lockForBuyIn(userId, tableId, amount);
      setAccountBalance((prev) => Math.max(0, prev - amount));
      totalBuyInRef.current += amount; // Track for session P/L
      // Update hero's table stack in local state AND sync to DB
      setTableState((prev) => {
        const updatedPlayers = [...prev.players];
        const heroIdx = prev.heroSeat - 1;
        if (heroIdx >= 0 && updatedPlayers[heroIdx]) {
          updatedPlayers[heroIdx] = {
            ...updatedPlayers[heroIdx]!,
            stack: updatedPlayers[heroIdx]!.stack + amount,
          };
        }
        return { ...prev, players: updatedPlayers };
      });
      // Sync stack to Supabase table_seats (fire-and-forget)
      // Compute the NEW stack directly — tableState hasn't updated yet (setState is async)
      const currentStack = tableState.players[tableState.heroSeat - 1]?.stack || 0;
      const newStack = currentStack + amount;
      supabase
        .from('table_seats')
        .update({ stack: newStack })
        .eq('table_id', tableId)
        .eq('seat_number', tableState.heroSeat)
        .is('left_at', null)
        .then(({ error: syncErr }) => {
          if (syncErr) console.warn('[Cashier] Add chips stack sync failed:', syncErr.message);
        });
    } catch (error) {
      console.error('Failed to add chips:', error);
      // Surface error to user — alert as fallback since toast not always available
      const msg = error instanceof Error ? error.message : 'Failed to add chips';
      if (typeof window !== 'undefined') toast.error(msg);
    }
  };

  // Handle cashier withdraw
  const handleWithdrawChips = async (amount: number) => {
    if (!userId || userId === 'guest' || !tableId) {
      console.error('Cannot withdraw: not authenticated');
      return;
    }
    try {
      await WalletService.unlockFromTable(userId, tableId, amount);
      setAccountBalance((prev) => prev + amount); // BUG-08 FIX: Withdrawing FROM table adds TO wallet
      // Update hero's table stack in local state AND sync to DB
      setTableState((prev) => {
        const updatedPlayers = [...prev.players];
        const heroIdx = prev.heroSeat - 1;
        if (heroIdx >= 0 && updatedPlayers[heroIdx]) {
          updatedPlayers[heroIdx] = {
            ...updatedPlayers[heroIdx]!,
            stack: Math.max(0, updatedPlayers[heroIdx]!.stack - amount),
          };
        }
        return { ...prev, players: updatedPlayers };
      });
      // Sync stack to Supabase table_seats (fire-and-forget)
      // Compute the NEW stack directly — tableState hasn't updated yet (setState is async)
      const currentStack = tableState.players[tableState.heroSeat - 1]?.stack || 0;
      const newStack = Math.max(0, currentStack - amount);
      supabase
        .from('table_seats')
        .update({ stack: newStack })
        .eq('table_id', tableId)
        .eq('seat_number', tableState.heroSeat)
        .is('left_at', null)
        .then(({ error: syncErr }) => {
          if (syncErr) console.warn('[Cashier] Withdraw chips stack sync failed:', syncErr.message);
        });
    } catch (error) {
      console.error('Failed to withdraw chips:', error);
    }
  };

  // Load BBJ pool data
  useEffect(() => {
    const loadBBJPool = async () => {
      if (!tableId) return;

      try {
        // Get BBJ pool — fetch the actual club_id from the table record
        const { data: tableData } = await supabase
          .from('tables')
          .select('club_id')
          .eq('id', tableId)
          .maybeSingle();
        const actualClubId = tableData?.club_id || tableId;
        const pool = await BBJService.getPool({ clubId: actualClubId });
        if (pool) {
          setBbjAmount(pool.main_balance);
        }
      } catch (error) {
        console.error('Error loading BBJ pool:', error);
      }
    };

    loadBBJPool();
  }, [tableId]);

  // Rabbit Hunt state
  const [isRabbitAvailable, setIsRabbitAvailable] = useState(false);
  const [currentBoard, setCurrentBoard] = useState<
    Array<{ rank: string; suit: 'h' | 'd' | 'c' | 's' }>
  >([]);

  // Handle rabbit hunt reveal
  const handleRabbitReveal = async (): Promise<
    Array<{ rank: string; suit: 'h' | 'd' | 'c' | 's' }>
  > => {
    // Use HandController's actual deck state for accurate rabbit hunt
    const engineState = handControllerRef.current?.getState();
    const remainingDeck = engineState?.deck;
    const cardsNeeded = 5 - currentBoard.length;

    if (
      remainingDeck &&
      typeof remainingDeck.deal === 'function' &&
      remainingDeck.remaining() >= cardsNeeded
    ) {
      try {
        const suitMap: Record<string, 'h' | 'd' | 'c' | 's'> = {
          hearts: 'h',
          diamonds: 'd',
          clubs: 'c',
          spades: 's',
        };
        const dealt = remainingDeck.deal(cardsNeeded);
        return dealt.map((c) => ({
          rank: c.rank,
          suit: suitMap[c.suit] || (c.suit as 'h' | 'd' | 'c' | 's'),
        }));
      } catch {
        // Fallback to random if deck deal fails
      }
    }

    // Fallback: generate random cards (only if engine deck unavailable)
    const suits: Array<'h' | 'd' | 'c' | 's'> = ['h', 'd', 'c', 's'];
    const ranks = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
    const remainingCards: Array<{ rank: string; suit: 'h' | 'd' | 'c' | 's' }> = [];
    for (let i = 0; i < cardsNeeded; i++) {
      remainingCards.push({
        rank: ranks[Math.floor(Math.random() * ranks.length)],
        suit: suits[Math.floor(Math.random() * suits.length)],
      });
    }
    return remainingCards;
  };

  // Leaderboard state
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<
    'session' | 'day' | 'week' | 'month' | 'allTime'
  >('session');
  const [leaderboardPlayers, setLeaderboardPlayers] = useState<
    Array<{
      rank: number;
      playerId: string;
      playerName: string;
      avatar?: string;
      amount: number;
      isPositive: boolean;
      isCurrentUser?: boolean;
    }>
  >([]);

  // Sound settings state
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);

  // Play turn alert when it's hero's turn
  const playTurnAlert = () => {
    // NEW-BUG-1 FIX: use dynamic isEnabled() not stale isSoundEnabled closure
    if (soundService.isEnabled()) {
      soundService.playTurnAlert();
    }
  };

  // Confetti state for big wins
  const [showConfetti, setShowConfetti] = useState(false);

  // All-in dramatic mode
  const [isAllInMode, setIsAllInMode] = useState(false);

  // ═══════════════════════════════════════════════════════════════════════════
  //  PHASE 4 — Premium Features (HUD, Pot Odds, Hand History, Settings)
  // ═══════════════════════════════════════════════════════════════════════════

  // Smart Mini-HUD — track opponent stats (VPIP/PFR/heat)
  const {
    getStats: getPlayerHUDStats,
    recordHandPlayed,
    recordVPIP,
    recordPFR,
    recordWin: recordHUDWin,
  } = usePlayerStats();

  // User settings with persistence
  const { settings: userSettings, updateSetting } = useTableSettings();

  // Hand history state
  const [handHistory, setHandHistory] = useState<HandRecord[]>([]);
  const [showHandHistory, setShowHandHistory] = useState(false);

  // Hand history recording refs — accumulate actions during a hand
  const handActionsRef = useRef<
    Array<{ seat: number; action: string; amount?: number; street: string }>
  >([]);
  const historyHandCountRef = useRef(0);
  const handStartStacksRef = useRef<Record<number, number>>({});

  // Play win sound — escalates based on pot size
  const playWinSound = (potAmount?: number) => {
    // NEW-BUG-2 FIX: use dynamic isEnabled() not stale isSoundEnabled closure
    if (!soundService.isEnabled()) return;
    const bb = parseFloat(tableState.blinds.split('/')[1]) || 2;
    const bbWon = (potAmount || tableState.pot) / bb;

    if (bbWon >= 50) {
      soundService.playBigWin();
      // Confetti disabled — annoying on repeated wins
    } else {
      soundService.playWin();
    }
    soundService.playPotCollect();
  };

  // GTO advisor state
  const [gtoSolution, setGtoSolution] = useState<GTOSolution | null>(null);
  const [isGtoLoading, setIsGtoLoading] = useState(false);
  const [showGtoAdvisor, setShowGtoAdvisor] = useState(false);

  // Fetch GTO advice for current situation
  const fetchGtoAdvice = async (
    position: string,
    street: string,
    board: string[] | null = null
  ) => {
    setIsGtoLoading(true);
    try {
      const solution = await GTOQueryService.getGTOAction(
        position,
        'SRP', // Single Raised Pot
        street,
        board,
        'check',
        100
      );
      setGtoSolution(solution);
    } catch (error) {
      console.error('Error fetching GTO advice:', error);
    }
    setIsGtoLoading(false);
  };

  // Rake state
  const [currentRake, setCurrentRake] = useState<RakeCalculation | null>(null);
  const [sessionRake, setSessionRake] = useState(0);

  // Handle hand complete - calculate rake, execute waterfall, and record BBJ contribution
  const handleHandComplete = async (
    handId: string,
    potSize: number,
    wentToFlop: boolean,
    players: Array<{ userId: string; clubId: string; agentId?: string }>
  ) => {
    // Parse blinds from string (e.g., "0.25/0.50" -> sb=0.25, bb=0.50)
    const blindParts = tableState.blinds.split('/');
    const smallBlind = parseFloat(blindParts[0]) || 1;
    const bigBlind = parseFloat(blindParts[1]) || 2;

    // Calculate rake using official stake-based chart
    const rakeCalc = RakeService.calculateRake(potSize, bigBlind, wentToFlop, smallBlind);
    setCurrentRake(rakeCalc);
    setSessionRake((prev) => prev + rakeCalc.cappedRake);

    // Execute waterfall (distribute rake to all parties)
    if (tableId && players.length > 0) {
      const clubId = actualClubIdRef.current || players[0]?.clubId || tableId;
      try {
        // Resolve unionId from club → union_clubs join table
        let unionId: string | undefined;
        try {
          const { data: ucRow } = await supabase
            .from('union_clubs')
            .select('union_id')
            .eq('club_id', clubId)
            .limit(1)
            .maybeSingle();
          if (ucRow) unionId = ucRow.union_id;
        } catch {
          /* club may not be in a union — standalone club */
        }

        const waterfallResult = await RakeService.executeWaterfall({
          handId,
          tableId,
          clubId,
          unionId,
          smallBlind,
          potSize,
          bigBlind,
          wentToFlop,
          players: players.map((p) => ({
            ...p,
            isSittingOut: false,
            hasCards: true,
            wentToFlop,
          })),
        });

        // Update local BBJ display from waterfall result
        if (waterfallResult.bbjContributed && wentToFlop) {
          setBbjAmount((prev) => prev + BBJService.calculateContribution(bigBlind));
        }
      } catch (rakeErr) {
        console.error('[Rake] Waterfall failed:', rakeErr);
      }
    }
  };

  // Leave-table notification state (replaces blocking alert())
  const [leaveNotice, setLeaveNotice] = useState<string | null>(null);

  // Handle tournament rebuy
  const handleTournamentRebuy = async () => {
    if (!tableState.tournamentId || !userId) return;
    try {
      const rebuyCheck = await tournamentService.canRebuy(tableState.tournamentId, userId);
      if (!rebuyCheck.allowed) {
        toast.error(rebuyCheck.reason || 'Rebuy not available');
        return;
      }
      // Get tournament info to get rebuy cost and chips
      const tournament = await tournamentService.getTournament(tableState.tournamentId);
      if (tournament) {
        const rebuyChips = tournament.rebuy_chips || tournament.starting_chips;
        const rebuyCost = tournament.rebuy_cost || tournament.buy_in_amount;
        setRebuyData({ cost: rebuyCost, chips: rebuyChips });
        setShowRebuyModal(true);
      }
    } catch (err) {
      toast?.error((err as Error).message || 'Failed to load rebuy info');
    }
  };

  // Handle tournament add-on
  const handleTournamentAddOn = async () => {
    if (!tableState.tournamentId || !userId || rebuyProcessing) return;
    setRebuyProcessing(true);
    try {
      const addOnCheck = await tournamentService.canAddOn(tableState.tournamentId);
      if (!addOnCheck.allowed) {
        toast.error(addOnCheck.reason || 'Add-on not available');
        return;
      }
      await tournamentService.processAddOn(tableState.tournamentId, userId);
      toast?.success('Add-on successful — chips added');
      setShowTournamentRebuy(false);
    } catch (err) {
      toast?.error((err as Error).message || 'Add-on failed');
    } finally {
      setRebuyProcessing(false);
    }
  };

  // Handle leave table - cleans up and returns chips (non-blocking)
  const handleLeaveTable = async () => {
    if (!tableId || !userId) return;
    setLeaveNotice(null);

    // Capture hero stack BEFORE leave (seat data may be cleared by leaveTable)
    const heroPlayer = tableState.players[tableState.heroSeat - 1];
    const stackAtLeave = heroPlayer?.stack || 0;

    try {
      const result = await tableService.leaveTable(tableId, tableState.heroSeat, userId);
      if (result.success) {
        console.log(`[Leave] Success — ${result.chipsReturned} chips returned to wallet`);

        // Notify system
        masterBus.emit('TABLE_LEFT', { tableId, seat: tableState.heroSeat });

        // Show session summary instead of navigating immediately
        // P/L = chips returned to wallet minus total chips invested at table
        sessionPLRef.current = (result.chipsReturned || 0) - totalBuyInRef.current;
        setShowSessionSummary(true);
      } else {
        console.error('[Leave] Failed to leave table');
        setLeaveNotice(
          'Unable to leave right now. You may be in an active hand — you will leave after it completes.'
        );
      }
    } catch (error) {
      console.error('[Leave] Exception:', error);
      setLeaveNotice('Error leaving table. Please try again.');
    }
  };

  // ─── beforeunload: warn user and attempt seat cleanup on tab close/refresh ───
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // Only warn if the player is actually seated
      if (tableState.heroSeat > 0 && tableId && userId && userId !== 'guest') {
        // Fire seat cleanup (best-effort, may not complete before tab closes)
        navigator.sendBeacon?.(
          `${import.meta.env.VITE_SUPABASE_URL || ''}/rest/v1/rpc/player_leave_table`,
          JSON.stringify({ p_table_id: tableId, p_user_id: userId })
        );
        event.preventDefault();
        event.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [tableId, userId, tableState.heroSeat]);

  // Subscribe to table updates using TableService
  useEffect(() => {
    if (!tableId) return;

    const unsubscribe = tableService.subscribeToTable(tableId, (updatedTable) => {
      // Update local state from table updates
      setTableState((prev) => ({
        ...prev,
        tableName: updatedTable.name,
        gameType: updatedTable.game_variant as any,
        blinds:
          updatedTable.small_blind != null && updatedTable.big_blind != null
            ? `${updatedTable.small_blind}/${updatedTable.big_blind}`
            : prev.blinds,
      }));
    });

    return () => unsubscribe();
  }, [tableId]);

  // Subscribe to server-side hand state broadcast (ServerTableEngine deals on the server)
  useEffect(() => {
    if (!tableId) return;
    const unsubscribe = subscribeToHandState(tableId, (handState: Record<string, unknown>) => {
      if (!handState) return;

      const serverPlayers = (handState.players as any[]) || [];
      const stage = (handState.stage as string) || 'preflop';
      const communityCards = (handState.community_cards as any[]) || [];
      const pot = (handState.pot as number) || 0;
      const currentBet = (handState.current_bet as number) || 0;
      const currentPlayer = handState.current_player as string | null;
      const dealerSeat = (handState.dealer_seat as number) || 0;

      setTableState((prev) => {
        const updatedPlayers = [...prev.players];

        // Merge server player data with existing UI state
        for (const sp of serverPlayers) {
          const seatIdx = (sp.seat as number) - 1;
          if (seatIdx < 0 || seatIdx >= updatedPlayers.length) continue;

          const existing = updatedPlayers[seatIdx];
          const isHero = sp.user_id === userId;

          updatedPlayers[seatIdx] = {
            ...(existing || {}),
            id: sp.user_id,
            name: sp.username || existing?.name || `Seat ${sp.seat}`,
            stack: sp.stack,
            bet: sp.bet || 0,
            holeCards: isHero ? sp.cards || existing?.holeCards || [] : existing?.holeCards || [],
            status: sp.is_folded
              ? 'folded'
              : sp.is_all_in
                ? 'all_in'
                : sp.is_sitting_out
                  ? 'sitting_out'
                  : 'active',
            isHero,
            showCards: isHero,
          } as any;
        }

        // Clear seats that have no server player
        const serverSeatNums = new Set(serverPlayers.map((sp: any) => sp.seat));
        for (let i = 0; i < updatedPlayers.length; i++) {
          if (updatedPlayers[i] && !serverSeatNums.has(i + 1)) {
            // Keep seat occupied from DB — don't clear non-playing spectator seats
          }
        }

        // Determine current player's seat index
        let currentPlayerSeat = 0;
        if (currentPlayer) {
          const cpSeat = serverPlayers.find((sp: any) => sp.user_id === currentPlayer);
          if (cpSeat) currentPlayerSeat = cpSeat.seat;
        }

        return {
          ...prev,
          players: updatedPlayers,
          pot,
          communityCards: communityCards.map((c: any) => {
            if (typeof c === 'string') {
              try {
                return JSON.parse(c);
              } catch {
                return c;
              }
            }
            return c;
          }),
          boardStage: stage as BoardStage,
          currentPlayerSeat,
          dealerSeat,
          isHandInProgress: stage !== 'preflop' || pot > 0,
        };
      });
    });

    return () => unsubscribe();
  }, [tableId, userId]);

  // Component visibility states
  const [showSettings, setShowSettings] = useState(false);
  const [showShareHand, setShowShareHand] = useState(false);
  const [showTableMenu, setShowTableMenu] = useState(false);
  const [sharedHandData, setSharedHandData] = useState<any>(null);

  // Load table info from Supabase on mount
  useEffect(() => {
    async function loadTableInfo() {
      if (!tableId) return;

      const { data: table, error } = await supabase
        .from('tables')
        .select('*')
        .eq('id', tableId)
        .maybeSingle();

      if (table && !error) {
        setTableState((prev) => ({
          ...prev,
          tableId: table.id,
          tableName: table.name || 'Poker Table',
          gameType: (table.game_variant || table.game_type || 'NLH') as any,
          isTournament: table.game_type === 'tournament' || !!table.tournament_id,
          tournamentId: table.tournament_id || undefined,
          blinds:
            table.stakes ||
            (table.small_blind != null && table.big_blind != null
              ? `${table.small_blind}/${table.big_blind}`
              : '?/?'),
          maxPlayers: table.max_players || 6,
          players: createEmptySeats(table.max_players || 6),
          positions: Array(table.max_players || 6).fill(null),
          lastActions: Array(table.max_players || 6).fill(null),
        }));

        // Store actual club_id for persistence and rake
        actualClubIdRef.current = table.club_id || '';

        // ─── Load bounty data for KO/PKO tournaments ───
        if (table.tournament_id) {
          const { data: tournData } = await supabase
            .from('tournaments')
            .select('is_bounty, is_pko, is_mystery_bounty, bounty_amount, spin_multiplier')
            .eq('id', table.tournament_id)
            .maybeSingle();

          if (
            tournData &&
            (tournData.is_bounty || tournData.is_pko || tournData.is_mystery_bounty)
          ) {
            // Load current bounty values for all players in this tournament
            const { data: bountyData } = await supabase
              .from('tournament_players')
              .select('user_id, current_bounty')
              .eq('tournament_id', table.tournament_id)
              .gt('current_bounty', 0);

            const bMap: Record<string, number> = {};
            if (bountyData) {
              bountyData.forEach((p: any) => {
                bMap[p.user_id] = p.current_bounty;
              });
            }
            setTableState((prev) => ({
              ...prev,
              bountyMap: bMap,
              isBountyTournament: true,
              spinMultiplier: tournData.spin_multiplier || undefined,
            }));

            // Subscribe to real-time bounty updates (store in ref for cleanup)
            const bountyChannelKey = `bounty-${table.tournament_id}`;

            const bountyChannel = masterBus.getOrCreateChannel(bountyChannelKey);
            bountyChannel
              .on(
                'postgres_changes',
                {
                  event: 'UPDATE',
                  schema: 'public',
                  table: 'tournament_players',
                  filter: `tournament_id=eq.${table.tournament_id}`,
                },
                (payload: any) => {
                  if (payload.new) {
                    const { user_id, current_bounty } = payload.new;
                    setTableState((prev) => ({
                      ...prev,
                      bountyMap: {
                        ...prev.bountyMap,
                        [user_id]: current_bounty || 0,
                      },
                    }));
                  }
                }
              )
              .subscribe();
            bountyChannelRef.current = bountyChannel;
          } else if (tournData?.spin_multiplier) {
            setTableState((prev) => ({
              ...prev,
              spinMultiplier: tournData.spin_multiplier,
            }));
          }
        }

        // Subscribe to tournament break + add-on events via Realtime
        if (table.tournament_id) {
          const breakChanKey = `t-break-${table.tournament_id}`;

          const breakChan = masterBus.getOrCreateChannel(breakChanKey);
          breakChan
            .on('broadcast', { event: 'tournament_event' }, (payload: any) => {
              const data = payload.payload;
              if (data?.type === 'tournament_break' || data?.type === 'BREAK_START') {
                setTournamentBreak({
                  active: true,
                  timeRemaining:
                    (data.payload?.breakDurationMinutes || data.payload?.durationMinutes || 5) * 60,
                  nextLevel: data.payload?.nextLevel,
                });
              } else if (data?.type === 'break_ended' || data?.type === 'BREAK_END') {
                setTournamentBreak({ active: false, timeRemaining: 0 });
              } else if (data?.type === 'ADDON_PERIOD_START') {
                // Add-on period: 60 seconds, show popup to all players
                const addonData = data.payload || {};
                // Fetch fresh wallet balance
                (async () => {
                  let walBal = 0;
                  if (userId && userId !== 'guest') {
                    const { data: w } = await supabase
                      .from('wallets')
                      .select('balance')
                      .eq('user_id', userId)
                      .eq('wallet_type', 'PLAYER')
                      .maybeSingle();
                    walBal = w?.balance || 0;
                  }
                  setAddOnPeriod({
                    active: true,
                    addOnCost: addonData.addOnCost || 0,
                    addOnChips: addonData.addOnChips || 0,
                    walletBalance: walBal,
                    timeRemaining: 60,
                  });
                })();
              } else if (data?.type === 'ADDON_PERIOD_END') {
                setAddOnPeriod((prev) => ({ ...prev, active: false }));
              } else if (data?.type === 'hand_for_hand') {
                // Bubble mode — hand-for-hand play activated
                setTableState((prev) => ({
                  ...prev,
                  handForHand: data.payload?.active === true, // BUG-10 FIX: strict boolean check
                  bubbleInfo: data.payload
                    ? {
                        playersRemaining: data.payload.playersRemaining,
                        paidPositions: data.payload.paidPositions,
                      }
                    : undefined,
                }));
                if (data.payload?.active) {
                  setAnnouncement({ type: 'hand_for_hand', data: data.payload });
                  toast?.info?.('Hand-for-hand play activated — bubble approaching');
                }
              } else if (data?.type === 'bubble_burst') {
                // Bubble burst — players are now in the money
                setTableState((prev) => ({
                  ...prev,
                  handForHand: false,
                  bubbleInfo: undefined,
                }));
                setAnnouncement({ type: 'bubble_burst', data: data.payload });
                toast?.success?.('Bubble burst — you are in the money!');
              } else if (data?.type === 'player_eliminated') {
                // A player was eliminated from the tournament
                const elimData = data.payload || {};
                console.log(
                  `[TablePage] Player eliminated: ${elimData.userId?.slice(0, 8)} at position ${elimData.position}`
                );

                // Check if the current user was eliminated
                if (elimData.userId === userId) {
                  if (elimData.position === 1) {
                    // Current user won the tournament
                    const tournamentName = tableState.tableName || 'Tournament';
                    setTournamentWinner({
                      prize: elimData.prize || 0,
                      name: tournamentName,
                    });
                  } else {
                    // Current user was eliminated (not winner)
                    const pos = elimData.position || '?';
                    const prize = elimData.prize || 0;
                    if (prize > 0) {
                      toast?.success?.(
                        `You finished ${pos}${pos === 1 ? 'st' : pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th'} and won ${prize}!`
                      );
                    } else {
                      toast?.info?.(
                        `You finished ${pos}${pos === 1 ? 'st' : pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th'}. Better luck next time!`
                      );
                    }
                    // Auto-redirect to results after 5 seconds
                    setTimeout(() => {
                      const tournId = tableState.tournamentId;
                      if (tournId) {
                        window.location.href = `/hub/club-arena/tournament-results?id=${tournId}`;
                      }
                    }, 5000);
                  }
                }

                // Refresh seated players to reflect elimination
                if (elimData.userId) {
                  setTableState((prev) => ({
                    ...prev,
                    players: prev.players.map((seat: any) =>
                      seat?.userId === elimData.userId ? { ...seat, status: 'eliminated' } : seat
                    ),
                  }));
                }
              } else if (data?.type === 'table_rebalance') {
                // Players moved between tables — check if current user was moved
                console.log('[TablePage] Table rebalance detected');
                (async () => {
                  try {
                    if (userId && tableState.tournamentId) {
                      const { data: playerData } = await supabase
                        .from('tournament_players')
                        .select('table_id')
                        .eq('tournament_id', tableState.tournamentId)
                        .eq('user_id', userId)
                        .maybeSingle();

                      if (playerData?.table_id && playerData.table_id !== tableId) {
                        // Current user was moved to a different table — redirect
                        console.log(
                          `[TablePage] User moved from ${tableId} to ${playerData.table_id}`
                        );
                        const cId = actualClubIdRef.current || tableId || 'demo';
                        navigate(`/clubs/${cId}/table/${playerData.table_id}`);
                      } else if (playerData?.table_id === tableId) {
                        // User stayed at this table — just refresh seats
                        setTableState((prev) => ({ ...prev, refreshTrigger: Date.now() }));
                      }
                    } else {
                      // Not a tournament or no user — just refresh
                      setTableState((prev) => ({ ...prev, refreshTrigger: Date.now() }));
                    }
                  } catch (err) {
                    console.error('[TablePage] Error checking player table during rebalance:', err);
                    // Fallback: just refresh seats
                    setTableState((prev) => ({ ...prev, refreshTrigger: Date.now() }));
                  }
                })();
              } else if (data?.type === 'late_reg_closed') {
                // Late registration window has closed
                setTableState((prev) => ({
                  ...prev,
                  lateRegOpen: false,
                }));
              } else if (data?.type === 'rebuy') {
                // A player rebuyed — refresh their stack
                const rebuyData = data.payload || {};
                if (rebuyData.userId) {
                  console.log(
                    `[TablePage] Rebuy: ${rebuyData.userId.slice(0, 8)} +${rebuyData.chips} chips`
                  );
                }
              } else if (data?.type === 'level_up') {
                // Blind level increased
                const levelData = data.payload || {};
                setTableState((prev) => ({
                  ...prev,
                  currentLevel: levelData.level,
                  blinds: levelData.blinds,
                }));
                setAnnouncement({ type: 'level_up', data: levelData });
              }
            })
            .subscribe();
          breakChannelRef.current = breakChan;

          // NOTE: Add-on events handled via break channel above (ADDON_PERIOD_START/END)
          // No duplicate add-on channel needed — prevents race condition from dual subscriptions
        }

        // Load user's Player Wallet balance for buy-in
        if (userId && userId !== 'guest') {
          const { data: walletData } = await supabase
            .from('wallets')
            .select('balance')
            .eq('user_id', userId)
            .eq('wallet_type', 'PLAYER')
            .maybeSingle();

          if (walletData) {
            setAccountBalance(walletData.balance || 0);
          }
        }

        // ─── Load existing seated players from DB (reconnection support) ───
        // If page reloads while players are seated, we must restore their state
        const { data: existingSeats } = await supabase
          .from('table_seats')
          .select('seat_number, user_id, stack, status, horse_id, is_sitting_out')
          .eq('table_id', table.id)
          .is('left_at', null);

        if (existingSeats && existingSeats.length > 0) {
          // Fetch display names for seated players
          const userIds = existingSeats.map((s) => s.user_id).filter(Boolean);
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, avatar_url, is_horse')
            .in('id', userIds);

          const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

          // BUG-09 FIX: Merged heroSeat update into same setTableState callback
          // (was previously calling setTableState inside setTableState which causes React warnings)
          setTableState((prev) => {
            const updatedPlayers = [...prev.players];
            let resolvedHeroSeat = prev.heroSeat;
            for (const seat of existingSeats) {
              const seatIdx = seat.seat_number - 1;
              if (seatIdx < 0 || seatIdx >= updatedPlayers.length) continue;
              const profile = profileMap.get(seat.user_id);
              const isHero = seat.user_id === userId;

              updatedPlayers[seatIdx] = {
                id: seat.user_id,
                name: profile?.username || `Player ${seat.seat_number}`,
                avatar: profile?.avatar_url || '',
                stack: seat.stack || 0,
                status: seat.is_sitting_out ? ('sitting_out' as const) : ('active' as const),
                isHero,
                showCards: isHero,
                isHorse: profile?.is_horse || !!seat.horse_id,
                horseProfile: undefined,
              } as any;

              // Restore hero seat if this is the current user
              if (isHero) {
                resolvedHeroSeat = seat.seat_number;
              }
            }
            return { ...prev, players: updatedPlayers, heroSeat: resolvedHeroSeat };
          });

          // If hero is already seated, update hero seat immediately
          const heroSeat = existingSeats.find((s) => s.user_id === userId);
          if (heroSeat) {
            setTableState((prev) => ({
              ...prev,
              heroSeat: heroSeat.seat_number,
            }));
          }
        }
      }
    }
    loadTableInfo();
  }, [tableId, userId]);

  // Join/leave multiplayer room
  useEffect(() => {
    if (!tableId || !userId) return;

    // Join the room
    roomService.joinRoom(
      tableId,
      userId,
      tableState.players[tableState.heroSeat - 1]?.name || 'Player',
      tableState.heroSeat,
      tableState.players[tableState.heroSeat - 1]?.stack || 0
    );

    // Subscribe to room messages
    const unsubscribe = roomService.onMessage(tableId, (msg: RoomMessage) => {
      switch (msg.type) {
        case 'PLAYER_JOINED':
          // Handle player joining
          break;
        case 'PLAYER_LEFT':
          // Handle player leaving
          break;
        case 'PLAYER_ACTION': {
          // Handle player action broadcast with sound effects
          const action = (msg.payload as any)?.action?.toLowerCase() || '';
          if (soundService.isEnabled()) {
            if (action === 'bet' || action === 'raise' || action === 'call' || action === 'allin') {
              soundService.playChips();
            } else if (action === 'check') {
              soundService.playCheck();
            } else if (action === 'fold') {
              soundService.playFold();
            }
          }
          break;
        }
        case 'CHAT':
          // Handle chat message
          break;
      }
    });

    return () => {
      unsubscribe();
      roomService.leaveRoom(tableId);
      if (breakChannelRef.current) {
        masterBus.removeRegisteredChannel(`t-break-${tableState.tournamentId || tableId}`);
        breakChannelRef.current = null;
      }
      if (addOnChannelRef.current) {
        // Add-on events handled via break channel — no separate channel needed
        addOnChannelRef.current = null;
      }
      if (bountyChannelRef.current) {
        masterBus.removeRegisteredChannel(`bounty-${tableState.tournamentId || tableId}`);
        bountyChannelRef.current = null;
      }
    };
  }, [tableId, userId, tableState.heroSeat]);

  // ── Bus Listener: live settings sync (theme, sound, deck changes) ──
  useEffect(() => {
    const unsub = masterBus.subscribe('SETTINGS_UPDATED', (event) => {
      const s = (event as any)?.payload?.settings || (event as any)?.settings;
      if (!s) return;
      // Apply sound preference if changed
      if (typeof s.soundEnabled === 'boolean') {
        localStorage.setItem('club_arena_sounds', String(s.soundEnabled));
      }
      // Apply deck/theme preference if changed
      if (s.deckStyle) {
        localStorage.setItem('club_arena_deck', s.deckStyle);
      }
    });
    return () => {
      unsub();
    };
  }, []);

  // ── BUG-02 FIX: Action timer countdown ──────────────────────────────────
  // REMOVED: Duplicate timer lived here, conflicting with the timer at line ~3035.
  // The authoritative auto-fold timer at ~3035 has sendAction() broadcast,
  // error handling, and playFold() sound. This duplicate was causing
  // performAction to fire TWICE and lacked the broadcast.

  // ═══════════════════════════════════════════════════════════════════════════
  // HORSE LOADING — Load seated horses from DB into React table state
  // ═══════════════════════════════════════════════════════════════════════════
  const horsesLoadedRef = useRef(false);
  // Track horse seat→profile mapping synchronously (not via React state)
  // so TURN_CHANGE handler can check immediately without waiting for re-render
  const horseMapRef = useRef<
    Map<number, { id: string; profile: string; name: string; stack: number }>
  >(new Map());

  useEffect(() => {
    if (!tableId || horsesLoadedRef.current || _horsesLoadedForTable[tableId]) return;
    // Wait for table info to load first (maxPlayers must be set)
    if (tableState.blinds === '?/?') return;

    // Set IMMEDIATELY to prevent duplicate async calls on re-render AND remount
    horsesLoadedRef.current = true;
    _horsesLoadedForTable[tableId] = true;

    const loadHorses = async () => {
      try {
        // Initialize Hydra
        HydraService.initialize();

        // Get all horses seated at this table via HydraService
        const horses = await HydraService.getActiveHorses(tableId);

        if (horses.length === 0) {
          // No horses found, seed the table
          // Seed with new horses if none exist
          const bbMatch = tableState.blinds.match(/\/(\d+)/);
          const bigBlind = bbMatch ? parseInt(bbMatch[1]) : 2;
          await HydraService.seedTable(tableId, bigBlind);
          // Re-query after seeding
          const seededHorses = await HydraService.getActiveHorses(tableId);
          if (seededHorses.length > 0) {
            populateHorsePlayers(seededHorses);
          }
        } else {
          // Load horses into table state
          populateHorsePlayers(horses);
        }
      } catch (err) {
        console.error('[Horses] Failed to load horses:', err);
        horsesLoadedRef.current = false; // Allow retry on error
        if (tableId) _horsesLoadedForTable[tableId] = false;
      }
    };

    const populateHorsePlayers = (horses: import('../services/HydraService').HorsePlayer[]) => {
      // Set horse map SYNCHRONOUSLY before React state update
      // This ensures TURN_CHANGE handler can detect horses immediately
      for (const horse of horses) {
        const bbMatch = tableState.blinds.match(/\/(\d+)/);
        const bigBlind = bbMatch ? parseFloat(bbMatch[1]) : 2;
        const stack = horse.stack > 0 ? horse.stack : bigBlind * 100;
        horseMapRef.current.set(horse.seatNumber, {
          id: horse.id,
          profile: horse.profile,
          name: horse.name || `Player ${horse.seatNumber}`,
          stack,
        });
      }

      setTableState((prev) => {
        const updatedPlayers = [...prev.players];
        let populated = 0;

        for (const horse of horses) {
          const seatIdx = horse.seatNumber - 1;
          if (seatIdx >= 0 && seatIdx < updatedPlayers.length && !updatedPlayers[seatIdx]) {
            const bbMatch = prev.blinds.match(/\/(\d+)/);
            const bigBlind = bbMatch ? parseFloat(bbMatch[1]) : 2;
            const stack = horse.stack > 0 ? horse.stack : bigBlind * 100;

            updatedPlayers[seatIdx] = {
              id: horse.id,
              name: horse.name || `Player ${horse.playerNumber || seatIdx + 1}`,
              avatar:
                horse.avatar ||
                HORSE_AVATARS[horse.name] ||
                `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(horse.name || 'default')}&backgroundColor=b6e3f4`,
              stack,
              status: 'active' as const,
              isHero: false,
              showCards: false,
              // Extended horse properties for TURN_CHANGE auto-action
              isHorse: true,
              horseProfile: horse.profile,
            } as any;
            populated++;
          }
        }

        // Horses populated into seats
        return { ...prev, players: updatedPlayers };
      });
    };

    loadHorses();
  }, [tableId, tableState.blinds]);

  // ═══════════════════════════════════════════════════════════════════════════
  // HAND CONTROLLER — Manages poker game loop for ALL tables
  // ═══════════════════════════════════════════════════════════════════════════
  const [handController, setHandController] = useState<HandController | null>(null);
  const handNumberRef = useRef(1);
  const handControllerRef = useRef<HandController | null>(null);
  const handInProgressRef = useRef(false); // Stable ref to prevent re-creation

  // Keep a ref to the latest tableState for use inside HandController event closures
  const tableStateRef = useRef(tableState);
  useEffect(() => {
    tableStateRef.current = tableState;
  }, [tableState]);

  // ═══════════════════════════════════════════════════════════════════════════
  // startNextHand — IMPERATIVE hand creation (NOT driven by useEffect deps)
  // Called directly from: (1) horse loading callback, (2) HAND_COMPLETE handler
  // This eliminates React dependency-array re-runs that caused duplicate HCs
  // ═══════════════════════════════════════════════════════════════════════════
  const startNextHandRef = useRef<() => void>(() => {});
  startNextHandRef.current = () => {
    // GUARD: prevent duplicate creation using GLOBAL window locks + timestamp debounce
    const locks = _win.__pokerLocks;
    const now = Date.now();
    if (locks.handActive || locks.activeHC || handControllerRef.current) {
      return;
    }
    // Timestamp debounce: no two hands can start within 3 seconds
    if (locks.lastHandStartMs && now - locks.lastHandStartMs < 3000) {
      return;
    }

    // Read latest state from ref (avoids stale closures)
    const currentState = tableStateRef.current;
    const seatedPlayers = currentState.players.filter((p) => p && p.stack > 0);
    if (seatedPlayers.length < 2) return;

    // IMMEDIATELY set GLOBAL lock — prevents any parallel call from proceeding
    _win.__pokerLocks.handActive = true;
    _win.__pokerLocks.activeHC = true; // Sentinel, replaced with actual HC below
    _win.__pokerLocks.lastHandStartMs = now;

    // Parse table settings
    const blindParts = currentState.blinds.split('/');
    const smallBlind = parseFloat(blindParts[0]) || 1;
    const bigBlind = parseFloat(blindParts[1]) || 2;

    // ENG-02 FIX: Added missing plo8, plo6, SHORT_DECK aliases
    const variantMap: Record<string, 'nlh' | 'plo4' | 'plo5' | 'plo6' | 'plo8' | 'short_deck'> = {
      NLH: 'nlh',
      PLO4: 'plo4',
      PLO5: 'plo5',
      PLO6: 'plo6',
      PLO8: 'plo8',
      SHORT: 'short_deck',
      SHORT_DECK: 'short_deck',
      nlh: 'nlh',
      plo4: 'plo4',
      plo5: 'plo5',
      plo6: 'plo6',
      plo8: 'plo8',
    };
    const gameVariant = variantMap[currentState.gameType] || 'nlh';

    const handNumber = handNumberRef.current;

    // Convert to SeatPlayer format for HandController
    const hcPlayers: import('../types/database.types').SeatPlayer[] = seatedPlayers.map(
      (p, idx) => ({
        seat: p ? currentState.players.indexOf(p) + 1 : idx + 1,
        user_id: p!.id,
        username: p!.name,
        stack: p!.stack,
        bet: 0,
        totalInvested: 0,
        cards: [],
        is_folded: false,
        is_all_in: false,
        is_sitting_out: false,
      })
    );

    const config = {
      tableId: tableId || 'anonymous',
      handNumber,
      gameVariant,
      smallBlind,
      bigBlind,
      rakeConfig: getRakeConfigForBlinds(smallBlind, bigBlind),
    };

    const dealerSeatIndex = (handNumber - 1) % seatedPlayers.length;
    const dealerSeat = hcPlayers[dealerSeatIndex]?.seat || 1;

    let hand: HandController;
    try {
      hand = new HandController(config, hcPlayers, dealerSeat);
    } catch (err) {
      console.error('[HC] Failed to create HandController:', err);
      _win.__pokerLocks.handActive = false;
      _win.__pokerLocks.activeHC = null;
      return;
    }
    handControllerRef.current = hand;
    handInProgressRef.current = true;
    _win.__pokerLocks.activeHC = hand;

    // Wire persistence service — use ACTUAL club_id, not table_id
    const clubId = actualClubIdRef.current || tableId || 'demo';
    handPersistenceService.wireToHandController(hand, {
      tableId: tableId || 'anonymous',
      clubId,
      stakes: currentState.blinds,
      gameVariant: gameVariant as 'nlh' | 'plo4' | 'plo5' | 'plo6',
    });

    // Subscribe to events and update UI
    hand.onEvent(async (event) => {
      switch (event.type) {
        case 'HAND_START':
          handInProgressRef.current = true;
          _win.__pokerLocks.handActive = true;
          // Reset raise slider on new hand — prevents stale raise panel
          setShowRaiseSlider(false);
          setTableState((prev) => ({
            ...prev,
            isHandInProgress: true,
            pot: 0,
            lastActions: Array(prev.maxPlayers).fill(null), // Clear action labels
          }));
          // Track hand for HUD stats — record all seated players
          {
            const currentState = tableStateRef.current;
            currentState.players.forEach((p) => {
              if (p && !p.isHero && p.status !== 'sitting_out' && p.status !== 'away') {
                recordHandPlayed(p.id);
              }
            });
          }
          // Reset hand history recording for this hand
          handActionsRef.current = [];
          historyHandCountRef.current += 1;
          {
            const currentState = tableStateRef.current;
            const stacks: Record<number, number> = {};
            currentState.players.forEach((p, i) => {
              if (p) stacks[i + 1] = p.stack;
            });
            handStartStacksRef.current = stacks;
          }
          // Play deal/chips sound
          if (soundService.isEnabled()) soundService.playChips();
          break;

        case 'CARDS_DEALT':
          // Play card deal sound — BUG-01 FIX: use soundService.isEnabled() not stale closure
          if (soundService.isEnabled()) soundService.playDeal();

          {
            // Convert HandController Card format to UI format
            const suitMapDeal: Record<string, 'h' | 'd' | 'c' | 's'> = {
              hearts: 'h',
              diamonds: 'd',
              clubs: 'c',
              spades: 's',
            };
            const holeCards: Card[] = event.cards.map((c) => ({
              rank: c.rank,
              suit: suitMapDeal[c.suit] || (c.suit as 'h' | 'd' | 'c' | 's'),
            }));

            setTableState((prev) => {
              const updatedPlayers = [...prev.players];
              const seatIndex = event.seat - 1;
              if (
                seatIndex >= 0 &&
                seatIndex < updatedPlayers.length &&
                updatedPlayers[seatIndex]
              ) {
                updatedPlayers[seatIndex] = {
                  ...updatedPlayers[seatIndex]!,
                  holeCards,
                  showCards: updatedPlayers[seatIndex]!.isHero,
                };
              }
              return { ...prev, players: updatedPlayers };
            });
          }
          break;

        case 'COMMUNITY_CARDS': {
          // Play community card reveal sound (stagger for each card)
          // BUG-01 FIX: use soundService.isEnabled() not stale closure
          if (soundService.isEnabled()) {
            event.cards.forEach((_: any, i: number) => {
              setTimeout(() => soundService.playCommunityCard(), i * 120);
            });
          }

          const suitMap: Record<string, 'h' | 'd' | 'c' | 's'> = {
            hearts: 'h',
            diamonds: 'd',
            clubs: 'c',
            spades: 's',
          };
          const uiCards: Card[] = event.cards.map((c) => ({
            rank: c.rank,
            suit: suitMap[c.suit] || (c.suit as 'h' | 'd' | 'c' | 's'),
          }));
          setTableState((prev) => ({
            ...prev,
            communityCards: [...prev.communityCards, ...uiCards],
            boardStage: event.stage as any,
            lastActions: Array(prev.maxPlayers).fill(null), // Clear for new betting round
          }));
          break;
        }

        case 'POT_UPDATE':
          setTableState((prev) => ({ ...prev, pot: event.pot }));
          break;

        case 'PLAYER_ACTION':
          // Track VPIP/PFR for HUD stats (preflop voluntary actions)
          {
            const currentState = tableStateRef.current;
            const actionPlayer = currentState.players[event.seat - 1];
            if (actionPlayer && !actionPlayer.isHero && currentState.boardStage === 'preflop') {
              const act = (event.action || '').toLowerCase();
              // VPIP = any voluntary money in (call, bet, raise, all_in) — not check/fold
              if (['call', 'bet', 'raise', 'all_in', 'allin'].includes(act)) {
                recordVPIP(actionPlayer.id);
              }
              // PFR = preflop raise or 3bet+
              if (['raise', 'bet', 'all_in', 'allin'].includes(act)) {
                recordPFR(actionPlayer.id);
              }
            }
          }
          // Record action for hand history
          {
            const currentState = tableStateRef.current;
            handActionsRef.current.push({
              seat: event.seat,
              action: (event.action || '').toLowerCase(),
              amount: event.amount,
              street: currentState.boardStage || 'preflop',
            });
          }
          // Update last actions display and player status
          setTableState((prev) => {
            const newLastActions = [...prev.lastActions];
            const seatIndex = event.seat - 1;

            // Map action to display label
            const actionLabel = (event.action || '').toUpperCase() as any;
            newLastActions[seatIndex] = actionLabel;

            // Update player fold status if folded
            const updatedPlayers = [...prev.players];
            if (event.action === 'fold' && updatedPlayers[seatIndex]) {
              updatedPlayers[seatIndex] = {
                ...updatedPlayers[seatIndex]!,
                status: 'folded',
              };
            }

            return {
              ...prev,
              lastActions: newLastActions,
              players: updatedPlayers,
            };
          });
          break;

        case 'TURN_CHANGE':
          setTableState((prev) => ({ ...prev, currentPlayerSeat: event.seat }));
          // Close raise slider if it's no longer hero's turn
          {
            const currentState = tableStateRef.current;
            if (event.seat !== currentState.heroSeat) {
              setShowRaiseSlider(false);
            }
          }
          // Play turn alert and reset timer if it's hero's turn
          {
            const currentState = tableStateRef.current;
            if (event.seat === currentState.heroSeat) {
              playTurnAlert();
              setActionTimeRemaining(15); // Reset action timer
            }

            // Auto-action for horses (check extended player properties OR horseMapRef)
            const actingPlayer = currentState.players[event.seat - 1] as any;
            const horseInfo = horseMapRef.current.get(event.seat);
            const isHorse = actingPlayer?.isHorse || !!horseInfo;
            // Horse auto-action detection
            if (isHorse && handControllerRef.current) {
              const bigBlind = parseFloat(currentState.blinds.split('/')[1]) || 0.5;
              const activePlayers = currentState.players.filter(
                (p) => p && (p as any).status !== 'folded'
              ).length;

              // Get toCall from HandController state for accurate bet-to-call
              const hcState = handControllerRef.current.getState();
              const currentBets = hcState?.players || [];
              const maxBet = Math.max(...currentBets.map((p: any) => p.bet || 0), 0);
              const playerBet = currentBets.find((p: any) => p.seat === event.seat)?.bet || 0;
              const toCall = Math.max(0, maxBet - playerBet);

              // Use actingPlayer stack or horseInfo stack or engine player stack
              const enginePlayer = currentBets.find((p: any) => p.seat === event.seat);
              const playerStack =
                actingPlayer?.stack || horseInfo?.stack || enginePlayer?.stack || 100;

              const context: import('../services/HydraService').HandContext = {
                pot: currentState.pot || hcState?.pot || 0,
                toCall,
                minRaise: Math.max(bigBlind, toCall + bigBlind),
                maxRaise: playerStack,
                position: event.seat <= 3 ? 'early' : event.seat <= 5 ? 'middle' : 'late',
                street: (currentState.boardStage || 'preflop') as
                  | 'preflop'
                  | 'flop'
                  | 'turn'
                  | 'river',
                playersInHand: activePlayers,
                stackToPotRatio:
                  (currentState.pot || 1) > 0 ? playerStack / (currentState.pot || 1) : 100,
                isHeadsUp: activePlayers === 2,
              };

              const horseProfile = actingPlayer?.horseProfile || horseInfo?.profile || 'reg';
              const decision = HydraService.getDecision(
                {
                  ...actingPlayer,
                  profile: horseProfile,
                } as import('../services/HydraService').HorsePlayer,
                context
              );

              // Execute after think time (workerTimeout is throttle-proof)
              workerTimeout(() => {
                if (handControllerRef.current) {
                  let finalAction = decision.action as string;
                  let finalAmount = decision.amount;

                  // Map HydraService 'allin' to HandController 'all_in'
                  if (finalAction === 'allin') finalAction = 'all_in';

                  // Get fresh engine state for accurate validation
                  const hcStateNow = handControllerRef.current.getState();
                  const engineCurrentBet = hcStateNow.currentBet || 0;
                  const freshPlayerBet =
                    hcStateNow.players?.find((p: any) => p.seat === event.seat)?.bet || 0;
                  const freshToCall = Math.max(0, engineCurrentBet - freshPlayerBet);

                  // Validate action against game state
                  if (finalAction === 'check' && freshToCall > 0) {
                    finalAction = 'call';
                    finalAmount = freshToCall;
                  }
                  if (finalAction === 'call' && freshToCall === 0) {
                    // Nothing to call — check instead (prevents "Nothing to call" rejection)
                    finalAction = 'check';
                    finalAmount = undefined;
                  }
                  if (finalAction === 'call') {
                    finalAmount = freshToCall;
                  }
                  if (finalAction === 'fold' && freshToCall === 0) {
                    finalAction = 'check'; // Don't fold when checking is free
                  }

                  // Remap raise↔bet based on whether there's an existing bet
                  // Engine requires 'bet' when opening, 'raise' when increasing
                  if (finalAction === 'raise' && engineCurrentBet === 0) {
                    finalAction = 'bet'; // No bet to raise — use bet instead
                  }
                  if (finalAction === 'bet' && engineCurrentBet > 0) {
                    finalAction = 'raise'; // Bet already exists — use raise instead
                  }

                  // Validate raise/bet amount against HandController's actual minRaise
                  if (
                    (finalAction === 'raise' || finalAction === 'bet') &&
                    handControllerRef.current
                  ) {
                    const engineMinRaise = Math.max(bigBlind, hcStateNow.lastRaise || bigBlind);
                    const minTotalForRaise = engineCurrentBet + engineMinRaise;

                    if (finalAmount === undefined || finalAmount < minTotalForRaise) {
                      // Can't meet minimum raise — fall back to call or check
                      if (freshToCall > 0 && playerStack >= freshToCall) {
                        finalAction = 'call';
                        finalAmount = freshToCall;
                      } else if (freshToCall > 0) {
                        finalAction = 'all_in';
                        finalAmount = undefined;
                      } else {
                        finalAction = 'check';
                        finalAmount = undefined;
                      }
                    } else if (
                      finalAmount >
                      playerStack + (engineCurrentBet > 0 ? freshToCall : 0)
                    ) {
                      // Over stack — go all-in
                      finalAction = 'all_in';
                      finalAmount = undefined;
                    }
                  }

                  // Capture stack before action for bug validation
                  const stackBefore =
                    hcStateNow.players?.find((p: any) => p.seat === event.seat)?.stack || 0;

                  const result = handControllerRef.current.performAction(
                    event.seat,
                    finalAction as any,
                    finalAmount
                  );

                  // Horse mini-agent: validate chip integrity after action
                  const hcStateAfter = handControllerRef.current.getState();
                  const stackAfter =
                    hcStateAfter.players?.find((p: any) => p.seat === event.seat)?.stack || 0;
                  const horseName = actingPlayer?.name || horseInfo?.name || `Seat ${event.seat}`;

                  horseBugReporter.validateChips(
                    horseName,
                    actingPlayer?.id || '',
                    tableId || '',
                    currentState.tableId || '',
                    0,
                    stackBefore,
                    stackAfter,
                    finalAction,
                    finalAmount || 0
                  );

                  // Report if action was rejected
                  if (result === false) {
                    horseBugReporter.reportActionRejected(
                      horseName,
                      actingPlayer?.id || '',
                      tableId || '',
                      currentState.tableId || '',
                      0,
                      finalAction,
                      finalAmount,
                      'HandController rejected action'
                    );
                  }
                }
              }, decision.thinkTime);
            }
          }
          break;

        case 'SHOWDOWN':
          // Play showdown dramatic sound
          // BUG-01 FIX: use soundService.isEnabled() not stale closure
          if (soundService.isEnabled()) soundService.playShowdown();

          // Reveal all cards for showdown
          setTableState((prev) => {
            const updatedPlayers = [...prev.players];
            for (const result of event.results) {
              const playerIdx = updatedPlayers.findIndex((p) => p?.id === result.userId);
              if (playerIdx >= 0 && updatedPlayers[playerIdx]) {
                // Convert card format and show cards
                const suitMapShowdown: Record<string, 'h' | 'd' | 'c' | 's'> = {
                  hearts: 'h',
                  diamonds: 'd',
                  clubs: 'c',
                  spades: 's',
                };
                const showdownCards = result.cards.map((c) => ({
                  rank: c.rank as Card['rank'],
                  suit: (suitMapShowdown[c.suit] || c.suit) as 'h' | 'd' | 'c' | 's',
                }));
                updatedPlayers[playerIdx] = {
                  ...updatedPlayers[playerIdx]!,
                  holeCards: showdownCards,
                  showCards: true, // Reveal all cards at showdown
                };
              }
            }
            return { ...prev, players: updatedPlayers };
          });
          break;

        case 'WINNERS':
          // Sync all player stacks from the engine state after pot distribution
          setTableState((prev) => {
            const updatedPlayers = [...prev.players];
            const engineState = handControllerRef.current?.getState();
            if (engineState) {
              for (const ep of engineState.players) {
                const playerIdx = updatedPlayers.findIndex((p) => p?.id === ep.user_id);
                if (playerIdx >= 0 && updatedPlayers[playerIdx]) {
                  updatedPlayers[playerIdx] = {
                    ...updatedPlayers[playerIdx]!,
                    stack: ep.stack,
                  };
                }
              }
            }
            return { ...prev, players: updatedPlayers, pot: 0 };
          });
          {
            const totalWon = event.winners.reduce(
              (sum: number, w: any) => sum + (w.amount || 0),
              0
            );
            playWinSound(totalWon);
          }
          // Clear all-in mode when winners declared
          setIsAllInMode(false);

          // NOTE: No wallet transactions here — chips stay on the table.
          // Wallet transfers only happen on buy-in (debit) and leave-table (credit).
          // Winners' chips are added to their table stack via the state update above.

          // Track winner info for visual highlighting + hand history amounts (BUG-05 FIX)
          {
            const winnerIds = event.winners.map((w: any) => w.userId);
            const bestHand = event.winners.find((w: any) => w.hand?.name)?.hand;
            const handName = bestHand?.name || '';
            // Build amounts map for hand history
            const amountsMap: Record<string, number> = {};
            for (const w of event.winners) {
              amountsMap[w.userId] = (amountsMap[w.userId] || 0) + (w.amount || 0);
            }
            // Find which community card indices are part of the winning hand
            const winCardIndices: number[] = [];
            if (bestHand?.cards) {
              const communityCards = handControllerRef.current?.getState()?.communityCards || [];
              bestHand.cards.forEach((wc: any) => {
                const idx = communityCards.findIndex(
                  (cc: any) => cc.rank === wc.rank && cc.suit === wc.suit
                );
                if (idx >= 0 && !winCardIndices.includes(idx)) {
                  winCardIndices.push(idx);
                }
              });
            }
            setWinnerInfo({
              playerIds: winnerIds,
              handName,
              cardIndices: winCardIndices,
              amounts: amountsMap,
            });
          }

          // Track wins for HUD stats
          for (const winner of event.winners) {
            if (winner.userId) {
              recordHUDWin(winner.userId);
            }
          }
          // Trigger achievements for winners
          for (const winner of event.winners) {
            achievementTriggerService
              .onHandComplete(winner.userId, {
                won: true,
                potSize: winner.amount,
                handRank: winner.hand?.name, // e.g. 'Royal Flush', 'Full House'
                showdown: true,
              })
              .catch((err) => console.error('[Achievements] Trigger failed:', err));
          }
          break;

        case 'HAND_COMPLETE':
          // Close raise slider on hand complete
          setShowRaiseSlider(false);
          // First, keep cards visible for 3 seconds so players can see showdown
          setTableState((prev) => ({
            ...prev,
            isHandInProgress: false,
          }));
          setLastHandId(`hand-${event.handNumber}`);

          // Build HandRecord from accumulated actions
          {
            const currentState = tableStateRef.current;
            const posLabels = ['D', 'SB', 'BB', 'UTG', 'MP', 'CO', 'BTN', 'UTG+1', 'UTG+2'];
            const streetMap: Record<string, HandHistoryAction[]> = {
              preflop: [],
              flop: [],
              turn: [],
              river: [],
            };
            for (const a of handActionsRef.current) {
              const player = currentState.players[a.seat - 1];
              if (streetMap[a.street]) {
                streetMap[a.street].push({
                  playerName: player?.name || `Seat ${a.seat}`,
                  playerId: player?.id || '',
                  action: a.action as any,
                  amount: a.amount,
                });
              }
            }
            const streets: HandHistoryStreet[] = [];
            for (const name of ['preflop', 'flop', 'turn', 'river'] as const) {
              if (streetMap[name].length > 0) {
                streets.push({
                  name,
                  actions: streetMap[name],
                  pot: event.pot || 0, // Use HC's authoritative pot (currentState.pot is zeroed by WINNERS)
                });
              }
            }
            const heroPlayer = currentState.players[currentState.heroSeat - 1];
            const heroStartStack = handStartStacksRef.current[currentState.heroSeat] || 0;
            const heroEndStack = heroPlayer?.stack || 0;
            const record: HandRecord = {
              id: `hand-${event.handNumber || historyHandCountRef.current}`,
              handNumber: event.handNumber || historyHandCountRef.current,
              timestamp: Date.now(),
              gameType: currentState.gameType,
              blinds: currentState.blinds,
              players: currentState.players
                .filter((p): p is NonNullable<typeof p> => !!p)
                .map((p, i) => ({
                  id: p.id,
                  name: p.name,
                  seat: i + 1,
                  stack: handStartStacksRef.current[i + 1] || p.stack,
                  position: (currentState.positions[i] ||
                    posLabels[Math.min(i, posLabels.length - 1)] ||
                    '') as string,
                })),
              streets,
              // BUG-05 FIX: Use actual winner amounts from winnerInfo.amounts
              winners: winnerInfo.playerIds.map((pid) => {
                const wp = currentState.players.find((p) => p?.id === pid);
                return {
                  playerId: pid,
                  playerName: wp?.name || 'Unknown',
                  amount: winnerInfo.amounts[pid] || 0,
                  hand: winnerInfo.handName || undefined,
                };
              }),
              heroId: userId || '',
              heroResult: heroEndStack - heroStartStack,
              potTotal: event.pot || currentState.pot, // Use HC's authoritative pot value
            };
            setHandHistory((prev) => [record, ...prev].slice(0, 50)); // Keep last 50 hands

            // ── Session Tracking: update refs for end-of-session summary ──
            handsPlayedRef.current += 1;
            // Use event.pot (authoritative HC value) — currentState.pot is already 0
            // because WINNERS handler sets pot: 0 before HAND_COMPLETE fires
            const handPotForSession = event.pot || 0;
            if (handPotForSession > biggestPotRef.current) {
              biggestPotRef.current = handPotForSession;
            }
            if (heroEndStack > peakStackRef.current) {
              peakStackRef.current = heroEndStack;
            }
          }

          // Delayed cleanup: clear board and cards after 3 seconds, then start next hand
          workerTimeout(() => {
            // Clear ALL locks to allow next hand
            handInProgressRef.current = false;
            handControllerRef.current = null;
            _win.__pokerLocks.handActive = false;
            _win.__pokerLocks.activeHC = null;
            // Clear winner highlights
            setWinnerInfo({ playerIds: [], handName: '', cardIndices: [], amounts: {} });
            setTableState((prev) => {
              // Parse big blind for auto-rebuy calculation
              const bbMatch = prev.blinds.match(/\/(\d+\.?\d*)/);
              const bb = bbMatch ? parseFloat(bbMatch[1]) : 0.5;
              const rebuyStack = bb * 100; // 100 BB rebuy

              // Clear all players' hole cards and reset status for next hand
              // Auto-rebuy horses that busted (stack <= 0)
              const clearedPlayers = prev.players.map((p, idx) => {
                if (!p) return null;
                const isHorse = (p as any).isHorse || horseMapRef.current.has(idx + 1);
                const needsRebuy = isHorse && p.stack <= 0;
                return {
                  ...p,
                  holeCards: undefined,
                  showCards: false,
                  stack: needsRebuy ? rebuyStack : p.stack,
                  status: needsRebuy || p.stack > 0 ? ('active' as const) : p.status,
                };
              });
              return {
                ...prev,
                communityCards: [],
                boardStage: 'preflop',
                pot: 0,
                lastActions: Array(prev.maxPlayers).fill(null),
                players: clearedPlayers,
              };
            });
            // Start next hand IMPERATIVELY (not via useEffect)
            workerTimeout(() => startNextHandRef.current(), 500);
          }, 3000);

          // Execute rake waterfall
          {
            const currentPlayers = tableStateRef.current.players.filter((p) => p && p.stack > 0);
            const rakeClubId = actualClubIdRef.current || tableId || 'demo';
            const rakePlayers = currentPlayers.map((p) => ({
              userId: p!.id,
              clubId: rakeClubId,
              agentId: undefined,
            }));
            // BUG-04 FIX: Use the pot value BEFORE winners handler zeroed it
            // The HandController already calculated correct rake — pass the
            // original pot stored in event data, not the already-zeroed tableState.pot
            const handPot = event.pot || tableStateRef.current.pot || 0;
            await handleHandComplete(
              handPersistenceService.getCurrentHandId() || crypto.randomUUID(),
              event.rake > 0 ? handPot : 0,
              event.rake > 0, // wentToFlop: if HC calculated rake, flop was seen
              rakePlayers
            );
          }

          // Sync player stacks back to table_seats in DB (fire-and-forget)
          {
            const allPlayers = tableStateRef.current.players;
            for (let seatIdx = 0; seatIdx < allPlayers.length; seatIdx++) {
              const p = allPlayers[seatIdx];
              if (p && p.id) {
                supabase
                  .from('table_seats')
                  .update({ stack: p.stack })
                  .eq('table_id', tableId)
                  .eq('seat_number', seatIdx + 1)
                  .is('left_at', null)
                  .then(({ error: syncErr }) => {
                    if (syncErr) console.warn('[Seats] Stack sync failed:', syncErr.message);
                  });
              }
            }
          }
          break;
      }
    });

    setHandController(hand);
    try {
      hand.start();
    } catch (err) {
      console.error('[HC] hand.start() failed:', err);
      handControllerRef.current = null;
      handInProgressRef.current = false;
      _win.__pokerLocks.handActive = false;
      _win.__pokerLocks.activeHC = null;
    }
  };

  // Trigger first hand when horses are loaded (via useEffect that watches for players)
  // This only fires ONCE — subsequent hands are triggered by HAND_COMPLETE
  useEffect(() => {
    // Use GLOBAL flag so component remounts don't re-trigger
    if (
      _win.__pokerLocks.firstHandTriggered ||
      _win.__pokerLocks.handActive ||
      _win.__pokerLocks.activeHC
    )
      return;
    const seatedPlayers = tableState.players.filter((p) => p && p.stack > 0);
    if (seatedPlayers.length >= 2) {
      _win.__pokerLocks.firstHandTriggered = true;
      startNextHandRef.current();
    }
  }, [tableState.players]);

  // Handle incoming game events from WebSocket
  useEffect(() => {
    if (!lastEvent) return;

    switch (lastEvent.type) {
      case 'DEAL_CARDS':
        // Update community cards
        if (lastEvent.data.communityCards) {
          setTableState((prev) => ({
            ...prev,
            communityCards: lastEvent.data.communityCards as Card[],
          }));
        }
        break;
      case 'PLAYER_ACTION':
        // Update pot, player stacks, etc.
        if (lastEvent.data.pot !== undefined) {
          setTableState((prev) => ({
            ...prev,
            pot: lastEvent.data.pot as number,
          }));
        }
        break;
      case 'POT_WIN':
        // Show winner animation
        break;
      case 'HAND_COMPLETE':
        // Reset for next hand
        setTableState((prev) => ({
          ...prev,
          communityCards: [],
          boardStage: 'preflop',
          pot: 0,
        }));
        break;
    }
  }, [lastEvent]);

  // Update players from presence state
  useEffect(() => {
    if (!presence) return;

    // Merge presence data with existing players (use callback to avoid stale state)
    setTableState((prev) => {
      const updatedPlayers = [...prev.players];
      let hasChanges = false;

      presence.players.forEach((p) => {
        if (p.seatNumber !== undefined) {
          const seatIdx = p.seatNumber - 1;
          if (seatIdx >= 0 && seatIdx < updatedPlayers.length) {
            const existing = updatedPlayers[seatIdx];
            // Only update if actually different to prevent loops
            if (!existing || existing.id !== p.userId) {
              updatedPlayers[seatIdx] = {
                id: p.userId,
                name: p.username,
                avatar: p.avatar || '',
                stack: existing?.stack ?? 0,
                status: existing?.status ?? 'active',
                isHero: p.userId === userId,
                showCards: existing?.showCards ?? false,
              };
              hasChanges = true;
            }
          }
        }
      });

      // Only update state if there were actual changes
      return hasChanges ? { ...prev, players: updatedPlayers } : prev;
    });
  }, [presence, userId]);

  // Get seat positions based on table size
  const seatPositions = tableState.maxPlayers === 9 ? SEAT_POSITIONS_9MAX : SEAT_POSITIONS_6MAX;

  // Find player at specific seat (1-indexed)
  const getPlayerAtSeat = useCallback(
    (seatNumber: number): SeatPlayer | null => {
      return tableState.players[seatNumber - 1] ?? null;
    },
    [tableState.players]
  );

  // Handle seat click (sit down at empty seat)
  const handleSeatClick = async (seatNumber: number) => {
    // Validate seat is empty before showing buy-in modal
    const seatIdx = seatNumber - 1;
    if (seatIdx >= 0 && seatIdx < tableState.players.length && tableState.players[seatIdx]) {
      // Seat is occupied — ignore click
      return;
    }
    // Don't allow sitting if already seated at this table
    if (tableState.heroSeat > 0) {
      return;
    }
    setSelectedSeat(seatNumber);
    setShowBuyInModal(true);
    await updateSeat(seatNumber);
  };

  // Broadcast current hand state via Supabase Realtime — PRIMARY sync mechanism
  // Mirrors HeadlessTableEngine.broadcastCurrentState() for human player actions
  const broadcastLocalHandState = useCallback(() => {
    if (!handControllerRef.current || !tableId) return;
    const state = handControllerRef.current.getState();
    const currentSeatPlayer = state.players?.find((p: any) => p.seat === state.currentPlayerSeat);
    broadcastHandState(tableId, {
      table_id: tableId,
      pot: state.pot ?? 0,
      community_cards: state.communityCards ?? [],
      current_bet: state.currentBet ?? 0,
      current_player: currentSeatPlayer?.user_id ?? null,
      dealer_seat: state.dealerSeat ?? 0,
      stage: state.stage ?? 'preflop',
      players: (state.players ?? []).map((p: any) => ({
        seat: p.seat,
        user_id: p.user_id,
        username: p.username,
        stack: p.stack,
        bet: p.bet ?? 0,
        cards: p.cards ?? [],
        is_folded: p.is_folded ?? false,
        is_all_in: p.is_all_in ?? false,
        is_sitting_out: p.is_sitting_out ?? false,
      })),
    });
  }, [tableId]);

  // Action handlers — LOCAL engine is authoritative → broadcast via Supabase Realtime (PRIMARY)
  // → fire-and-forget server call (SECONDARY, for when game server is deployed)
  const handleFold = async () => {
    const heroSeat = tableState.heroSeat;
    setShowRaiseSlider(false);
    startTransition(() => {
      if (handControllerRef.current) {
        handControllerRef.current.performAction(heroSeat, 'fold');
      }
    });
    soundService.playFold();
    broadcastLocalHandState();
    if (tableId) submitAction(tableId, userId, 'fold').catch(() => {});
  };

  const handleCheck = async () => {
    const heroSeat = tableState.heroSeat;
    setShowRaiseSlider(false);
    startTransition(() => {
      if (handControllerRef.current) {
        handControllerRef.current.performAction(heroSeat, 'check');
      }
    });
    soundService.playCheck();
    broadcastLocalHandState();
    if (tableId) submitAction(tableId, userId, 'check').catch(() => {});
  };

  const handleCall = async () => {
    const heroSeat = tableState.heroSeat;
    setShowRaiseSlider(false);
    startTransition(() => {
      if (handControllerRef.current) {
        handControllerRef.current.performAction(heroSeat, 'call');
      }
    });
    soundService.playChips();
    broadcastLocalHandState();
    if (tableId) submitAction(tableId, userId, 'call').catch(() => {});
  };

  const handleBet = () => {
    setShowRaiseSlider(true);
  };

  const handleRaise = () => {
    setShowRaiseSlider(true);
  };

  // Unified action handler for ActionPanel component
  // Architecture: LOCAL engine is authoritative → broadcast via Supabase Realtime (PRIMARY)
  // → fire-and-forget server call (SECONDARY, for when game server is deployed)
  const handleActionPanelAction = useCallback(
    async (action: 'fold' | 'check' | 'call' | 'raise' | 'allin', amount?: number) => {
      const heroSeat = tableState.heroSeat;
      const hero = getPlayerAtSeat(heroSeat);
      const heroStack = hero?.stack || 0;

      switch (action) {
        case 'fold':
          startTransition(() => {
            if (handControllerRef.current)
              handControllerRef.current.performAction(heroSeat, 'fold');
          });
          soundService.playFold();
          broadcastLocalHandState();
          if (tableId) submitAction(tableId, userId, 'fold').catch(() => {});
          break;
        case 'check':
          startTransition(() => {
            if (handControllerRef.current)
              handControllerRef.current.performAction(heroSeat, 'check');
          });
          soundService.playCheck();
          broadcastLocalHandState();
          if (tableId) submitAction(tableId, userId, 'check').catch(() => {});
          break;
        case 'call':
          startTransition(() => {
            if (handControllerRef.current)
              handControllerRef.current.performAction(heroSeat, 'call');
          });
          soundService.playChips();
          broadcastLocalHandState();
          if (tableId) submitAction(tableId, userId, 'call').catch(() => {});
          break;
        case 'raise':
          if (amount) {
            const clamped = Math.min(amount, heroStack);
            if (clamped <= 0) return;
            startTransition(() => {
              if (handControllerRef.current) {
                handControllerRef.current.performAction(heroSeat, 'raise', clamped);
              }
            });
            soundService.playRaise();
            broadcastLocalHandState();
            if (tableId) submitAction(tableId, userId, 'raise', clamped).catch(() => {});
          }
          break;
        case 'allin':
          if (heroStack <= 0) return;
          startTransition(() => {
            if (handControllerRef.current)
              handControllerRef.current.performAction(heroSeat, 'all_in');
          });
          soundService.playAllIn();
          setIsAllInMode(true);
          broadcastLocalHandState();
          if (tableId) submitAction(tableId, userId, 'allin', heroStack).catch(() => {});
          break;
      }
    },
    [tableState.heroSeat, tableId, userId, broadcastLocalHandState]
  );

  const handleConfirmRaise = async () => {
    const heroSeat = tableState.heroSeat;
    const hero = getPlayerAtSeat(heroSeat);
    const heroStack = hero?.stack || 0;

    // Clamp raise to hero's stack (can't bet more than you have)
    const clampedRaise = Math.min(raiseAmount, heroStack);
    if (clampedRaise <= 0) return;

    // Close slider immediately
    setShowRaiseSlider(false);
    try {
      startTransition(() => {
        if (handControllerRef.current) {
          const result = handControllerRef.current.performAction(heroSeat, 'raise', clampedRaise);
          if (result === false) {
            console.warn('[TablePage] Raise rejected by engine — amount:', clampedRaise);
          }
        }
      });
      soundService.playChips();
      // PRIMARY: Broadcast via Supabase Realtime
      broadcastLocalHandState();
      // SECONDARY: Fire-and-forget server call
      if (tableId) submitAction(tableId, userId, 'raise', clampedRaise).catch(() => {});
    } catch (err) {
      console.warn('[TablePage] Raise error:', err);
    }
  };

  const handleAllIn = async () => {
    const heroSeat = tableState.heroSeat;
    const hero = getPlayerAtSeat(heroSeat);
    const heroStack = hero?.stack || 0;
    if (heroStack <= 0) return;
    try {
      startTransition(() => {
        if (handControllerRef.current) {
          handControllerRef.current.performAction(heroSeat, 'all_in');
        }
      });
      soundService.playChips();
      // PRIMARY: Broadcast via Supabase Realtime
      broadcastLocalHandState();
      // SECONDARY: Fire-and-forget server call
      if (tableId) submitAction(tableId, userId, 'allin', heroStack).catch(() => {});
    } catch (err) {
      console.warn('[TablePage] All-in error:', err);
    }

    // Check for all-in scenario triggers (after slight delay to let state update)
    workerTimeout(() => {
      // Use tableStateRef.current instead of stale tableState closure
      const currentState = tableStateRef.current;
      const activePlayers = currentState.players.filter(
        (p) => p && p.status === 'active' && p.stack > 0
      );
      const allInPlayers = currentState.players.filter((p) => p && p.status === 'all_in');

      // If heads-up all-in (2 players all-in), trigger insurance
      if (activePlayers.length === 0 && allInPlayers.length >= 2) {
        const opponent = allInPlayers.find((p) => p?.id !== hero?.id);
        const potSize = currentState.pot;
        const maxCoverage = Math.trunc(potSize * 0.8 * 100) / 100; // 80% of pot coverage

        // Convert board cards to proper format
        const boardCards = tableState.communityCards.map((c) => ({
          rank: c.rank,
          suit: c.suit as 'h' | 'd' | 'c' | 's',
        }));

        // Hero's hole cards
        const heroCards =
          hero?.holeCards?.map((c) => ({
            rank: c.rank,
            suit: c.suit as 'h' | 'd' | 'c' | 's',
          })) || [];

        setInsuranceOffer({
          maxCoverage,
          equityPercent: 65, // Would come from hand evaluator in production
          premiumRate: 0.1, // 10% premium rate
          potAmount: potSize,
          yourStack: heroStack,
          opponentStack: opponent?.stack || 0,
          yourCards: heroCards,
          board: boardCards,
        });
        setShowInsurance(true);

        // Also trigger Run It Twice prompt after insurance decision
        setRitOpponent(opponent?.name || 'Opponent');
        setRitTimer(10);
        // RIT prompt will show after insurance modal closes
      }
    }, 500);
  };

  // Side menu toggle — wrapped in startTransition to avoid INP
  const toggleSideMenu = () => {
    startTransition(() => {
      setIsSideMenuOpen(!isSideMenuOpen);
    });
  };

  // Chip animation helpers
  const triggerChipAnimation = useCallback(
    (
      fromSeat: number,
      toPot: boolean,
      amount: number,
      chipColor: 'red' | 'green' | 'blue' | 'black' | 'gold' = 'gold'
    ) => {
      const seatPositions = tableState.maxPlayers === 9 ? SEAT_POSITIONS_9MAX : SEAT_POSITIONS_6MAX;
      const fromPos = seatPositions[fromSeat] || { x: 50, y: 50 };
      const toPos = toPot ? { x: 50, y: 45 } : fromPos; // Pot is center of table

      const animId = `chip_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      setChipAnimations((prev) => [
        ...prev,
        {
          id: animId,
          from: {
            x: (fromPos.x / 100) * window.innerWidth,
            y: (fromPos.y / 100) * window.innerHeight,
          },
          to: { x: (toPos.x / 100) * window.innerWidth, y: (toPos.y / 100) * window.innerHeight },
          amount,
          chipColor,
        },
      ]);
    },
    [tableState.maxPlayers]
  );

  const handleAnimationComplete = useCallback((id: string) => {
    setChipAnimations((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // Load waitlist data
  const loadWaitlist = useCallback(async () => {
    if (!tableId) return;
    try {
      const entries = await waitlistService.getTableWaitlist(tableId);
      setWaitListPlayers(
        entries.map((e) => ({
          playerId: e.userId,
          playerName: `Player ${e.position}`, // Would come from profile join
          position: e.position,
          joinedAt: new Date(e.joinedAt),
        }))
      );
    } catch (error) {
      console.error('Failed to load waitlist:', error);
    }
  }, [tableId]);

  // Handle opening waitlist modal and loading data
  const handleOpenWaitlist = useCallback(() => {
    loadWaitlist();
    setShowWaitList(true);
  }, [loadWaitlist]);

  // Pre-action execution — When it becomes player's turn, execute queued action
  useEffect(() => {
    if (
      tableState.currentPlayerSeat === tableState.heroSeat &&
      preAction &&
      tableState.isHandInProgress
    ) {
      // Small delay to ensure state is updated
      const timer = setTimeout(async () => {
        try {
          if (preAction === 'fold') {
            await handleFold();
          } else if (preAction === 'check') {
            // Only check if can check (no bet to call)
            const handState = handControllerRef.current?.getState();
            const currentBet = handState?.currentBet || 0;
            const myEngineBet = handState?.players.find((p) => p.user_id === userId)?.bet || 0;
            const callAmount = Math.max(0, currentBet - myEngineBet);
            if (callAmount === 0) {
              await handleCheck();
            }
          } else if (preAction === 'callAny') {
            await handleCall();
          }
          // Clear the pre-action after executing
          setPreAction(null);
        } catch (err) {
          console.error('[PreAction] Error executing pre-action:', err);
          setPreAction(null);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [
    tableState.currentPlayerSeat,
    tableState.heroSeat,
    preAction,
    tableState.isHandInProgress,
    userId,
  ]);

  // Trigger board animation on stage transition
  useEffect(() => {
    setBoardStageKey((prev) => prev + 1);
  }, [tableState.boardStage]);

  // Clear pre-action if game state changes significantly (new hand, someone raises after preaction set, etc)
  useEffect(() => {
    // Reset pre-actions when a new hand starts or board changes
    if (!tableState.isHandInProgress) {
      setPreAction(null);
    }
  }, [tableState.boardStage, tableState.isHandInProgress]);

  // Timer countdown with auto-fold on timeout
  // NOTE: actionTimeRemaining removed from deps to prevent re-creating interval every second
  // The setInterval handles its own countdown via the functional state updater
  useEffect(() => {
    if (tableState.currentPlayerSeat === tableState.heroSeat) {
      const timer = setInterval(() => {
        setActionTimeRemaining((prev) => {
          if (prev <= 0) return 0;
          const newValue = prev - 1;
          // Auto-fold when timer expires
          if (newValue <= 0 && handControllerRef.current) {
            try {
              const foldResult = handControllerRef.current.performAction(
                tableState.heroSeat,
                'fold'
              );
              if (foldResult !== false) {
                sendAction('fold', { seat: tableState.heroSeat, autoFold: true });
                soundService.playFold();
              } else {
                console.warn(
                  '[AutoFold] performAction returned false — fold may not have executed'
                );
              }
            } catch (err) {
              console.error('[AutoFold] Error during auto-fold:', err);
            }
          }
          return Math.max(0, newValue);
        });
      }, 1000);
      return () => clearInterval(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableState.currentPlayerSeat, tableState.heroSeat]);

  // Timer warning sound — tick when hero's time is running low
  useEffect(() => {
    const isHeroTurn =
      tableState.currentPlayerSeat === tableState.heroSeat && tableState.isHandInProgress;
    if (isHeroTurn && actionTimeRemaining <= 5 && actionTimeRemaining > 0 && isSoundEnabled) {
      soundService.startTimerWarning();
    } else {
      soundService.stopTimerWarning();
    }
    return () => soundService.stopTimerWarning();
  }, [
    actionTimeRemaining,
    tableState.currentPlayerSeat,
    tableState.heroSeat,
    tableState.isHandInProgress,
    isSoundEnabled,
  ]);

  return (
    <div
      className={`table-page${isAllInMode ? ' table-page--allin-mode' : ''}${tableState.currentPlayerSeat === tableState.heroSeat && tableState.isHandInProgress ? ' table-page--hero-turn' : ''}${winnerInfo.playerIds.length > 0 ? ' table-page--winner-flash' : ''}`}
    >
      <style>{`
                @keyframes boardSlideIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
                @keyframes boardFade { from { opacity: 0.7; } to { opacity: 1; } }
                .community-area { animation: boardFade 0.4s ease-out; }
                .board-transition { animation: boardSlideIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); }
            `}</style>
      {/* ═══════════════════════════════════════════════════════════════════════
          HEADER BAR — Compact PokerBros-style with game info
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="table-header">
        <div className="header-left">
          <button
            className="header-btn back-btn"
            onClick={() => {
              soundService.playButtonClick();
              navigate(-1);
            }}
            title="Back"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M12 4l-6 6 6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            className="header-btn add-chips-icon"
            onClick={() => {
              soundService.playButtonClick();
              if (tableState.players[tableState.heroSeat - 1]) setShowBuyInModal(true);
            }}
            title="Add Chips"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M9 6v6M6 9h6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="header-center">
          <span className="header-game-type">{tableState.gameType}</span>
          <span className="header-blinds">{tableState.blinds}</span>
        </div>
        <div className="header-right">
          <button
            className="header-btn"
            onClick={() => {
              soundService.playButtonClick();
              setShowHandHistory((prev) => !prev);
            }}
            title="Hand History"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M3 4h12M3 7h8M3 10h10M3 13h6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            className="header-btn"
            onClick={() => {
              soundService.playButtonClick();
              setShowSettings(true);
            }}
            title="Settings"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="9" r="2" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M9 1v2M9 15v2M1 9h2M15 9h2M3.3 3.3l1.4 1.4M13.3 13.3l1.4 1.4M3.3 14.7l1.4-1.4M13.3 4.7l1.4-1.4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            className="header-btn menu-btn"
            onClick={() => {
              soundService.playButtonClick();
              setShowTableMenu(true);
            }}
            title="Menu"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="4" r="1.5" fill="currentColor" />
              <circle cx="9" cy="9" r="1.5" fill="currentColor" />
              <circle cx="9" cy="14" r="1.5" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          TABLE AREA
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="table-container">
        <div className="table-scaler">
          {/* Table Felt */}
          <div className="table-felt">
            <div className="table-rail">
              <div className="table-surface">
                {/* Pot Display — click to toggle chips/BB */}
                <div className="pot-area">
                  <PotDisplay
                    mainPot={tableState.pot}
                    sidePots={tableState.sidePots}
                    bigBlind={parseFloat(tableState.blinds.split('/')[1]) || 0}
                    displayMode={potDisplayMode}
                    onToggleDisplayMode={handleTogglePotDisplay}
                  />
                </div>

                {/* Community Cards */}
                <div className="community-area" key={`board-${boardStageKey}`}>
                  <CommunityCards
                    cards={tableState.communityCards}
                    stage={tableState.boardStage}
                    highlightedIndices={winnerInfo.cardIndices}
                    winningHandName={winnerInfo.handName}
                  />
                </div>

                {/* Spectator Badge — moved out of center clutter */}
                {presence?.observers && presence.observers.length > 0 && (
                  <div className="spectator-area">
                    <SpectatorBadge observers={presence.observers} />
                  </div>
                )}

                {/* Spin Multiplier Badge */}
                {tableState.isTournament &&
                  tableState.spinMultiplier &&
                  tableState.spinMultiplier > 1 && (
                    <div
                      className={`spinMultiplierBadge ${tableState.spinMultiplier >= 100 ? 'premium' : ''}`}
                    >
                      <span className="spinMultiplierIcon">🎰</span>
                      <span className="spinMultiplierValue">{tableState.spinMultiplier}x</span>
                    </div>
                  )}

                {/* Hand Strength Indicator - Shows during hero's turn */}
                {tableState.isHandInProgress &&
                  tableState.players[tableState.heroSeat - 1]?.holeCards &&
                  tableState.players[tableState.heroSeat - 1]!.holeCards!.length >= 2 && (
                    <div className="hand-strength-hud">
                      <HandStrengthIndicator
                        cards={tableState.players[tableState.heroSeat - 1]!.holeCards!.map(
                          (c: Card) => `${c.rank}${c.suit}`
                        )}
                        communityCards={tableState.communityCards.map(
                          (c: Card) => `${c.rank}${c.suit}`
                        )}
                        size="sm"
                      />
                    </div>
                  )}

                {/* Session Timer */}
                <SessionTimer
                  breakInterval={60}
                  onBreakSuggested={() => console.log('Break suggested')}
                />
              </div>
            </div>
          </div>

          {/* Player Seats */}
          {seatPositions.map((pos, idx) => {
            const seatNumber = idx + 1;
            const player = getPlayerAtSeat(seatNumber);

            return (
              <div
                key={seatNumber}
                className="seat-wrapper"
                style={{
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                }}
              >
                <SeatSlot
                  seatNumber={seatNumber}
                  player={player || null}
                  position={tableState.positions[idx] || null}
                  isActive={seatNumber === tableState.currentPlayerSeat}
                  lastAction={tableState.lastActions[idx] || null}
                  timerProgress={
                    seatNumber === tableState.currentPlayerSeat
                      ? (actionTimeRemaining / 15) * 100
                      : undefined
                  }
                  bigBlind={parseFloat(tableState.blinds.split('/')[1]) || 2}
                  isTournament={tableState.isTournament}
                  bountyValue={
                    tableState.isBountyTournament && player
                      ? tableState.bountyMap[player.id]
                      : undefined
                  }
                  isWinner={player ? winnerInfo.playerIds.includes(player.id) : false}
                  winningHandName={
                    player && winnerInfo.playerIds.includes(player.id)
                      ? winnerInfo.handName
                      : undefined
                  }
                  hudStats={player && !player.isHero ? getPlayerHUDStats(player.id) : null}
                  showHUD={userSettings.showHUD && !!player && !player.isHero}
                  onSit={() => handleSeatClick(seatNumber)}
                  onAvatarClick={() => {
                    // Open throwable selector targeting this seat
                    setThrowTargetSeat(seatNumber);
                    setShowThrowableSelector(true);
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          BOTTOM CONTROLS + ACTION PANEL
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="action-panel-wrapper">
        {/* Spectator Mode - Show when user is not seated */}
        {!tableState.players[tableState.heroSeat - 1] ? (
          <div className="spectator-mode">
            <span className="spectator-mode__icon">👁</span>
            <span className="spectator-mode__text">
              {tableState.isTournament ? 'Observing tournament' : 'Click a seat to join'}
            </span>
          </div>
        ) : (
          <>
            {/* ─── CONTROL STRIP — Clean icon row above action buttons ─── */}
            {tableState.isHandInProgress && (
              <div className="control-strip">
                {/* Straddle Toggle */}
                <button
                  className="control-strip__btn"
                  title="Straddle"
                  onClick={() => {
                    /* toggle straddle */
                  }}
                >
                  <span className="control-strip__icon">STR</span>
                </button>

                {/* Time Bank */}
                <button className="control-strip__btn" title="Time Bank">
                  <span className="control-strip__icon">⏱</span>
                  <span className="control-strip__count">3</span>
                </button>

                {/* Timer Display */}
                {tableState.currentPlayerSeat === tableState.heroSeat && (
                  <div className="control-strip__timer">
                    <span className="control-strip__timer-val">{actionTimeRemaining}s</span>
                  </div>
                )}

                {/* Spacer */}
                <div className="control-strip__spacer" />

                {/* Rabbit Hunt */}
                <button className="control-strip__btn" title="Rabbit Hunt">
                  <span className="control-strip__icon">🐰</span>
                </button>

                {/* Chat Toggle */}
                <button
                  className={`control-strip__btn ${isChatMuted ? 'control-strip__btn--muted' : ''}`}
                  title="Chat"
                  onClick={() => setIsChatCollapsed(!isChatCollapsed)}
                >
                  <span className="control-strip__icon">💬</span>
                </button>
              </div>
            )}

            {/* ─── ACTION PANEL — PokerBros 3-button layout ─── */}
            {tableState.currentPlayerSeat === tableState.heroSeat && tableState.isHandInProgress
              ? (() => {
                  const handState = handControllerRef.current?.getState();
                  const currentBet = handState?.currentBet || 0;
                  const myEngineBet =
                    handState?.players.find((p) => p.user_id === userId)?.bet || 0;
                  const callAmount = Math.max(0, currentBet - myEngineBet);
                  const heroStack = getPlayerAtSeat(tableState.heroSeat)?.stack || 0;
                  const bb = parseFloat(tableState.blinds.split('/')[1]) || 2;
                  const minRaise = Math.max(bb, currentBet > 0 ? currentBet * 2 : bb * 2);

                  return (
                    <ActionPanel
                      canFold={true}
                      canCheck={callAmount === 0}
                      canCall={callAmount > 0}
                      canRaise={heroStack > minRaise}
                      canAllIn={heroStack > 0}
                      callAmount={callAmount}
                      minRaise={minRaise}
                      maxRaise={heroStack}
                      pot={tableState.pot}
                      bigBlind={bb}
                      onAction={handleActionPanelAction}
                      isMyTurn={true}
                    />
                  );
                })()
              : null}

            {/* ─── PRE-ACTION BAR — Show when not hero's turn ─── */}
            {tableState.isHandInProgress &&
              tableState.currentPlayerSeat !== tableState.heroSeat && (
                <PreActionBar
                  canCheck={(() => {
                    const handState = handControllerRef.current?.getState();
                    const currentBet = handState?.currentBet || 0;
                    const myEngineBet =
                      handState?.players.find((p) => p.user_id === userId)?.bet || 0;
                    return Math.max(0, currentBet - myEngineBet) === 0;
                  })()}
                  isMyTurn={false}
                  preAction={preAction}
                  onPreActionChange={setPreAction}
                />
              )}
          </>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          SIDE MENU (Slide-in)
          ═══════════════════════════════════════════════════════════════════════ */}
      {isSideMenuOpen && (
        <>
          <div className="menu-overlay" onClick={toggleSideMenu} />
          <nav className="side-menu">
            <button className="menu-item" onClick={() => navigate('/cashier')}>
              <span className="menu-item-icon">◉</span>
              <span className="menu-item-label">Cashier</span>
              <span className="menu-item-arrow">›</span>
            </button>
            <button
              className="menu-item"
              onClick={() => {
                setShowBuyInModal(true);
                setIsSideMenuOpen(false);
              }}
            >
              <span className="menu-item-icon">+</span>
              <span className="menu-item-label">Top Up</span>
              <span className="menu-item-arrow">›</span>
            </button>
            <button
              className="menu-item"
              onClick={() => {
                setShowGameRules(true);
                setIsSideMenuOpen(false);
              }}
            >
              <span className="menu-item-icon">☰</span>
              <span className="menu-item-label">Table Rules</span>
              <span className="menu-item-arrow">›</span>
            </button>
            <button className="menu-item">
              <span className="menu-item-icon">♪</span>
              <span className="menu-item-label">Sounds</span>
              <span className="menu-item-arrow">›</span>
            </button>
            <button className="menu-item">
              <span className="menu-item-icon">⋆</span>
              <span className="menu-item-label">Vibrations</span>
              <span className="menu-item-toggle on">ON</span>
            </button>
            <button className="menu-item" onClick={() => setIsChatMuted(!isChatMuted)}>
              <span className="menu-item-icon">💬</span>
              <span className="menu-item-label">Chat</span>
              <span className={`menu-item-toggle ${isChatMuted ? '' : 'on'}`}>
                {isChatMuted ? 'MUTED' : 'ON'}
              </span>
            </button>
            <button className="menu-item">
              <span className="menu-item-icon">↗</span>
              <span className="menu-item-label">Share</span>
              <span className="menu-item-arrow">›</span>
            </button>
            <button className="menu-item">
              <span className="menu-item-icon">★</span>
              <span className="menu-item-label">VIP</span>
              <span className="menu-item-arrow">›</span>
            </button>
            <button
              className="menu-item"
              onClick={() => {
                setShowPlayerNotes(true);
                setIsSideMenuOpen(false);
              }}
            >
              <span className="menu-item-icon">✎</span>
              <span className="menu-item-label">Player Notes</span>
              <span className="menu-item-arrow">›</span>
            </button>
            <button
              className="menu-item"
              onClick={() => {
                setShowHandReplay(true);
                setIsSideMenuOpen(false);
              }}
            >
              <span className="menu-item-icon">♠</span>
              <span className="menu-item-label">Hand History</span>
              <span className="menu-item-arrow">›</span>
            </button>
            <button
              className="menu-item"
              onClick={() => {
                setShowSitOut(true);
                setIsSideMenuOpen(false);
              }}
            >
              <span className="menu-item-icon">⏸</span>
              <span className="menu-item-label">Sit Out</span>
              <span className="menu-item-arrow">›</span>
            </button>
            <button
              className="menu-item"
              onClick={() => {
                handleOpenWaitlist();
                setIsSideMenuOpen(false);
              }}
            >
              <span className="menu-item-icon">⌂</span>
              <span className="menu-item-label">Wait List</span>
              <span className="menu-item-arrow">›</span>
            </button>
            <button
              className="menu-item exit"
              onClick={() => {
                setIsSideMenuOpen(false);
                handleLeaveTable();
              }}
            >
              <span className="menu-item-icon">←</span>
              <span className="menu-item-label">Leave Table</span>
              <span className="menu-item-arrow">›</span>
            </button>
            <div className="menu-footer">Version: 1.0.0 (Club Arena)</div>
          </nav>
        </>
      )}

      {/* Observing Mode Indicator (when not seated) */}
      {!tableState.players.some((p) => p?.isHero) && (
        <div className="observing-indicator">
          <span className="eye-icon">◉</span>
          <span>Observing</span>
        </div>
      )}

      {/* Table Chat */}
      <TableChat
        messages={chatMessages}
        onSendMessage={handleSendChatMessage}
        myPlayerId={userId}
        isCollapsed={isChatCollapsed}
        onToggleCollapse={() => setIsChatCollapsed(!isChatCollapsed)}
        placeholder="Say something..."
        isMuted={isChatMuted}
      />

      {/* Player Notes Modal */}
      {showPlayerNotes && (
        <div className="player-notes-overlay" onClick={() => setShowPlayerNotes(false)}>
          <div className="player-notes-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowPlayerNotes(false)}>
              ✕
            </button>
            <PlayerNotesPanel
              targetUserId={selectedPlayerForNotes?.id}
              targetName={selectedPlayerForNotes?.name}
              onClose={() => setShowPlayerNotes(false)}
            />
          </div>
        </div>
      )}

      {/* Hand Replay Modal */}
      {showHandReplay && (
        <div className="player-notes-overlay" onClick={() => setShowHandReplay(false)}>
          <div
            className="player-notes-modal hand-replay-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-close" onClick={() => setShowHandReplay(false)}>
              ✕
            </button>
            {lastHandId ? (
              <HandReplay handId={lastHandId} onClose={() => setShowHandReplay(false)} />
            ) : (
              <div className="no-hand-history">
                <span className="empty-icon">♠</span>
                <p>No recent hand to replay</p>
                <p className="hint">Complete a hand to view its replay</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Game Rules Modal */}
      <GameRulesModal
        isOpen={showGameRules}
        onClose={() => setShowGameRules(false)}
        variant="No Limit Hold'em"
        stakes="1/2"
        minBuyIn={(() => {
          const bb = parseFloat(tableState.blinds.split('/')[1]) || 2;
          return bb * 40;
        })()}
        maxBuyIn={(() => {
          const bb = parseFloat(tableState.blinds.split('/')[1]) || 2;
          return bb * 100;
        })()}
        rakePercentage={5}
        rakeCap={3}
        isStraddleEnabled={true}
        isRunItTwiceEnabled={true}
      />

      {/* Chip Animations */}
      <ChipAnimationManager
        animations={chipAnimations}
        onAnimationComplete={handleAnimationComplete}
      />

      {/* Sit Out Modal */}
      <SitOutModal
        isOpen={showSitOut}
        onClose={() => setShowSitOut(false)}
        onReturn={() => setShowSitOut(false)}
        onLeaveTable={() => navigate('/')}
        timeRemaining={sitOutTimeRemaining}
        maxSitOutTime={300}
        tableName={tableState.tableName}
      />

      {/* Wait List Modal */}
      <WaitListModal
        isOpen={showWaitList}
        onClose={() => setShowWaitList(false)}
        tableName={tableState.tableName}
        blinds={tableState.blinds}
        players={waitListPlayers}
        myPlayerId={userId}
        onLeaveWaitList={() => setShowWaitList(false)}
      />

      {/* Insurance Modal */}
      {insuranceOffer && (
        <InsuranceModal
          isOpen={showInsurance}
          onClose={() => setShowInsurance(false)}
          onAccept={handleInsuranceAccept}
          onDecline={handleInsuranceDecline}
          offer={insuranceOffer}
          timeRemaining={15}
        />
      )}

      {/* Run It Twice Prompt */}
      <RunItTwicePrompt
        isOpen={showRIT}
        onAccept={handleRITAccept}
        onDecline={handleRITDecline}
        timeRemaining={ritTimer}
        opponentName={ritOpponent}
      />

      {/* Bad Beat Jackpot Display */}
      <BadBeatJackpot amount={bbjAmount} qualifyingHand="Quad 8s or better" isHit={showBBJ} />

      {/* Throwable Selector */}
      {showThrowableSelector && userId && (
        <div className="throwable-selector-overlay" onClick={() => setShowThrowableSelector(false)}>
          <ThrowableSelector
            userId={userId}
            onSelect={handleThrowableSelect}
            onClose={() => setShowThrowableSelector(false)}
          />
        </div>
      )}

      {/* Throw Animations */}
      <ThrowAnimationContainer
        events={activeThrows}
        seatPositions={getSeatPositions()}
        onEventComplete={handleThrowComplete}
      />

      {/* Win Confetti — disabled (cheesy and annoying on repeated wins) */}
      {/* <ConfettiCanvas active={showConfetti} duration={3500} count={55} onComplete={() => setShowConfetti(false)} /> */}

      {/* Tip Dealer Modal */}
      <TipDealer
        isOpen={showTipDealer}
        onClose={() => setShowTipDealer(false)}
        onTip={handleTipDealer}
        balance={tableState.players[tableState.heroSeat - 1]?.stack || 0}
      />

      {/* Straddle Toggle (UTG only, cash games only) */}
      {!tableState.isTournament && (
        <StraddleToggle
          isEnabled={isStraddleEnabled}
          onToggle={(v) => startTransition(() => setIsStraddleEnabled(v))}
          amount={straddleAmount}
          isAvailable={isStraddleAvailable}
        />
      )}

      {/* Time Bank */}
      <TimeBank
        isVisible={showTimeBank}
        isActive={timeBankActive}
        banksRemaining={timeBanksRemaining}
        totalTime={30}
        timeRemaining={timeBankTimeRemaining}
        onActivate={handleActivateTimeBank}
      />

      {/* Leave Table Notice (non-blocking replacement for alert()) */}
      {leaveNotice && (
        <div
          style={{
            position: 'fixed',
            bottom: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#1a1a2e',
            border: '1px solid #e74c3c',
            borderRadius: 8,
            padding: '12px 20px',
            color: '#fff',
            fontSize: 14,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            maxWidth: '90vw',
          }}
        >
          <span>{leaveNotice}</span>
          <button
            onClick={() => setLeaveNotice(null)}
            style={{
              background: '#e74c3c',
              border: 'none',
              color: '#fff',
              borderRadius: 4,
              padding: '4px 12px',
              cursor: 'pointer',
            }}
          >
            OK
          </button>
        </div>
      )}

      {/* Cashier Modal */}
      <CashierModal
        isOpen={showCashier}
        onClose={() => setShowCashier(false)}
        onAddChips={handleAddChips}
        onWithdrawChips={handleWithdrawChips}
        currentStack={tableState.players[tableState.heroSeat - 1]?.stack || 0}
        accountBalance={accountBalance}
        minBuyIn={(() => {
          const bb = parseFloat(tableState.blinds.split('/')[1]) || 2;
          return bb * 40;
        })()}
        maxBuyIn={(() => {
          const bb = parseFloat(tableState.blinds.split('/')[1]) || 2;
          return bb * 100;
        })()}
        maxStack={(() => {
          const bb = parseFloat(tableState.blinds.split('/')[1]) || 2;
          return bb * 200;
        })()}
      />

      {/* Buy-In Modal */}
      <BuyInModal
        isOpen={showBuyInModal}
        onClose={() => setShowBuyInModal(false)}
        onConfirm={async (amount, autoRebuy) => {
          // Debounce protection: prevent double-click
          if (buyInProcessingRef.current) return;
          buyInProcessingRef.current = true;
          try {
            // DEBUG: Log all buy-in conditions
            console.log('[BuyIn] onConfirm called:', {
              amount,
              autoRebuy,
              tableId,
              userId,
              selectedSeat,
              isGuest: userId === 'guest',
              tableIdMatch: tableId?.match(/^[0-9a-f-]{36}$/i) ? 'UUID' : 'NOT-UUID',
            });

            // Demo mode bypass - skip wallet RPC for demo tables
            const isDemoTable = tableId === 'demo' || !tableId?.match(/^[0-9a-f-]{36}$/i);

            console.log('[BuyIn] isDemoTable:', isDemoTable);
            console.log(
              '[BuyIn] Will attempt real buy-in:',
              !isDemoTable && !!(userId && userId !== 'guest' && tableId && selectedSeat)
            );

            if (isDemoTable) {
              // Directly set chips for demo mode
              setAccountBalance(amount);
              const newPlayers = [...tableState.players];
              if (selectedSeat && selectedSeat > 0 && selectedSeat <= newPlayers.length) {
                newPlayers[selectedSeat - 1] = {
                  id: userId || 'demo-player',
                  name: username || 'You',
                  avatar: '',
                  stack: amount,
                  status: 'active',
                  isHero: true,
                  showCards: false,
                };
                setTableState((prev) => ({ ...prev, players: newPlayers, heroSeat: selectedSeat }));
              }
            } else if (userId && userId !== 'guest' && tableId && selectedSeat) {
              try {
                console.log('[BuyIn] Calling WalletService.lockForBuyIn:', {
                  userId,
                  tableId,
                  amount,
                });
                // Lock chips in escrow for table buy-in
                await WalletService.lockForBuyIn(userId, tableId, amount);
                console.log('[BuyIn] lockForBuyIn SUCCESS');

                // ─── Clear any stale seat record, then INSERT into table_seats ───
                // Stale records (left_at IS NOT NULL) can block due to unique constraint
                await supabase
                  .from('table_seats')
                  .delete()
                  .eq('table_id', tableId)
                  .eq('seat_number', selectedSeat)
                  .not('left_at', 'is', null);

                const { error: seatError } = await supabase.from('table_seats').insert({
                  table_id: tableId,
                  seat_number: selectedSeat,
                  user_id: userId,
                  stack: amount,
                  status: 'active',
                  auto_rebuy: autoRebuy || false,
                });

                if (seatError) {
                  console.error('[BuyIn] table_seats insert FAILED:', seatError);
                  // NOTE: Do NOT refund here — the catch block handles refund
                  throw new Error('Failed to seat: ' + seatError.message);
                }
                console.log('[BuyIn] table_seats INSERT success, seat:', selectedSeat);

                // Update current_players count on the table
                const { data: tableData } = await supabase
                  .from('tables')
                  .select('current_players')
                  .eq('id', tableId)
                  .maybeSingle();
                await supabase
                  .from('tables')
                  .update({ current_players: (tableData?.current_players || 0) + 1 })
                  .eq('id', tableId);

                setAccountBalance((prev) => Math.max(0, prev - amount));

                // Add player to local table state
                const newPlayers = [...tableState.players];
                newPlayers[selectedSeat - 1] = {
                  id: userId,
                  name: username || 'Player',
                  avatar: '',
                  stack: amount,
                  status: 'active',
                  isHero: true,
                  showCards: false,
                };
                setTableState((prev) => ({ ...prev, players: newPlayers, heroSeat: selectedSeat }));

                // Notify Hydra service that a real player joined (triggers horse recede)
                HydraService.onRealPlayerJoined(tableId, userId);

                // Broadcast seat update to other clients
                await sendAction('player_seated', {
                  seat: selectedSeat,
                  userId,
                  stack: amount,
                  autoRebuy,
                });

                // Player seated successfully
              } catch (error) {
                console.error('[BuyIn] Buy-in FAILED:', error);
                // Attempt to refund locked chips
                try {
                  await WalletService.unlockFromTable(userId, tableId, amount);
                  setAccountBalance((prev) => prev + amount);
                  console.log('[BuyIn] Refunded chips after failed buy-in');
                } catch (refundErr) {
                  console.error('[BuyIn] CRITICAL — refund also failed:', refundErr);
                }
                toast.error('Buy-in failed. Your chips have been refunded.');
              }
            } else {
              console.error('[BuyIn] FELL THROUGH - no branch matched:', {
                isDemoTable,
                userId,
                isGuest: userId === 'guest',
                tableId,
                selectedSeat,
              });
            }
            setShowBuyInModal(false);
          } finally {
            buyInProcessingRef.current = false;
          }
        }}
        tableName={tableState.tableName}
        minBuyIn={(() => {
          const bb = parseFloat(tableState.blinds.split('/')[1]) || 2;
          return bb * 40;
        })()}
        maxBuyIn={(() => {
          const bb = parseFloat(tableState.blinds.split('/')[1]) || 2;
          return bb * 100;
        })()}
        accountBalance={
          tableId === 'demo' || !tableId?.match(/^[0-9a-f-]{36}$/i) ? 10000 : accountBalance
        }
        bigBlind={parseFloat(tableState.blinds.split('/')[1]) || 2}
      />

      {/* Rabbit Hunt (post-hand card reveal) */}
      <RabbitHunt
        isAvailable={isRabbitAvailable}
        onReveal={handleRabbitReveal}
        currentBoard={currentBoard}
      />

      {/* Leaderboard Panel */}
      <LeaderboardPanel
        isOpen={showLeaderboard}
        onClose={() => setShowLeaderboard(false)}
        title="Session Leaderboard"
        players={leaderboardPlayers}
        period={leaderboardPeriod}
        onPeriodChange={setLeaderboardPeriod}
      />

      {/* Table Menu */}
      <TableMenu
        isOpen={showTableMenu}
        onClose={() => setShowTableMenu(false)}
        onToggle={() => setShowTableMenu(!showTableMenu)}
        sections={[
          {
            title: 'Quick Actions',
            actions: [
              { id: 'sitout', label: 'Sit Out', icon: '', onClick: () => {} },
              ...(tableState.isTournament
                ? [
                    { id: 'rebuy', label: 'Rebuy', icon: '', onClick: handleTournamentRebuy },
                    { id: 'addon', label: 'Add-On', icon: '', onClick: handleTournamentAddOn },
                  ]
                : [
                    {
                      id: 'rebuy',
                      label: 'Add Chips',
                      icon: '',
                      onClick: () => setShowCashier(true),
                    },
                  ]),
            ],
          },
          {
            title: 'Table Info',
            actions: [
              {
                id: 'leaderboard',
                label: 'Leaderboard',
                icon: '',
                onClick: () => setShowLeaderboard(true),
              },
              { id: 'settings', label: 'Settings', icon: '', onClick: () => setShowSettings(true) },
            ],
          },
          {
            actions: [
              {
                id: 'leave',
                label: 'Leave Table',
                icon: '',
                onClick: handleLeaveTable,
                danger: true,
              },
            ],
          },
        ]}
        tableName={tableState.tableName}
      />

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={{
          autoMuckLosers: true,
          autoMuckWinners: false,
          autoPostBlinds: true,
          soundEnabled: isSoundEnabled,
          soundVolume: 70,
          showHandStrength: true,
          showPotOdds: false,
          animationSpeed: 'normal',
          fourColorDeck: false,
          showStackInBB: false,
          showBetSizePresets: true,
          confirmAllIn: true,
          sitOutNextHand: false,
        }}
        onSettingsChange={(settings) => {
          if (settings.soundEnabled !== undefined) {
            setIsSoundEnabled(settings.soundEnabled);
          }
        }}
      />

      {/* Share Hand */}
      {showShareHand && sharedHandData && (
        <ShareHand
          isOpen={showShareHand}
          onClose={() => setShowShareHand(false)}
          hand={sharedHandData}
        />
      )}

      {/* Tournament Add-On Period Modal */}
      {tableState.isTournament && addOnPeriod.active && (
        <AddOnModal
          isVisible={addOnPeriod.active}
          addOnCost={addOnPeriod.addOnCost}
          addOnChips={addOnPeriod.addOnChips}
          walletBalance={addOnPeriod.walletBalance}
          timeRemaining={addOnPeriod.timeRemaining}
          onAccept={async () => {
            if (!tableState.tournamentId || !userId || rebuyProcessing) return;
            setRebuyProcessing(true);
            try {
              await tournamentService.processAddOn(tableState.tournamentId, userId);
              toast?.success('Add-on accepted — chips added to your stack');
              setAddOnPeriod((prev) => ({ ...prev, active: false }));
            } catch (err: any) {
              toast?.error(err.message || 'Add-on failed');
            } finally {
              setRebuyProcessing(false);
            }
          }}
          onDecline={() => {
            setAddOnPeriod((prev) => ({ ...prev, active: false }));
          }}
        />
      )}

      {/* Tournament Rebuy Modal */}
      {rebuyData && (
        <RebuyModal
          isOpen={showRebuyModal}
          rebuyCost={rebuyData.cost}
          rebuyChips={rebuyData.chips}
          walletBalance={accountBalance || 0}
          onConfirm={async () => {
            if (!tableState.tournamentId || !userId) return;
            setRebuyProcessing(true);
            try {
              await tournamentService.processRebuy(tableState.tournamentId, userId);
              toast?.success('Rebuy successful — chips added to your stack');
              setShowRebuyModal(false);
            } catch (err: any) {
              toast?.error(err.message || 'Rebuy failed');
            } finally {
              setRebuyProcessing(false);
            }
          }}
          onClose={() => setShowRebuyModal(false)}
          isProcessing={rebuyProcessing}
        />
      )}

      {/* Tournament Break Screen Overlay */}
      {tableState.isTournament && (
        <TournamentBreakScreen
          isVisible={tournamentBreak.active}
          breakTimeRemaining={tournamentBreak.timeRemaining}
          tournamentName={tableState.tableName}
          currentLevel={0}
          nextLevel={
            tournamentBreak.nextLevel || { level: 1, smallBlind: 0, bigBlind: 0, duration: 0 }
          }
          playersRemaining={tableState.players.filter(Boolean).length}
          totalPlayers={tableState.maxPlayers}
          averageStack={
            tableState.players.filter(Boolean).reduce((s, p) => s + (p?.stack || 0), 0) /
            Math.max(tableState.players.filter(Boolean).length, 1)
          }
          topPlayers={[]}
          prizePool={0}
        />
      )}

      {/* Tournament Announcement Overlay */}
      {tableState.isTournament && (
        <TournamentAnnouncementOverlay
          type={announcement?.type as any}
          data={announcement?.data}
          onDismiss={() => setAnnouncement(null)}
        />
      )}

      {/* Tournament Winner Overlay */}
      {tableState.isTournament && tournamentWinner && (
        <TournamentWinnerOverlay
          isWinner={true}
          prize={tournamentWinner.prize}
          tournamentName={tournamentWinner.name}
          onDismiss={() => setTournamentWinner(null)}
        />
      )}

      {/* Hand History Panel */}
      <HandHistoryPanel
        isOpen={showHandHistory}
        onClose={() => setShowHandHistory(false)}
        hands={handHistory}
        heroId={userId || ''}
      />

      {/* Session Summary Modal — shown when player leaves table */}
      {showSessionSummary && (
        <SessionSummary
          duration={Math.floor((Date.now() - sessionStartRef.current) / 1000)}
          handsPlayed={handsPlayedRef.current}
          profitLoss={sessionPLRef.current}
          biggestPot={biggestPotRef.current}
          peakStack={peakStackRef.current}
          onClose={() => {
            // #6: Reset all session tracking refs to prevent stale data on re-seat
            handsPlayedRef.current = 0;
            biggestPotRef.current = 0;
            peakStackRef.current = 0;
            sessionPLRef.current = 0;
            sessionStartRef.current = Date.now();
            setShowSessionSummary(false);

            // Notify system
            masterBus.emit('SESSION_SUMMARY_DISMISSED', { tableId: tableId ?? '' });

            navigate('/');
          }}
        />
      )}
    </div>
  );
}

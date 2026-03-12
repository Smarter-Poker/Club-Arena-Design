/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  useTableSidePanels — Modal & Side Panel Toggle State
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Extracted from TablePage.tsx.
 * Consolidates ~20 boolean toggles for all modals and side panels into a single
 * hook with named show/hide methods.
 */

import { useState, useCallback, useRef, useEffect, startTransition } from 'react';
import { workerTimeout, cancelWorkerTimeout } from './useTabKeepAlive';
import { WalletService } from '../services/WalletService';
import { BBJService } from '../services/BBJService';
import { supabase } from '../lib/supabase';
import { masterBus } from '../core/MasterBus';
import type { InsuranceOffer } from '../components/table/InsuranceModal';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface PlayerNotesTarget {
  id: string;
  name: string;
  seat: number;
}

export interface UseTableSidePanelsReturn {
  // Buy-In / Cashier
  showBuyInModal: boolean;
  setShowBuyInModal: React.Dispatch<React.SetStateAction<boolean>>;
  selectedSeat: number | null;
  setSelectedSeat: React.Dispatch<React.SetStateAction<number | null>>;
  showCashier: boolean;
  setShowCashier: React.Dispatch<React.SetStateAction<boolean>>;
  accountBalance: number;
  setAccountBalance: React.Dispatch<React.SetStateAction<number>>;

  // Sit Out
  showSitOut: boolean;
  setShowSitOut: React.Dispatch<React.SetStateAction<boolean>>;
  sitOutTimeRemaining: number;
  setSitOutTimeRemaining: React.Dispatch<React.SetStateAction<number>>;

  // Wait List
  showWaitList: boolean;
  setShowWaitList: React.Dispatch<React.SetStateAction<boolean>>;

  // Session Summary
  showSessionSummary: boolean;
  setShowSessionSummary: React.Dispatch<React.SetStateAction<boolean>>;

  // Player Notes
  showPlayerNotes: boolean;
  setShowPlayerNotes: React.Dispatch<React.SetStateAction<boolean>>;
  selectedPlayerForNotes: PlayerNotesTarget | null;
  setSelectedPlayerForNotes: React.Dispatch<React.SetStateAction<PlayerNotesTarget | null>>;

  // Hand History & Replay
  showHandReplay: boolean;
  setShowHandReplay: React.Dispatch<React.SetStateAction<boolean>>;
  lastHandId: string | null;
  setLastHandId: React.Dispatch<React.SetStateAction<string | null>>;

  // Game Rules
  showGameRules: boolean;
  setShowGameRules: React.Dispatch<React.SetStateAction<boolean>>;

  // Insurance
  showInsurance: boolean;
  setShowInsurance: React.Dispatch<React.SetStateAction<boolean>>;
  insuranceOffer: InsuranceOffer | null;
  setInsuranceOffer: React.Dispatch<React.SetStateAction<InsuranceOffer | null>>;

  // Run It Twice
  showRIT: boolean;
  setShowRIT: React.Dispatch<React.SetStateAction<boolean>>;
  ritTimer: number;
  setRitTimer: React.Dispatch<React.SetStateAction<number>>;
  ritOpponent: string;
  setRitOpponent: React.Dispatch<React.SetStateAction<string>>;

  // BBJ
  showBBJ: boolean;
  setShowBBJ: React.Dispatch<React.SetStateAction<boolean>>;
  bbjAmount: number;
  setBbjAmount: React.Dispatch<React.SetStateAction<number>>;

  // Tip Dealer
  showTipDealer: boolean;
  setShowTipDealer: React.Dispatch<React.SetStateAction<boolean>>;

  // Straddle
  isStraddleEnabled: boolean;
  setIsStraddleEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  straddleAmount: number;
  isStraddleAvailable: boolean;

  // Time Bank
  showTimeBank: boolean;
  setShowTimeBank: React.Dispatch<React.SetStateAction<boolean>>;
  timeBankActive: boolean;
  setTimeBankActive: React.Dispatch<React.SetStateAction<boolean>>;
  timeBanksRemaining: number;
  setTimeBanksRemaining: React.Dispatch<React.SetStateAction<number>>;
  timeBankTimeRemaining: number;
  setTimeBankTimeRemaining: React.Dispatch<React.SetStateAction<number>>;

  // Rabbit Hunt
  isRabbitAvailable: boolean;
  setIsRabbitAvailable: React.Dispatch<React.SetStateAction<boolean>>;

  // Side Menu
  isSideMenuOpen: boolean;
  setIsSideMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;

  // Handlers
  handleActivateTimeBank: () => void;
  handleInsuranceAccept: (coverageAmount: number) => Promise<void>;
  handleInsuranceDecline: () => void;
  handleRITAccept: (sendAction: (type: string, data: any) => void, heroSeat: number) => void;
  handleRITDecline: (sendAction: (type: string, data: any) => void, heroSeat: number) => void;
  handleTipDealer: (amount: number) => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════════

export function useTableSidePanels(
  tableId: string | undefined,
  userId: string
): UseTableSidePanelsReturn {
  // Buy-In / Cashier
  const [showBuyInModal, setShowBuyInModal] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [showCashier, setShowCashier] = useState(false);
  const [accountBalance, setAccountBalance] = useState(0);

  // Sit Out
  const [showSitOut, setShowSitOut] = useState(false);
  const [sitOutTimeRemaining, setSitOutTimeRemaining] = useState(300);

  // Wait List
  const [showWaitList, setShowWaitList] = useState(false);

  // Session Summary
  const [showSessionSummary, setShowSessionSummary] = useState(false);

  // Player Notes
  const [showPlayerNotes, setShowPlayerNotes] = useState(false);
  const [selectedPlayerForNotes, setSelectedPlayerForNotes] = useState<PlayerNotesTarget | null>(
    null
  );

  // Hand History & Replay
  const [showHandReplay, setShowHandReplay] = useState(false);
  const [lastHandId, setLastHandId] = useState<string | null>(null);

  // Game Rules
  const [showGameRules, setShowGameRules] = useState(false);

  // Insurance
  const [showInsurance, setShowInsurance] = useState(false);
  const [insuranceOffer, setInsuranceOffer] = useState<InsuranceOffer | null>(null);

  // Run It Twice
  const [showRIT, setShowRIT] = useState(false);
  const [ritTimer, setRitTimer] = useState(10);
  const [ritOpponent, setRitOpponent] = useState('Opponent');

  // BBJ
  const [showBBJ, setShowBBJ] = useState(false);
  const [bbjAmount, setBbjAmount] = useState(0);

  // Tip Dealer
  const [showTipDealer, setShowTipDealer] = useState(false);

  // Straddle
  const [isStraddleEnabled, setIsStraddleEnabled] = useState(false);
  const [straddleAmount] = useState(4);
  const [isStraddleAvailable] = useState(true);

  // Time Bank
  const [showTimeBank, setShowTimeBank] = useState(false);
  const [timeBankActive, setTimeBankActive] = useState(false);
  const [timeBanksRemaining, setTimeBanksRemaining] = useState(3);
  const [timeBankTimeRemaining, setTimeBankTimeRemaining] = useState(0);

  // Rabbit Hunt
  const [isRabbitAvailable, setIsRabbitAvailable] = useState(false);

  // Side Menu
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);

  // Insurance auto-decline timeout
  const insuranceTimeoutRef = useRef<number | null>(null);
  useEffect(() => {
    if (showInsurance) {
      insuranceTimeoutRef.current = workerTimeout(() => {
        handleInsuranceDecline();
      }, 15000);
    } else {
      if (insuranceTimeoutRef.current !== null) {
        cancelWorkerTimeout(insuranceTimeoutRef.current);
        insuranceTimeoutRef.current = null;
      }
    }
    return () => {
      if (insuranceTimeoutRef.current !== null) {
        cancelWorkerTimeout(insuranceTimeoutRef.current);
        insuranceTimeoutRef.current = null;
      }
    };
  }, [showInsurance]);

  // Load BBJ pool data
  useEffect(() => {
    const loadBBJPool = async () => {
      if (!tableId) return;
      try {
        const { data: tableData } = await supabase
          .from('tables')
          .select('club_id')
          .eq('id', tableId)
          .maybeSingle();
        const actualClubId = tableData?.club_id || tableId;
        const pool = await BBJService.getPool({ clubId: actualClubId });
        if (pool) setBbjAmount(pool.main_balance);
      } catch (error) {
        console.error('Error loading BBJ pool:', error);
      }
    };
    loadBBJPool();
  }, [tableId]);

  // Handlers
  const handleActivateTimeBank = useCallback(() => {
    if (timeBanksRemaining > 0) {
      startTransition(() => {
        setTimeBankActive(true);
        setTimeBanksRemaining((prev) => prev - 1);
        setTimeBankTimeRemaining(30);
      });
    }
  }, [timeBanksRemaining]);

  const handleInsuranceAccept = useCallback(
    async (coverageAmount: number) => {
      if (userId && tableId) {
        try {
          const premium = coverageAmount * 0.1;
          await WalletService.processInsurance(userId, tableId, `hand-${Date.now()}`, premium);
        } catch (error) {
          console.error('Insurance processing failed:', error);
        }
      }
      setShowInsurance(false);
    },
    [userId, tableId]
  );

  const handleInsuranceDecline = useCallback(() => {
    setShowInsurance(false);
    if (ritOpponent !== 'Opponent') {
      setShowRIT(true);
    }
  }, [ritOpponent]);

  const handleRITAccept = useCallback(
    (sendAction: (type: string, data: any) => void, heroSeat: number) => {
      setShowRIT(false);
      sendAction('rit_accept', { seat: heroSeat });
    },
    []
  );

  const handleRITDecline = useCallback(
    (sendAction: (type: string, data: any) => void, heroSeat: number) => {
      setShowRIT(false);
      sendAction('rit_decline', { seat: heroSeat });
    },
    []
  );

  const handleTipDealer = useCallback(
    async (amount: number) => {
      if (userId && tableId) {
        try {
          await WalletService.processDealerTip(userId, tableId, amount);
        } catch (error) {
          console.error('Tip processing failed:', error);
        }
      }
      setShowTipDealer(false);
    },
    [userId, tableId]
  );

  return {
    showBuyInModal,
    setShowBuyInModal,
    selectedSeat,
    setSelectedSeat,
    showCashier,
    setShowCashier,
    accountBalance,
    setAccountBalance,
    showSitOut,
    setShowSitOut,
    sitOutTimeRemaining,
    setSitOutTimeRemaining,
    showWaitList,
    setShowWaitList,
    showSessionSummary,
    setShowSessionSummary,
    showPlayerNotes,
    setShowPlayerNotes,
    selectedPlayerForNotes,
    setSelectedPlayerForNotes,
    showHandReplay,
    setShowHandReplay,
    lastHandId,
    setLastHandId,
    showGameRules,
    setShowGameRules,
    showInsurance,
    setShowInsurance,
    insuranceOffer,
    setInsuranceOffer,
    showRIT,
    setShowRIT,
    ritTimer,
    setRitTimer,
    ritOpponent,
    setRitOpponent,
    showBBJ,
    setShowBBJ,
    bbjAmount,
    setBbjAmount,
    showTipDealer,
    setShowTipDealer,
    isStraddleEnabled,
    setIsStraddleEnabled,
    straddleAmount,
    isStraddleAvailable,
    showTimeBank,
    setShowTimeBank,
    timeBankActive,
    setTimeBankActive,
    timeBanksRemaining,
    setTimeBanksRemaining,
    timeBankTimeRemaining,
    setTimeBankTimeRemaining,
    isRabbitAvailable,
    setIsRabbitAvailable,
    isSideMenuOpen,
    setIsSideMenuOpen,
    handleActivateTimeBank,
    handleInsuranceAccept,
    handleInsuranceDecline,
    handleRITAccept,
    handleRITDecline,
    handleTipDealer,
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🎣 USE POKER — Poker-Specific Custom Hooks
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// TIMER HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Countdown timer hook
 */
export function useCountdown(initialSeconds: number, autoStart = true) {
    const [seconds, setSeconds] = useState(initialSeconds);
    const [isRunning, setIsRunning] = useState(autoStart);
    const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

    useEffect(() => {
        if (isRunning && seconds > 0) {
            intervalRef.current = setInterval(() => {
                setSeconds((s) => {
                    if (s <= 1) {
                        setIsRunning(false);
                        return 0;
                    }
                    return s - 1;
                });
            }, 1000);
        }
        return () => clearInterval(intervalRef.current);
    }, [isRunning, seconds]);

    const start = useCallback(() => setIsRunning(true), []);
    const pause = useCallback(() => setIsRunning(false), []);
    const reset = useCallback((newSeconds?: number) => {
        setSeconds(newSeconds ?? initialSeconds);
        setIsRunning(false);
    }, [initialSeconds]);

    return { seconds, isRunning, isExpired: seconds === 0, start, pause, reset };
}

/**
 * Tournament blind timer hook
 */
export function useBlindTimer(
    levels: Array<{ smallBlind: number; bigBlind: number; ante?: number; duration: number }>,
    autoStart = false
) {
    const [currentLevelIndex, setCurrentLevelIndex] = useState(0);
    const [timeRemaining, setTimeRemaining] = useState(levels[0]?.duration || 0);
    const [isRunning, setIsRunning] = useState(autoStart);

    const currentLevel = levels[currentLevelIndex];
    const nextLevel = levels[currentLevelIndex + 1];

    useEffect(() => {
        if (!isRunning || timeRemaining <= 0) return;

        const interval = setInterval(() => {
            setTimeRemaining((t) => {
                if (t <= 1) {
                    // Move to next level
                    if (currentLevelIndex < levels.length - 1) {
                        setCurrentLevelIndex((i) => i + 1);
                        return levels[currentLevelIndex + 1]?.duration || 0;
                    }
                    setIsRunning(false);
                    return 0;
                }
                return t - 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [isRunning, timeRemaining, currentLevelIndex, levels]);

    const start = useCallback(() => setIsRunning(true), []);
    const pause = useCallback(() => setIsRunning(false), []);
    const skipLevel = useCallback(() => {
        if (currentLevelIndex < levels.length - 1) {
            setCurrentLevelIndex((i) => i + 1);
            setTimeRemaining(levels[currentLevelIndex + 1]?.duration || 0);
        }
    }, [currentLevelIndex, levels]);

    return {
        currentLevel,
        nextLevel,
        levelNumber: currentLevelIndex + 1,
        totalLevels: levels.length,
        timeRemaining,
        isRunning,
        start,
        pause,
        skipLevel,
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLAYER TURN HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Action timer for player turns
 */
export function useActionTimer(
    timeLimit: number,
    onTimeout?: () => void
) {
    const [timeLeft, setTimeLeft] = useState(timeLimit);
    const [isActive, setIsActive] = useState(false);
    const callbackRef = useRef(onTimeout);

    useEffect(() => {
        callbackRef.current = onTimeout;
    }, [onTimeout]);

    useEffect(() => {
        if (!isActive || timeLeft <= 0) return;

        const interval = setInterval(() => {
            setTimeLeft((t) => {
                if (t <= 1) {
                    setIsActive(false);
                    callbackRef.current?.();
                    return 0;
                }
                return t - 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [isActive, timeLeft]);

    const startTimer = useCallback(() => {
        setTimeLeft(timeLimit);
        setIsActive(true);
    }, [timeLimit]);

    const stopTimer = useCallback(() => {
        setIsActive(false);
    }, []);

    const addTime = useCallback((seconds: number) => {
        setTimeLeft((t) => t + seconds);
    }, []);

    return {
        timeLeft,
        isActive,
        progress: timeLeft / timeLimit,
        startTimer,
        stopTimer,
        addTime,
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHIP ANIMATION HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

interface ChipAnimation {
    id: string;
    from: { x: number; y: number };
    to: { x: number; y: number };
    amount: number;
}

/**
 * Chip movement animation state
 */
export function useChipAnimations() {
    const [animations, setAnimations] = useState<ChipAnimation[]>([]);

    const addAnimation = useCallback((animation: Omit<ChipAnimation, 'id'>) => {
        const id = `chip-${Date.now()}-${Math.random()}`;
        setAnimations((prev) => [...prev, { ...animation, id }]);

        // Auto-remove after animation
        setTimeout(() => {
            setAnimations((prev) => prev.filter((a) => a.id !== id));
        }, 600);
    }, []);

    const clearAnimations = useCallback(() => {
        setAnimations([]);
    }, []);

    return { animations, addAnimation, clearAnimations };
}

// ═══════════════════════════════════════════════════════════════════════════════
// POT CALCULATION HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate pot odds and equity
 */
export function usePotOdds(
    potSize: number,
    betToCall: number,
    estimatedEquity?: number
) {
    const potOdds = betToCall > 0 ? betToCall / (potSize + betToCall) : 0;
    const potOddsPercent = potOdds * 100;

    const impliedOdds = potSize > 0 ? (betToCall / potSize) * 100 : 0;

    const shouldCall = estimatedEquity !== undefined
        ? estimatedEquity > potOddsPercent
        : undefined;

    return {
        potOdds,
        potOddsPercent,
        impliedOdds,
        shouldCall,
        breakEvenEquity: potOddsPercent,
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HAND HISTORY HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

interface HandHistoryEntry {
    handId: string;
    timestamp: Date;
    players: string[];
    result: 'won' | 'lost' | 'split';
    amount: number;
    cards?: string[];
}

/**
 * Track hand history for current session
 */
export function useHandHistory(maxEntries = 50) {
    const [history, setHistory] = useState<HandHistoryEntry[]>([]);

    const addHand = useCallback((entry: Omit<HandHistoryEntry, 'timestamp'>) => {
        setHistory((prev) => {
            const newEntry = { ...entry, timestamp: new Date() };
            const updated = [newEntry, ...prev];
            return updated.slice(0, maxEntries);
        });
    }, [maxEntries]);

    const clearHistory = useCallback(() => {
        setHistory([]);
    }, []);

    const stats = {
        totalHands: history.length,
        handsWon: history.filter((h) => h.result === 'won').length,
        handsLost: history.filter((h) => h.result === 'lost').length,
        netProfit: history.reduce((sum, h) => {
            return sum + (h.result === 'won' ? h.amount : h.result === 'lost' ? -h.amount : 0);
        }, 0),
    };

    return { history, addHand, clearHistory, stats };
}

// ═══════════════════════════════════════════════════════════════════════════════
// BETTING HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Bet slider state management
 */
export function useBetSlider(options: {
    minBet: number;
    maxBet: number;
    bigBlind: number;
    potSize?: number;
}) {
    const { minBet, maxBet, bigBlind, potSize = 0 } = options;
    const [betAmount, setBetAmount] = useState(minBet);

    const increment = useCallback((amount: number) => {
        setBetAmount((prev) => Math.min(maxBet, prev + amount));
    }, [maxBet]);

    const decrement = useCallback((amount: number) => {
        setBetAmount((prev) => Math.max(minBet, prev - amount));
    }, [minBet]);

    const setPercentOfPot = useCallback((percent: number) => {
        const amount = Math.floor(potSize * (percent / 100));
        setBetAmount(Math.min(maxBet, Math.max(minBet, amount)));
    }, [potSize, minBet, maxBet]);

    const setBigBlinds = useCallback((bbs: number) => {
        const amount = bigBlind * bbs;
        setBetAmount(Math.min(maxBet, Math.max(minBet, amount)));
    }, [bigBlind, minBet, maxBet]);

    const presets = {
        half: () => setPercentOfPot(50),
        pot: () => setPercentOfPot(100),
        allIn: () => setBetAmount(maxBet),
        min: () => setBetAmount(minBet),
    };

    return {
        betAmount,
        setBetAmount,
        increment,
        decrement,
        setPercentOfPot,
        setBigBlinds,
        presets,
        inBigBlinds: betAmount / bigBlind,
        isAllIn: betAmount >= maxBet,
    };
}

export default useCountdown;

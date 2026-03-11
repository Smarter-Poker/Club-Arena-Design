import { useState, useEffect, useCallback } from 'react';
import { soundService } from '../services/SoundService';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * useTableTimer Hook
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Manages poker table action timer with countdown logic, auto-fold, and warnings.
 * Handles:
 * - Countdown interval management
 * - Auto-fold when timer reaches 0
 * - Timer urgency state (< 5 seconds)
 * - Progress percentage calculation
 * - Timer warning sounds
 * - Automatic cleanup on unmount
 */

export interface UseTableTimerProps {
    isHeroTurn: boolean;
    heroSeat: number;
    isSoundEnabled: boolean;
    onAutoFold: () => void;
    initialTime?: number;
}

export interface UseTableTimerReturn {
    timeRemaining: number;
    setTimeRemaining: (time: number) => void;
    resetTimer: (time?: number) => void;
    isUrgent: boolean;        // true when < 5 seconds
    timerProgress: number;    // 0-100 percentage
}

const DEFAULT_INITIAL_TIME = 15;
const URGENCY_THRESHOLD = 5; // seconds

export function useTableTimer({
    isHeroTurn,
    heroSeat,
    isSoundEnabled,
    onAutoFold,
    initialTime = DEFAULT_INITIAL_TIME,
}: UseTableTimerProps): UseTableTimerReturn {
    const [timeRemaining, setTimeRemaining] = useState(initialTime);
    const [isUrgent, setIsUrgent] = useState(false);

    // Calculate progress as percentage (0-100)
    const timerProgress = Math.max(0, Math.min(100, (timeRemaining / initialTime) * 100));

    // Reset timer to initial time or custom time
    const resetTimer = useCallback((newTime?: number) => {
        const time = newTime ?? initialTime;
        setTimeRemaining(time);
        setIsUrgent(false);
    }, [initialTime]);

    // Timer countdown with auto-fold on timeout
    useEffect(() => {
        if (!isHeroTurn) {
            setIsUrgent(false);
            return;
        }

        const interval = setInterval(() => {
            setTimeRemaining(prev => {
                if (prev <= 0) return 0;
                const newValue = prev - 1;

                // Auto-fold when timer expires
                if (newValue <= 0) {
                    onAutoFold();
                    return 0;
                }

                return newValue;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [isHeroTurn, onAutoFold]);

    // Manage urgency state and warning sound
    useEffect(() => {
        const isNowUrgent = isHeroTurn && timeRemaining <= URGENCY_THRESHOLD && timeRemaining > 0;
        setIsUrgent(isNowUrgent);

        if (isNowUrgent && isSoundEnabled) {
            soundService.startTimerWarning();
        } else {
            soundService.stopTimerWarning();
        }

        return () => {
            soundService.stopTimerWarning();
        };
    }, [isHeroTurn, timeRemaining, isSoundEnabled]);

    return {
        timeRemaining,
        setTimeRemaining,
        resetTimer,
        isUrgent,
        timerProgress,
    };
}

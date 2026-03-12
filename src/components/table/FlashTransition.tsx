/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  FLASH TRANSITION — Fast-Fold Table Wipe Animation
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Full-screen transition overlay when switching tables in fast-fold mode.
 * Plays a brief wipe animation to mask the table reassignment.
 *
 * Styles:
 *   - 'wipe'   — Horizontal wipe from left to right
 *   - 'fade'   — Quick fade to black and back
 *   - 'blur'   — Gaussian blur + zoom
 */

import React, { useState, useEffect, useRef } from 'react';
import './FlashTransition.css';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type TransitionStyle = 'wipe' | 'fade' | 'blur';

export interface FlashTransitionProps {
  /** Whether the transition is active */
  active: boolean;
  /** Visual style of the transition */
  style?: TransitionStyle;
  /** Duration in ms (default 400) */
  duration?: number;
  /** Called when transition completes */
  onComplete?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function FlashTransition({
  active,
  style = 'wipe',
  duration = 400,
  onComplete,
}: FlashTransitionProps) {
  const [phase, setPhase] = useState<'idle' | 'entering' | 'leaving'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (active) {
      setPhase('entering');

      // Halfway through — trigger the content swap
      timerRef.current = setTimeout(() => {
        setPhase('leaving');

        // Complete
        timerRef.current = setTimeout(() => {
          setPhase('idle');
          onComplete?.();
        }, duration / 2);
      }, duration / 2);
    } else {
      setPhase('idle');
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [active, duration, onComplete]);

  if (phase === 'idle') return null;

  return (
    <div
      className={`flash-transition flash-transition--${style} flash-transition--${phase}`}
      style={{
        animationDuration: `${duration / 2}ms`,
      }}
    />
  );
}

export default FlashTransition;

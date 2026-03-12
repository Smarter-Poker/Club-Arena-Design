/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  useTableKeyboard — Keyboard Shortcuts for Power Users
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Extracted from TablePage.tsx.
 * Binds keyboard shortcuts for fast play:
 *
 *  ACTION KEYS (only when it's hero's turn):
 *    F = Fold
 *    C = Call / Check
 *    R = Raise (focus bet input)
 *    A = All-in
 *    1-4 = Bet presets (1/3, 1/2, 3/4, pot)
 *
 *  TOGGLE KEYS (always active):
 *    M = Mute/unmute sound
 *    H = Toggle hand strength display
 *    S = Toggle stats HUD
 *    Escape = Close any open panel or modal
 */

import { useEffect, useCallback } from 'react';

export interface UseTableKeyboardOptions {
  isHeroTurn: boolean;
  isSpectator: boolean;
  isModalOpen: boolean;

  // Action callbacks
  onFold?: () => void;
  onCallCheck?: () => void;
  onRaise?: () => void;
  onAllIn?: () => void;
  onBetPreset?: (preset: number) => void; // 0=1/3, 1=1/2, 2=3/4, 3=pot

  // Toggle callbacks
  onToggleSound?: () => void;
  onToggleHandStrength?: () => void;
  onToggleStats?: () => void;
  onClosePanel?: () => void;
}

export function useTableKeyboard({
  isHeroTurn,
  isSpectator,
  isModalOpen,
  onFold,
  onCallCheck,
  onRaise,
  onAllIn,
  onBetPreset,
  onToggleSound,
  onToggleHandStrength,
  onToggleStats,
  onClosePanel,
}: UseTableKeyboardOptions): void {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      const key = e.key.toLowerCase();

      // ── Escape: always works ──
      if (key === 'escape') {
        e.preventDefault();
        onClosePanel?.();
        return;
      }

      // ── Toggle keys: always active (unless spectator) ──
      if (!isSpectator) {
        switch (key) {
          case 'm':
            e.preventDefault();
            onToggleSound?.();
            return;
          case 'h':
            e.preventDefault();
            onToggleHandStrength?.();
            return;
          case 's':
            if (!e.ctrlKey && !e.metaKey) {
              e.preventDefault();
              onToggleStats?.();
            }
            return;
        }
      }

      // ── Action keys: only when it's hero's turn ──
      if (isHeroTurn && !isSpectator && !isModalOpen) {
        switch (key) {
          case 'f':
            e.preventDefault();
            onFold?.();
            return;
          case 'c':
            e.preventDefault();
            onCallCheck?.();
            return;
          case 'r':
            e.preventDefault();
            onRaise?.();
            return;
          case 'a':
            e.preventDefault();
            onAllIn?.();
            return;
          case '1':
            e.preventDefault();
            onBetPreset?.(0); // 1/3 pot
            return;
          case '2':
            e.preventDefault();
            onBetPreset?.(1); // 1/2 pot
            return;
          case '3':
            e.preventDefault();
            onBetPreset?.(2); // 3/4 pot
            return;
          case '4':
            e.preventDefault();
            onBetPreset?.(3); // pot
            return;
        }
      }
    },
    [
      isHeroTurn,
      isSpectator,
      isModalOpen,
      onFold,
      onCallCheck,
      onRaise,
      onAllIn,
      onBetPreset,
      onToggleSound,
      onToggleHandStrength,
      onToggleStats,
      onClosePanel,
    ]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

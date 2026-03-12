/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ♠ useMessageDraft — Q3 Social Upgrade (Phase 2: Social Richness)
 * Auto-saves message drafts to localStorage per conversation.
 * Survives keyboard close, app backgrounding, and navigation.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, useRef } from 'react';

const DRAFT_PREFIX = 'club-arena-draft:';
const DEBOUNCE_MS = 300;

/**
 * Hook to persist message drafts per conversation
 * @param conversationId - Unique ID for the conversation (chat thread, club channel, etc.)
 * @returns [draft, setDraft, clearDraft]
 */
export function useMessageDraft(
  conversationId: string
): [string, (value: string) => void, () => void] {
  const storageKey = `${DRAFT_PREFIX}${conversationId}`;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize from localStorage
  const [draft, setDraftState] = useState<string>(() => {
    try {
      return localStorage.getItem(storageKey) || '';
    } catch {
      return '';
    }
  });

  // Re-load draft if conversationId changes
  useEffect(() => {
    try {
      const savedDraft = localStorage.getItem(storageKey) || '';
      setDraftState(savedDraft);
    } catch {
      setDraftState('');
    }
  }, [storageKey]);

  // Debounced save to localStorage
  const setDraft = useCallback(
    (value: string) => {
      setDraftState(value);

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        try {
          if (value.trim()) {
            localStorage.setItem(storageKey, value);
          } else {
            localStorage.removeItem(storageKey);
          }
        } catch {
          // localStorage quota exceeded — silently fail
        }
      }, DEBOUNCE_MS);
    },
    [storageKey]
  );

  // Clear draft (e.g., after message is sent)
  const clearDraft = useCallback(() => {
    setDraftState('');
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Silent
    }
  }, [storageKey]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return [draft, setDraft, clearDraft];
}

export default useMessageDraft;

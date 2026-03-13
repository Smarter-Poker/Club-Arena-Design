/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  usePrefetch — Hover-Intent Data Prefetching
 * ═══════════════════════════════════════════════════════════════════════════════
 * When users hover over navigation elements (club cards, table rows, etc.),
 * start loading the target page's data so it appears instantly on click.
 *
 * Uses a 150ms delay to avoid fetching on accidental mouse passes.
 *
 * @example
 * const { onMouseEnter, onMouseLeave } = usePrefetch(
 *     () => supabase.from('clubs').select('*').eq('id', clubId)
 * );
 * <div onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>...</div>
 */

import { useRef, useCallback } from 'react';

const prefetchCache = new Map<string, unknown>();

export function usePrefetch<T>(key: string, fetchFn: () => Promise<T>, delayMs: number = 150) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onMouseEnter = useCallback(() => {
    // Already cached? Skip
    if (prefetchCache.has(key)) return;

    timerRef.current = setTimeout(async () => {
      try {
        const data = await fetchFn();
        prefetchCache.set(key, data);
      } catch {
        // Prefetch failures are silent — user hasn't clicked yet
      }
    }, delayMs);
  }, [key, fetchFn, delayMs]);

  const onMouseLeave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return { onMouseEnter, onMouseLeave };
}

/**
 * Get prefetched data from cache (if available).
 */
export function getPrefetchedData<T>(key: string): T | undefined {
  return prefetchCache.get(key) as T | undefined;
}

/**
 * Clear a specific prefetch entry (e.g., after data changes).
 */
export function clearPrefetch(key: string): void {
  prefetchCache.delete(key);
}

export default usePrefetch;

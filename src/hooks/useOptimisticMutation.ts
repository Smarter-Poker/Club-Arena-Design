/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  useOptimisticMutation — Optimistic UI with automatic rollback
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Generic hook that immediately applies optimistic state, then syncs to
 * the backend. Rolls back state and shows toast on failure.
 *
 * Usage:
 *   const { mutate, isPending } = useOptimisticMutation({
 *     mutationFn: async (amount) => await addChips(userId, amount),
 *     onOptimistic: (amount) => setBalance(b => b + amount),
 *     onRollback: (amount) => setBalance(b => b - amount),
 *   });
 */

import { useState, useCallback, useRef } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface OptimisticMutationOptions<TInput, TResult> {
  /** The async function that performs the actual backend mutation */
  mutationFn: (input: TInput) => Promise<TResult>;
  /** Called immediately to apply optimistic state */
  onOptimistic: (input: TInput) => void;
  /** Called on failure to revert optimistic state */
  onRollback: (input: TInput, error: Error) => void;
  /** Optional success callback */
  onSuccess?: (result: TResult, input: TInput) => void;
  /** Optional error callback (called after rollback) */
  onError?: (error: Error, input: TInput) => void;
  /** Max concurrent mutations (default: 1) */
  maxConcurrent?: number;
}

export interface OptimisticMutationResult<TInput> {
  /** Trigger the mutation */
  mutate: (input: TInput) => Promise<void>;
  /** Whether a mutation is currently in flight */
  isPending: boolean;
  /** Number of in-flight mutations */
  pendingCount: number;
  /** Last error, if any */
  error: Error | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════════

export function useOptimisticMutation<TInput, TResult = unknown>(
  options: OptimisticMutationOptions<TInput, TResult>
): OptimisticMutationResult<TInput> {
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const mutate = useCallback(async (input: TInput) => {
    const opts = optionsRef.current;
    const maxConcurrent = opts.maxConcurrent ?? 1;

    // Throttle concurrent mutations
    if (pendingCount >= maxConcurrent) {
      console.warn('[OptimisticMutation] Max concurrent mutations reached, dropping');
      return;
    }

    // Apply optimistic state immediately
    try {
      opts.onOptimistic(input);
    } catch (err) {
      console.error('[OptimisticMutation] onOptimistic threw:', err);
    }

    setPendingCount((c) => c + 1);
    setError(null);

    try {
      const result = await opts.mutationFn(input);
      opts.onSuccess?.(result, input);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('[OptimisticMutation] Mutation failed, rolling back:', error);

      // Rollback optimistic state
      try {
        opts.onRollback(input, error);
      } catch (rollbackErr) {
        console.error('[OptimisticMutation] Rollback also failed:', rollbackErr);
      }

      setError(error);
      opts.onError?.(error, input);
    } finally {
      setPendingCount((c) => Math.max(0, c - 1));
    }
  }, [pendingCount]);

  return {
    mutate,
    isPending: pendingCount > 0,
    pendingCount,
    error,
  };
}

export default useOptimisticMutation;

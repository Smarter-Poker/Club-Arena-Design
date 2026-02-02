/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  SUPABASE SENTRY INTEGRATION
 * ═══════════════════════════════════════════════════════════════════════════════
 * Custom Sentry integration for monitoring Supabase database operations.
 * Tracks query performance, errors, and RLS policy violations.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import * as Sentry from '@sentry/react';

/**
 * Track a Supabase operation with Sentry
 */
export function trackSupabaseOperation<T>(
    table: string,
    operation: string,
    promise: Promise<T>
): Promise<T> {
    return Sentry.startSpan(
        {
            name: `Supabase ${operation}`,
            op: 'db.query',
            attributes: {
                'db.table': table,
                'db.operation': operation,
            },
        },
        async () => {
            try {
                const result = await promise;

                // Check for Supabase errors in the result
                if (result && typeof result === 'object' && 'error' in result) {
                    const error = (result as any).error;

                    if (error) {
                        // Capture Supabase errors
                        Sentry.captureException(error, {
                            tags: {
                                table,
                                operation,
                                error_code: error.code,
                            },
                            contexts: {
                                supabase: {
                                    table,
                                    operation,
                                    error_code: error.code,
                                    error_message: error.message,
                                    error_details: error.details,
                                    error_hint: error.hint,
                                },
                            },
                        });

                        // Check for RLS policy violations
                        if (error.code === 'PGRST301' || error.code === '42501') {
                            Sentry.captureMessage(`RLS Policy Violation: ${table}`, {
                                level: 'warning',
                                tags: {
                                    table,
                                    error_type: 'rls_policy_violation',
                                },
                            });
                        }
                    }
                }

                return result;
            } catch (error) {
                // Capture unexpected errors
                Sentry.captureException(error, {
                    tags: {
                        table,
                        operation,
                    },
                });
                throw error;
            }
        }
    );
}

/**
 * Helper to wrap Supabase queries with Sentry tracking
 * 
 * Usage:
 * const { data, error } = await trackSupabaseQuery(
 *   'clubs',
 *   'select',
 *   supabase.from('clubs').select('*')
 * );
 */
export async function trackSupabaseQuery<T>(
    table: string,
    operation: string,
    query: PromiseLike<T>
): Promise<T> {
    return trackSupabaseOperation(table, operation, Promise.resolve(query));
}

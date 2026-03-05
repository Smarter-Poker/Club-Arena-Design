/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CLUB ENGINE — Supabase Client Configuration
 * ═══════════════════════════════════════════════════════════════════════════════
 * Connects to PokerIQ-Production (kuklfnapbkmacvwxktbh)
 */

import { createClient, RealtimeChannel } from '@supabase/supabase-js';

// Environment validation - follows VITE_ prefix law
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// SECURITY: No hardcoded fallback credentials — env vars are required
if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
        '[Supabase] VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in environment variables. ' +
        'Check your .env file.'
    );
}

// Create the Supabase client with realtime enabled for live traffic
// CRITICAL: storageKey MUST match Hub's 'smarter-poker-auth' for same-origin SSO
export const supabase = createClient(
    supabaseUrl || '',
    supabaseAnonKey || '',
    {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true,
            storageKey: 'smarter-poker-auth', // MUST match Hub for SSO
            flowType: 'implicit', // Avoids PKCE lock contention
            // CRITICAL: Bypass navigator.locks to prevent getSession() deadlock.
            // The default lock implementation acquires an exclusive Web Lock that
            // never releases if the initial getSession() network call is slow,
            // causing every subsequent auth operation to deadlock permanently.
            lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => fn(),
        },
        realtime: {
            params: {
                eventsPerSecond: 10,
            },
        },
    }
);

// Filter options for realtime subscriptions
interface SubscribeFilter {
    column: string;
    value: string;
}

// Subscribe to realtime changes on a database table
export function subscribeToTable<T>(
    tableName: string,
    callback: (data: T) => void,
    filter?: SubscribeFilter
): () => void {
    const channelName = filter
        ? `${tableName}:${filter.column}:${filter.value}`
        : tableName;

    const channel: RealtimeChannel = supabase
        .channel(channelName)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: tableName,
            filter: filter ? `${filter.column}=eq.${filter.value}` : undefined
        }, (payload) => {
            callback(payload.new as T);
        })
        .subscribe();

    // Return unsubscribe function
    return () => {
        supabase.removeChannel(channel);
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// REALTIME BROADCAST — Ephemeral hand state (no database table needed)
// ══════════════════════════════════════════════════════════════════════════════
// HeadlessTableEngine broadcasts hand state updates to a channel per table.
// useTableStore subscribes to the same channel to receive live game data.
// This is much faster than postgres_changes and doesn't require a hand_states table.

/**
 * Broadcast hand state to all subscribers for a given table.
 * Called by HeadlessTableEngine on every hand event.
 */
export function broadcastHandState(
    tableId: string,
    handState: Record<string, unknown>
): void {
    const channelName = `hand-state:${tableId}`;
    const channel = supabase.channel(channelName);
    channel.send({
        type: 'broadcast',
        event: 'hand_state',
        payload: handState,
    }).catch((err: unknown) => {
        console.warn(`[Broadcast] Failed to send hand state for ${tableId}:`, err);
    });
}

/**
 * Subscribe to hand state broadcasts for a given table.
 * Returns an unsubscribe function.
 */
export function subscribeToHandState(
    tableId: string,
    callback: (handState: Record<string, unknown>) => void
): () => void {
    const channelName = `hand-state:${tableId}`;
    const channel = supabase
        .channel(channelName)
        .on('broadcast', { event: 'hand_state' }, (payload) => {
            callback(payload.payload as Record<string, unknown>);
        })
        .subscribe();

    return () => {
        channel.unsubscribe().catch(() => {});
        supabase.removeChannel(channel);
    };
}

// Export type-safe database interface
export type SupabaseClient = typeof supabase;

// ══════════════════════════════════════════════════════════════════════════════
// SAME-ORIGIN SSO — Club Arena shares auth with Hub via localStorage
// ══════════════════════════════════════════════════════════════════════════════
// Since Club Arena is now served at smarter.poker/hub/club-arena (same origin),
// it automatically shares the 'smarter-poker-auth' localStorage key with the Hub.
// No postMessage or iframe handshake needed - just use the same storageKey above.
if (typeof window !== 'undefined') {

    // ══════════════════════════════════════════════════════════════════════════
    // SESSION MIGRATION — Move sessions from old default key to shared key
    // ══════════════════════════════════════════════════════════════════════════
    // Users who logged in before the SSO update may have their session stored
    // under the default Supabase key. This migrates them to the shared key.
    const OLD_DEFAULT_KEY = 'sb-kuklfnapbkmacvwxktbh-auth-token';
    const NEW_SHARED_KEY = 'smarter-poker-auth';
    const MIGRATION_FLAG = 'smarter_poker_auth_migration';

    try {
        const hasMigrated = localStorage.getItem(MIGRATION_FLAG);
        const hasNewSession = localStorage.getItem(NEW_SHARED_KEY);
        const hasOldSession = localStorage.getItem(OLD_DEFAULT_KEY);

        if (!hasMigrated && !hasNewSession && hasOldSession) {
            localStorage.setItem(NEW_SHARED_KEY, hasOldSession);
            localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());
            // Reload to pick up the migrated session
            window.location.reload();
        } else if (!hasMigrated) {
            // Mark as checked even if no migration needed
            localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());
        }
    } catch (e) {
        console.error('[SSO] Migration error:', e);
    }

    // Session status logged by AntiGravityBoot — no duplicate getSession() here
    // (duplicate calls cause navigator.locks deadlock)
}


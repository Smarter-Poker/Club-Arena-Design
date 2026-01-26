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

// Fallback credentials for PokerIQ-Production (same as World Hub)
const FALLBACK_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const FALLBACK_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo';

// Create the Supabase client with realtime enabled for live traffic
export const supabase = createClient(
    supabaseUrl || FALLBACK_URL,
    supabaseAnonKey || FALLBACK_ANON_KEY,
    {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true,
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

// Export type-safe database interface
export type SupabaseClient = typeof supabase;

// ══════════════════════════════════════════════════════════════════════════════
// SSO HANDSHAKE — Receive auth token from World Hub parent frame
// ══════════════════════════════════════════════════════════════════════════════
if (typeof window !== 'undefined') {
    const isInIframe = window.parent !== window;
    console.log('[SSO-CHILD] SSO receiver initialized, in iframe:', isInIframe);

    // Guard: Check if we already have a session - skip SSO if so
    const checkExistingSession = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        return !!session;
    };

    // Listen for auth token from parent
    window.addEventListener('message', async (event) => {
        console.log('[SSO-CHILD] Received message from:', event.origin, 'type:', event.data?.type);

        // Only accept from World Hub origin
        if (event.origin !== 'https://smarter.poker') {
            return;
        }

        if (event.data?.type === 'SMARTER_POKER_AUTH') {
            // Guard: If we already have a session, skip
            if (await checkExistingSession()) {
                console.log('[SSO-CHILD] Session already exists, skipping SSO');
                return;
            }

            const { access_token, refresh_token } = event.data.payload;
            console.log('[SSO-CHILD] Auth tokens received:', !!access_token, !!refresh_token);

            if (access_token && refresh_token) {
                try {
                    console.log('[SSO-CHILD] Calling setSession...');
                    const { error } = await supabase.auth.setSession({
                        access_token,
                        refresh_token,
                    });
                    if (!error) {
                        console.log('[SSO-CHILD]  Session set! Reloading...');
                        window.location.reload();
                    } else {
                        console.error('[SSO-CHILD]  setSession error:', error);
                    }
                } catch (err) {
                    console.error('[SSO-CHILD]  Exception:', err);
                }
            }
        }
    });

    // Request auth token from parent only if we don't have a session
    if (isInIframe) {
        checkExistingSession().then(hasSession => {
            if (hasSession) {
                console.log('[SSO-CHILD] Already logged in, skipping CLUB_ARENA_READY');
                return;
            }

            const sendReady = () => {
                console.log('[SSO-CHILD] Sending CLUB_ARENA_READY to parent');
                window.parent.postMessage({ type: 'CLUB_ARENA_READY' }, 'https://smarter.poker');
            };

            // Send immediately and retry
            sendReady();
            setTimeout(sendReady, 500);
            setTimeout(sendReady, 1500);
        });
    }
}

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
// CRITICAL: storageKey MUST match Hub's 'smarter-poker-auth' for same-origin SSO
export const supabase = createClient(
    supabaseUrl || FALLBACK_URL,
    supabaseAnonKey || FALLBACK_ANON_KEY,
    {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true,
            storageKey: 'smarter-poker-auth', // MUST match Hub for SSO
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
// SAME-ORIGIN SSO — Club Arena shares auth with Hub via localStorage
// ══════════════════════════════════════════════════════════════════════════════
// Since Club Arena is now served at smarter.poker/hub/club-arena (same origin),
// it automatically shares the 'smarter-poker-auth' localStorage key with the Hub.
// No postMessage or iframe handshake needed - just use the same storageKey above.
if (typeof window !== 'undefined') {
    console.log('[SSO] Same-origin SSO enabled via shared storageKey: smarter-poker-auth');

    // Log session status on load for debugging
    supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
            console.log('[SSO] ✅ Session found from Hub auth');
        } else {
            console.log('[SSO] ⚠️ No session - user needs to log in at Hub');
        }
    });
}


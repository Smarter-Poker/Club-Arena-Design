/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * MASTER BUS -- Centralized State & Event Management Layer (v2.0)
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * The Master Bus is the central nervous system of Club Arena, orchestrating:
 * - Type-safe event emission and subscription
 * - Cross-store state synchronization
 * - Realtime channel bridge for live updates
 * - Service layer coordination
 * - Supabase channel deduplication registry
 * - Sentry breadcrumb logging for observability
 * - Debounced subscription helpers for performance
 * 
 * NO DEMO DATA - All operations are real.
 */

import { useArenaStore } from '../stores/useArenaStore';
import { useClubStore } from '../stores/useClubStore';
import { useTableStore } from '../stores/useTableStore';
import { useUnionStore } from '../stores/useUnionStore';
import { useWalletStore } from '../stores/useWalletStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useUserStore } from '../stores/useUserStore';
import { realtimeChannelService } from '../services/RealtimeChannelService';
import { supabase } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type BusEventType =
    | 'AUTH_STATE_CHANGED'
    | 'USER_PROFILE_LOADED'
    | 'CLUB_JOINED'
    | 'CLUB_LEFT'
    | 'TABLE_SEATED'
    | 'TABLE_LEFT'
    | 'BALANCE_UPDATED'
    | 'WALLET_REFRESHED'
    | 'REALTIME_CONNECTED'
    | 'REALTIME_DISCONNECTED'
    | 'SYSTEM_ERROR'
    | 'HORSE_BUG_REPORT'
    | 'NOTIFICATION_READ'
    | 'WAITLIST_POSITION_CHANGED'
    | 'SESSION_SUMMARY_DISMISSED'
    // Phase 5: Daily challenge game events
    | 'HAND_COMPLETED'
    | 'HAND_WON'
    | 'FLOP_SEEN'
    | 'ALL_IN_WON'
    | 'BIG_POT_WON'
    | 'PREFLOP_WIN'
    | 'FLUSH_WIN'
    | 'PLAY_MINUTES'
    // Phase 5: Card color customization
    | 'CARD_COLOR_CHANGED'
    // Phase 8: Diamond economy bus event
    | 'DIAMOND_BALANCE_CHANGED';

// #13: Type-safe payload map — compile-time enforcement of correct payloads
export interface BusPayloadMap {
    AUTH_STATE_CHANGED: AuthStatePayload;
    USER_PROFILE_LOADED: { avatarUrl?: string; displayName?: string; userId?: string };
    CLUB_JOINED: ClubEventPayload;
    CLUB_LEFT: ClubEventPayload;
    TABLE_SEATED: TableEventPayload;
    TABLE_LEFT: TableEventPayload;
    BALANCE_UPDATED: { source: string; [key: string]: unknown };
    WALLET_REFRESHED: BalancePayload;
    REALTIME_CONNECTED: { channelName: string };
    REALTIME_DISCONNECTED: { channelName: string; reason?: string };
    SYSTEM_ERROR: { message: string; code?: string };
    HORSE_BUG_REPORT: Record<string, unknown>;
    NOTIFICATION_READ: { notifId: string | null; allRead: boolean };
    WAITLIST_POSITION_CHANGED: { tableId: string; position: number; tableName: string };
    SESSION_SUMMARY_DISMISSED: { tableId: string };
    // Gameplay events — strict payload types (#7)
    HAND_WON: { handId: string; winners: string[]; pot: number };
    HAND_COMPLETED: { handId: string; tableId: string };
    FLOP_SEEN: { handId: string; tableId: string };
    ALL_IN_WON: { handId: string; playerId: string; pot: number };
    BIG_POT_WON: { handId: string; pot: number };
    PREFLOP_WIN: { handId: string; playerId: string };
    FLUSH_WIN: { handId: string; playerId: string };
    PLAY_MINUTES: { minutes: number };
    // UI customization
    CARD_COLOR_CHANGED: { preset: string };
    // Phase 8: Diamond economy
    DIAMOND_BALANCE_CHANGED: { newBalance: number; delta: number; source: string };
}

export interface BusEvent<T = unknown> {
    type: BusEventType;
    payload: T;
    timestamp: string;
}

export interface AuthStatePayload {
    userId: string | null;
    isAuthenticated: boolean;
}

export interface ClubEventPayload {
    clubId: string;
    clubName?: string;
}

export interface TableEventPayload {
    tableId: string;
    seat?: number;
}

export interface BalancePayload {
    walletType: 'PLAYER' | 'BUSINESS' | 'PROMO';
    available: number;
    total: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MASTER BUS STATUS
// ═══════════════════════════════════════════════════════════════════════════════

export interface MasterBusStatus {
    online: boolean;
    stores: {
        arena: boolean;
        club: boolean;
        table: boolean;
        union: boolean;
        wallet: boolean;
        settings: boolean;
        user: boolean;
    };
    eventSubscribers: number;
    timestamp: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MASTER BUS SINGLETON
// ═══════════════════════════════════════════════════════════════════════════════

type EventHandler<T = unknown> = (event: BusEvent<T>) => void;
type EventLogEntry = BusEvent & { id: number };
type OnEventCallback = (entry: EventLogEntry) => void;

// Auto-incrementing subscriber ID for unique debounce timer keys
let _subscriberIdCounter = 0;
let _eventLogIdCounter = 0;

// Critical events that trigger SW notification + Supabase log
const CRITICAL_EVENTS: BusEventType[] = [
    'BALANCE_UPDATED', 'CLUB_JOINED', 'CLUB_LEFT', 'TABLE_SEATED', 'TABLE_LEFT',
];

class MasterBusCore {
    private subscribers: Map<BusEventType, Set<EventHandler>> = new Map();
    private status: MasterBusStatus | null = null;
    private initialized: boolean = false;

    // ═══════════════════════════════════════════════════════════════════════════
    // SUPABASE CHANNEL REGISTRY — Prevents duplicate subscriptions
    // ═══════════════════════════════════════════════════════════════════════════
    private channelRegistry: Map<string, RealtimeChannel> = new Map();
    private debouncedTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

    // #4: Channel health monitor interval
    private healthCheckInterval: ReturnType<typeof setInterval> | null = null;

    // #9 Event log for DevTools dashboard (capped at 200)
    private eventLog: EventLogEntry[] = [];
    private onEventCallbacks: Set<OnEventCallback> = new Set();
    private static MAX_EVENT_LOG = 200;

    // #4b Channel factory registry for auto-recovery
    private channelFactoryRegistry: Map<string, () => void> = new Map();

    /**
     * Initialize the Master Bus
     * Verifies all stores are accessible and sets up event system
     */
    init(): MasterBusStatus {
        if (this.initialized) {
            return this.status!;
        }


        const stores = {
            arena: false,
            club: false,
            table: false,
            union: false,
            wallet: false,
            settings: false,
            user: false,
        };

        // Verify each store is accessible
        try {
            const arenaState = useArenaStore.getState();
            stores.arena = arenaState !== undefined;
        } catch (e) {
            console.error(' ├─ ArenaStore:  (Error)', e);
        }

        try {
            const clubState = useClubStore.getState();
            stores.club = clubState !== undefined;
        } catch (e) {
            console.error(' ├─ ClubStore:  (Error)', e);
        }

        try {
            const tableState = useTableStore.getState();
            stores.table = tableState !== undefined;
        } catch (e) {
            console.error(' ├─ TableStore:  (Error)', e);
        }

        try {
            const unionState = useUnionStore.getState();
            stores.union = unionState !== undefined;
        } catch (e) {
            console.error(' ├─ UnionStore:  (Error)', e);
        }

        try {
            const walletState = useWalletStore.getState();
            stores.wallet = walletState !== undefined;
        } catch (e) {
            console.error(' ├─ WalletStore:  (Error)', e);
        }

        try {
            const settingsState = useSettingsStore.getState();
            stores.settings = settingsState !== undefined;
        } catch (e) {
            console.error(' ├─ SettingsStore:  (Error)', e);
        }

        try {
            const userState = useUserStore.getState();
            stores.user = userState !== undefined;
        } catch (e) {
            console.error(' └─ UserStore:  (Error)', e);
        }

        // Determine overall status
        const allOnline = Object.values(stores).every(s => s === true);

        this.status = {
            online: allOnline,
            stores,
            eventSubscribers: this.getTotalSubscribers(),
            timestamp: new Date().toISOString(),
        };

        this.initialized = true;

        // Set up internal event handlers for cross-store sync
        this.setupInternalHandlers();

        // #4: Start channel health monitoring (every 30s)
        this.startChannelHealthMonitor();

        return this.status;
    }

    /**
     * Subscribe to an event type — type-safe version
     */
    subscribe<K extends BusEventType>(
        eventType: K,
        handler: (event: BusEvent<K extends keyof BusPayloadMap ? BusPayloadMap[K] : unknown>) => void
    ): () => void {
        if (!this.subscribers.has(eventType)) {
            this.subscribers.set(eventType, new Set());
        }

        this.subscribers.get(eventType)!.add(handler as EventHandler);

        // Return unsubscribe function
        return () => {
            this.subscribers.get(eventType)?.delete(handler as EventHandler);
        };
    }

    /**
     * Emit an event to all subscribers — type-safe version
     * Also logs a Sentry breadcrumb for observability (#8)
     */
    emit<K extends BusEventType>(
        type: K,
        payload: K extends keyof BusPayloadMap ? BusPayloadMap[K] : unknown
    ): void {
        const event: BusEvent<typeof payload> = {
            type,
            payload,
            timestamp: new Date().toISOString(),
        };

        // #9: Log to event log for DevTools dashboard
        const logEntry: EventLogEntry = { ...event as BusEvent, id: ++_eventLogIdCounter };
        this.eventLog.push(logEntry);
        if (this.eventLog.length > MasterBusCore.MAX_EVENT_LOG) {
            this.eventLog = this.eventLog.slice(-MasterBusCore.MAX_EVENT_LOG);
        }
        // Notify live DevTools listeners
        this.onEventCallbacks.forEach(cb => { try { cb(logEntry); } catch { /* */ } });

        // #8: Log Sentry breadcrumb for every event
        try {
            if (typeof window !== 'undefined' && (window as any).__SENTRY__) {
                import('@sentry/react').then(Sentry => {
                    Sentry.addBreadcrumb({
                        category: 'masterBus',
                        message: type,
                        level: 'info',
                        data: typeof payload === 'object' ? (payload as Record<string, unknown>) : { value: payload },
                    });
                }).catch(() => { /* Sentry not available */ });
            }
        } catch { /* silent */ }

        // #9b: Forward critical events to Service Worker for background notifications
        if (CRITICAL_EVENTS.includes(type)) {
            try {
                if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                    navigator.serviceWorker.controller.postMessage({
                        type: 'BUS_EVENT',
                        event: { type, payload, timestamp: event.timestamp },
                    });
                }
            } catch { /* SW not available */ }
        }

        const handlers = this.subscribers.get(type);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(event as BusEvent);
                } catch (e) {
                    console.error(`[BUS ERROR] Handler failed for ${type}:`, e);
                }
            });
        }
    }

    /**
     * Set up internal handlers for cross-store synchronization
     */
    private setupInternalHandlers(): void {
        // When auth state changes, sync user data across stores
        this.subscribe('AUTH_STATE_CHANGED', (event) => {
            const { userId, isAuthenticated } = event.payload;

            if (isAuthenticated && userId) {
                // Load user-specific data
                useClubStore.getState().loadMemberships();
                useWalletStore.getState().refreshAll(userId);
            } else {
                // Clear user data on logout
                useClubStore.getState().reset();
                useWalletStore.getState().reset();
                useArenaStore.getState().reset();
            }
        });

        // When joining a club, subscribe to realtime channel
        this.subscribe('CLUB_JOINED', (event) => {
            const { clubId } = event.payload;
            const user = useUserStore.getState().user;

            if (user) {
                realtimeChannelService.subscribeToClub(
                    clubId,
                    user.id,
                    {
                        id: user.id,
                        displayName: user.display_name || user.username,
                        playerNumber: 0,
                        avatarUrl: user.avatar_url || '',
                        status: 'online',
                    },
                    {
                        onEvent: (clubEvent) => {
                        },
                    }
                );
            }
        });

        // When leaving a club, unsubscribe from realtime
        this.subscribe('CLUB_LEFT', (event) => {
            realtimeChannelService.unsubscribeFromClub(event.payload.clubId);
        });
    }

    /**
     * Get total number of event subscribers
     */
    private getTotalSubscribers(): number {
        let total = 0;
        this.subscribers.forEach(handlers => {
            total += handlers.size;
        });
        return total;
    }

    /**
     * Get current Master Bus status
     */
    getStatus(): MasterBusStatus | null {
        if (this.status) {
            this.status.eventSubscribers = this.getTotalSubscribers();
        }
        return this.status;
    }

    /**
     * Check if Master Bus is online
     */
    isOnline(): boolean {
        return this.status?.online === true;
    }

    /**
     * Reset the Master Bus (for testing or logout)
     */
    reset(): void {
        this.subscribers.clear();
        // Clean up all registered Supabase channels
        this.channelRegistry.forEach((channel) => {
            supabase.removeChannel(channel);
        });
        this.channelRegistry.clear();
        this.channelFactoryRegistry.clear();
        this.debouncedTimers.forEach(timer => clearTimeout(timer));
        this.debouncedTimers.clear();
        this.eventLog = [];
        this.onEventCallbacks.clear();
        // #4: Stop health monitor
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
        this.status = null;
        this.initialized = false;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // #1: CHANNEL REGISTRY — Deduplicated Supabase channel management
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Get or create a Supabase channel — guarantees exactly one channel per key.
     * If a channel with the same key already exists, returns it.
     */
    getOrCreateChannel(key: string): RealtimeChannel {
        const existing = this.channelRegistry.get(key);
        if (existing) return existing;

        const channel = supabase.channel(key);
        this.channelRegistry.set(key, channel);
        return channel;
    }

    /**
     * Remove a registered channel by key
     */
    removeRegisteredChannel(key: string): void {
        const channel = this.channelRegistry.get(key);
        if (channel) {
            supabase.removeChannel(channel);
            this.channelRegistry.delete(key);
        }
    }

    /**
     * Check if a channel is already registered
     */
    hasChannel(key: string): boolean {
        return this.channelRegistry.has(key);
    }

    /**
     * Get count of registered channels (for diagnostics)
     */
    getChannelCount(): number {
        return this.channelRegistry.size;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // #4: DEBOUNCED SUBSCRIPTION — Prevents rapid-fire event storms
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Subscribe with debounce — collapses rapid-fire events into one call.
     * #2 FIX: Uses unique per-subscriber timer keys (no cross-subscriber collision).
     * #1 FIX: Clears pending timer on unsubscribe (no stale handler fire).
     */
    subscribeDebounced<K extends BusEventType>(
        eventType: K,
        handler: (event: BusEvent<K extends keyof BusPayloadMap ? BusPayloadMap[K] : unknown>) => void,
        debounceMs: number = 300
    ): () => void {
        // #2: Unique timer key per subscriber instance
        const subscriberId = ++_subscriberIdCounter;
        const timerKey = `${eventType}_debounce_${subscriberId}`;

        const debouncedHandler: EventHandler = (event) => {
            const existing = this.debouncedTimers.get(timerKey);
            if (existing) clearTimeout(existing);

            this.debouncedTimers.set(timerKey, setTimeout(() => {
                (handler as EventHandler)(event);
                this.debouncedTimers.delete(timerKey);
            }, debounceMs));
        };

        const unsubFromBus = this.subscribe(eventType, debouncedHandler as any);

        // #1: Return enhanced unsubscribe that also clears any pending timer
        return () => {
            unsubFromBus();
            const pendingTimer = this.debouncedTimers.get(timerKey);
            if (pendingTimer) {
                clearTimeout(pendingTimer);
                this.debouncedTimers.delete(timerKey);
            }
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // #4: CHANNEL HEALTH MONITOR — Auto-detect dead channels
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Periodically checks channel health. Removes channels in CLOSED or
     * CHANNEL_ERROR state from the registry to prevent stale references.
     */
    private startChannelHealthMonitor(): void {
        if (this.healthCheckInterval) return; // Already running

        this.healthCheckInterval = setInterval(() => {
            const deadChannels: string[] = [];

            this.channelRegistry.forEach((channel, key) => {
                const state = (channel as any).state;
                if (state === 'closed' || state === 'errored') {
                    console.warn(`[BUS HEALTH] Dead channel detected: "${key}" (state: ${state})`);
                    deadChannels.push(key);
                }
            });

            deadChannels.forEach(key => {
                // #4b: Auto-recovery — try to re-create via factory if registered
                const factory = this.channelFactoryRegistry.get(key);
                this.removeRegisteredChannel(key);
                if (factory) {
                    console.log(`[BUS HEALTH] Auto-recovering channel: "${key}"`);
                    try {
                        factory();
                    } catch (e) {
                        console.error(`[BUS HEALTH] Recovery failed for "${key}":`, e);
                    }
                } else {
                    console.warn(`[BUS HEALTH] No factory for "${key}" -- removed only`);
                }
            });
        }, 30_000); // Every 30 seconds
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // #9: DIAGNOSTICS — Dev-mode debugging dashboard data
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Returns a diagnostics snapshot for dev debugging.
     */
    getDiagnostics(): {
        subscribers: Record<string, number>;
        channels: { key: string; state: string }[];
        pendingTimers: number;
        initialized: boolean;
        eventLogSize: number;
        channelFactories: number;
    } {
        const subscribers: Record<string, number> = {};
        this.subscribers.forEach((handlers, event) => {
            subscribers[event] = handlers.size;
        });

        const channels = Array.from(this.channelRegistry.entries()).map(([key, ch]) => ({
            key,
            state: (ch as any).state || 'unknown',
        }));

        return {
            subscribers,
            channels,
            pendingTimers: this.debouncedTimers.size,
            initialized: this.initialized,
            eventLogSize: this.eventLog.length,
            channelFactories: this.channelFactoryRegistry.size,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // #9: EVENT LOG — DevTools dashboard live feed
    // ═══════════════════════════════════════════════════════════════════════════

    /** Get the event log (newest last) */
    getEventLog(): EventLogEntry[] {
        return [...this.eventLog];
    }

    /** Clear the event log */
    clearEventLog(): void {
        this.eventLog = [];
    }

    /** Register a live callback for new events (returns unsubscribe fn) */
    onEvent(callback: OnEventCallback): () => void {
        this.onEventCallbacks.add(callback);
        return () => { this.onEventCallbacks.delete(callback); };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // #4b: CHANNEL FACTORY REGISTRY — For auto-recovery
    // ═══════════════════════════════════════════════════════════════════════════

    /** Register a factory function for a channel key (enables auto-recovery) */
    registerChannelFactory(key: string, factory: () => void): void {
        this.channelFactoryRegistry.set(key, factory);
    }

    /** Remove a channel factory */
    removeChannelFactory(key: string): void {
        this.channelFactoryRegistry.delete(key);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

// Singleton instance
export const masterBus = new MasterBusCore();

// Convenience functions
export function initMasterBus(): MasterBusStatus {
    return masterBus.init();
}

export function getMasterBusStatus(): MasterBusStatus | null {
    return masterBus.getStatus();
}

export function isMasterBusOnline(): boolean {
    return masterBus.isOnline();
}

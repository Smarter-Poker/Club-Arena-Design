/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 📡 REALTIME CHANNEL SERVICE — Supabase Presence & Broadcast
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Manages real-time communication channels for:
 * - Club presence and activity
 * - Tournament updates and eliminations
 * - Table state synchronization
 * - Hand-by-hand streaming
 *
 * CHANNELS:
 * - club:{id} — Member join/leave, table created, announcements
 * - tournament:{id} — Registration, eliminations, payouts
 * - table:{id} — Game state, player actions (handled by TableWebSocket)
 * - hand:{id} — Hand replay streaming
 */

import { supabase } from '../lib/supabase';
import type { RealtimeChannel, RealtimePresenceState } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type ChannelType = 'club' | 'tournament' | 'table' | 'hand' | 'lobby';

export interface ClubPresence {
    id: string;
    displayName: string;
    playerNumber: number;
    avatarUrl: string;
    status: 'online' | 'away' | 'playing';
    currentTableId?: string;
    joinedAt: string;
}

export interface ClubEvent {
    type: 'member_joined' | 'member_left' | 'table_created' | 'table_closed' |
    'announcement' | 'tournament_starting' | 'jackpot_hit';
    payload: any;
    timestamp: string;
}

export interface TournamentEvent {
    type: 'registration_open' | 'registration_closed' | 'tournament_started' |
    'player_registered' | 'player_eliminated' | 'level_up' |
    'final_table' | 'heads_up' | 'winner' | 'payout';
    payload: any;
    timestamp: string;
}

export interface HandEvent {
    type: 'deal' | 'action' | 'street' | 'showdown' | 'pot_awarded';
    payload: any;
    timestamp: string;
}

export interface ChannelSubscription {
    channel: RealtimeChannel;
    type: ChannelType;
    entityId: string;
    onEvent: (event: any) => void;
    onPresenceSync?: (members: ClubPresence[]) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

class RealtimeChannelService {
    private subscriptions: Map<string, ChannelSubscription> = new Map();
    private presenceState: Map<string, ClubPresence[]> = new Map();

    // ─────────────────────────────────────────────────────────────────────────────
    // CLUB CHANNELS
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Subscribe to club channel for presence and events
     */
    subscribeToClub(
        clubId: string,
        userId: string,
        userInfo: Omit<ClubPresence, 'joinedAt'>,
        callbacks: {
            onMemberJoin?: (member: ClubPresence) => void;
            onMemberLeave?: (memberId: string) => void;
            onEvent?: (event: ClubEvent) => void;
            onPresenceSync?: (members: ClubPresence[]) => void;
        }
    ): () => void {
        const channelName = `club:${clubId}`;

        if (this.subscriptions.has(channelName)) {
            return () => this.unsubscribeFromClub(clubId);
        }

        const channel = supabase.channel(channelName, {
            config: { presence: { key: userId } },
        });

        // Handle presence
        channel.on('presence', { event: 'sync' }, () => {
            const state = channel.presenceState<ClubPresence>();
            const members = Object.values(state).flat() as ClubPresence[];
            this.presenceState.set(clubId, members);
            callbacks.onPresenceSync?.(members);
        });

        channel.on('presence', { event: 'join' }, ({ newPresences }) => {
            newPresences.forEach((presence: any) => {
                callbacks.onMemberJoin?.(presence as ClubPresence);
            });
        });

        channel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
            leftPresences.forEach((presence: any) => {
                callbacks.onMemberLeave?.(presence.id);
            });
        });

        // Handle broadcast events
        channel.on('broadcast', { event: 'club_event' }, ({ payload }) => {
            callbacks.onEvent?.(payload as ClubEvent);
        });

        // Subscribe and track presence
        channel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await channel.track({
                    ...userInfo,
                    joinedAt: new Date().toISOString(),
                });
            }
        });

        this.subscriptions.set(channelName, {
            channel,
            type: 'club',
            entityId: clubId,
            onEvent: callbacks.onEvent || (() => { }),
            onPresenceSync: callbacks.onPresenceSync,
        });

        return () => this.unsubscribeFromClub(clubId);
    }

    /**
     * Unsubscribe from club channel
     */
    async unsubscribeFromClub(clubId: string): Promise<void> {
        const channelName = `club:${clubId}`;
        const subscription = this.subscriptions.get(channelName);

        if (subscription) {
            await subscription.channel.unsubscribe();
            this.subscriptions.delete(channelName);
            this.presenceState.delete(clubId);
        }
    }

    /**
     * Broadcast an event to a club channel
     */
    async broadcastClubEvent(clubId: string, event: Omit<ClubEvent, 'timestamp'>): Promise<void> {
        const channelName = `club:${clubId}`;
        const subscription = this.subscriptions.get(channelName);

        if (!subscription) {
            console.warn(`Not subscribed to ${channelName}`);
            return;
        }

        const fullEvent: ClubEvent = {
            ...event,
            timestamp: new Date().toISOString(),
        };

        await subscription!.channel.send({
            type: 'broadcast',
            event: 'club_event',
            payload: fullEvent,
        });
    }

    /**
     * Get current club presence
     */
    getClubPresence(clubId: string): ClubPresence[] {
        return this.presenceState.get(clubId) || [];
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // TOURNAMENT CHANNELS
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Subscribe to tournament channel for updates
     */
    subscribeToTournament(
        tournamentId: string,
        callbacks: {
            onEvent?: (event: TournamentEvent) => void;
            onPlayerRegistered?: (player: any) => void;
            onPlayerEliminated?: (elimination: any) => void;
            onLevelUp?: (level: any) => void;
            onWinner?: (winner: any) => void;
        }
    ): () => void {
        const channelName = `tournament:${tournamentId}`;

        if (this.subscriptions.has(channelName)) {
            return () => this.unsubscribeFromTournament(tournamentId);
        }

        const channel = supabase.channel(channelName);

        channel.on('broadcast', { event: 'tournament_event' }, ({ payload }) => {
            const event = payload as TournamentEvent;
            callbacks.onEvent?.(event);

            // Route to specific callbacks
            switch (event.type) {
                case 'player_registered':
                    callbacks.onPlayerRegistered?.(event.payload);
                    break;
                case 'player_eliminated':
                    callbacks.onPlayerEliminated?.(event.payload);
                    break;
                case 'level_up':
                    callbacks.onLevelUp?.(event.payload);
                    break;
                case 'winner':
                    callbacks.onWinner?.(event.payload);
                    break;
            }
        });

        channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
            }
        });

        this.subscriptions.set(channelName, {
            channel,
            type: 'tournament',
            entityId: tournamentId,
            onEvent: callbacks.onEvent || (() => { }),
        });

        return () => this.unsubscribeFromTournament(tournamentId);
    }

    /**
     * Unsubscribe from tournament channel
     */
    async unsubscribeFromTournament(tournamentId: string): Promise<void> {
        const channelName = `tournament:${tournamentId}`;
        const subscription = this.subscriptions.get(channelName);

        if (subscription) {
            await subscription.channel.unsubscribe();
            this.subscriptions.delete(channelName);
        }
    }

    /**
     * Broadcast tournament event
     */
    async broadcastTournamentEvent(tournamentId: string, event: Omit<TournamentEvent, 'timestamp'>): Promise<void> {
        const channelName = `tournament:${tournamentId}`;
        const subscription = this.subscriptions.get(channelName);

        // Create temporary channel if not subscribed
        if (!subscription) {
            const channel = supabase.channel(channelName);
            await channel.subscribe();

            await channel.send({
                type: 'broadcast',
                event: 'tournament_event',
                payload: { ...event, timestamp: new Date().toISOString() },
            });

            await channel.unsubscribe();
            return;
        }

        await subscription.channel.send({
            type: 'broadcast',
            event: 'tournament_event',
            payload: { ...event, timestamp: new Date().toISOString() },
        });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // HAND REPLAY STREAMING
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Subscribe to hand replay channel
     */
    subscribeToHandReplay(
        handId: string,
        callbacks: {
            onEvent?: (event: HandEvent) => void;
        }
    ): () => void {
        const channelName = `hand:${handId} `;

        const channel = supabase.channel(channelName);

        channel.on('broadcast', { event: 'hand_event' }, ({ payload }) => {
            callbacks.onEvent?.(payload as HandEvent);
        });

        channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
            }
        });

        this.subscriptions.set(channelName, {
            channel,
            type: 'hand',
            entityId: handId,
            onEvent: callbacks.onEvent || (() => { }),
        });

        return () => this.unsubscribeFromHand(handId);
    }

    /**
     * Unsubscribe from hand channel
     */
    async unsubscribeFromHand(handId: string): Promise<void> {
        const channelName = `hand:${handId} `;
        const subscription = this.subscriptions.get(channelName);

        if (subscription) {
            await subscription.channel.unsubscribe();
            this.subscriptions.delete(channelName);
        }
    }

    /**
     * Stream hand events for replay
     */
    async streamHandReplay(handId: string, events: HandEvent[], speedMs: number = 1000): Promise<void> {
        const channel = supabase.channel(`hand:${handId} `);
        await channel.subscribe();

        for (const event of events) {
            await new Promise(resolve => setTimeout(resolve, speedMs));
            await channel.send({
                type: 'broadcast',
                event: 'hand_event',
                payload: event,
            });
        }

        await channel.unsubscribe();
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // LOBBY CHANNEL (Global)
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Subscribe to global lobby for club activity
     */
    subscribeToLobby(
        callbacks: {
            onClubActivity?: (clubId: string, playersOnline: number) => void;
            onTournamentStarting?: (tournament: any) => void;
            onJackpotHit?: (jackpot: any) => void;
        }
    ): () => void {
        const channelName = 'lobby:global';

        const channel = supabase.channel(channelName);

        channel.on('broadcast', { event: 'lobby_update' }, ({ payload }) => {
            switch (payload.type) {
                case 'club_activity':
                    callbacks.onClubActivity?.(payload.clubId, payload.playersOnline);
                    break;
                case 'tournament_starting':
                    callbacks.onTournamentStarting?.(payload.tournament);
                    break;
                case 'jackpot_hit':
                    callbacks.onJackpotHit?.(payload.jackpot);
                    break;
            }
        });

        channel.subscribe();

        this.subscriptions.set(channelName, {
            channel,
            type: 'lobby',
            entityId: 'global',
            onEvent: () => { },
        });

        return () => this.unsubscribeFromLobby();
    }

    /**
     * Unsubscribe from lobby
     */
    async unsubscribeFromLobby(): Promise<void> {
        const channelName = 'lobby:global';
        const subscription = this.subscriptions.get(channelName);

        if (subscription) {
            await subscription.channel.unsubscribe();
            this.subscriptions.delete(channelName);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // UTILITIES
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Get all active subscriptions
     */
    getActiveSubscriptions(): Array<{ channel: string; type: ChannelType; entityId: string }> {
        return Array.from(this.subscriptions.entries()).map(([channel, sub]) => ({
            channel,
            type: sub.type,
            entityId: sub.entityId,
        }));
    }

    /**
     * Unsubscribe from all channels
     */
    async unsubscribeAll(): Promise<void> {
        const promises = Array.from(this.subscriptions.values()).map(sub =>
            sub.channel.unsubscribe()
        );
        await Promise.all(promises);
        this.subscriptions.clear();
        this.presenceState.clear();
    }
}

export const realtimeChannelService = new RealtimeChannelService();
export { RealtimeChannelService };
export default realtimeChannelService;

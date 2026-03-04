/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  HAND PERSISTENCE SERVICE — Persists HandController events to database
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { supabase } from '../lib/supabase';
import type { HandController, HandEvent } from '../engine/HandController';

interface HandRecord {
    id?: string;
    table_id: string;
    club_id: string;
    hand_number: number;
    game_variant: string;
    stakes: string;
    pot: number;
    rake: number;
    community_cards: string[];
    winner_ids: string[];
    players: Record<string, unknown>;
    actions: Record<string, unknown>[];
    started_at: string;
    ended_at?: string;
}

interface PersistenceConfig {
    tableId: string;
    clubId: string;
    stakes: string;
    gameVariant: 'nlh' | 'plo4' | 'plo5' | 'plo6';
}

class HandPersistenceServiceClass {
    private currentHand: HandRecord | null = null;
    private handActions: Record<string, unknown>[] = [];
    private unsubscribe: (() => void) | null = null;

    /**
     * Wire a HandController to persist its events to the database
     */
    wireToHandController(
        controller: HandController,
        config: PersistenceConfig
    ): () => void {
        // Clean up previous subscription to prevent memory leak
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }

        // Subscribe to all hand events
        this.unsubscribe = controller.onEvent((event: HandEvent) => {
            this.handleEvent(event, config);
        });

        return () => {
            if (this.unsubscribe) {
                this.unsubscribe();
                this.unsubscribe = null;
            }
        };
    }

    /** Get the current persisted hand UUID (if available) */
    getCurrentHandId(): string | null {
        return this.currentHand?.id || null;
    }

    private async handleEvent(event: HandEvent, config: PersistenceConfig): Promise<void> {
        switch (event.type) {
            case 'HAND_START':
                await this.onHandStart(event.handNumber, event.players, config);
                break;
            case 'PLAYER_ACTION':
                this.onPlayerAction(event.seat, event.action, event.amount);
                break;
            case 'COMMUNITY_CARDS':
                this.onCommunityCards(event.cards, (event as any).stage);
                break;
            case 'HAND_COMPLETE':
                await this.onHandComplete(event.handNumber, event.rake);
                break;
            case 'WINNERS':
                this.onWinners(event.winners);
                break;
            case 'POT_UPDATE':
                this.onPotUpdate(event.pot);
                break;
            default:
                // Other events (CARDS_DEALT, TURN_CHANGE, SHOWDOWN) don't persist directly
                break;
        }
    }

    private async onHandStart(
        handNumber: number,
        players: { seat: number; user_id: string; username: string; stack: number }[],
        config: PersistenceConfig
    ): Promise<void> {
        // Guard: if a hand is already in progress, finalize it before starting a new one
        if (this.currentHand?.id) {
            console.warn('[HandPersistence] Duplicate HAND_START — finalizing previous hand', this.currentHand.hand_number);
            await this.onHandComplete(this.currentHand.hand_number, 0);
        }

        // Initialize hand record
        this.currentHand = {
            table_id: config.tableId,
            club_id: config.clubId,
            hand_number: handNumber,
            game_variant: config.gameVariant,
            stakes: config.stakes,
            pot: 0,
            rake: 0,
            community_cards: [],
            winner_ids: [],
            players: Object.fromEntries(players.map((p) => [p.user_id, { seat: p.seat, username: p.username, stack: p.stack }])),
            actions: [],
            started_at: new Date().toISOString(),
        };
        this.handActions = [];

        // Insert initial hand record
        const { data, error } = await supabase
            .from('hands')
            .insert({
                table_id: this.currentHand.table_id,
                club_id: this.currentHand.club_id,
                hand_number: this.currentHand.hand_number,
                game_variant: this.currentHand.game_variant,
                stakes: this.currentHand.stakes,
                pot: 0,
                rake: 0,
                community_cards: [],
                winner_ids: [],
                players: this.currentHand.players,
                actions: [],
                started_at: this.currentHand.started_at,
            })
            .select('id')
            .single();

        if (error) {
            console.error('[HandPersistence] Failed to insert hand:', error);
            // Retry once — transient errors (network, lock contention) are common
            try {
                const { data: retryData, error: retryError } = await supabase
                    .from('hands')
                    .insert({
                        table_id: this.currentHand.table_id,
                        club_id: this.currentHand.club_id,
                        hand_number: this.currentHand.hand_number,
                        game_variant: this.currentHand.game_variant,
                        stakes: this.currentHand.stakes,
                        pot: 0,
                        rake: 0,
                        community_cards: [],
                        winner_ids: [],
                        players: this.currentHand.players,
                        actions: [],
                        started_at: this.currentHand.started_at,
                    })
                    .select('id')
                    .single();
                if (!retryError && retryData) {
                    this.currentHand.id = retryData.id;
                    console.log('[HandPersistence] Retry succeeded — hand ID:', retryData.id);
                } else {
                    console.error('[HandPersistence] Retry also failed:', retryError);
                    // Generate a local ID so onHandComplete doesn't silently skip
                    // Hand won't be in DB but rake waterfall still needs a handId
                    this.currentHand.id = crypto.randomUUID();
                    (this.currentHand as any)._localOnly = true;
                }
            } catch (e) {
                console.error('[HandPersistence] Retry exception:', e);
                this.currentHand.id = crypto.randomUUID();
                (this.currentHand as any)._localOnly = true;
            }
        } else if (data) {
            this.currentHand.id = data.id;
        }
    }

    private onPlayerAction(seat: number, action: string, amount: number): void {
        if (!this.currentHand) return;

        // Accumulate action
        this.handActions.push({
            seat,
            action,
            amount: amount || 0,
            timestamp: new Date().toISOString(),
        });
    }

    private onCommunityCards(cards: { rank: string; suit: string }[], stage?: string): void {
        if (!this.currentHand) return;

        // APPEND new community cards (don't overwrite — events fire per stage: flop=3, turn=1, river=1)
        // Use first char of suit name: "spades" → "s", "hearts" → "h", "diamonds" → "d", "clubs" → "c"
        const formatted = cards.map((c) => `${c.rank}${c.suit[0]}`);
        this.currentHand.community_cards.push(...formatted);

        // Track the current street based on community card stage
        if (stage) {
            (this.currentHand as any)._currentStreet = stage;
        }
    }

    private onWinners(winners: { userId: string; amount: number }[]): void {
        if (!this.currentHand) return;
        console.log('[HandPersistence] WINNERS event received:', JSON.stringify(winners));
        this.currentHand.winner_ids = winners.map((w) => w.userId);
        console.log('[HandPersistence] winner_ids set to:', JSON.stringify(this.currentHand.winner_ids));
    }

    private onPotUpdate(pot: number): void {
        if (!this.currentHand) return;
        this.currentHand.pot = pot;
    }

    private async onHandComplete(handNumber: number, rake: number): Promise<void> {
        if (!this.currentHand?.id) {
            // Still clean up state even if no hand ID
            this.currentHand = null;
            this.handActions = [];
            return;
        }

        console.log('[HandPersistence] HAND_COMPLETE — saving:', {
            id: this.currentHand.id,
            pot: this.currentHand.pot,
            rake,
            community_cards: this.currentHand.community_cards,
            winner_ids: this.currentHand.winner_ids,
            actions_count: this.handActions.length,
            localOnly: !!(this.currentHand as any)._localOnly,
        });

        // Determine final street from community cards or tracked stage
        const ccCount = this.currentHand.community_cards.length;
        const finalStreet = ccCount >= 5 ? 'river' : ccCount >= 4 ? 'turn' : ccCount >= 3 ? 'flop' : 'preflop';

        // Skip DB update for local-only hands (insert failed + retry failed)
        if (!(this.currentHand as any)._localOnly) {
            const updatePayload = {
                pot: this.currentHand.pot,
                rake,
                community_cards: this.currentHand.community_cards,
                winner_ids: this.currentHand.winner_ids,
                actions: this.handActions,
                status: 'completed',
                street: finalStreet,
                ended_at: new Date().toISOString(),
            };

            const { error } = await supabase
                .from('hands')
                .update(updatePayload)
                .eq('id', this.currentHand.id);

            if (error) {
                console.error('[HandPersistence] Failed to update hand:', error);
                // Retry the final update once
                try {
                    await supabase.from('hands').update(updatePayload).eq('id', this.currentHand.id);
                } catch (e) {
                    console.error('[HandPersistence] Retry update also failed:', e);
                }
            }
        }

        // Reset state
        this.currentHand = null;
        this.handActions = [];
    }

    /**
     * Load hand history for a table
     */
    async getTableHandHistory(tableId: string, limit = 20): Promise<HandRecord[]> {
        const { data, error } = await supabase
            .from('hands')
            .select('*')
            .eq('table_id', tableId)
            .order('ended_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('[HandPersistence] Failed to load hand history:', error);
            return [];
        }

        return data || [];
    }

    /**
     * Load hand history for a player
     */
    async getPlayerHandHistory(playerId: string, limit = 50): Promise<HandRecord[]> {
        const { data, error } = await supabase
            .from('hands')
            .select('*')
            .contains('players', { [playerId]: {} })
            .order('ended_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('[HandPersistence] Failed to load player hands:', error);
            return [];
        }

        return data || [];
    }
}

export const handPersistenceService = new HandPersistenceServiceClass();
export default handPersistenceService;

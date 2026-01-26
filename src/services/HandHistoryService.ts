/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CLUB ENGINE — Hand History Service
 * ═══════════════════════════════════════════════════════════════════════════════
 * Manages hand history data for replay and sharing
 * Real Supabase integration — no demo data
 */

import { supabase } from '../lib/supabase';
import type { Card } from '../types/database.types';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface HandPlayer {
    seat: number;
    user_id: string;
    username: string;
    avatar_url: string | null;
    position: 'UTG' | 'UTG+1' | 'UTG+2' | 'MP' | 'MP+1' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB';
    hole_cards: Card[];
    final_hand?: string;
    result: number;
    is_winner: boolean;
}

export interface HandAction {
    player_id: string;
    action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in';
    amount?: number;
    street: 'preflop' | 'flop' | 'turn' | 'river';
    timestamp: number;
}

export interface HandRecord {
    id: string;
    serial_number: string;
    table_id: string;
    table_name: string;
    played_at: string;
    hand_number: number;
    total_hands: number;
    main_pot: number;
    side_pots: number[];
    community_cards: Card[];
    players: HandPlayer[];
    actions: HandAction[];
    game_type: string;
    stakes: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

class HandHistoryServiceClass {

    /**
     * Get a single hand by ID
     */
    async getHand(handId: string): Promise<HandRecord | null> {
        const { data, error } = await supabase
            .from('hands')
            .select(`
                *,
                hand_players (
                    seat,
                    user_id,
                    hole_cards,
                    final_hand,
                    result,
                    is_winner,
                    profiles:user_id (
                        username,
                        avatar_url
                    )
                ),
                hand_actions (
                    player_id,
                    action,
                    amount,
                    street,
                    created_at
                ),
                tables (
                    name,
                    game_type,
                    stakes
                )
            `)
            .eq('id', handId)
            .single();

        if (error || !data) return null;

        return this.mapHandRecord(data);
    }

    /**
     * Get hands for a player
     */
    async getPlayerHands(userId: string, limit = 50): Promise<HandRecord[]> {
        const { data, error } = await supabase
            .from('hand_players')
            .select(`
                hands (
                    *,
                    hand_players (
                        seat,
                        user_id,
                        hole_cards,
                        final_hand,
                        result,
                        is_winner,
                        profiles:user_id (
                            username,
                            avatar_url
                        )
                    ),
                    tables (
                        name,
                        game_type,
                        stakes
                    )
                )
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error || !data) return [];

        return data.map((d: any) => this.mapHandRecord(d.hands)).filter(Boolean) as HandRecord[];
    }

    /**
     * Get hands for a table
     */
    async getTableHands(tableId: string, limit = 100): Promise<HandRecord[]> {
        const { data, error } = await supabase
            .from('hands')
            .select(`
                *,
                hand_players (
                    seat,
                    user_id,
                    hole_cards,
                    final_hand,
                    result,
                    is_winner,
                    profiles:user_id (
                        username,
                        avatar_url
                    )
                ),
                tables (
                    name,
                    game_type,
                    stakes
                )
            `)
            .eq('table_id', tableId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error || !data) return [];

        return data.map(this.mapHandRecord);
    }

    /**
     * Get recent winning hands (for highlights)
     */
    async getRecentWinningHands(userId: string, limit = 10): Promise<HandRecord[]> {
        const { data, error } = await supabase
            .from('hand_players')
            .select(`
                hands (
                    *,
                    hand_players (
                        seat,
                        user_id,
                        hole_cards,
                        final_hand,
                        result,
                        is_winner,
                        profiles:user_id (
                            username,
                            avatar_url
                        )
                    ),
                    tables (
                        name,
                        game_type,
                        stakes
                    )
                )
            `)
            .eq('user_id', userId)
            .eq('is_winner', true)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error || !data) return [];

        return data.map((d: any) => this.mapHandRecord(d.hands)).filter(Boolean) as HandRecord[];
    }

    /**
     * Search hands by criteria
     */
    async searchHands(filters: {
        userId?: string;
        tableId?: string;
        clubId?: string;
        startDate?: string;
        endDate?: string;
        minPot?: number;
        limit?: number;
    }): Promise<HandRecord[]> {
        let query = supabase
            .from('hands')
            .select(`
                *,
                hand_players (
                    seat,
                    user_id,
                    hole_cards,
                    final_hand,
                    result,
                    is_winner,
                    profiles:user_id (
                        username,
                        avatar_url
                    )
                ),
                tables (
                    name,
                    game_type,
                    stakes,
                    club_id
                )
            `)
            .order('created_at', { ascending: false });

        if (filters.tableId) {
            query = query.eq('table_id', filters.tableId);
        }

        if (filters.startDate) {
            query = query.gte('created_at', filters.startDate);
        }

        if (filters.endDate) {
            query = query.lte('created_at', filters.endDate);
        }

        if (filters.minPot) {
            query = query.gte('pot_size', filters.minPot);
        }

        query = query.limit(filters.limit || 50);

        const { data, error } = await query;

        if (error || !data) return [];

        let results = data.map(this.mapHandRecord);

        // Filter by clubId if provided (post-query filter)
        if (filters.clubId) {
            results = results.filter((h: any) => h._table?.club_id === filters.clubId);
        }

        return results;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────────────────────────────────────

    private mapHandRecord(data: any): HandRecord {
        const table = data.tables || {};
        const players: HandPlayer[] = (data.hand_players || []).map((hp: any) => ({
            seat: hp.seat,
            user_id: hp.user_id,
            username: hp.profiles?.username || 'Unknown',
            avatar_url: hp.profiles?.avatar_url || null,
            position: this.getPositionName(hp.seat, data.button_seat || 1, (data.hand_players || []).length),
            hole_cards: hp.hole_cards || [],
            final_hand: hp.final_hand,
            result: hp.result || 0,
            is_winner: hp.is_winner || false,
        }));

        const actions: HandAction[] = (data.hand_actions || []).map((a: any) => ({
            player_id: a.player_id,
            action: a.action,
            amount: a.amount,
            street: a.street,
            timestamp: new Date(a.created_at).getTime(),
        }));

        return {
            id: data.id,
            serial_number: data.serial_number || data.id,
            table_id: data.table_id,
            table_name: table.name || 'Unknown',
            played_at: data.created_at,
            hand_number: data.hand_number || 1,
            total_hands: data.total_hands || 1,
            main_pot: data.pot_size || 0,
            side_pots: data.side_pots || [],
            community_cards: data.community_cards || [],
            players,
            actions,
            game_type: table.game_type || 'NLH',
            stakes: table.stakes || '1/2',
        };
    }

    private getPositionName(
        seat: number,
        buttonSeat: number,
        playerCount: number
    ): 'UTG' | 'UTG+1' | 'UTG+2' | 'MP' | 'MP+1' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB' {
        // Calculate position relative to button
        const positions = this.getPositionOrder(playerCount);
        const relativePos = (seat - buttonSeat + playerCount) % playerCount;
        return positions[relativePos] || 'MP';
    }

    private getPositionOrder(playerCount: number): ('BTN' | 'SB' | 'BB' | 'UTG' | 'UTG+1' | 'UTG+2' | 'MP' | 'MP+1' | 'HJ' | 'CO')[] {
        if (playerCount <= 2) return ['BTN', 'BB'];
        if (playerCount <= 3) return ['BTN', 'SB', 'BB'];
        if (playerCount <= 6) return ['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO'];
        return ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO'];
    }
}

export const handHistoryService = new HandHistoryServiceClass();
export const HandHistoryService = handHistoryService;
export default handHistoryService;

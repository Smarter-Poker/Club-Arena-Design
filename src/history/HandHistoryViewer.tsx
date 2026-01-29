/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  HAND HISTORY VIEWER — Browse Past Hands
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../stores/useUserStore';
import { useToast } from '../common/Toast';
import './HandHistoryViewer.css';

interface HandHistoryViewerProps {
    clubId?: string;
    tableId?: string;
    limit?: number;
    onSelectHand?: (handId: string) => void;
}

interface HandSummary {
    id: string;
    tableId: string;
    tableName: string;
    stakes: string;
    potSize: number;
    myResult: number;
    holeCards: string[];
    communityCards: string[];
    position: string;
    action: string;
    playedAt: Date;
}

export function HandHistoryViewer({
    clubId,
    tableId,
    limit = 25,
    onSelectHand
}: HandHistoryViewerProps) {
    const { user } = useUserStore();
    const toast = useToast();

    const [hands, setHands] = useState<HandSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'won' | 'lost'>('all');

    useEffect(() => {
        if (user?.id) {
            loadHands();
        }
    }, [user?.id, clubId, tableId]);

    const loadHands = async () => {
        if (!user?.id) return;
        setLoading(true);

        try {
            let query = supabase
                .from('hand_histories')
                .select('*')
                .eq('user_id', user.id)
                .order('played_at', { ascending: false })
                .limit(limit);

            if (clubId) query = query.eq('club_id', clubId);
            if (tableId) query = query.eq('table_id', tableId);

            const { data, error } = await query;

            if (!error && data) {
                setHands(data.map(h => ({
                    id: h.id,
                    tableId: h.table_id,
                    tableName: h.table_name || 'Table',
                    stakes: h.stakes || '1/2',
                    potSize: h.pot_size || 0,
                    myResult: h.result || 0,
                    holeCards: h.hole_cards || [],
                    communityCards: h.community_cards || [],
                    position: h.position || 'BTN',
                    action: h.final_action || 'fold',
                    playedAt: new Date(h.played_at || h.created_at)
                })));
            }
        } catch (error) {
            toast.error('Failed to load hand history');
        }
        setLoading(false);
    };

    const filteredHands = hands.filter(h => {
        if (filter === 'won') return h.myResult > 0;
        if (filter === 'lost') return h.myResult < 0;
        return true;
    });

    const formatCards = (cards: string[]) => {
        return cards.map(c => {
            const suit = c.slice(-1);
            const suitEmoji = suit === 'h' ? '♥' : suit === 'd' ? '♦' : suit === 'c' ? '♣' : '♠';
            return c.slice(0, -1) + suitEmoji;
        }).join(' ');
    };

    if (loading) {
        return <div className="hand-history loading">Loading...</div>;
    }

    return (
        <div className="hand-history">
            <div className="hand-history__header">
                <h3> Hand History</h3>
                <div className="filters">
                    <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All</button>
                    <button className={filter === 'won' ? 'active' : ''} onClick={() => setFilter('won')}>Won</button>
                    <button className={filter === 'lost' ? 'active' : ''} onClick={() => setFilter('lost')}>Lost</button>
                </div>
            </div>

            {filteredHands.length === 0 ? (
                <div className="empty-state">No hands found</div>
            ) : (
                <div className="hand-history__list">
                    {filteredHands.map(hand => (
                        <div
                            key={hand.id}
                            className={`hand-row ${hand.myResult > 0 ? 'won' : hand.myResult < 0 ? 'lost' : ''}`}
                            onClick={() => onSelectHand?.(hand.id)}
                        >
                            <div className="hand-info">
                                <span className="table">{hand.tableName}</span>
                                <span className="stakes">{hand.stakes}</span>
                                <span className="position">{hand.position}</span>
                            </div>
                            <div className="cards">
                                <span className="hole-cards">{formatCards(hand.holeCards)}</span>
                                {hand.communityCards.length > 0 && (
                                    <span className="board">{formatCards(hand.communityCards)}</span>
                                )}
                            </div>
                            <div className="result">
                                <span className={`amount ${hand.myResult >= 0 ? 'positive' : 'negative'}`}>
                                    {hand.myResult >= 0 ? '+' : ''}{hand.myResult.toLocaleString()}
                                </span>
                                <span className="pot">Pot: {hand.potSize.toLocaleString()}</span>
                            </div>
                            <span className="time">
                                {hand.playedAt.toLocaleDateString()}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default HandHistoryViewer;

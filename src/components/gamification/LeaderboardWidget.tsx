/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  LEADERBOARD WIDGET — Compact Leaderboard Display
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import './LeaderboardWidget.css';

interface LeaderboardWidgetProps {
    clubId?: string;
    period?: 'daily' | 'weekly' | 'monthly' | 'all';
    metric?: 'profit' | 'hands' | 'rake';
    limit?: number;
    showTitle?: boolean;
}

interface LeaderEntry {
    rank: number;
    userId: string;
    username: string;
    avatarUrl: string;
    value: number;
}

export function LeaderboardWidget({
    clubId,
    period = 'weekly',
    metric = 'profit',
    limit = 5,
    showTitle = true
}: LeaderboardWidgetProps) {
    const [entries, setEntries] = useState<LeaderEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadLeaderboard();
    }, [clubId, period, metric]);

    const loadLeaderboard = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .rpc('fn_get_leaderboard', {
                    p_club_id: clubId || null,
                    p_period: period,
                    p_metric: metric,
                    p_limit: limit
                });

            if (!error && data) {
                setEntries(data.map((e: any, idx: number) => ({
                    rank: idx + 1,
                    userId: e.user_id,
                    username: e.username,
                    avatarUrl: e.avatar_url || '',
                    value: e.value || 0
                })));
            }
        } catch (error) {
            console.error('Failed to load leaderboard:', error);
        }
        setLoading(false);
    };

    const formatValue = (value: number) => {
        if (metric === 'profit') {
            return value >= 0 ? `+${value.toLocaleString()}` : value.toLocaleString();
        }
        return value.toLocaleString();
    };

    const getPeriodLabel = () => {
        switch (period) {
            case 'daily': return 'Today';
            case 'weekly': return 'This Week';
            case 'monthly': return 'This Month';
            default: return 'All Time';
        }
    };

    const getMetricIcon = () => {
        switch (metric) {
            case 'profit': return '';
            case 'hands': return '';
            case 'rake': return '';
            default: return '';
        }
    };

    if (loading) {
        return <div className="leaderboard-widget loading">Loading...</div>;
    }

    return (
        <div className="leaderboard-widget">
            {showTitle && (
                <div className="leaderboard-widget__header">
                    <span className="icon">{getMetricIcon()}</span>
                    <span className="title">Top Players</span>
                    <span className="period">{getPeriodLabel()}</span>
                </div>
            )}

            <div className="leaderboard-widget__list">
                {entries.map(entry => (
                    <div key={entry.userId} className={`leader-entry rank-${entry.rank}`}>
                        <span className="rank">
                            {entry.rank === 1 && ''}
                            {entry.rank === 2 && ''}
                            {entry.rank === 3 && ''}
                            {entry.rank > 3 && `#${entry.rank}`}
                        </span>
                        <span className="avatar">{entry.avatarUrl}</span>
                        <span className="username">{entry.username}</span>
                        <span className={`value ${entry.value >= 0 ? 'positive' : 'negative'}`}>
                            {formatValue(entry.value)}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default LeaderboardWidget;

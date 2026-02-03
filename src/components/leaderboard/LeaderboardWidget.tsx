/**
 * ♠ CLUB ARENA — Leaderboard Widget
 * Compact leaderboard for dashboard display
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import './LeaderboardWidget.css';

interface LeaderboardEntry {
    rank: number;
    userId: string;
    username: string;
    avatar?: string;
    value: number;
    change: number; // positive = up, negative = down
}

type LeaderboardType = 'profit' | 'hands' | 'tournaments' | 'streak';

interface LeaderboardWidgetProps {
    clubId?: string;
    type?: LeaderboardType;
    limit?: number;
    showFilters?: boolean;
    onPlayerClick?: (userId: string) => void;
}

export const LeaderboardWidget: React.FC<LeaderboardWidgetProps> = ({
    clubId,
    type = 'profit',
    limit = 5,
    showFilters = true,
    onPlayerClick,
}) => {
    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [selectedType, setSelectedType] = useState<LeaderboardType>(type);
    const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'monthly' | 'alltime'>('weekly');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadLeaderboard();
    }, [clubId, selectedType, timeframe]);

    const loadLeaderboard = async () => {
        setLoading(true);
        try {
            // Mock data for demo
            const mockEntries: LeaderboardEntry[] = [
                { rank: 1, userId: '1', username: 'PokerPro99', value: 12500, change: 2 },
                { rank: 2, userId: '2', username: 'AceHunter', value: 9800, change: -1 },
                { rank: 3, userId: '3', username: 'ChipMaster', value: 8250, change: 1 },
                { rank: 4, userId: '4', username: 'BluffKing', value: 6100, change: 0 },
                { rank: 5, userId: '5', username: 'RiverRat', value: 4500, change: -2 },
            ].slice(0, limit);
            setEntries(mockEntries);
        } catch (error) {
            console.error('Failed to load leaderboard:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatValue = (value: number) => {
        if (selectedType === 'profit') {
            if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
            return `$${value}`;
        }
        if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
        return value.toString();
    };

    const getTypeLabel = (t: LeaderboardType) => {
        switch (t) {
            case 'profit': return 'Profit';
            case 'hands': return 'Hands';
            case 'tournaments': return 'Wins';
            case 'streak': return 'Streak';
        }
    };

    const getRankBadge = (rank: number) => {
        if (rank === 1) return '🥇';
        if (rank === 2) return '🥈';
        if (rank === 3) return '🥉';
        return `#${rank}`;
    };

    return (
        <div className="leaderboard-widget">
            {/* Header */}
            <div className="widget-header">
                <h3>🏆 Leaderboard</h3>
                <a href="/leaderboard" className="view-all">View All →</a>
            </div>

            {/* Filters */}
            {showFilters && (
                <div className="filters-row">
                    <div className="type-filters">
                        {(['profit', 'hands', 'tournaments', 'streak'] as LeaderboardType[]).map(t => (
                            <button
                                key={t}
                                className={`filter-btn ${selectedType === t ? 'active' : ''}`}
                                onClick={() => setSelectedType(t)}
                            >
                                {getTypeLabel(t)}
                            </button>
                        ))}
                    </div>
                    <select
                        className="timeframe-select"
                        value={timeframe}
                        onChange={(e) => setTimeframe(e.target.value as any)}
                    >
                        <option value="daily">Today</option>
                        <option value="weekly">This Week</option>
                        <option value="monthly">This Month</option>
                        <option value="alltime">All Time</option>
                    </select>
                </div>
            )}

            {/* Entries */}
            <div className="entries-list">
                {loading ? (
                    <div className="loading-skeleton">
                        {Array.from({ length: limit }).map((_, i) => (
                            <div key={i} className="skeleton-row" />
                        ))}
                    </div>
                ) : (
                    entries.map((entry, index) => (
                        <div
                            key={entry.userId}
                            className={`entry-row rank-${entry.rank}`}
                            onClick={() => onPlayerClick?.(entry.userId)}
                            style={{ animationDelay: `${index * 50}ms` }}
                        >
                            <span className="rank-badge">{getRankBadge(entry.rank)}</span>
                            <div className="player-info">
                                <div className="player-avatar">
                                    {entry.avatar ? (
                                        <img src={entry.avatar} alt={entry.username} />
                                    ) : (
                                        <span>{entry.username[0]}</span>
                                    )}
                                </div>
                                <span className="player-name">{entry.username}</span>
                            </div>
                            <div className="value-section">
                                <span className="entry-value">{formatValue(entry.value)}</span>
                                {entry.change !== 0 && (
                                    <span className={`change-indicator ${entry.change > 0 ? 'up' : 'down'}`}>
                                        {entry.change > 0 ? '↑' : '↓'}{Math.abs(entry.change)}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default LeaderboardWidget;

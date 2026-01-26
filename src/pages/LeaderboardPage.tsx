/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  LEADERBOARD PAGE — Global Rankings with Real-Time Updates
 * ═══════════════════════════════════════════════════════════════════════════════
 * Full-page leaderboard with club/union rankings and live updates
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { LeaderboardService } from '../services/LeaderboardService';
import type { LeaderboardEntry, LeaderboardMetric, LeaderboardPeriod } from '../services/LeaderboardService';
import { useUserStore } from '../stores/useUserStore';
import { useToast } from '../components/common/Toast';
import SmarterHeader from '../components/layout/SmarterHeader';
import './LeaderboardPage.css';

type LeaderboardScope = 'my-clubs' | 'global';

export default function LeaderboardPage() {
    const navigate = useNavigate();
    const { user } = useUserStore();
    const toast = useToast();
    const [scope, setScope] = useState<LeaderboardScope>('my-clubs');
    const [period, setPeriod] = useState<LeaderboardPeriod>('weekly');
    const [metric, setMetric] = useState<LeaderboardMetric>('profit');
    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [userRank, setUserRank] = useState<{ rank: number; total: number } | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
    const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        loadLeaderboard();

        // Subscribe to real-time leaderboard updates
        const channel = supabase
            .channel('leaderboard-updates')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'leaderboard_cache',
                },
                () => {
                    // Reload leaderboard when data changes
                    loadLeaderboard(true);
                }
            )
            .subscribe();

        // Auto-refresh every 30 seconds
        refreshTimerRef.current = setInterval(() => {
            loadLeaderboard(true);
        }, 30000);

        return () => {
            supabase.removeChannel(channel);
            if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
        };
    }, [scope, period, metric]);

    const loadLeaderboard = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            // For now, load a sample club leaderboard
            // In production, this would aggregate across user's clubs
            const data = await LeaderboardService.getClubLeaderboard(
                'sample-club-id', // Would be dynamic
                metric,
                period,
                50
            );
            setEntries(data);
            setLastUpdated(new Date());

            // Get user's rank
            if (user?.id) {
                const rank = await LeaderboardService.getUserRank(
                    user.id,
                    'sample-club-id',
                    metric,
                    period
                );
                setUserRank(rank);
            }
        } catch (error) {
            console.error('Failed to load leaderboard:', error);
            if (!silent) toast.error('Failed to load leaderboard');
        }
        setLoading(false);
    };

    const formatValue = (value: number, metric: LeaderboardMetric): string => {
        // Format profit-related metrics as currency
        if (metric === 'profit') {
            if (Math.abs(value) >= 1000000) {
                return `$${(value / 1000000).toFixed(1)}M`;
            }
            if (Math.abs(value) >= 1000) {
                return `$${(value / 1000).toFixed(1)}K`;
            }
            return `$${value.toLocaleString()}`;
        }
        return value.toLocaleString();
    };

    const getRankBadge = (rank: number): string => {
        if (rank === 1) return '';
        if (rank === 2) return '';
        if (rank === 3) return '';
        return `#${rank}`;
    };

    return (
        <div className="leaderboard-page">
            <SmarterHeader title=" Leaderboard" />

            {/* Live Indicator */}
            <div className="live-indicator">
                <span className="live-dot"></span>
                <span>Live • Updated {lastUpdated.toLocaleTimeString()}</span>
            </div>

            {/* User Rank Card */}
            {userRank && (
                <div className="user-rank-card">
                    <div className="user-rank-position">
                        <span className="rank-number">{getRankBadge(userRank.rank)}</span>
                        <span className="rank-label">Your Rank</span>
                    </div>
                    <div className="rank-context">
                        out of {userRank.total.toLocaleString()} players
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="leaderboard-filters">
                {/* Scope Toggle */}
                <div className="filter-group scope-toggle">
                    <button
                        className={scope === 'my-clubs' ? 'active' : ''}
                        onClick={() => setScope('my-clubs')}
                    >
                        My Clubs
                    </button>
                    <button
                        className={scope === 'global' ? 'active' : ''}
                        onClick={() => setScope('global')}
                    >
                        Global
                    </button>
                </div>

                {/* Period Selector */}
                <div className="filter-group">
                    <select
                        value={period}
                        onChange={(e) => setPeriod(e.target.value as LeaderboardPeriod)}
                    >
                        <option value="daily">Today</option>
                        <option value="weekly">This Week</option>
                        <option value="monthly">This Month</option>
                        <option value="allTime">All Time</option>
                    </select>
                </div>

                {/* Metric Selector */}
                <div className="filter-group">
                    <select
                        value={metric}
                        onChange={(e) => setMetric(e.target.value as LeaderboardMetric)}
                    >
                        <option value="profit">Profit</option>
                        <option value="hands_played">Hands Played</option>
                        <option value="rake_generated">Rake Generated</option>
                        <option value="tournaments_won">Tournaments Won</option>
                    </select>
                </div>
            </div>

            {/* Leaderboard Table */}
            <div className="leaderboard-list">
                {loading ? (
                    <div className="loading-state">
                        <div className="spinner" />
                        <p>Loading rankings...</p>
                    </div>
                ) : entries.length === 0 ? (
                    <div className="empty-state">
                        <span className="empty-icon"></span>
                        <p>No rankings yet. Start playing to climb the leaderboard!</p>
                    </div>
                ) : (
                    entries.map((entry) => (
                        <div
                            key={entry.userId}
                            className={`leaderboard-entry ${entry.userId === user?.id ? 'current-user' : ''}`}
                            onClick={() => navigate(`/profile/${entry.userId}`)}
                            style={{ cursor: 'pointer' }}
                        >
                            <span className={`entry-rank ${entry.rank <= 3 ? 'top-3' : ''}`}>
                                {getRankBadge(entry.rank)}
                            </span>
                            <div className="entry-avatar">
                                {entry.avatar ? (
                                    <img src={entry.avatar} alt="" />
                                ) : (
                                    <span>{entry.username[0]?.toUpperCase()}</span>
                                )}
                            </div>
                            <div className="entry-info">
                                <span className="entry-name">{entry.username}</span>
                                {entry.xpEarned && (
                                    <span className="entry-xp">+{entry.xpEarned} XP</span>
                                )}
                            </div>
                            <div className={`entry-value ${entry.value >= 0 ? 'positive' : 'negative'}`}>
                                {formatValue(entry.value, metric)}
                                {entry.change !== 0 && (
                                    <span className={`change ${entry.change > 0 ? 'up' : 'down'}`}>
                                        {entry.change > 0 ? '▲' : '▼'} {Math.abs(entry.change)}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

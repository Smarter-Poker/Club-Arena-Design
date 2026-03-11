/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  LEADERBOARD PAGE — Global Rankings with Real-Time Updates
 * ═══════════════════════════════════════════════════════════════════════════════
 * Full-page leaderboard with club/union rankings, podium display, and live updates.
 * Supports Clubs, Charities, and Home Game venue types with appropriate metrics.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { LeaderboardService } from '../services/LeaderboardService';
import type { LeaderboardEntry, LeaderboardMetric, LeaderboardPeriod, TournamentStats } from '../services/LeaderboardService';
import { getUserMemberships } from '../services/ClubsService';
import { useUserStore } from '../stores/useUserStore';
import { useToast } from '../components/common/Toast';
import './LeaderboardPage.css';

const podiumAnimationStyle = {
    opacity: 0,
    transform: 'translateY(16px)',
    animation: 'fadeInUp 0.7s ease-out forwards',
};

const rankingRowAnimationStyle = (index: number) => ({
    opacity: 0,
    transform: 'translateY(8px)',
    animation: `fadeInUp 0.5s ease-out ${index * 60}ms forwards`,
});

type LeaderboardScope = 'my-clubs' | 'global';
type LeaderboardTab = 'rankings' | 'tournaments';

interface UserClub {
    id: string;
    name: string;
}

// Metric definitions with labels and icons for each metric type
const METRIC_OPTIONS: { value: LeaderboardMetric; label: string; icon: string; description: string }[] = [
    { value: 'profit', label: 'Profit', icon: '💰', description: 'Total profit earned' },
    { value: 'hands_played', label: 'Hands Played', icon: '🃏', description: 'Total hands dealt in' },
    { value: 'tournaments_won', label: 'Tournaments Won', icon: '🏆', description: 'Tournament victories' },
    { value: 'vpip', label: 'VPIP', icon: '📊', description: 'Voluntarily put chips in pot %' },
    { value: 'roi', label: 'ROI', icon: '📈', description: 'Return on investment %' },
];

const PERIOD_OPTIONS: { value: LeaderboardPeriod; label: string }[] = [
    { value: 'daily', label: 'Today' },
    { value: 'weekly', label: 'This Week' },
    { value: 'monthly', label: 'This Month' },
    { value: 'all_time', label: 'All Time' },
];

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

    // Club selection
    const [userClubs, setUserClubs] = useState<UserClub[]>([]);
    const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
    const [clubsLoading, setClubsLoading] = useState(true);

    // Tournament stats
    const [activeTab, setActiveTab] = useState<LeaderboardTab>('rankings');
    const activeTabRef = useRef<LeaderboardTab>('rankings');
    const [tournamentStats, setTournamentStats] = useState<TournamentStats[]>([]);
    const [tournamentsLoading, setTournamentsLoading] = useState(false);

    // Load user's clubs on mount
    useEffect(() => {
        loadUserClubs();
    }, []);

    // Keep activeTabRef in sync
    useEffect(() => {
        activeTabRef.current = activeTab;
    }, [activeTab]);

    // Load leaderboard when filters or selected club change
    useEffect(() => {
        if (selectedClubId) {
            if (activeTab === 'rankings') {
                loadLeaderboard();
            } else {
                loadTournamentStats();
            }

            // Subscribe to real-time leaderboard updates
            const channel = supabase
                .channel('leaderboard-updates')
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'promotion_leaderboards',
                    },
                    () => {
                        if (activeTabRef.current === 'rankings') loadLeaderboard(true);
                    }
                )
                .subscribe();

            // Also subscribe to tournament updates
            const tourneyChannel = supabase
                .channel('tournament-leaderboard-updates')
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'tournament_players',
                    },
                    () => {
                        if (activeTabRef.current === 'tournaments') loadTournamentStats();
                    }
                )
                .subscribe();

            // Auto-refresh every 30 seconds
            refreshTimerRef.current = setInterval(() => {
                if (activeTabRef.current === 'rankings') {
                    loadLeaderboard(true);
                } else {
                    loadTournamentStats();
                }
            }, 30000);

            return () => {
                supabase.removeChannel(channel);
                supabase.removeChannel(tourneyChannel);
                if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
            };
        } else {
            setEntries([]);
            setTournamentStats([]);
            setLoading(false);
        }
    }, [scope, period, metric, selectedClubId, activeTab]);

    const loadUserClubs = async () => {
        setClubsLoading(true);
        try {
            const memberships = await getUserMemberships();
            const clubs = memberships.map((m: any) => ({
                id: m.club?.id || m.club_id,
                name: m.club?.name || 'Unknown Club',
            })).filter((c: UserClub) => c.id);

            setUserClubs(clubs);
            if (clubs.length > 0 && !selectedClubId) {
                setSelectedClubId(clubs[0].id);
            }
        } catch (error) {
            console.error('Failed to load clubs:', error);
        }
        setClubsLoading(false);
    };

    const loadLeaderboard = async (silent = false) => {
        if (!selectedClubId) {
            setLoading(false);
            return;
        }
        if (!silent) setLoading(true);
        try {
            const data = await LeaderboardService.getClubLeaderboard(
                selectedClubId,
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
                    selectedClubId,
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

    const loadTournamentStats = async () => {
        if (!selectedClubId) {
            setTournamentsLoading(false);
            return;
        }
        setTournamentsLoading(true);
        try {
            const data = await LeaderboardService.getClubTournamentStats(
                selectedClubId,
                50
            );
            setTournamentStats(data);
            setLastUpdated(new Date());
        } catch (error) {
            console.error('Failed to load tournament stats:', error);
            toast.error('Failed to load tournament stats');
        }
        setTournamentsLoading(false);
    };

    const formatValue = (value: number, m: LeaderboardMetric): string => {
        const precise = Math.trunc(value * 100) / 100;
        if (m === 'profit' || m === 'hands_played' || m === 'tournaments_won') {
            return precise.toLocaleString('en-US');
        }
        if (m === 'vpip' || m === 'roi') {
            return `${precise}%`;
        }
        return precise.toLocaleString('en-US');
    };

    const getRankBadge = (rank: number): string => {
        if (rank === 1) return '🥇';
        if (rank === 2) return '🥈';
        if (rank === 3) return '🥉';
        return `#${rank}`;
    };

    const getRankLabel = (rank: number): string => {
        if (rank === 1) return '1st';
        if (rank === 2) return '2nd';
        if (rank === 3) return '3rd';
        return `#${rank}`;
    };

    const top3 = entries.slice(0, 3);
    const rest = entries.slice(3);

    return (
        <div className="leaderboard-page">

            {/* Live Indicator */}
            <div className="live-indicator">
                <span className="live-dot"></span>
                <span>Live • Updated {lastUpdated.toLocaleTimeString()}</span>
            </div>

            {/* Tab Selector */}
            <div className="leaderboard-tabs">
                <button
                    className={`tab-btn ${activeTab === 'rankings' ? 'active' : ''}`}
                    onClick={() => setActiveTab('rankings')}
                >
                    Rankings
                </button>
                <button
                    className={`tab-btn ${activeTab === 'tournaments' ? 'active' : ''}`}
                    onClick={() => setActiveTab('tournaments')}
                >
                    Tournament Stats
                </button>
            </div>

            {/* User Rank Card */}
            {userRank && (
                <div className="user-rank-card">
                    <div className="user-rank-position">
                        <span className="rank-number">{getRankLabel(userRank.rank)}</span>
                        <span className="rank-label">Your Rank</span>
                    </div>
                    <div className="rank-context">
                        out of {userRank.total.toLocaleString()} players
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="leaderboard-filters">
                {/* Club Selector (only shown when multiple clubs) */}
                {userClubs.length > 1 && (
                    <div className="filter-group">
                        <select
                            value={selectedClubId || ''}
                            onChange={(e) => setSelectedClubId(e.target.value)}
                        >
                            {userClubs.map(club => (
                                <option key={club.id} value={club.id}>{club.name}</option>
                            ))}
                        </select>
                    </div>
                )}

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
                        {PERIOD_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </div>

                {/* Metric Selector */}
                <div className="filter-group">
                    <select
                        value={metric}
                        onChange={(e) => setMetric(e.target.value as LeaderboardMetric)}
                    >
                        {METRIC_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>
                                {opt.icon} {opt.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Leaderboard Content */}
            <div className="leaderboard-list">
                {clubsLoading ? (
                    <div className="loading-state">
                        <div className="spinner" />
                        <p>Loading clubs...</p>
                    </div>
                ) : userClubs.length === 0 ? (
                    <div className="empty-state">
                        <span className="empty-icon">♠</span>
                        <p>Join a club to see leaderboard rankings!</p>
                        <button
                            className="join-club-btn"
                            onClick={() => navigate('/clubs')}
                        >
                            Browse Clubs
                        </button>
                    </div>
                ) : activeTab === 'rankings' && loading ? (
                    <div className="loading-state">
                        <div className="spinner" />
                        <p>Loading rankings...</p>
                    </div>
                ) : activeTab === 'rankings' && entries.length === 0 ? (
                    <div className="empty-state">
                        <span className="empty-icon">🏆</span>
                        <p>No rankings yet for this period.</p>
                        <p className="empty-sub">Start playing to climb the leaderboard!</p>
                    </div>
                ) : activeTab === 'tournaments' && tournamentsLoading ? (
                    <div className="loading-state">
                        <div className="spinner" />
                        <p>Loading tournament stats...</p>
                    </div>
                ) : activeTab === 'tournaments' && tournamentStats.length === 0 ? (
                    <div className="empty-state">
                        <span className="empty-icon">🏅</span>
                        <p>No tournament stats yet.</p>
                        <p className="empty-sub">Register for a tournament to see your stats!</p>
                    </div>
                ) : activeTab === 'rankings' && entries.length > 0 ? (
                    <>
                        {/* ── TOP 3 PODIUM ── */}
                        {top3.length >= 3 && (
                            <div className="podium-section" style={podiumAnimationStyle}>
                                {/* 2nd Place */}
                                <div
                                    className="podium-place podium-2nd"
                                    onClick={() => navigate(`/profile/${top3[1].userId}`)}
                                >
                                    <div className="podium-avatar silver">
                                        {top3[1].avatar ? (
                                            <img src={top3[1].avatar} alt="" />
                                        ) : (
                                            <span>{top3[1].username[0]?.toUpperCase()}</span>
                                        )}
                                    </div>
                                    {top3[1].isVIP && <span className="vip-badge">VIP</span>}
                                    <span className="podium-name">{top3[1].username}</span>
                                    <span className="podium-value silver-text">
                                        {formatValue(top3[1].value, metric)}
                                    </span>
                                    <span className="podium-rank-emoji">🥈</span>
                                    <div className="podium-bar silver-bar"></div>
                                </div>

                                {/* 1st Place */}
                                <div
                                    className="podium-place podium-1st"
                                    onClick={() => navigate(`/profile/${top3[0].userId}`)}
                                >
                                    <div className="podium-crown">👑</div>
                                    <div className="podium-avatar gold">
                                        {top3[0].avatar ? (
                                            <img src={top3[0].avatar} alt="" />
                                        ) : (
                                            <span>{top3[0].username[0]?.toUpperCase()}</span>
                                        )}
                                    </div>
                                    {top3[0].isVIP && <span className="vip-badge">VIP</span>}
                                    <span className="podium-name">{top3[0].username}</span>
                                    <span className="podium-value gold-text">
                                        {formatValue(top3[0].value, metric)}
                                    </span>
                                    <span className="podium-rank-emoji">🥇</span>
                                    <div className="podium-bar gold-bar"></div>
                                </div>

                                {/* 3rd Place */}
                                <div
                                    className="podium-place podium-3rd"
                                    onClick={() => navigate(`/profile/${top3[2].userId}`)}
                                >
                                    <div className="podium-avatar bronze">
                                        {top3[2].avatar ? (
                                            <img src={top3[2].avatar} alt="" />
                                        ) : (
                                            <span>{top3[2].username[0]?.toUpperCase()}</span>
                                        )}
                                    </div>
                                    {top3[2].isVIP && <span className="vip-badge">VIP</span>}
                                    <span className="podium-name">{top3[2].username}</span>
                                    <span className="podium-value bronze-text">
                                        {formatValue(top3[2].value, metric)}
                                    </span>
                                    <span className="podium-rank-emoji">🥉</span>
                                    <div className="podium-bar bronze-bar"></div>
                                </div>
                            </div>
                        )}

                        {/* Show top 3 as list rows if less than 3 total */}
                        {top3.length < 3 && top3.map((entry, index) => (
                            <div
                                key={entry.userId}
                                className={`leaderboard-entry ${entry.userId === user?.id ? 'current-user' : ''}`}
                                onClick={() => navigate(`/profile/${entry.userId}`)}
                                style={{ ...rankingRowAnimationStyle(index), cursor: 'pointer' }}
                            >
                                <span className={`entry-rank top-3`}>
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
                                    <span className="entry-name">
                                        {entry.username}
                                        {entry.isVIP && <span className="entry-vip-tag">VIP</span>}
                                    </span>
                                </div>
                                <div className={`entry-value ${entry.value >= 0 ? 'positive' : 'negative'}`}>
                                    {formatValue(entry.value, metric)}
                                </div>
                            </div>
                        ))}

                        {/* ── REMAINING RANKINGS (4th+) ── */}
                        {rest.length > 0 && (
                            <div className="rankings-divider">
                                <span>Rankings</span>
                            </div>
                        )}
                        {rest.map((entry, index) => (
                            <div
                                key={entry.userId}
                                className={`leaderboard-entry ${entry.userId === user?.id ? 'current-user' : ''}`}
                                onClick={() => navigate(`/profile/${entry.userId}`)}
                                style={{ ...rankingRowAnimationStyle(index), cursor: 'pointer' }}
                            >
                                <span className="entry-rank">
                                    {getRankLabel(entry.rank)}
                                </span>
                                <div className="entry-avatar">
                                    {entry.avatar ? (
                                        <img src={entry.avatar} alt="" />
                                    ) : (
                                        <span>{entry.username[0]?.toUpperCase()}</span>
                                    )}
                                </div>
                                <div className="entry-info">
                                    <span className="entry-name">
                                        {entry.username}
                                        {entry.isVIP && <span className="entry-vip-tag">VIP</span>}
                                    </span>
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
                        ))}
                    </>
                ) : activeTab === 'tournaments' && tournamentStats.length > 0 ? (
                    <>
                        {/* Tournament Stats Header */}
                        <div className="tournament-stats-header">
                            <div className="stats-column-header">Player</div>
                            <div className="stats-column-header">Tournaments</div>
                            <div className="stats-column-header">Wins</div>
                            <div className="stats-column-header">Final Tables</div>
                            <div className="stats-column-header">ITM</div>
                            <div className="stats-column-header">Total Prizes</div>
                            <div className="stats-column-header">ROI</div>
                            <div className="stats-column-header">Biggest Win</div>
                        </div>

                        {/* Tournament Stats Rows */}
                        {tournamentStats.map((stat, index) => (
                            <div
                                key={stat.userId}
                                className={`tournament-stats-entry animate-fade-in-up stagger-${Math.min(index + 1, 10)} ${stat.userId === user?.id ? 'current-user' : ''}`}
                                onClick={() => navigate(`/profile/${stat.userId}`)}
                                style={{ cursor: 'pointer' }}
                            >
                                <div className="stats-cell player-cell">
                                    <span className="rank-badge">#{index + 1}</span>
                                    <div className="entry-avatar">
                                        {stat.avatar ? (
                                            <img src={stat.avatar} alt="" />
                                        ) : (
                                            <span>{stat.username[0]?.toUpperCase()}</span>
                                        )}
                                    </div>
                                    <span className="player-name">{stat.username}</span>
                                </div>
                                <div className="stats-cell">{stat.tournamentsPlayed}</div>
                                <div className="stats-cell wins">{stat.wins}</div>
                                <div className="stats-cell">{stat.finalTables}</div>
                                <div className="stats-cell">{stat.itmFinishes}</div>
                                <div className="stats-cell prizes">{(Math.trunc(stat.totalPrizes * 100) / 100).toLocaleString()}</div>
                                <div className={`stats-cell roi ${stat.roi >= 0 ? 'positive' : 'negative'}`}>
                                    {Math.trunc(stat.roi * 100) / 100}%
                                </div>
                                <div className="stats-cell biggest">{(Math.trunc(stat.biggestWin * 100) / 100).toLocaleString()}</div>
                            </div>
                        ))}
                    </>
                ) : null}
            </div>
        </div>
    );
}

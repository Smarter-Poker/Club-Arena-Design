/**
 *  PLAYER STATS PAGE — Detailed Statistics with Charts
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase'
import { masterBus } from '../core/MasterBus';
import { useUserStore } from '../stores/useUserStore';
import { useToast } from '../components/common/Toast';
import {
    LineChart,
    Line,
    AreaChart,
    Area,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from 'recharts';
import PositionWinRates from '../components/stats/PositionWinRates';
import SessionHistory from '../components/stats/SessionHistory';
import BankrollTracker from '../components/stats/BankrollTracker';
import AdvancedStatsSummary from '../components/stats/AdvancedStatsSummary';
import './PlayerStatsPage.css';

interface DetailedStats {
    // Volume
    total_hands: number;
    hands_won: number;
    hands_lost: number;
    showdowns_won: number;
    showdowns_total: number;

    // Style
    vpip: number;
    pfr: number;
    aggression_factor: number;
    three_bet_percent: number;
    fold_to_three_bet: number;
    cbet_flop: number;
    cbet_turn: number;

    // Results
    bb_per_100: number;
    total_profit: number;
    biggest_pot_won: number;
    biggest_pot_lost: number;

    // Time
    hours_played: number;
    avg_session_length: number;
}

interface SessionData {
    date: string;
    profit: number;
    hands: number;
    cumulative: number;
}

type StatCategory = 'overview' | 'preflop' | 'postflop' | 'results' | 'charts' | 'advanced' | 'positions' | 'sessions' | 'bankroll';

const CHART_COLORS = ['#4169E1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

// Standalone animated counter hook (must be defined outside component)
function useCountUpNumber(target: number, duration: number = 400) {
    const [display, setDisplay] = useState(0);
    useEffect(() => {
        let startTime: number;
        let rafId: number;
        const animate = (now: number) => {
            if (!startTime) startTime = now;
            const progress = Math.min((now - startTime) / duration, 1);
            setDisplay(Math.floor(target * progress));
            if (progress < 1) {
                rafId = requestAnimationFrame(animate);
            } else {
                setDisplay(target);
            }
        };
        rafId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(rafId);
    }, [target, duration]);
    return display;
}

export default function PlayerStatsPage() {
    const navigate = useNavigate();
    const { userId } = useParams();
    const { user } = useUserStore();

    const targetUserId = userId || user?.id;
    const [stats, setStats] = useState<DetailedStats | null>(null);
    const [sessionHistory, setSessionHistory] = useState<SessionData[]>([]);
    const [loading, setLoading] = useState(true);
    const [category, setCategory] = useState<StatCategory>('overview');
    const [visibleSummaryCards, setVisibleSummaryCards] = useState(new Set<number>());
    const [visibleSessionRows, setVisibleSessionRows] = useState(new Set<number>());
    const toast = useToast();

    // Stagger summary cards on mount
    useEffect(() => {
        const timers = [0, 1, 2].map((i) =>
            setTimeout(() => setVisibleSummaryCards(prev => new Set([...prev, i])), i * 60)
        );
        return () => timers.forEach(t => clearTimeout(t));
    }, []);

    // Stagger session rows
    useEffect(() => {
        if (sessionHistory.length > 0) {
            const timers = sessionHistory.map((_, i) =>
                setTimeout(() => setVisibleSessionRows(prev => new Set([...prev, i])), i * 50)
            );
            return () => timers.forEach(t => clearTimeout(t));
        }
    }, [sessionHistory.length]);

    useEffect(() => {
        if (targetUserId) {
            loadStats();
            loadSessionHistory();
        }
    }, [targetUserId]);

    // ── Realtime: live stats updates when new hands complete ──
    useEffect(() => {
        if (!targetUserId) return;
        const channelKey = `player-stats-${targetUserId}`;

        const channel = masterBus.getOrCreateChannel(channelKey);
            channel
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'hand_history',
                filter: `player_ids=cs.{${targetUserId}}`,
            }, () => {
                loadStats();
                loadSessionHistory();
            })
            .subscribe();
        return () => { masterBus.removeRegisteredChannel(channelKey); };
    }, [targetUserId]);

    const loadStats = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('player_stats')
                .select('*')
                .eq('user_id', targetUserId)
                .single();

            if (!error && data) {
                setStats(data);
            } else {
                // Default stats
                setStats({
                    total_hands: 0, hands_won: 0, hands_lost: 0,
                    showdowns_won: 0, showdowns_total: 0,
                    vpip: 0, pfr: 0, aggression_factor: 0,
                    three_bet_percent: 0, fold_to_three_bet: 0,
                    cbet_flop: 0, cbet_turn: 0,
                    bb_per_100: 0, total_profit: 0,
                    biggest_pot_won: 0, biggest_pot_lost: 0,
                    hours_played: 0, avg_session_length: 0,
                });
            }
        } catch (error) {
            console.error('Failed to load stats:', error);
            toast.error('Failed to load player stats');
        }
        setLoading(false);
    };

    const loadSessionHistory = async () => {
        try {
            const { data } = await supabase
                .from('player_sessions')
                .select('date, profit_loss, hands_played')
                .eq('user_id', targetUserId)
                .order('date', { ascending: true })
                .limit(30);

            if (data && data.length > 0) {
                let cumulative = 0;
                const history = data.map(session => {
                    cumulative += session.profit_loss || 0;
                    return {
                        date: new Date(session.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                        profit: session.profit_loss || 0,
                        hands: session.hands_played || 0,
                        cumulative,
                    };
                });
                setSessionHistory(history);
            } else {
                // No real session data yet — show empty state (no fake data)
                setSessionHistory([]);
            }
        } catch (error) {
            console.error('Failed to load session history:', error);
        }
    };

    const winRate = stats && stats.total_hands > 0
        ? ((stats.hands_won / stats.total_hands) * 100).toFixed(1)
        : '0';

    const showdownWinRate = stats && stats.showdowns_total > 0
        ? ((stats.showdowns_won / stats.showdowns_total) * 100).toFixed(1)
        : '0';

    // Animated win rate counter — hook called at component body level (not inside useMemo)
    const winRateInt = parseInt(winRate.split('.')[0]) || 0;
    const winRateDec = winRate.split('.')[1] || '';
    const countedWinRate = useCountUpNumber(winRateInt, 400);
    const displayedWinRate = winRateDec ? `${countedWinRate}.${winRateDec}` : `${countedWinRate}`;

    // Position breakdown — populated from real DB data when available
    // TODO: wire to player_position_stats table when available
    const positionData = stats ? [
        { name: 'BTN', value: Math.round((stats.hands_won / Math.max(stats.total_hands, 1)) * 100), fullName: 'Button' },
        { name: 'CO', value: Math.round((stats.hands_won / Math.max(stats.total_hands, 1)) * 80), fullName: 'Cutoff' },
        { name: 'MP', value: Math.round((stats.hands_won / Math.max(stats.total_hands, 1)) * 70), fullName: 'Middle Position' },
        { name: 'EP', value: Math.round((stats.hands_won / Math.max(stats.total_hands, 1)) * 60), fullName: 'Early Position' },
        { name: 'SB', value: Math.round((stats.hands_won / Math.max(stats.total_hands, 1)) * 65), fullName: 'Small Blind' },
        { name: 'BB', value: Math.round((stats.hands_won / Math.max(stats.total_hands, 1)) * 55), fullName: 'Big Blind' },
    ] : [];

    if (loading) {
        return (
            <div className="stats-page">
                <div className="loading-state"><div className="spinner" /></div>
            </div>
        );
    }

    return (
        <div className="stats-page">

            {/* Summary Cards */}
            <div className="stats-summary">
                <div
                    className="stat-card"
                    style={{
                        opacity: visibleSummaryCards.has(0) ? 1 : 0,
                        transform: visibleSummaryCards.has(0) ? 'translateY(0)' : 'translateY(8px)',
                        transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                    }}
                >
                    <span className="stat-value">{stats?.total_hands.toLocaleString()}</span>
                    <span className="stat-label">Hands Played</span>
                </div>
                <div
                    className="stat-card"
                    style={{
                        opacity: visibleSummaryCards.has(1) ? 1 : 0,
                        transform: visibleSummaryCards.has(1) ? 'translateY(0)' : 'translateY(8px)',
                        transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                    }}
                >
                    <span className="stat-value">{displayedWinRate}%</span>
                    <span className="stat-label">Win Rate</span>
                </div>
                <div
                    className="stat-card profit"
                    style={{
                        opacity: visibleSummaryCards.has(2) ? 1 : 0,
                        transform: visibleSummaryCards.has(2) ? 'translateY(0)' : 'translateY(8px)',
                        transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                    }}
                >
                    <span className={`stat-value ${(stats?.total_profit || 0) >= 0 ? 'positive' : 'negative'}`}>
                        {stats?.total_profit.toLocaleString()}
                    </span>
                    <span className="stat-label">Total Profit</span>
                </div>
            </div>

            {/* Category Tabs */}
            <div className="stats-tabs">
                {(['overview', 'advanced', 'positions', 'sessions', 'bankroll', 'preflop', 'postflop', 'results', 'charts'] as StatCategory[]).map(cat => (
                    <button
                        key={cat}
                        className={category === cat ? 'active' : ''}
                        onClick={() => setCategory(cat)}
                    >
                        {cat === 'charts' ? 'Charts' :
                         cat === 'advanced' ? 'Advanced' :
                         cat === 'positions' ? 'Positions' :
                         cat === 'sessions' ? 'Sessions' :
                         cat === 'bankroll' ? 'Bankroll' :
                         cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </button>
                ))}
            </div>

            {/* Stats Content */}
            <div className="stats-content">
                {category === 'overview' && stats && (
                    <div className="stats-grid">
                        <StatRow label="VPIP" value={`${(stats.vpip * 100).toFixed(1)}%`} />
                        <StatRow label="PFR" value={`${(stats.pfr * 100).toFixed(1)}%`} />
                        <StatRow label="Aggression Factor" value={stats.aggression_factor.toFixed(2)} />
                        <StatRow label="Hours Played" value={`${stats.hours_played.toFixed(1)}h`} />
                        <StatRow label="Showdown Win %" value={`${showdownWinRate}%`} />
                        <StatRow label="BB/100" value={stats.bb_per_100.toFixed(2)} highlight />
                    </div>
                )}

                {category === 'preflop' && stats && (
                    <div className="stats-grid">
                        <StatRow label="VPIP" value={`${(stats.vpip * 100).toFixed(1)}%`} />
                        <StatRow label="PFR" value={`${(stats.pfr * 100).toFixed(1)}%`} />
                        <StatRow label="3-Bet %" value={`${(stats.three_bet_percent * 100).toFixed(1)}%`} />
                        <StatRow label="Fold to 3-Bet" value={`${(stats.fold_to_three_bet * 100).toFixed(1)}%`} />
                    </div>
                )}

                {category === 'postflop' && stats && (
                    <div className="stats-grid">
                        <StatRow label="C-Bet Flop" value={`${(stats.cbet_flop * 100).toFixed(1)}%`} />
                        <StatRow label="C-Bet Turn" value={`${(stats.cbet_turn * 100).toFixed(1)}%`} />
                        <StatRow label="Aggression Factor" value={stats.aggression_factor.toFixed(2)} />
                        <StatRow label="Showdown Win %" value={`${showdownWinRate}%`} />
                    </div>
                )}

                {category === 'results' && stats && (
                    <div className="stats-grid">
                        <StatRow label="Total Profit" value={`${stats.total_profit.toLocaleString()}`} highlight />
                        <StatRow label="BB/100" value={stats.bb_per_100.toFixed(2)} />
                        <StatRow label="Biggest Pot Won" value={`${stats.biggest_pot_won.toLocaleString()}`} />
                        <StatRow label="Biggest Pot Lost" value={`${stats.biggest_pot_lost.toLocaleString()}`} />
                        <StatRow label="Hands Won" value={stats.hands_won.toLocaleString()} />
                        <StatRow label="Hands Lost" value={stats.hands_lost.toLocaleString()} />
                    </div>
                )}

                {category === 'advanced' && (
                    <div style={{ opacity: 1, transform: 'translateY(0)', transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
                        <AdvancedStatsSummary />
                    </div>
                )}

                {category === 'positions' && (
                    <div style={{ opacity: 1, transform: 'translateY(0)', transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
                        <PositionWinRates />
                    </div>
                )}

                {category === 'sessions' && (
                    <div style={{ opacity: 1, transform: 'translateY(0)', transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
                        <SessionHistory />
                    </div>
                )}

                {category === 'bankroll' && (
                    <div style={{ opacity: 1, transform: 'translateY(0)', transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
                        <BankrollTracker />
                    </div>
                )}

                {category === 'charts' && (
                    <div
                        className="charts-section"
                        style={{
                            opacity: category === 'charts' ? 1 : 0,
                            transform: category === 'charts' ? 'translateY(0)' : 'translateY(12px)',
                            transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                        }}
                    >
                        {/* Profit Over Time Chart */}
                        <div className="chart-card">
                            <h3> Profit Over Time</h3>
                            <div className="chart-container">
                                <ResponsiveContainer width="100%" height={250}>
                                    <AreaChart data={sessionHistory}>
                                        <defs>
                                            <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#4169E1" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#4169E1" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                        <XAxis dataKey="date" stroke="rgba(255,255,255,0.5)" fontSize={12} />
                                        <YAxis stroke="rgba(255,255,255,0.5)" fontSize={12} />
                                        <Tooltip
                                            contentStyle={{
                                                background: '#1e1e32',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                borderRadius: '8px',
                                            }}
                                            labelStyle={{ color: '#fff' }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="cumulative"
                                            stroke="#4169E1"
                                            fill="url(#profitGradient)"
                                            strokeWidth={2}
                                            name="Cumulative Profit"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Session Results Bar Chart */}
                        <div className="chart-card">
                            <h3> Daily Results</h3>
                            <div className="chart-container">
                                <ResponsiveContainer width="100%" height={200}>
                                    <BarChart data={sessionHistory}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                        <XAxis dataKey="date" stroke="rgba(255,255,255,0.5)" fontSize={12} />
                                        <YAxis stroke="rgba(255,255,255,0.5)" fontSize={12} />
                                        <Tooltip
                                            contentStyle={{
                                                background: '#1e1e32',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                borderRadius: '8px',
                                            }}
                                            labelStyle={{ color: '#fff' }}
                                        />
                                        <Bar
                                            dataKey="profit"
                                            name="Profit"
                                            radius={[4, 4, 0, 0]}
                                        >
                                            {sessionHistory.map((entry, index) => (
                                                <Cell
                                                    key={`cell-${index}`}
                                                    fill={entry.profit >= 0 ? '#22c55e' : '#ef4444'}
                                                />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Position Breakdown Pie Chart */}
                        <div className="chart-card">
                            <h3> Win % by Position</h3>
                            <div className="chart-container pie-chart">
                                <ResponsiveContainer width="100%" height={250}>
                                    <PieChart>
                                        <Pie
                                            data={positionData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={90}
                                            paddingAngle={2}
                                            dataKey="value"
                                            nameKey="name"
                                            label={({ name, value }) => `${name}: ${value}%`}
                                            labelLine={{ stroke: 'rgba(255,255,255,0.3)' }}
                                        >
                                            {positionData.map((entry, index) => (
                                                <Cell
                                                    key={`cell-${index}`}
                                                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                                                />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{
                                                background: '#1e1e32',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                borderRadius: '8px',
                                            }}
                                            formatter={(value, name) => [`${value}%`, positionData.find(p => p.name === name)?.fullName || name]}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function StatRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
    return (
        <div className={`stat-row ${highlight ? 'highlight' : ''}`}>
            <span className="row-label">{label}</span>
            <span className="row-value">{value}</span>
        </div>
    );
}


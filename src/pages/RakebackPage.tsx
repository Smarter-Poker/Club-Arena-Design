/**
 *  RAKEBACK PAGE — Player Rakeback Dashboard with Charts
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useUserStore } from '../stores/useUserStore';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import './RakebackPage.css';

interface RakebackPeriod {
    id: string;
    period_start: string;
    period_end: string;
    rake_generated: number;
    rakeback_rate: number;
    rakeback_earned: number;
    status: 'pending' | 'paid';
}

export default function RakebackPage() {
    const navigate = useNavigate();
    const { user } = useUserStore();

    const [periods, setPeriods] = useState<RakebackPeriod[]>([]);
    const [loading, setLoading] = useState(true);
    const [totalEarned, setTotalEarned] = useState(0);
    const [currentRate, setCurrentRate] = useState(0);

    // Refs to avoid stale closures
    const loadRakebackDataRef = useRef<() => void>(() => {});

    const loadRakebackData = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('rakeback_periods')
                .select('*')
                .eq('user_id', user?.id)
                .order('period_start', { ascending: false })
                .limit(12);

            if (!error && data) {
                setPeriods(data);
                setTotalEarned(data.reduce((sum, p) => sum + (p.rakeback_earned || 0), 0));
                if (data.length > 0) {
                    setCurrentRate(data[0].rakeback_rate || 0);
                }
            }
        } catch (error) {
            console.error('Failed to load rakeback:', error);
        }
        setLoading(false);
    };

    // Store ref for callback use
    useEffect(() => {
        loadRakebackDataRef.current = loadRakebackData;
    }, [user?.id]);

    // Setup subscriptions to rakeback and wallet changes
    useEffect(() => {
        if (!user?.id) return;

        // Real-time updates when rakeback periods change
        const rakebackChannel = supabase
            .channel('rakeback-updates')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'rakeback_periods',
                    filter: `user_id=eq.${user.id}`,
                },
                () => loadRakebackDataRef.current()
            )
            .subscribe();

        // Real-time updates when wallet changes (balance/earnings)
        const walletChannel = supabase
            .channel('wallet-updates')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'wallets',
                    filter: `user_id=eq.${user.id}`,
                },
                () => loadRakebackDataRef.current()
            )
            .subscribe();

        return () => {
            supabase.removeChannel(rakebackChannel);
            supabase.removeChannel(walletChannel);
        };
    }, [user?.id]);

    // Initial load
    useEffect(() => {
        if (user?.id) {
            loadRakebackData();
        }
    }, [user?.id]);

    const formatDate = (dateStr: string): string => {
        return new Date(dateStr).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric'
        });
    };

    // Chart data (reversed for chronological order)
    const chartData = useMemo(() => {
        return [...periods].reverse().slice(-6).map(p => ({
            period: formatDate(p.period_start),
            earned: p.rakeback_earned,
            rake: p.rake_generated,
        }));
    }, [periods]);

    const pendingAmount = periods
        .filter(p => p.status === 'pending')
        .reduce((sum, p) => sum + p.rakeback_earned, 0);

    return (
        <div className="rakeback-page">

            <div className="rakeback-summary">
                <div className="summary-card main">
                    <span className="card-icon"></span>
                    <div className="card-content">
                        <span className="card-value">{totalEarned.toLocaleString()}</span>
                        <span className="card-label">Total Earned</span>
                    </div>
                </div>
                <div className="summary-row">
                    <div className="summary-card">
                        <span className="card-value">{(currentRate * 100).toFixed(1)}%</span>
                        <span className="card-label">Your Rate</span>
                    </div>
                    <div className="summary-card pending">
                        <span className="card-value">{pendingAmount.toLocaleString()}</span>
                        <span className="card-label">Pending</span>
                    </div>
                </div>
            </div>

            {/* Rakeback Chart */}
            {chartData.length > 0 && (
                <div className="rakeback-chart">
                    <h3> Earnings History</h3>
                    <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis dataKey="period" stroke="var(--text-secondary)" fontSize={12} />
                            <YAxis stroke="var(--text-secondary)" fontSize={12} tickFormatter={(v) => `${v}`} />
                            <Tooltip
                                contentStyle={{ background: 'var(--bg-secondary)', border: 'none', borderRadius: '8px' }}
                                formatter={(value) => [`${Number(value || 0).toLocaleString()}`, 'Rakeback']}
                            />
                            <Bar dataKey="earned" fill="var(--accent-success)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}

            <div className="rakeback-info">
                <h3>How Rakeback Works</h3>
                <p>You earn back a percentage of the rake you generate at the tables.
                    Your rate increases as you play more and move up VIP levels.</p>
            </div>

            <div className="rakeback-history">
                <h3>History</h3>
                {loading ? (
                    <div className="loading-state"><div className="spinner" /></div>
                ) : periods.length === 0 ? (
                    <div className="empty-state">
                        <p>No rakeback history yet. Play some hands to earn rakeback!</p>
                    </div>
                ) : (
                    <div className="periods-list">
                        {periods.map(period => (
                            <div key={period.id} className="period-row">
                                <div className="period-dates">
                                    <span>{formatDate(period.period_start)} - {formatDate(period.period_end)}</span>
                                </div>
                                <div className="period-details">
                                    <span className="rake-generated">Rake: {period.rake_generated.toLocaleString()}</span>
                                    <span className="rakeback-rate">{(period.rakeback_rate * 100).toFixed(1)}%</span>
                                </div>
                                <div className="period-earned">
                                    <span className={`amount ${period.status}`}>
                                        {period.rakeback_earned.toLocaleString()}
                                    </span>
                                    <span className={`status ${period.status}`}>
                                        {period.status === 'paid' ? ' Paid' : ' Pending'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}


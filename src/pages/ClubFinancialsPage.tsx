/**
 *  CLUB FINANCIALS PAGE — Club Financial Overview
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useUserStore } from '../stores/useUserStore';
import { useToast } from '../components/common/Toast';
import { ClubFinancialDashboard } from '../components/dashboard/ClubFinancialDashboard';
import FinancialChart from '../components/charts/FinancialChart';
import './ClubFinancialsPage.css';

interface FinancialSummary {
    period: string;
    rake_collected: number;
    rakeback_paid: number;
    agent_commissions: number;
    union_fees: number;
    net_revenue: number;
}

interface RecentTransaction {
    id: string;
    type: 'rake' | 'payout' | 'settlement' | 'deposit' | 'withdrawal';
    amount: number;
    description: string;
    created_at: string;
}

export default function ClubFinancialsPage() {
    const navigate = useNavigate();
    const { clubId } = useParams();
    const { user } = useUserStore();

    const [summary, setSummary] = useState<FinancialSummary | null>(null);
    const [transactions, setTransactions] = useState<RecentTransaction[]>([]);
    const [chartData, setChartData] = useState<{ name: string; rake: number; rakeback: number }[]>([]);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState<'week' | 'month' | 'all'>('week');
    const toast = useToast();

    useEffect(() => {
        if (clubId) loadFinancials();
    }, [clubId, period]);

    const loadFinancials = async () => {
        setLoading(true);
        try {
            // Calculate date range based on period
            const now = new Date();
            let startDate: Date;

            if (period === 'week') {
                startDate = new Date(now);
                startDate.setDate(now.getDate() - 7);
            } else if (period === 'month') {
                startDate = new Date(now);
                startDate.setMonth(now.getMonth() - 1);
            } else {
                startDate = new Date(0); // All time - epoch
            }

            // Load summary - query all and aggregate in frontend
            const { data: summaryData } = await supabase
                .from('club_financial_summary')
                .select('*')
                .eq('club_id', clubId)
                .gte('created_at', startDate.toISOString())
                .order('created_at', { ascending: false })
                .limit(1);

            if (summaryData && summaryData.length > 0) {
                const data = summaryData[0];
                setSummary({
                    period,
                    rake_collected: data.rake_collected || 0,
                    rakeback_paid: data.rakeback_paid || 0,
                    agent_commissions: data.agent_commissions || 0,
                    union_fees: data.union_fees || 0,
                    net_revenue: data.net_revenue || 0,
                });
            } else {
                setSummary({
                    period,
                    rake_collected: 0,
                    rakeback_paid: 0,
                    agent_commissions: 0,
                    union_fees: 0,
                    net_revenue: 0,
                });
            }

            // Load historical data for chart
            const { data: historyData } = await supabase
                .from('club_financial_summary')
                .select('created_at, rake_collected, rakeback_paid')
                .eq('club_id', clubId)
                .gte('created_at', startDate.toISOString())
                .order('created_at', { ascending: true })
                .limit(30);

            if (historyData && historyData.length > 0) {
                setChartData(historyData.map((d: any) => ({
                    name: new Date(d.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                    rake: d.rake_collected || 0,
                    rakeback: d.rakeback_paid || 0,
                })));
            } else {
                // No data - show empty chart
                setChartData([]);
            }

            // Load recent transactions within period
            const { data: txData } = await supabase
                .from('club_transactions')
                .select('*')
                .eq('club_id', clubId)
                .gte('created_at', startDate.toISOString())
                .order('created_at', { ascending: false })
                .limit(20);

            if (txData) {
                setTransactions(txData.map((t: any) => ({
                    id: t.id,
                    type: t.type,
                    amount: t.amount,
                    description: t.description || t.type,
                    created_at: t.created_at,
                })));
            }
        } catch (error) {
            console.error('Failed to load financials:', error);
            toast.error('Failed to load financial data');
        }
        setLoading(false);
    };

    const formatDate = (dateStr: string): string => {
        return new Date(dateStr).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
        });
    };

    const getTypeIcon = (type: string): string => {
        switch (type) {
            case 'rake': return '';
            case 'payout': return '';
            case 'settlement': return '';
            case 'deposit': return '';
            case 'withdrawal': return '';
            default: return '';
        }
    };

    if (loading) {
        return (
            <div className="financials-page">
                <div className="loading-state"><div className="spinner" /></div>
            </div>
        );
    }

    return (
        <div className="financials-page">

            {/* Period Selector */}
            <div className="period-selector">
                {(['week', 'month', 'all'] as const).map(p => (
                    <button
                        key={p}
                        className={period === p ? 'active' : ''}
                        onClick={() => setPeriod(p)}
                    >
                        {p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : 'All Time'}
                    </button>
                ))}
            </div>

            {/* Revenue Chart */}
            <section className="chart-section" style={{
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '16px',
            }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#888' }}>Revenue Trend</h3>
                <FinancialChart data={chartData} height={180} showRakeback={true} />
            </section>

            {/* Summary Cards */}
            {summary && (
                <div className="summary-cards">
                    <div className="summary-card revenue">
                        <span className="card-value">${summary.rake_collected.toLocaleString()}</span>
                        <span className="card-label">Rake Collected</span>
                    </div>
                    <div className="summary-row">
                        <div className="summary-card">
                            <span className="card-value expense">-${summary.rakeback_paid.toLocaleString()}</span>
                            <span className="card-label">Rakeback</span>
                        </div>
                        <div className="summary-card">
                            <span className="card-value expense">-${summary.agent_commissions.toLocaleString()}</span>
                            <span className="card-label">Agent Fees</span>
                        </div>
                    </div>
                    <div className="summary-card net">
                        <span className={`card-value ${summary.net_revenue >= 0 ? 'positive' : 'negative'}`}>
                            {summary.net_revenue >= 0 ? '+' : ''}${summary.net_revenue.toLocaleString()}
                        </span>
                        <span className="card-label">Net Revenue</span>
                    </div>
                </div>
            )}

            {/* Club Financial Dashboard - Chip Minting & Commission */}
            {clubId && (
                <section className="financial-dashboard-section">
                    <ClubFinancialDashboard clubId={clubId} />
                </section>
            )}

            {/* Recent Transactions */}
            <section className="transactions-section">
                <h3>Recent Transactions</h3>
                {transactions.length === 0 ? (
                    <div className="empty-state">
                        <p>No transactions yet</p>
                    </div>
                ) : (
                    <div className="transactions-list">
                        {transactions.map(tx => (
                            <div key={tx.id} className="transaction-row">
                                <span className="tx-icon">{getTypeIcon(tx.type)}</span>
                                <div className="tx-info">
                                    <span className="tx-desc">{tx.description}</span>
                                    <span className="tx-date">{formatDate(tx.created_at)}</span>
                                </div>
                                <span className={`tx-amount ${tx.amount >= 0 ? 'positive' : 'negative'}`}>
                                    {tx.amount >= 0 ? '+' : ''}${Math.abs(tx.amount).toLocaleString()}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}

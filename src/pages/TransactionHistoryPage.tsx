/**
 *  TRANSACTION HISTORY PAGE — With Pagination & Export
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase'
import { masterBus } from '../core/MasterBus';
import { useUserStore } from '../stores/useUserStore';
import { exportToCSV } from '../lib/export';
import './TransactionHistoryPage.css';

interface Transaction {
    id: string;
    type: 'deposit' | 'withdrawal' | 'transfer_in' | 'transfer_out' | 'rake' | 'rakeback' | 'settlement';
    amount: number;
    currency: 'chips' | 'diamonds' | 'usd';
    description: string;
    created_at: string;
    club_id?: string;
    club_name?: string;
    counterparty_name?: string;
}

type TransactionFilter = 'all' | 'deposits' | 'withdrawals' | 'transfers' | 'rake';

const PAGE_SIZE = 25;

export default function TransactionHistoryPage() {
    const navigate = useNavigate();
    const { user } = useUserStore();

    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [filter, setFilter] = useState<TransactionFilter>('all');
    const [hasMore, setHasMore] = useState(true);
    const [page, setPage] = useState(0);
    const [visibleTransactions, setVisibleTransactions] = useState(new Set<number>());

    // Stagger transaction rows
    useEffect(() => {
        setVisibleTransactions(new Set());
        const timers = transactions.map((_, i) =>
            setTimeout(() => setVisibleTransactions(prev => new Set([...prev, i])), i * 35)
        );
        return () => timers.forEach(t => clearTimeout(t));
    }, [transactions.length]);

    useEffect(() => {
        if (user?.id) {
            setTransactions([]);
            setPage(0);
            setHasMore(true);
            loadTransactions(0, true);
        }
    }, [user?.id, filter]);

    // ── Realtime: live transaction updates ──
    useEffect(() => {
        if (!user?.id) return;
        const channelKey = `tx-history-${user.id}`;

        const channel = masterBus.getOrCreateChannel(channelKey);
            channel
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'chip_transactions',
            }, () => {
                loadTransactions(0, true);
            })
            .subscribe();
        return () => { masterBus.removeRegisteredChannel(channelKey); };
    }, [user?.id]);

    const loadTransactions = async (pageNum: number, reset = false) => {
        if (reset) setLoading(true);
        else setLoadingMore(true);

        try {
            let query = supabase
                .from('chip_transactions')
                .select(`
                    id,
                    transaction_type,
                    amount,
                    notes,
                    created_at,
                    club_id,
                    clubs (name)
                `)
                .or(`from_user_id.eq.${user?.id},to_user_id.eq.${user?.id}`)
                .order('created_at', { ascending: false })
                .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

            // Apply filter
            if (filter === 'deposits') query = query.eq('transaction_type', 'deposit');
            else if (filter === 'withdrawals') query = query.in('transaction_type', ['cash_out', 'withdrawal']);
            else if (filter === 'transfers') query = query.in('transaction_type', ['transfer_in', 'transfer_out', 'agent_transfer']);
            else if (filter === 'rake') query = query.in('transaction_type', ['rake', 'rakeback']);

            const { data, error } = await query;

            if (!error && data) {
                const mapped = data.map((t: any) => ({
                    id: t.id,
                    type: t.transaction_type,
                    amount: t.amount,
                    currency: 'chips' as const,
                    description: t.notes || '',
                    created_at: t.created_at,
                    club_id: t.club_id,
                    club_name: t.clubs?.name,
                }));

                if (reset) {
                    setTransactions(mapped);
                } else {
                    setTransactions(prev => [...prev, ...mapped]);
                }

                setHasMore(data.length === PAGE_SIZE);
                setPage(pageNum);
            }
        } catch (error) {
            console.error('Failed to load transactions:', error);
        }
        setLoading(false);
        setLoadingMore(false);
    };

    const loadMore = () => {
        if (!loadingMore && hasMore) {
            loadTransactions(page + 1);
        }
    };

    const handleExportCSV = () => {
        exportToCSV(transactions, 'transactions.csv', [
            { key: 'created_at', label: 'Date' },
            { key: 'type', label: 'Type' },
            { key: 'description', label: 'Description' },
            { key: 'amount', label: 'Amount' },
            { key: 'currency', label: 'Currency' },
            { key: 'club_name', label: 'Club' },
        ]);
    };

    const getIcon = (type: string): string => {
        switch (type) {
            case 'deposit': return '▲';
            case 'withdrawal': return '▼';
            case 'transfer_in': return '←';
            case 'transfer_out': return '→';
            case 'rake': return '%';
            case 'rakeback': return '↺';
            case 'settlement': return '☐';
            default: return '●';
        }
    };

    const formatDate = (dateStr: string): string => {
        const date = new Date(dateStr);
        return date.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getCurrencySymbol = (currency: string): string => {
        switch (currency) {
            case 'diamonds': return '◆';
            case 'usd': return '';
            default: return '♠';
        }
    };

    // Calculate totals
    const totals = transactions.reduce(
        (acc, tx) => {
            if (tx.amount > 0) acc.deposits += tx.amount;
            else acc.withdrawals += Math.abs(tx.amount);
            return acc;
        },
        { deposits: 0, withdrawals: 0 }
    );

    return (
        <div className="transaction-history-page">

            {/* Summary */}
            <div className="tx-summary">
                <div className="summary-card">
                    <span className="summary-value positive">+{totals.deposits.toLocaleString()}</span>
                    <span className="summary-label">Deposits</span>
                </div>
                <div className="summary-card">
                    <span className="summary-value negative">-{totals.withdrawals.toLocaleString()}</span>
                    <span className="summary-label">Withdrawals</span>
                </div>
                <button className="export-btn" onClick={handleExportCSV}>
                    Export CSV
                </button>
            </div>

            <div className="filter-tabs">
                {(['all', 'deposits', 'withdrawals', 'transfers', 'rake'] as TransactionFilter[]).map(f => (
                    <button
                        key={f}
                        className={filter === f ? 'active' : ''}
                        onClick={() => setFilter(f)}
                    >
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                ))}
            </div>

            <div className="transactions-list">
                {loading ? (
                    <div className="loading-state"><div className="spinner" /></div>
                ) : transactions.length === 0 ? (
                    <div className="empty-state">
                        <span className="empty-icon">○</span>
                        <p>No transactions found</p>
                    </div>
                ) : (
                    <>
                        {transactions.map((tx, index) => (
                            <div
                                key={tx.id}
                                className="transaction-row"
                                style={{
                                    opacity: visibleTransactions.has(index) ? 1 : 0,
                                    transform: visibleTransactions.has(index) ? 'translateY(0)' : 'translateY(6px)',
                                    transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                                }}
                            >
                                <span className="tx-icon">{getIcon(tx.type)}</span>
                                <div className="tx-info">
                                    <span className="tx-desc">{tx.description || tx.type.replace('_', ' ')}</span>
                                    <span className="tx-meta">
                                        {tx.club_name && <span className="tx-club">{tx.club_name}</span>}
                                        {formatDate(tx.created_at)}
                                    </span>
                                </div>
                                <span className={`tx-amount ${tx.amount >= 0 ? 'positive' : 'negative'}`}>
                                    {tx.amount >= 0 ? '+' : ''}{getCurrencySymbol(tx.currency)}{Math.abs(tx.amount).toLocaleString()}
                                </span>
                            </div>
                        ))}

                        {/* Load More Button */}
                        {hasMore && (
                            <button
                                className="load-more-btn"
                                onClick={loadMore}
                                disabled={loadingMore}
                            >
                                {loadingMore ? 'Loading...' : 'Load More'}
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}


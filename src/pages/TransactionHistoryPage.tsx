/**
 *  TRANSACTION HISTORY PAGE — With Pagination & Export
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useUserStore } from '../stores/useUserStore';
import SmarterHeader from '../components/layout/SmarterHeader';
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

    useEffect(() => {
        if (user?.id) {
            setTransactions([]);
            setPage(0);
            setHasMore(true);
            loadTransactions(0, true);
        }
    }, [user?.id, filter]);

    const loadTransactions = async (pageNum: number, reset = false) => {
        if (reset) setLoading(true);
        else setLoadingMore(true);

        try {
            let query = supabase
                .from('transactions')
                .select(`
                    id,
                    type,
                    amount,
                    currency,
                    description,
                    created_at,
                    club_id,
                    clubs (name)
                `)
                .eq('user_id', user?.id)
                .order('created_at', { ascending: false })
                .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

            // Apply filter
            if (filter === 'deposits') query = query.eq('type', 'deposit');
            else if (filter === 'withdrawals') query = query.eq('type', 'withdrawal');
            else if (filter === 'transfers') query = query.in('type', ['transfer_in', 'transfer_out']);
            else if (filter === 'rake') query = query.in('type', ['rake', 'rakeback']);

            const { data, error } = await query;

            if (!error && data) {
                const mapped = data.map((t: any) => ({
                    id: t.id,
                    type: t.type,
                    amount: t.amount,
                    currency: t.currency || 'chips',
                    description: t.description || '',
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
            case 'deposit': return '';
            case 'withdrawal': return '';
            case 'transfer_in': return '';
            case 'transfer_out': return '';
            case 'rake': return '';
            case 'rakeback': return '';
            case 'settlement': return '';
            default: return '';
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
            case 'diamonds': return '';
            case 'usd': return '$';
            default: return '';
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
            <SmarterHeader title=" Transactions" />

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
                        <span className="empty-icon"></span>
                        <p>No transactions found</p>
                    </div>
                ) : (
                    <>
                        {transactions.map(tx => (
                            <div key={tx.id} className="transaction-row">
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


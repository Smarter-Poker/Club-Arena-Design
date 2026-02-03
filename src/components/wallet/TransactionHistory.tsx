/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  TRANSACTION HISTORY — Wallet Transaction Log
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../stores/useUserStore';
import { useToast } from '../common/Toast';
import './TransactionHistory.css';

interface TransactionHistoryProps {
    walletId?: string;
    limit?: number;
}

interface Transaction {
    id: string;
    type: 'deposit' | 'withdrawal' | 'transfer' | 'rake' | 'bonus' | 'refund' | 'purchase';
    amount: number;
    balance: number;
    description: string;
    createdAt: Date;
    status: 'pending' | 'completed' | 'failed';
}

const TYPE_ICONS: Record<string, string> = {
    deposit: '',
    withdrawal: '',
    transfer: '',
    rake: '',
    bonus: '',
    refund: '',
    purchase: ''
};

const TYPE_COLORS: Record<string, string> = {
    deposit: '#22c55e',
    withdrawal: '#f59e0b',
    transfer: '#3b82f6',
    rake: '#ef4444',
    bonus: '#a855f7',
    refund: '#22c55e',
    purchase: '#f59e0b'
};

export function TransactionHistory({ walletId, limit = 20 }: TransactionHistoryProps) {
    const { user } = useUserStore();
    const toast = useToast();

    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<string>('all');

    useEffect(() => {
        if (user?.id || walletId) {
            loadTransactions();
        }
    }, [user?.id, walletId]);

    const loadTransactions = async () => {
        if (!user?.id && !walletId) return;
        setLoading(true);

        try {
            let query = supabase
                .from('wallet_transactions')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limit);

            if (walletId) {
                query = query.eq('wallet_id', walletId);
            } else {
                query = query.eq('user_id', user?.id);
            }

            const { data, error } = await query;

            if (!error && data) {
                setTransactions(data.map(t => ({
                    id: t.id,
                    type: t.type,
                    amount: t.amount,
                    balance: t.balance_after || 0,
                    description: t.description || '',
                    createdAt: new Date(t.created_at),
                    status: t.status || 'completed'
                })));
            }
        } catch (error) {
            toast.error('Failed to load transactions');
        }
        setLoading(false);
    };

    const filteredTransactions = filter === 'all'
        ? transactions
        : transactions.filter(t => t.type === filter);

    if (loading) {
        return <div className="transaction-history loading">Loading...</div>;
    }

    return (
        <div className="transaction-history">
            <div className="transaction-history__header">
                <h3> Transaction History</h3>
                <select value={filter} onChange={e => setFilter(e.target.value)}>
                    <option value="all">All</option>
                    <option value="deposit">Deposits</option>
                    <option value="withdrawal">Withdrawals</option>
                    <option value="transfer">Transfers</option>
                    <option value="rake">Rake</option>
                    <option value="bonus">Bonuses</option>
                </select>
            </div>

            {filteredTransactions.length === 0 ? (
                <div className="empty-state">No transactions</div>
            ) : (
                <div className="transaction-list">
                    {filteredTransactions.map(tx => (
                        <div key={tx.id} className={`transaction-row ${tx.type}`}>
                            <span className="icon">{TYPE_ICONS[tx.type] || '📄'}</span>
                            <div className="details">
                                <span className="type">{tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}</span>
                                <span className="description">{tx.description}</span>
                            </div>
                            <div className="amounts">
                                <span
                                    className={`amount ${tx.amount >= 0 ? 'positive' : 'negative'}`}
                                    style={{ color: TYPE_COLORS[tx.type] }}
                                >
                                    {tx.amount >= 0 ? '+' : ''}{tx.amount.toLocaleString()}
                                </span>
                                <span className="balance">Bal: {tx.balance.toLocaleString()}</span>
                            </div>
                            <span className="time">
                                {tx.createdAt.toLocaleDateString()} {tx.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default TransactionHistory;

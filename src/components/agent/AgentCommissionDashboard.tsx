/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  AGENT COMMISSION DASHBOARD — Track Agent Earnings
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../stores/useUserStore';
import { useToast } from '../common/Toast';
import './AgentCommissionDashboard.css';

interface CommissionSummary {
    totalEarned: number;
    thisWeek: number;
    thisMonth: number;
    pendingPayout: number;
    lastPayout: Date | null;
}

interface CommissionRecord {
    id: string;
    playerId: string;
    playerName: string;
    amount: number;
    rakeAmount: number;
    commissionRate: number;
    createdAt: Date;
    tableId?: string;
    tableName?: string;
}

interface SubAgent {
    id: string;
    username: string;
    avatarUrl: string;
    totalPlayers: number;
    totalCommission: number;
    commissionRate: number;
    joinedAt: Date;
}

export function AgentCommissionDashboard() {
    const { user } = useUserStore();
    const toast = useToast();

    const [summary, setSummary] = useState<CommissionSummary | null>(null);
    const [records, setRecords] = useState<CommissionRecord[]>([]);
    const [subAgents, setSubAgents] = useState<SubAgent[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'summary' | 'records' | 'subagents'>('summary');

    useEffect(() => {
        if (user?.id) {
            loadData();
        }
    }, [user?.id]);

    const loadData = async () => {
        if (!user?.id) return;
        setLoading(true);

        try {
            // Load commission summary
            const { data: summaryData, error: summaryErr } = await supabase
                .rpc('fn_get_agent_commission_summary', { p_agent_id: user.id });
            if (summaryErr) console.error('[AgentCommission] Summary RPC failed:', summaryErr.message);

            if (summaryData) {
                setSummary({
                    totalEarned: summaryData.total_earned || 0,
                    thisWeek: summaryData.this_week || 0,
                    thisMonth: summaryData.this_month || 0,
                    pendingPayout: summaryData.pending_payout || 0,
                    lastPayout: summaryData.last_payout ? new Date(summaryData.last_payout) : null
                });
            }

            // Load recent records
            const { data: recordsData } = await supabase
                .from('commission_records')
                .select('*')
                .eq('agent_id', user.id)
                .order('created_at', { ascending: false })
                .limit(50);

            if (recordsData) {
                setRecords(recordsData.map(r => ({
                    id: r.id,
                    playerId: r.player_id,
                    playerName: r.player_name || 'Unknown',
                    amount: r.amount,
                    rakeAmount: r.rake_amount || 0,
                    commissionRate: r.commission_rate || 0,
                    createdAt: new Date(r.created_at),
                    tableId: r.table_id,
                    tableName: r.table_name
                })));
            }

            // Load sub-agents
            const { data: subAgentsData } = await supabase
                .from('agents')
                .select('id, username, avatar_url, player_count, total_commission, commission_rate, created_at')
                .eq('parent_agent_id', user.id);

            if (subAgentsData) {
                setSubAgents(subAgentsData.map(a => ({
                    id: a.id,
                    username: a.username,
                    avatarUrl: a.avatar_url || '',
                    totalPlayers: a.player_count || 0,
                    totalCommission: a.total_commission || 0,
                    commissionRate: a.commission_rate || 0,
                    joinedAt: new Date(a.created_at)
                })));
            }
        } catch (error) {
            toast.error('Failed to load commission data');
        }

        setLoading(false);
    };

    const requestPayout = async () => {
        if (!user?.id || !summary?.pendingPayout) return;

        try {
            const { error } = await supabase
                .rpc('fn_request_agent_payout', { p_agent_id: user.id });

            if (error) {
                console.warn('[AgentDashboard] fn_request_agent_payout RPC not available');
                return null;
            }

            toast.success('Payout request submitted!');
            loadData();
        } catch (error) {
            console.warn('[AgentDashboard] Payout request failed (non-fatal):', error);
        }
    };

    if (loading) {
        return (
            <div className="agent-commission">
                <div className="loading-state"><div className="spinner" /></div>
            </div>
        );
    }

    return (
        <div className="agent-commission">
            {/* Tabs */}
            <div className="agent-commission__tabs">
                <button
                    className={activeTab === 'summary' ? 'active' : ''}
                    onClick={() => setActiveTab('summary')}
                >
                     Summary
                </button>
                <button
                    className={activeTab === 'records' ? 'active' : ''}
                    onClick={() => setActiveTab('records')}
                >
                     Records
                </button>
                <button
                    className={activeTab === 'subagents' ? 'active' : ''}
                    onClick={() => setActiveTab('subagents')}
                >
                     Sub-Agents
                </button>
            </div>

            {/* Summary Tab */}
            {activeTab === 'summary' && summary && (
                <div className="agent-commission__summary">
                    <div className="summary-card total">
                        <span className="label">Total Earned</span>
                        <span className="value">{summary.totalEarned.toLocaleString()} </span>
                    </div>
                    <div className="summary-card">
                        <span className="label">This Week</span>
                        <span className="value">{summary.thisWeek.toLocaleString()}</span>
                    </div>
                    <div className="summary-card">
                        <span className="label">This Month</span>
                        <span className="value">{summary.thisMonth.toLocaleString()}</span>
                    </div>
                    <div className="summary-card pending">
                        <span className="label">Pending Payout</span>
                        <span className="value">{summary.pendingPayout.toLocaleString()}</span>
                        {summary.pendingPayout > 0 && (
                            <button className="payout-btn" onClick={requestPayout}>
                                Request Payout
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Records Tab */}
            {activeTab === 'records' && (
                <div className="agent-commission__records">
                    {records.length === 0 ? (
                        <div className="empty-state">No commission records yet</div>
                    ) : (
                        <table>
                            <thead>
                                <tr>
                                    <th>Player</th>
                                    <th>Rake</th>
                                    <th>Rate</th>
                                    <th>Commission</th>
                                    <th>Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {records.map(record => (
                                    <tr key={record.id}>
                                        <td>{record.playerName}</td>
                                        <td>{record.rakeAmount.toLocaleString()}</td>
                                        <td>{(record.commissionRate * 100).toFixed(1)}%</td>
                                        <td className="commission">{record.amount.toLocaleString()}</td>
                                        <td>{record.createdAt.toLocaleDateString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Sub-Agents Tab */}
            {activeTab === 'subagents' && (
                <div className="agent-commission__subagents">
                    {subAgents.length === 0 ? (
                        <div className="empty-state">No sub-agents yet</div>
                    ) : (
                        <div className="subagent-grid">
                            {subAgents.map(agent => (
                                <div key={agent.id} className="subagent-card">
                                    <span className="avatar">{agent.avatarUrl}</span>
                                    <div className="info">
                                        <span className="name">{agent.username}</span>
                                        <span className="stats">
                                            {agent.totalPlayers} players • {(agent.commissionRate * 100).toFixed(0)}% rate
                                        </span>
                                    </div>
                                    <span className="earnings">{agent.totalCommission.toLocaleString()}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default AgentCommissionDashboard;

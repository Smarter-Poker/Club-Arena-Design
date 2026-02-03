/**
 * ♠ CLUB ARENA — Admin Dashboard
 * Club management tools, bulk actions, reports, moderation queue
 */

import React, { useState, useEffect } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    LineChart, Line,
} from 'recharts';
import { supabase } from '../../lib/supabase';
import { useToast } from '../common/Toast';
import './AdminDashboard.css';

interface ClubStats {
    totalMembers: number;
    activeToday: number;
    newThisWeek: number;
    totalRake: number;
    pendingWithdrawals: number;
    moderationQueue: number;
}

interface ModerationItem {
    id: string;
    type: 'report' | 'suspicious' | 'chargeback';
    player: string;
    reason: string;
    timestamp: string;
    severity: 'low' | 'medium' | 'high';
}

interface ReportData {
    date: string;
    players: number;
    hands: number;
    rake: number;
}

export const AdminDashboard: React.FC<{ clubId: string }> = ({ clubId }) => {
    const toast = useToast();
    const [stats, setStats] = useState<ClubStats>({
        totalMembers: 1247,
        activeToday: 89,
        newThisWeek: 23,
        totalRake: 45670,
        pendingWithdrawals: 12,
        moderationQueue: 5,
    });
    const [moderationQueue, setModerationQueue] = useState<ModerationItem[]>([]);
    const [reportData, setReportData] = useState<ReportData[]>([]);
    const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'moderation' | 'reports'>('overview');
    const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
    const [bulkAction, setBulkAction] = useState('');

    useEffect(() => {
        loadDashboardData();
    }, [clubId]);

    const loadDashboardData = () => {
        // Mock data
        const mockModeration: ModerationItem[] = [
            { id: '1', type: 'report', player: 'SuspiciousUser', reason: 'Reported for colluding', timestamp: new Date().toISOString(), severity: 'high' },
            { id: '2', type: 'suspicious', player: 'BotLike42', reason: 'Unusual betting patterns', timestamp: new Date().toISOString(), severity: 'medium' },
            { id: '3', type: 'chargeback', player: 'RefundRequest', reason: 'Diamond purchase disputed', timestamp: new Date().toISOString(), severity: 'high' },
        ];
        setModerationQueue(mockModeration);

        const mockReports: ReportData[] = [];
        for (let i = 7; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            mockReports.push({
                date: date.toLocaleDateString('en-US', { weekday: 'short' }),
                players: Math.floor(Math.random() * 100) + 50,
                hands: Math.floor(Math.random() * 5000) + 2000,
                rake: Math.floor(Math.random() * 10000) + 5000,
            });
        }
        setReportData(mockReports);
    };

    const handleModeration = async (itemId: string, action: 'approve' | 'reject' | 'ban') => {
        setModerationQueue((prev) => prev.filter((m) => m.id !== itemId));
        toast.success(`Player ${action === 'ban' ? 'banned' : action === 'approve' ? 'cleared' : 'warned'} successfully`);
    };

    const handleBulkAction = async () => {
        if (!bulkAction || selectedMembers.length === 0) {
            toast.error('Select members and an action');
            return;
        }
        toast.success(`${bulkAction} applied to ${selectedMembers.length} members`);
        setSelectedMembers([]);
        setBulkAction('');
    };

    const exportReport = (format: 'csv' | 'pdf') => {
        toast.success(`Exporting ${format.toUpperCase()} report...`);
        // In production, generate and download file
    };

    const tabs = [
        { id: 'overview', label: '📊 Overview', count: 0 },
        { id: 'members', label: '👥 Members', count: stats.totalMembers },
        { id: 'moderation', label: '⚠️ Moderation', count: stats.moderationQueue },
        { id: 'reports', label: '📈 Reports', count: 0 },
    ] as const;

    return (
        <div className="admin-dashboard">
            <header className="admin-header">
                <h1>🎛️ Club Admin Dashboard</h1>
                <div className="header-actions">
                    <button className="btn-export" onClick={() => exportReport('csv')}>
                        📄 Export CSV
                    </button>
                    <button className="btn-export" onClick={() => exportReport('pdf')}>
                        📑 Export PDF
                    </button>
                </div>
            </header>

            {/* Tabs */}
            <div className="admin-tabs">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        className={`tab ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.label}
                        {tab.count > 0 && <span className="tab-count">{tab.count}</span>}
                    </button>
                ))}
            </div>

            {activeTab === 'overview' && (
                <>
                    {/* Stats Cards */}
                    <div className="stats-row">
                        <div className="stat-card primary">
                            <span className="stat-icon">👥</span>
                            <div className="stat-content">
                                <span className="stat-value">{stats.totalMembers.toLocaleString()}</span>
                                <span className="stat-label">Total Members</span>
                            </div>
                        </div>
                        <div className="stat-card success">
                            <span className="stat-icon">🟢</span>
                            <div className="stat-content">
                                <span className="stat-value">{stats.activeToday}</span>
                                <span className="stat-label">Active Today</span>
                            </div>
                        </div>
                        <div className="stat-card warning">
                            <span className="stat-icon">💰</span>
                            <div className="stat-content">
                                <span className="stat-value">{stats.totalRake.toLocaleString()}</span>
                                <span className="stat-label">Total Rake</span>
                            </div>
                        </div>
                        <div className="stat-card danger">
                            <span className="stat-icon">⚠️</span>
                            <div className="stat-content">
                                <span className="stat-value">{stats.moderationQueue}</span>
                                <span className="stat-label">Needs Review</span>
                            </div>
                        </div>
                    </div>

                    {/* Chart */}
                    <div className="chart-card">
                        <h3>📈 Weekly Activity</h3>
                        <ResponsiveContainer width="100%" height={200}>
                            <LineChart data={reportData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                <XAxis dataKey="date" stroke="#6b7280" />
                                <YAxis stroke="#6b7280" />
                                <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }} />
                                <Line type="monotone" dataKey="players" stroke="#1877f2" strokeWidth={2} />
                                <Line type="monotone" dataKey="hands" stroke="#2ecc71" strokeWidth={2} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </>
            )}

            {activeTab === 'moderation' && (
                <div className="moderation-section">
                    <h3>⚠️ Moderation Queue</h3>
                    {moderationQueue.length === 0 ? (
                        <div className="empty-queue">
                            <span>✅</span>
                            <p>No items to review</p>
                        </div>
                    ) : (
                        <div className="moderation-list">
                            {moderationQueue.map((item) => (
                                <div key={item.id} className={`moderation-item ${item.severity}`}>
                                    <div className="mod-header">
                                        <span className={`mod-type ${item.type}`}>
                                            {item.type.toUpperCase()}
                                        </span>
                                        <span className={`mod-severity ${item.severity}`}>
                                            {item.severity.toUpperCase()}
                                        </span>
                                    </div>
                                    <div className="mod-content">
                                        <span className="mod-player">{item.player}</span>
                                        <span className="mod-reason">{item.reason}</span>
                                    </div>
                                    <div className="mod-actions">
                                        <button className="btn-approve" onClick={() => handleModeration(item.id, 'approve')}>
                                            ✓ Clear
                                        </button>
                                        <button className="btn-warn" onClick={() => handleModeration(item.id, 'reject')}>
                                            ⚠️ Warn
                                        </button>
                                        <button className="btn-ban" onClick={() => handleModeration(item.id, 'ban')}>
                                            🚫 Ban
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'members' && (
                <div className="members-section">
                    <div className="bulk-actions">
                        <select value={bulkAction} onChange={(e) => setBulkAction(e.target.value)}>
                            <option value="">Select Bulk Action...</option>
                            <option value="message">Send Message</option>
                            <option value="bonus">Award Bonus</option>
                            <option value="suspend">Suspend</option>
                            <option value="remove">Remove from Club</option>
                        </select>
                        <button
                            className="btn-apply"
                            onClick={handleBulkAction}
                            disabled={!bulkAction || selectedMembers.length === 0}
                        >
                            Apply to {selectedMembers.length} Selected
                        </button>
                    </div>
                    <p className="members-placeholder">Member list with filters, search, and selection...</p>
                </div>
            )}

            {activeTab === 'reports' && (
                <div className="reports-section">
                    <h3>📊 Generate Reports</h3>
                    <div className="report-options">
                        <div className="report-card">
                            <span className="report-icon">💰</span>
                            <span className="report-title">Financial Report</span>
                            <span className="report-desc">Rake, deposits, withdrawals</span>
                            <button onClick={() => exportReport('csv')}>Generate</button>
                        </div>
                        <div className="report-card">
                            <span className="report-icon">👥</span>
                            <span className="report-title">Member Report</span>
                            <span className="report-desc">Activity, stats, retention</span>
                            <button onClick={() => exportReport('csv')}>Generate</button>
                        </div>
                        <div className="report-card">
                            <span className="report-icon">🎮</span>
                            <span className="report-title">Game Report</span>
                            <span className="report-desc">Hands played, tables, tournaments</span>
                            <button onClick={() => exportReport('csv')}>Generate</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminDashboard;

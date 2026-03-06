/**
 * ♠ CLUB ARENA — Audit Log
 * Track all admin actions in the club
 */

import React, { useState, useEffect } from 'react';
import './AuditLog.css';

interface AuditEntry {
    id: string;
    action: string;
    actor: { id: string; username: string };
    target?: { type: string; id: string; name: string };
    details: string;
    ipAddress: string;
    timestamp: string;
}

type ActionType = 'all' | 'player' | 'table' | 'finance' | 'settings' | 'security';

interface AuditLogProps {
    clubId: string;
}

export const AuditLog: React.FC<AuditLogProps> = ({ clubId }) => {
    const [entries, setEntries] = useState<AuditEntry[]>([]);
    const [filter, setFilter] = useState<ActionType>('all');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadAuditLog();
    }, [clubId, filter]);

    const loadAuditLog = async () => {
        setLoading(true);
        try {
            // Mock data
            const mock: AuditEntry[] = [
                {
                    id: '1',
                    action: 'player_banned',
                    actor: { id: 'a1', username: 'Admin1' },
                    target: { type: 'player', id: 'p1', name: 'BadPlayer99' },
                    details: 'Banned for 7 days - Collusion detected',
                    ipAddress: '192.168.1.100',
                    timestamp: new Date().toISOString(),
                },
                {
                    id: '2',
                    action: 'table_created',
                    actor: { id: 'a1', username: 'Admin1' },
                    target: { type: 'table', id: 't1', name: 'High Stakes NLH' },
                    details: 'Created 9-max NLH table with 5/10 blinds',
                    ipAddress: '192.168.1.100',
                    timestamp: new Date(Date.now() - 3600000).toISOString(),
                },
                {
                    id: '3',
                    action: 'balance_adjusted',
                    actor: { id: 'a2', username: 'SuperAgent' },
                    target: { type: 'player', id: 'p2', name: 'PokerPro99' },
                    details: 'Added 1000 chips - Deposit processed',
                    ipAddress: '192.168.1.101',
                    timestamp: new Date(Date.now() - 7200000).toISOString(),
                },
                {
                    id: '4',
                    action: 'settings_changed',
                    actor: { id: 'a1', username: 'Admin1' },
                    target: { type: 'club', id: 'c1', name: 'High Rollers' },
                    details: 'Changed rake from 3% to 2.5%',
                    ipAddress: '192.168.1.100',
                    timestamp: new Date(Date.now() - 86400000).toISOString(),
                },
                {
                    id: '5',
                    action: 'login_suspicious',
                    actor: { id: 'p3', username: 'NewPlayer' },
                    details: 'Login from new location detected',
                    ipAddress: '10.0.0.50',
                    timestamp: new Date(Date.now() - 172800000).toISOString(),
                },
            ];
            setEntries(mock);
        } catch (error) {
            console.error('Failed to load audit log:', error);
        } finally {
            setLoading(false);
        }
    };

    const getActionIcon = (action: string) => {
        if (action.includes('banned')) return '🚫';
        if (action.includes('table')) return '🎰';
        if (action.includes('balance') || action.includes('finance')) return '💰';
        if (action.includes('settings')) return '⚙️';
        if (action.includes('security') || action.includes('login')) return '🔐';
        return '📋';
    };

    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleString();
    };

    const filteredEntries = entries.filter(entry => {
        if (filter !== 'all') {
            if (filter === 'player' && !entry.action.includes('player') && !entry.action.includes('banned')) return false;
            if (filter === 'table' && !entry.action.includes('table')) return false;
            if (filter === 'finance' && !entry.action.includes('balance')) return false;
            if (filter === 'settings' && !entry.action.includes('settings')) return false;
            if (filter === 'security' && !entry.action.includes('login') && !entry.action.includes('security')) return false;
        }
        if (search) {
            const searchLower = search.toLowerCase();
            return (
                entry.action.toLowerCase().includes(searchLower) ||
                entry.actor.username.toLowerCase().includes(searchLower) ||
                entry.details.toLowerCase().includes(searchLower) ||
                entry.target?.name?.toLowerCase()?.includes(searchLower)
            );
        }
        return true;
    });

    return (
        <div className="audit-log">
            <div className="log-header">
                <h2>📋 Audit Log</h2>
            </div>

            {/* Filters */}
            <div className="log-filters">
                <div className="action-filters">
                    {(['all', 'player', 'table', 'finance', 'settings', 'security'] as ActionType[]).map(f => (
                        <button
                            key={f}
                            className={filter === f ? 'active' : ''}
                            onClick={() => setFilter(f)}
                        >
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                    ))}
                </div>
                <input
                    type="text"
                    placeholder="Search logs..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="search-input"
                />
            </div>

            {/* Log Entries */}
            <div className="log-entries">
                {loading ? (
                    <div className="loading-state">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="skeleton-row" />
                        ))}
                    </div>
                ) : filteredEntries.length === 0 ? (
                    <div className="empty-state">
                        <span>📋</span>
                        <p>No log entries found</p>
                    </div>
                ) : (
                    filteredEntries.map(entry => (
                        <div key={entry.id} className="log-entry">
                            <span className="entry-icon">{getActionIcon(entry.action)}</span>
                            <div className="entry-content">
                                <div className="entry-header">
                                    <span className="entry-action">{entry.action.replace(/_/g, ' ')}</span>
                                    <span className="entry-time">{formatTime(entry.timestamp)}</span>
                                </div>
                                <p className="entry-details">{entry.details}</p>
                                <div className="entry-meta">
                                    <span>By: <strong>{entry.actor.username}</strong></span>
                                    {entry.target && (
                                        <span>Target: <strong>{entry.target.name}</strong></span>
                                    )}
                                    <span className="entry-ip">{entry.ipAddress}</span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default AuditLog;

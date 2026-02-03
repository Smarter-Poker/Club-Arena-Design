import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import './ModerationLog.css';

interface LogEntry {
    id: string;
    action: 'mute' | 'ban' | 'kick' | 'delete_message' | 'warning' | 'unban';
    moderatorId: string;
    moderatorName: string;
    targetUserId: string;
    targetUsername: string;
    reason?: string;
    details?: string;
    timestamp: Date;
}

interface ModerationLogProps {
    clubId?: string;
    tableId?: string;
    limit?: number;
}

const ACTION_ICONS: Record<string, string> = {
    mute: '🔇',
    ban: '⛔',
    kick: '👢',
    delete_message: '',
    warning: '',
    unban: '',
};

const ACTION_COLORS: Record<string, string> = {
    mute: '#fbbf24',
    ban: '#ef4444',
    kick: '#f97316',
    delete_message: '#94a3b8',
    warning: '#fbbf24',
    unban: '#4ade80',
};

export const ModerationLog: React.FC<ModerationLogProps> = ({
    clubId,
    tableId,
    limit = 50
}) => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<string>('all');

    useEffect(() => {
        loadLogs();
    }, [clubId, tableId]);

    const loadLogs = async () => {
        setLoading(true);
        try {
            // Mock data - replace with actual query
            const mockLogs: LogEntry[] = [
                { id: '1', action: 'mute', moderatorId: 'm1', moderatorName: 'Admin1', targetUserId: 'u1', targetUsername: 'BadPlayer', reason: 'Spam', timestamp: new Date() },
                { id: '2', action: 'delete_message', moderatorId: 'm1', moderatorName: 'Admin1', targetUserId: 'u2', targetUsername: 'ToxicUser', details: 'Offensive content', timestamp: new Date(Date.now() - 3600000) },
                { id: '3', action: 'ban', moderatorId: 'm2', moderatorName: 'SuperMod', targetUserId: 'u3', targetUsername: 'Cheater99', reason: 'Collusion', timestamp: new Date(Date.now() - 86400000) },
                { id: '4', action: 'warning', moderatorId: 'm1', moderatorName: 'Admin1', targetUserId: 'u4', targetUsername: 'NewPlayer', reason: 'First offense', timestamp: new Date(Date.now() - 172800000) },
            ];
            setLogs(mockLogs);
        } catch (error) {
            console.error('Failed to load moderation logs:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredLogs = filter === 'all'
        ? logs
        : logs.filter(log => log.action === filter);

    const formatTime = (date: Date) => {
        const now = new Date();
        const diff = now.getTime() - date.getTime();

        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return date.toLocaleDateString();
    };

    return (
        <div className="moderation-log">
            <div className="log-header">
                <h3>Moderation Log</h3>
                <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                    <option value="all">All Actions</option>
                    <option value="mute">Mutes</option>
                    <option value="ban">Bans</option>
                    <option value="kick">Kicks</option>
                    <option value="delete_message">Deletions</option>
                    <option value="warning">Warnings</option>
                </select>
            </div>

            {loading ? (
                <div className="log-loading">Loading...</div>
            ) : (
                <div className="log-entries">
                    {filteredLogs.map(log => (
                        <div key={log.id} className="log-entry">
                            <div
                                className="log-icon"
                                style={{ background: `${ACTION_COLORS[log.action]}20`, color: ACTION_COLORS[log.action] }}
                            >
                                {ACTION_ICONS[log.action]}
                            </div>
                            <div className="log-content">
                                <div className="log-summary">
                                    <span className="mod-name">{log.moderatorName}</span>
                                    <span className="log-action">{log.action.replace('_', ' ')}</span>
                                    <span className="target-name">{log.targetUsername}</span>
                                </div>
                                {log.reason && <div className="log-reason">{log.reason}</div>}
                            </div>
                            <div className="log-time">{formatTime(log.timestamp)}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ModerationLog;

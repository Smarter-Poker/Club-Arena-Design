/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  NOTIFICATION CENTER — In-App Notification Feed
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Centralized feed for all platform notifications:
 * - Club activity (new members, table activity)
 * - Tournament alerts (starting, registration)
 * - Settlement notifications
 * - Achievement unlocks
 * - System messages
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useUserStore } from '../stores/useUserStore';
import './NotificationCenter.css';

interface Notification {
    id: string;
    type: 'club' | 'tournament' | 'settlement' | 'achievement' | 'system' | 'friend' | 'table';
    title: string;
    message: string;
    link?: string;
    read: boolean;
    created_at: string;
    icon?: string;
}

const ICON_MAP: Record<string, string> = {
    club: '♠',
    tournament: '🏆',
    settlement: '💰',
    achievement: '🎖️',
    system: '⚙️',
    friend: '👤',
    table: '🎯',
};

export default function NotificationCenter() {
    const navigate = useNavigate();
    const { user } = useUserStore();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<string>('all');

    const loadNotifications = useCallback(async () => {
        if (!user?.id) return;
        setLoading(true);
        try {
            const { data } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(50);

            if (data) {
                setNotifications(data.map(n => ({
                    id: n.id,
                    type: n.type || 'system',
                    title: n.title || 'Notification',
                    message: n.message || n.body || '',
                    link: n.link || n.action_url,
                    read: n.read || false,
                    created_at: n.created_at,
                    icon: ICON_MAP[n.type] || '📬',
                })));
            }
        } catch (err) {
            console.error('Failed to load notifications:', err);
        }
        setLoading(false);
    }, [user?.id]);

    useEffect(() => {
        loadNotifications();

        // Real-time updates
        if (!user?.id) return;
        const channel = supabase
            .channel(`notifications-${user.id}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${user.id}`,
                },
                (payload) => {
                    const n = payload.new as any;
                    setNotifications(prev => [{
                        id: n.id,
                        type: n.type || 'system',
                        title: n.title || 'Notification',
                        message: n.message || n.body || '',
                        link: n.link || n.action_url,
                        read: false,
                        created_at: n.created_at,
                        icon: ICON_MAP[n.type] || '📬',
                    }, ...prev]);
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [user?.id, loadNotifications]);

    const markAsRead = async (notifId: string) => {
        await supabase.from('notifications').update({ read: true }).eq('id', notifId);
        setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, read: true } : n));
    };

    const markAllRead = async () => {
        if (!user?.id) return;
        await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    };

    const handleClick = (notif: Notification) => {
        if (!notif.read) markAsRead(notif.id);
        if (notif.link) navigate(notif.link);
    };

    const formatTime = (dateStr: string) => {
        const d = new Date(dateStr);
        const now = new Date();
        const diff = (now.getTime() - d.getTime()) / 1000;
        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return d.toLocaleDateString();
    };

    const unreadCount = notifications.filter(n => !n.read).length;
    const filtered = filter === 'all'
        ? notifications
        : filter === 'unread'
            ? notifications.filter(n => !n.read)
            : notifications.filter(n => n.type === filter);

    const FILTERS = [
        { id: 'all', label: 'All' },
        { id: 'unread', label: `Unread (${unreadCount})` },
        { id: 'club', label: 'Club' },
        { id: 'tournament', label: 'Tournaments' },
        { id: 'settlement', label: 'Settlement' },
        { id: 'achievement', label: 'Achievements' },
    ];

    return (
        <div className="notification-center">
            <div className="notif-header">
                <h1>Notifications</h1>
                {unreadCount > 0 && (
                    <button className="mark-all-btn" onClick={markAllRead}>
                        Mark All Read
                    </button>
                )}
            </div>

            <div className="notif-filters">
                {FILTERS.map(f => (
                    <button
                        key={f.id}
                        className={`notif-filter ${filter === f.id ? 'active' : ''}`}
                        onClick={() => setFilter(f.id)}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            <div className="notif-list">
                {loading ? (
                    <div className="notif-loading"><div className="spinner" /></div>
                ) : filtered.length === 0 ? (
                    <div className="notif-empty">
                        <span>🔔</span>
                        <p>{filter === 'unread' ? 'All caught up!' : 'No notifications yet'}</p>
                    </div>
                ) : (
                    filtered.map(notif => (
                        <div
                            key={notif.id}
                            className={`notif-item ${!notif.read ? 'unread' : ''}`}
                            onClick={() => handleClick(notif)}
                        >
                            <span className="notif-icon">{notif.icon || ICON_MAP[notif.type]}</span>
                            <div className="notif-body">
                                <span className="notif-title">{notif.title}</span>
                                <span className="notif-message">{notif.message}</span>
                                <span className="notif-time">{formatTime(notif.created_at)}</span>
                            </div>
                            {!notif.read && <span className="notif-dot" />}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

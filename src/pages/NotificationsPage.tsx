/**
 *  NOTIFICATIONS PAGE — With Real-Time Updates
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase'
import { masterBus } from '../core/MasterBus';
import { useUserStore } from '../stores/useUserStore';
import { PremiumSFX } from '../services/PremiumSFX';
import './NotificationsPage.css';

interface Notification {
    id: string;
    type: 'info' | 'success' | 'warning' | 'error';
    title: string;
    message: string;
    read: boolean;
    created_at: string;
    action_url?: string;
}

export default function NotificationsPage() {
    const navigate = useNavigate();
    const { user } = useUserStore();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [newNotifId, setNewNotifId] = useState<string | null>(null);
    const [visibleNotifications, setVisibleNotifications] = useState(new Set<number>());

    useEffect(() => {
        if (user?.id) {
            loadNotifications();

            // Subscribe to real-time notifications
            const channelKey = 'user-notifications';

            const channel = masterBus.getOrCreateChannel(channelKey);
                channel
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'notifications',
                        filter: `user_id=eq.${user.id}`,
                    },
                    (payload) => {
                        const newNotif = payload.new as Notification;
                        setNotifications(prev => [newNotif, ...prev]);

                        // Highlight new notification
                        setNewNotifId(newNotif.id);
                        setTimeout(() => setNewNotifId(null), 3000);

                        // Play notification sound via PremiumSFX
                        try {
                            PremiumSFX.notification();
                        } catch (e) { /* silent */ }
                    }
                )
                .subscribe();

            return () => {
                masterBus.removeRegisteredChannel(channelKey);
            };
        }
    }, [user?.id]);

    // ── Bus Listeners: cross-page notification reactivity ──
    useEffect(() => {
        const unsubReceived = masterBus.subscribe('NOTIFICATION_RECEIVED', () => { loadNotifications(); });
        const unsubCount = masterBus.subscribe('NOTIFICATION_COUNT_CHANGED', () => { loadNotifications(); });
        return () => { unsubReceived(); unsubCount(); };
    }, []);

    const loadNotifications = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', user?.id)
                .order('created_at', { ascending: false })
                .limit(50);

            if (!error && data) {
                setNotifications(data);
            }
        } catch (error) {
            console.error('Failed to load notifications:', error);
        }
        setLoading(false);
    };

    const markAsRead = async (id: string) => {
        try {
            await supabase
                .from('notifications')
                .update({ read: true })
                .eq('id', id);

            setNotifications(prev =>
                prev.map(n => n.id === id ? { ...n, read: true } : n)
            );
        } catch (err) {
            console.error('[Notifications] markAsRead error:', err);
        }
    };

    const markAllRead = async () => {
        try {
            const { error } = await supabase
                .from('notifications')
                .update({ read: true })
                .eq('user_id', user?.id);

            if (error) throw error;
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
            masterBus.emit('NOTIFICATION_READ', { notifId: null, allRead: true });
        } catch (err) {
            console.error('[Notifications] markAllRead error:', err);
            toast.error('Failed to mark notifications as read');
        }
    };

    const deleteNotification = async (id: string) => {
        try {
            await supabase.from('notifications').delete().eq('id', id);
            setNotifications(prev => prev.filter(n => n.id !== id));
        } catch (err) {
            console.error('[Notifications] delete error:', err);
        }
    };

    const getIcon = (type: string): string => {
        switch (type) {
            case 'success': return '✓';
            case 'warning': return '!';
            case 'error': return '✗';
            default: return 'i';
        }
    };

    const formatDate = (dateStr: string): string => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    const unreadCount = notifications.filter(n => !n.read).length;

    // Stagger notification rows
    useEffect(() => {
        setVisibleNotifications(new Set());
        const timers = notifications.map((_, i) =>
            setTimeout(() => setVisibleNotifications(prev => new Set([...prev, i])), i * 40)
        );
        return () => timers.forEach(t => clearTimeout(t));
    }, [notifications.length]);

    return (
        <div className="notifications-page">

            {/* Real-time indicator */}
            <div className="realtime-indicator">
                <span className="live-dot"></span>
                <span>Live updates</span>
            </div>

            {unreadCount > 0 && (
                <div className="mark-all-bar">
                    <button className="mark-all-btn" onClick={markAllRead}>
                        Mark all as read ({unreadCount})
                    </button>
                </div>
            )}

            <div className="notifications-list">
                {loading ? (
                    <div className="loading-state"><div className="spinner" /></div>
                ) : notifications.length === 0 ? (
                    <div className="empty-state">
                        <span className="empty-icon">○</span>
                        <p>No notifications yet</p>
                    </div>
                ) : (
                    notifications.map((notif, index) => (
                        <div
                            key={notif.id}
                            className={`notification-item ${notif.read ? 'read' : 'unread'} ${newNotifId === notif.id ? 'new-highlight' : ''}`}
                            onClick={() => {
                                markAsRead(notif.id);
                                if (notif.action_url) navigate(notif.action_url);
                            }}
                            style={{
                                opacity: visibleNotifications.has(index) ? 1 : 0,
                                transform: visibleNotifications.has(index) ? 'translateY(0)' : 'translateY(8px)',
                                transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                            }}
                        >
                            <span className="notif-icon">{getIcon(notif.type)}</span>
                            <div className="notif-content">
                                <span className="notif-title">{notif.title}</span>
                                <span className="notif-message">{notif.message}</span>
                                <span className="notif-time">{formatDate(notif.created_at)}</span>
                            </div>
                            {!notif.read && <span className="unread-dot" />}
                            <button
                                className="delete-btn"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    deleteNotification(notif.id);
                                }}
                            >
                                ×
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}


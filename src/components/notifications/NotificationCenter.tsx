import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase'
import { masterBus } from '../../core/MasterBus';;
import { useNavigate } from 'react-router-dom';
import './NotificationCenter.css';

interface Notification {
    id: string;
    type: string;
    title: string;
    message: string;
    actionUrl?: string;
    isRead: boolean;
    createdAt: Date;
}

interface NotificationCenterProps {
    userId: string;
    isOpen: boolean;
    onClose: () => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
    userId,
    isOpen,
    onClose
}) => {
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'unread'>('all');
    const [visibleItems, setVisibleItems] = useState<Set<number>>(new Set());

    useEffect(() => {
        if (isOpen) {
            loadNotifications();
        }
    }, [isOpen, userId]);

    useEffect(() => {
        // Real-time subscription
        const channelKey = `notifications:${userId}`;

        const channel = masterBus.getOrCreateChannel(channelKey);
            channel
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${userId}`
            }, (payload) => {
                const newNotif = mapNotification(payload.new);
                setNotifications(prev => [newNotif, ...prev]);
            })
            .subscribe();

        return () => {
            masterBus.removeRegisteredChannel(channelKey);
        };
    }, [userId]);

    const loadNotifications = async () => {
        setLoading(true);
        try {
            const { data } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(50);

            if (data) {
                const mapped = data.map(mapNotification);
                setNotifications(mapped);
                setVisibleItems(new Set());
                mapped.forEach((_, i) => {
                    setTimeout(() => setVisibleItems(prev => new Set(prev).add(i)), i * 60);
                });
            }
        } catch (error) {
            console.error('Failed to load notifications:', error);
        } finally {
            setLoading(false);
        }
    };

    const mapNotification = (n: any): Notification => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        actionUrl: n.action_url,
        isRead: n.is_read,
        createdAt: new Date(n.created_at)
    });

    const handleNotificationClick = async (notif: Notification) => {
        // Mark as read
        if (!notif.isRead) {
            await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('id', notif.id);

            setNotifications(prev =>
                prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n)
            );
        }

        // Navigate if action URL
        if (notif.actionUrl) {
            navigate(notif.actionUrl);
            onClose();
        }
    };

    const handleMarkAllRead = async () => {
        await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', userId)
            .eq('is_read', false);

        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    };

    const handleClearAll = async () => {
        await supabase
            .from('notifications')
            .delete()
            .eq('user_id', userId)
            .eq('is_read', true);

        setNotifications(prev => prev.filter(n => !n.isRead));
    };

    const getTypeIcon = (type: string) => {
        const icons: Record<string, string> = {
            club_invite: '',
            agent_invite: '👔',
            message: '',
            table_ready: '',
            tournament_start: '',
            settlement: '',
            achievement: '',
            bonus: '',
            friend_request: '',
            system: ''
        };
        return icons[type] || '';
    };

    const formatTime = (date: Date) => {
        const diff = Date.now() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    };

    const filteredNotifications = filter === 'unread'
        ? notifications.filter(n => !n.isRead)
        : notifications;

    const unreadCount = notifications.filter(n => !n.isRead).length;

    if (!isOpen) return null;

    return (
        <>
            <div className="notification-backdrop" onClick={onClose} />
            <div className="notification-center">
                <div className="notification-header">
                    <h3>Notifications</h3>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <div className="notification-filters">
                    <button
                        className={filter === 'all' ? 'active' : ''}
                        onClick={() => setFilter('all')}
                    >
                        All
                    </button>
                    <button
                        className={filter === 'unread' ? 'active' : ''}
                        onClick={() => setFilter('unread')}
                    >
                        Unread ({unreadCount})
                    </button>
                </div>

                <div className="notification-actions">
                    <button onClick={handleMarkAllRead}>Mark all read</button>
                    <button onClick={handleClearAll}>Clear read</button>
                </div>

                <div className="notification-list">
                    {loading ? (
                        <div className="notification-loading">Loading...</div>
                    ) : filteredNotifications.length === 0 ? (
                        <div className="notification-empty">
                            {filter === 'unread' ? 'No unread notifications' : 'No notifications'}
                        </div>
                    ) : (
                        filteredNotifications.map((notif, i) => (
                            <div
                                key={notif.id}
                                className={`notification-item ${notif.isRead ? 'read' : 'unread'}`}
                                onClick={() => handleNotificationClick(notif)}
                                style={{
                                    opacity: visibleItems.has(i) ? 1 : 0,
                                    transform: visibleItems.has(i) ? 'translateY(0)' : 'translateY(8px)',
                                    transition: 'all 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                                }}
                            >
                                <span className="notif-icon">{getTypeIcon(notif.type)}</span>
                                <div className="notif-content">
                                    <div className="notif-title">{notif.title}</div>
                                    <div className="notif-message">{notif.message}</div>
                                    <div className="notif-time">{formatTime(notif.createdAt)}</div>
                                </div>
                                {!notif.isRead && <span className="unread-dot" />}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </>
    );
};

export default NotificationCenter;

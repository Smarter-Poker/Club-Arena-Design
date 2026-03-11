/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  NOTIFICATION BELL — Header Badge with Unread Count (v2.2 — Hardened)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Displays a bell icon with unread count badge. Tapping navigates to /notifications.
 *
 * v2.2: Synchronous cleanup to prevent React Strict Mode race conditions.
 *       Single source of truth for mark-read: masterBus NOTIFICATION_READ only.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../stores/useUserStore';
import { masterBus } from '../../core/MasterBus';

export default function NotificationBell() {
    const navigate = useNavigate();
    const { user } = useUserStore();
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        if (!user?.id) return;

        // Fetch initial unread count
        const fetchCount = async () => {
            const { count } = await supabase
                .from('notifications')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .eq('read', false);
            setUnreadCount(count || 0);
        };
        fetchCount();

        // Real-time: ONLY listen for new INSERTs (new notifications arriving)
        // Mark-read sync is handled exclusively by masterBus NOTIFICATION_READ
        const channelKey = `notif-bell-${user.id}`;
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
                () => {
                    setUnreadCount(prev => prev + 1);
                }
            )
            .subscribe();

        // masterBus subscriber for NOTIFICATION_READ (only source of mark-read sync)
        const unsubNotifRead = masterBus.subscribe('NOTIFICATION_READ', (event: any) => {
            if (event.payload?.allRead) {
                setUnreadCount(0);
            } else {
                setUnreadCount(prev => Math.max(0, prev - 1));
            }
        });

        return () => {
            masterBus.removeRegisteredChannel(channelKey);
            unsubNotifRead();
        };
    }, [user?.id]);

    return (
        <button
            onClick={() => navigate('/notifications')}
            style={{
                position: 'relative',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 6,
                fontSize: '1.2rem',
            }}
            title="Notifications"
        >
            🔔
            {unreadCount > 0 && (
                <span style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    background: '#ef4444',
                    color: '#fff',
                    fontSize: '0.55rem',
                    fontWeight: 800,
                    borderRadius: '50%',
                    width: 16,
                    height: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                </span>
            )}
        </button>
    );
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  NOTIFICATION BELL — Header Badge with Unread Count (v2.0)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Displays a bell icon with unread count badge. Tapping navigates to /notifications.
 *
 * v2.0: #4 — Subscribes to NOTIFICATION_READ via masterBus for instant badge sync
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../stores/useUserStore';

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

        // #1: Real-time listener via Channel Registry
        let channelKey = `notif-bell-${user.id}`;
        import('../../core/MasterBus').then(({ masterBus }) => {
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
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'notifications',
                        filter: `user_id=eq.${user.id}`,
                    },
                    (payload) => {
                        if ((payload.new as any).read === true) {
                            setUnreadCount(prev => Math.max(0, prev - 1));
                        }
                    }
                )
                .subscribe();
        });

        // #4: Subscribe to NOTIFICATION_READ for instant badge sync
        let unsubNotifRead: (() => void) | null = null;
        import('../../core/MasterBus').then(({ masterBus }) => {
            unsubNotifRead = masterBus.subscribe('NOTIFICATION_READ', (event: any) => {
                if (event.payload?.allRead) {
                    // All marked read — reset to 0
                    setUnreadCount(0);
                } else {
                    // Single marked read — decrement
                    setUnreadCount(prev => Math.max(0, prev - 1));
                }
            });
        });

        return () => {
            import('../../core/MasterBus').then(({ masterBus }) => {
                masterBus.removeRegisteredChannel(channelKey);
            });
            unsubNotifRead?.();
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

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  NOTIFICATION BELL — Header Badge with Unread Count
 * ═══════════════════════════════════════════════════════════════════════════════
 * Displays a bell icon with unread count badge. Tapping navigates to /notifications.
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

        // Real-time listener for new notifications
        const channel = supabase
            .channel(`notif-bell-${user.id}`)
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

        return () => { supabase.removeChannel(channel); };
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

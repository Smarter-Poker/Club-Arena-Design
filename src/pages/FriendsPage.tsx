/**
 * 👫 FRIENDS PAGE — Friends List & Management with Real-Time Status
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useUserStore } from '../stores/useUserStore';
import { useToast } from '../components/common/Toast';
import SmarterHeader from '../components/layout/SmarterHeader';
import FriendsList from '../components/social/FriendsList';
import './FriendsPage.css';

interface Friend {
    id: string;
    user_id: string;
    username: string;
    avatar_url?: string;
    is_online: boolean;
    current_table?: string;
}

type FriendsTab = 'friends' | 'pending' | 'blocked';

export default function FriendsPage() {
    const navigate = useNavigate();
    const { user } = useUserStore();
    const toast = useToast();

    const [friends, setFriends] = useState<Friend[]>([]);
    const [pendingRequests, setPendingRequests] = useState<Friend[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<FriendsTab>('friends');
    const [searchQuery, setSearchQuery] = useState('');
    const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (user?.id) loadFriends();
    }, [user?.id]);

    // Real-time presence tracking for friends
    useEffect(() => {
        if (!user?.id || friends.length === 0) return;

        const channel = supabase.channel('online-friends');

        // Track online status
        channel
            .on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState();
                const onlineIds = new Set<string>();
                Object.values(state).forEach(presences => {
                    (presences as any[]).forEach(p => onlineIds.add(p.user_id));
                });
                setOnlineUserIds(onlineIds);
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await channel.track({ user_id: user.id, online_at: new Date().toISOString() });
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user?.id, friends.length]);

    // Real-time friend request notifications
    useEffect(() => {
        if (!user?.id) return;

        const channel = supabase
            .channel('friend-requests')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'friendships',
                    filter: `friend_id=eq.${user.id}`,
                },
                (payload) => {
                    // New friend request!
                    loadFriends();
                    toast.success('New friend request received!');
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user?.id]);

    const loadFriends = async () => {
        setLoading(true);
        try {
            // Load accepted friendships
            const { data: friendships } = await supabase
                .from('friendships')
                .select(`
                    id,
                    friend:profiles!friendships_friend_id_fkey (
                        id,
                        username,
                        avatar_url
                    ),
                    status
                `)
                .eq('user_id', user?.id)
                .eq('status', 'accepted');

            if (friendships) {
                setFriends(friendships.map((f: any) => ({
                    id: f.id,
                    user_id: f.friend?.id,
                    username: f.friend?.username || 'Unknown',
                    avatar_url: f.friend?.avatar_url,
                    is_online: onlineUserIds.has(f.friend?.id),
                })));
            }

            // Load pending requests
            const { data: pending } = await supabase
                .from('friendships')
                .select(`
                    id,
                    user:profiles!friendships_user_id_fkey (
                        id,
                        username,
                        avatar_url
                    )
                `)
                .eq('friend_id', user?.id)
                .eq('status', 'pending');

            if (pending) {
                setPendingRequests(pending.map((p: any) => ({
                    id: p.id,
                    user_id: p.user?.id,
                    username: p.user?.username || 'Unknown',
                    avatar_url: p.user?.avatar_url,
                    is_online: onlineUserIds.has(p.user?.id),
                })));
            }
        } catch (error) {
            console.error('Failed to load friends:', error);
            toast.error('Failed to load friends');
        }
        setLoading(false);
    };

    const acceptRequest = async (friendshipId: string) => {
        await supabase
            .from('friendships')
            .update({ status: 'accepted' })
            .eq('id', friendshipId);
        loadFriends();
        toast.success('Friend request accepted!');
    };

    const declineRequest = async (friendshipId: string) => {
        await supabase
            .from('friendships')
            .delete()
            .eq('id', friendshipId);
        loadFriends();
    };

    // Update friend online status when presence changes
    const friendsWithStatus = friends.map(f => ({
        ...f,
        is_online: onlineUserIds.has(f.user_id),
    }));

    const filteredFriends = friendsWithStatus.filter(f =>
        f.username.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const onlineCount = friendsWithStatus.filter(f => f.is_online).length;

    return (
        <div className="friends-page">
            <SmarterHeader title="👫 Friends" />

            <div className="friends-summary">
                <div className="summary-stat">
                    <span className="stat-value">{friends.length}</span>
                    <span className="stat-label">Friends</span>
                </div>
                <div className="summary-stat online">
                    <span className="stat-value">{onlineCount}</span>
                    <span className="stat-label">Online</span>
                </div>
                {pendingRequests.length > 0 && (
                    <div className="summary-stat pending">
                        <span className="stat-value">{pendingRequests.length}</span>
                        <span className="stat-label">Pending</span>
                    </div>
                )}
            </div>

            <div className="friends-tabs">
                <button
                    className={activeTab === 'friends' ? 'active' : ''}
                    onClick={() => setActiveTab('friends')}
                >
                    Friends ({friends.length})
                </button>
                <button
                    className={activeTab === 'pending' ? 'active' : ''}
                    onClick={() => setActiveTab('pending')}
                >
                    Requests ({pendingRequests.length})
                </button>
            </div>

            {activeTab === 'friends' && (
                <>
                    <div className="friends-search">
                        <input
                            type="text"
                            placeholder="Search friends..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <div className="friends-list">
                        {loading ? (
                            <div className="loading-state"><div className="spinner" /></div>
                        ) : filteredFriends.length === 0 ? (
                            <div className="empty-state">
                                <span className="empty-icon">👫</span>
                                <p>No friends yet</p>
                                <button className="btn btn-primary" onClick={() => navigate('/search?tab=players')}>Find Friends</button>
                            </div>
                        ) : (
                            filteredFriends.map(friend => (
                                <div
                                    key={friend.id}
                                    className="friend-row"
                                    onClick={() => navigate(`/profile/${friend.user_id}`)}
                                >
                                    <div className="friend-avatar">
                                        {friend.avatar_url ? (
                                            <img src={friend.avatar_url} alt="" />
                                        ) : (
                                            <span>{friend.username[0]?.toUpperCase()}</span>
                                        )}
                                        {friend.is_online && <span className="online-dot" />}
                                    </div>
                                    <div className="friend-info">
                                        <span className="friend-name">{friend.username}</span>
                                        {friend.current_table && (
                                            <span className="friend-status"> Playing at {friend.current_table}</span>
                                        )}
                                    </div>
                                    <button
                                        className="action-btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            navigate(`/messages/new?userId=${friend.user_id}`);
                                        }}
                                    ></button>
                                </div>
                            ))
                        )}
                    </div>
                </>
            )}

            {activeTab === 'pending' && (
                <div className="pending-list">
                    {pendingRequests.length === 0 ? (
                        <div className="empty-state">
                            <p>No pending requests</p>
                        </div>
                    ) : (
                        pendingRequests.map(request => (
                            <div key={request.id} className="request-row">
                                <div className="request-avatar">
                                    {request.avatar_url ? (
                                        <img src={request.avatar_url} alt="" />
                                    ) : (
                                        <span>{request.username[0]?.toUpperCase()}</span>
                                    )}
                                </div>
                                <div className="request-info">
                                    <span className="request-name">{request.username}</span>
                                    <span className="request-label">wants to be friends</span>
                                </div>
                                <div className="request-actions">
                                    <button className="accept-btn" onClick={() => acceptRequest(request.id)}></button>
                                    <button className="decline-btn" onClick={() => declineRequest(request.id)}>✕</button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

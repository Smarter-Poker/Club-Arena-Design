/**
 * 👫 FRIENDS PAGE — Friends List & Management with Real-Time Status
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useUserStore } from '../stores/useUserStore';
import { masterBus } from '../core/MasterBus';
import { useToast } from '../components/common/Toast';
import FriendsList from '../components/social/FriendsList';
import RecentPlayers from '../components/social/RecentPlayers';
import FriendActivityFeed from '../components/social/FriendActivityFeed';
import InviteToTable from '../components/social/InviteToTable';
import { useSwipeAction } from '../hooks/useSwipeAction';
import './FriendsPage.css';
import { useVisibilityRefresh } from '../hooks/useVisibilityRefresh';

interface Friend {
  id: string;
  user_id: string;
  username: string;
  avatar_url?: string;
  is_online: boolean;
  current_table?: string;
}

type FriendsTab = 'friends' | 'pending' | 'recent';

export default function FriendsPage() {
  const navigate = useNavigate();
  useVisibilityRefresh(() => loadFriends());
  const { user } = useUserStore();
  const toast = useToast();

  const [friends, setFriends] = useState<Friend[]>([]);
  const [pendingRequests, setPendingRequests] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FriendsTab>('friends');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [visibleFriendRows, setVisibleFriendRows] = useState(new Set<number>());
  const [visiblePendingRows, setVisiblePendingRows] = useState(new Set<number>());
  const [searchFocused, setSearchFocused] = useState(false);
  const loadFriendsRef = useRef(async () => {});

  useEffect(() => {
    if (user?.id) loadFriends();
  }, [user?.id]);

  // Keep ref pointing to the latest version of loadFriends to avoid stale closures
  useEffect(() => {
    loadFriendsRef.current = loadFriends;
  });

  // Real-time presence tracking for friends
  useEffect(() => {
    if (!user?.id || friends.length === 0) return;

    const presenceKey = `online-friends-${user.id}`;
    const channel = masterBus.getOrCreateChannel(presenceKey);

    // Track online status
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const onlineIds = new Set<string>();
        Object.values(state).forEach((presences) => {
          (presences as any[]).forEach((p) => onlineIds.add(p.user_id));
        });
        setOnlineUserIds(onlineIds);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: user.id, online_at: new Date().toISOString() });
        }
      });

    return () => {
      masterBus.removeRegisteredChannel(presenceKey);
    };
  }, [user?.id, friends.length]);

  // Real-time friend request notifications
  useEffect(() => {
    if (!user?.id) return;

    const channelKey = `friend-requests-${user.id}`;
    const channel = masterBus.getOrCreateChannel(channelKey);
    channel
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
          loadFriendsRef.current();
          toast.success('New friend request received!');
        }
      )
      .subscribe();

    return () => {
      masterBus.removeRegisteredChannel(channelKey);
    };
  }, [user?.id]);

  // ── Bus Listeners: cross-page friend reactivity ──
  useEffect(() => {
    const unsubAccepted = masterBus.subscribe('FRIEND_REQUEST_ACCEPTED', () => {
      loadFriendsRef.current();
    });
    const unsubSent = masterBus.subscribe('FRIEND_REQUEST_SENT', () => {
      loadFriendsRef.current();
    });
    const unsubProfile = masterBus.subscribe('PROFILE_UPDATED', () => {
      loadFriendsRef.current();
    });
    return () => {
      unsubAccepted();
      unsubSent();
      unsubProfile();
    };
  }, []);

  const loadFriends = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      // Load accepted friendships (where user initiated)
      const { data: sentFriendships } = await supabase
        .from('friendships')
        .select(
          `
                    id,
                    friend:profiles!friendships_friend_id_fkey (
                        id,
                        username,
                        avatar_url
                    ),
                    status
                `
        )
        .eq('user_id', user?.id)
        .eq('status', 'accepted');

      // Load accepted friendships (where user received)
      const { data: receivedFriendships } = await supabase
        .from('friendships')
        .select(
          `
                    id,
                    friend:profiles!friendships_user_id_fkey (
                        id,
                        username,
                        avatar_url
                    ),
                    status
                `
        )
        .eq('friend_id', user?.id)
        .eq('status', 'accepted');

      const allFriendships = [...(sentFriendships || []), ...(receivedFriendships || [])];

      if (allFriendships.length > 0) {
        const uniqueMap = new Map();
        allFriendships.forEach((f: any) => {
          if (f.friend?.id && !uniqueMap.has(f.friend.id)) {
            uniqueMap.set(f.friend.id, {
              id: f.id,
              user_id: f.friend.id,
              username: f.friend.username || 'Unknown',
              avatar_url: f.friend.avatar_url,
              is_online: onlineUserIds.has(f.friend.id),
            });
          }
        });
        setFriends(Array.from(uniqueMap.values()));
      } else {
        setFriends([]);
      }

      // Load pending requests
      const { data: pending } = await supabase
        .from('friendships')
        .select(
          `
                    id,
                    user:profiles!friendships_user_id_fkey (
                        id,
                        username,
                        avatar_url
                    )
                `
        )
        .eq('friend_id', user?.id)
        .eq('status', 'pending');

      if (pending) {
        setPendingRequests(
          pending.map((p: any) => ({
            id: p.id,
            user_id: p.user?.id,
            username: p.user?.username || 'Unknown',
            avatar_url: p.user?.avatar_url,
            is_online: onlineUserIds.has(p.user?.id),
          }))
        );
      }
    } catch (error) {
      console.error('Failed to load friends:', error);
      toast.error('Failed to load friends');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadFriendsRef.current = loadFriends;
  }, [user?.id, onlineUserIds]);

  const acceptRequest = async (friendshipId: string) => {
    try {
      const { error } = await supabase
        .from('friendships')
        .update({ status: 'accepted' })
        .eq('id', friendshipId);
      if (error) throw error;
      masterBus.emit('FRIEND_REQUEST_ACCEPTED', { friendshipId });
      loadFriends();
      toast.success('Friend request accepted!');
    } catch (err) {
      console.error('[Friends] Failed to accept request:', err);
      toast.error('Failed to accept request');
    }
  };

  const declineRequest = async (friendshipId: string) => {
    try {
      const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
      if (error) throw error;
      loadFriends();
      toast.success('Friend request declined');
    } catch (err) {
      console.error('[Friends] Failed to decline request:', err);
      toast.error('Failed to decline request');
    }
  };

  const removeFriend = async (friendshipId: string) => {
    try {
      const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
      if (error) throw error;
      loadFriends();
      toast.success('Friend removed');
    } catch (err) {
      console.error('[Friends] Failed to remove friend:', err);
      toast.error('Failed to remove friend');
    }
  };

  const sendFriendRequest = async (playerId: string) => {
    if (!user?.id) return;
    try {
      const { error } = await supabase.from('friendships').insert({
        user_id: user.id,
        friend_id: playerId,
        status: 'pending',
      });
      if (error) {
        if (error.code === '23505') {
          toast.info('Friend request already sent');
          return;
        }
        throw error;
      }
      masterBus.emit('FRIEND_REQUEST_SENT', { toUserId: playerId });
      toast.success('Friend request sent!');
    } catch (err) {
      console.error('[Friends] Failed to send request:', err);
      toast.error('Failed to send friend request');
    }
  };

  // Update friend online status when presence changes
  const friendsWithStatus = friends.map((f) => ({
    ...f,
    is_online: onlineUserIds.has(f.user_id),
  }));

  const filteredFriends = friendsWithStatus.filter((f) =>
    f.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Stagger friend rows on render
  useEffect(() => {
    const timers = filteredFriends.map((_, i) =>
      setTimeout(() => setVisibleFriendRows((prev) => new Set([...prev, i])), i * 50)
    );
    return () => timers.forEach((t) => clearTimeout(t));
  }, [filteredFriends.length]);

  // Stagger pending rows
  useEffect(() => {
    const timers = pendingRequests.map((_, i) =>
      setTimeout(() => setVisiblePendingRows((prev) => new Set([...prev, i])), i * 50)
    );
    return () => timers.forEach((t) => clearTimeout(t));
  }, [pendingRequests.length]);

  const onlineCount = friendsWithStatus.filter((f) => f.is_online).length;

  return (
    <div className="friends-page">
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

      <div className="friends-tabs fr-chip-bar">
        <button
          className={`fr-filter-chip ${activeTab === 'friends' ? 'active' : ''}`}
          onClick={() => setActiveTab('friends')}
        >
          👥 Friends ({friends.length})
        </button>
        <button
          className={`fr-filter-chip ${activeTab === 'pending' ? 'active' : ''}`}
          onClick={() => setActiveTab('pending')}
        >
          🔔 Requests{' '}
          {pendingRequests.length > 0 && (
            <span className="fr-pending-badge">{pendingRequests.length}</span>
          )}
        </button>
        <button
          className={`fr-filter-chip ${activeTab === 'recent' ? 'active' : ''}`}
          onClick={() => setActiveTab('recent')}
        >
          🕒 Recent
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
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              style={{
                boxShadow: searchFocused ? '0 0 16px rgba(0, 212, 255, 0.4)' : 'none',
                transition: 'box-shadow 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
              }}
            />
          </div>

          <div className="friends-list">
            {loading ? (
              <div className="fr-skeleton-list">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="fr-skeleton-row">
                    <div className="fr-skel-avatar" />
                    <div className="fr-skel-text">
                      <div className="fr-skel-name" />
                      <div className="fr-skel-status" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredFriends.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">👫</span>
                <p>No friends yet</p>
                <button className="btn btn-primary" onClick={() => navigate('/search?tab=players')}>
                  Find Friends
                </button>
              </div>
            ) : (
              <>
                {filteredFriends.filter((f) => f.is_online).length > 0 && (
                  <div className="friend-group">
                    <h3 className="friend-group-header">
                      Online — {filteredFriends.filter((f) => f.is_online).length}
                    </h3>
                    {filteredFriends
                      .filter((f) => f.is_online)
                      .map((friend, index) => (
                        <SwipeableFriendRow
                          key={friend.id}
                          friend={friend}
                          visible={visibleFriendRows.has(filteredFriends.indexOf(friend))}
                          onMessage={() => navigate(`/messages/new?userId=${friend.user_id}`)}
                          onRemove={() => removeFriend(friend.id)}
                          navigate={navigate}
                        />
                      ))}
                  </div>
                )}
                {filteredFriends.filter((f) => !f.is_online).length > 0 && (
                  <div className="friend-group">
                    <h3 className="friend-group-header">
                      Offline — {filteredFriends.filter((f) => !f.is_online).length}
                    </h3>
                    {filteredFriends
                      .filter((f) => !f.is_online)
                      .map((friend, index) => (
                        <SwipeableFriendRow
                          key={friend.id}
                          friend={friend}
                          visible={visibleFriendRows.has(filteredFriends.indexOf(friend))}
                          onMessage={() => navigate(`/messages/new?userId=${friend.user_id}`)}
                          onRemove={() => removeFriend(friend.id)}
                          navigate={navigate}
                        />
                      ))}
                  </div>
                )}
              </>
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
            pendingRequests.map((request, index) => (
              <div
                key={request.id}
                className="request-row"
                style={{
                  opacity: visiblePendingRows.has(index) ? 1 : 0,
                  transform: visiblePendingRows.has(index) ? 'translateY(0)' : 'translateY(8px)',
                  transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                }}
              >
                <div className="request-avatar">
                  {request.avatar_url ? (
                    <img src={request.avatar_url} alt="" loading="lazy" />
                  ) : (
                    <span>{request.username[0]?.toUpperCase()}</span>
                  )}
                </div>
                <div className="request-info">
                  <span className="request-name">{request.username}</span>
                  <span className="request-label">wants to be friends</span>
                </div>
                <div className="request-actions">
                  <button className="accept-btn" onClick={() => acceptRequest(request.id)}>
                    ✓
                  </button>
                  <button className="decline-btn" onClick={() => declineRequest(request.id)}>
                    ✕
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'recent' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <FriendActivityFeed friends={friends} />
          <RecentPlayers
            onAddFriend={(playerId) => {
              sendFriendRequest(playerId);
            }}
            onInviteToTable={(playerId) => {
              navigate(`/messages/new?userId=${playerId}`);
              toast.info('Opening chat to invite...');
            }}
          />
        </div>
      )}
    </div>
  );
}

function SwipeableFriendRow({ friend, visible, onMessage, onRemove, navigate }: any) {
  const { handlers, rowStyle, offset, reset } = useSwipeAction({
    actionWidth: 80,
    threshold: 40,
    onSwipeRight: () => {
      // Swipe right reveals left action (Message)
    },
    onSwipeLeft: () => {
      // Swipe left reveals right action (Remove)
    },
  });

  return (
    <div
      className="swipe-container"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 0.3s, transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      }}
    >
      <div
        className="swipe-actions-left"
        onClick={(e) => {
          e.stopPropagation();
          reset();
          onMessage();
        }}
      >
        💬
      </div>
      <div
        className="swipe-actions-right"
        onClick={(e) => {
          e.stopPropagation();
          reset();
          onRemove();
        }}
      >
        🗑️
      </div>
      <div
        className="friend-row surface"
        style={rowStyle}
        {...handlers}
        onClick={() => {
          if (offset !== 0) reset();
          else navigate(`/profile/${friend.user_id}`);
        }}
      >
        <div className="friend-avatar">
          {friend.avatar_url ? (
            <img src={friend.avatar_url} alt="" loading="lazy" />
          ) : (
            <span>{friend.username[0]?.toUpperCase()}</span>
          )}
          {friend.is_online && <span className="online-dot pulse-anim" />}
        </div>
        <div className="friend-info">
          <span className="friend-name">{friend.username}</span>
          {/* fr-at-table-badge reserved for future current_table data */}
        </div>
      </div>
    </div>
  );
}

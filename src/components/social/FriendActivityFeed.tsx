import { useState, useEffect } from 'react';
import { masterBus } from '../../core/MasterBus';
import './FriendActivityFeed.css';

interface ActivityItem {
  id: string;
  userId: string;
  username: string;
  avatar?: string;
  action: string;
  target?: string;
  timestamp: Date;
  icon: string;
}

export default function FriendActivityFeed({ friends }: { friends: any[] }) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  useEffect(() => {
    // Simulated initial activities from friends
    if (friends.length > 0) {
      const initial: ActivityItem[] = [
        {
          id: '1',
          userId: friends[0]?.user_id || '1',
          username: friends[0]?.username || 'Player',
          avatar: friends[0]?.avatar_url,
          action: 'joined table',
          target: 'Shark Tank 1/2',
          timestamp: new Date(Date.now() - 1000 * 60 * 5),
          icon: '🃏',
        },
        {
          id: '2',
          userId: friends[1 % friends.length]?.user_id || '2',
          username: friends[1 % friends.length]?.username || 'Player 2',
          avatar: friends[1 % friends.length]?.avatar_url,
          action: 'hit a',
          target: 'Royal Flush',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
          icon: '👑',
        },
        {
          id: '3',
          userId: friends[2 % friends.length]?.user_id || '3',
          username: friends[2 % friends.length]?.username || 'Player 3',
          avatar: friends[2 % friends.length]?.avatar_url,
          action: 'won tournament',
          target: 'Sunday Million',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24),
          icon: '🏆',
        },
      ];
      setActivities(initial);
    }

    // Subscribe to real-time events on MasterBus
    const unsubComplete = masterBus.subscribe('HAND_COMPLETED', (payload: any) => {
      if (payload?.winnerId && friends.some((f) => f.user_id === payload.winnerId)) {
        const friend = friends.find((f) => f.user_id === payload.winnerId);
        if (friend) {
          setActivities((prev) =>
            [
              {
                id: Date.now().toString(),
                userId: friend.user_id,
                username: friend.username,
                avatar: friend.avatar_url,
                action: 'won a massive pot',
                timestamp: new Date(),
                icon: '💰',
              },
              ...prev,
            ].slice(0, 20)
          );
        }
      }
    });

    // Q3: React to new friendships so the feed updates instantly
    const unsubFriend = masterBus.subscribe('FRIEND_REQUEST_ACCEPTED', (payload: any) => {
      if (payload?.friendId || payload?.username) {
        setActivities((prev) =>
          [
            {
              id: Date.now().toString(),
              userId: payload.friendId || '',
              username: payload.username || 'A player',
              avatar: payload.avatarUrl,
              action: 'became friends with you',
              timestamp: new Date(),
              icon: '🤝',
            },
            ...prev,
          ].slice(0, 20)
        );
      }
    });

    return () => {
      unsubComplete();
      unsubFriend();
    };
  }, [friends]);

  if (activities.length === 0) return null;

  return (
    <div className="friend-activity-feed">
      <div className="activity-header">
        <h3>Friend Activity</h3>
        <div className="live-indicator">
          <span className="live-dot"></span> Live
        </div>
      </div>
      <div className="activity-list">
        {activities.map((item, index) => (
          <div
            key={item.id}
            className="activity-item"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="activity-avatar">
              {item.avatar ? (
                <img src={item.avatar} alt="" />
              ) : (
                <span>{item.username[0]?.toUpperCase()}</span>
              )}
              <div className="activity-icon-badge">{item.icon}</div>
            </div>
            <div className="activity-content">
              <p>
                <span className="activity-username">{item.username}</span> {item.action}{' '}
                {item.target && <span className="activity-target">{item.target}</span>}
              </p>
              <span className="activity-time">{formatTimeAgo(item.timestamp)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTimeAgo(date: Date) {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

import React from 'react';
import './ActivityFeed.css';

interface ActivityItem {
    id: string;
    type: 'win' | 'achievement' | 'friend' | 'tournament' | 'level_up';
    playerName: string;
    playerAvatar?: string;
    description: string;
    timestamp: Date;
    metadata?: Record<string, any>;
}

interface ActivityFeedProps {
    activities: ActivityItem[];
    onItemClick?: (id: string) => void;
}

const TYPE_ICONS = {
    win: '',
    achievement: '',
    friend: '',
    tournament: '',
    level_up: '',
};

export const ActivityFeed: React.FC<ActivityFeedProps> = ({
    activities,
    onItemClick
}) => {
    const formatTime = (date: Date) => {
        const diff = Date.now() - date.getTime();
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return date.toLocaleDateString();
    };

    return (
        <div className="activity-feed">
            <h3>Activity Feed</h3>
            <div className="feed-list">
                {activities.map(activity => (
                    <div
                        key={activity.id}
                        className={`feed-item type-${activity.type}`}
                        onClick={() => onItemClick?.(activity.id)}
                    >
                        <div className="feed-avatar">
                            {activity.playerAvatar ? (
                                <img src={activity.playerAvatar} alt="" />
                            ) : (
                                <span>{activity.playerName[0]}</span>
                            )}
                        </div>
                        <div className="feed-content">
                            <div className="feed-text">
                                <span className="feed-player">{activity.playerName}</span>
                                {' '}{activity.description}
                            </div>
                            <div className="feed-meta">
                                <span className="feed-icon">{TYPE_ICONS[activity.type]}</span>
                                <span className="feed-time">{formatTime(activity.timestamp)}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ActivityFeed;

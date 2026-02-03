/**
 * ♠ CLUB ARENA — Real-Time Activity Feed
 * Shows live table activity, player joins, and notable hands
 */

import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import './ActivityFeed.css';

interface ActivityItem {
    id: string;
    type: 'join_table' | 'leave_table' | 'big_pot' | 'player_join' | 'tournament_start' | 'achievement';
    message: string;
    timestamp: string;
    metadata?: {
        tableName?: string;
        playerName?: string;
        potSize?: number;
        chips?: number;
    };
}

interface ActivityFeedProps {
    clubId: string;
    maxItems?: number;
}

export const ActivityFeed: React.FC<ActivityFeedProps> = ({ clubId, maxItems = 20 }) => {
    const [activities, setActivities] = useState<ActivityItem[]>([]);
    const [isLive, setIsLive] = useState(true);

    useEffect(() => {
        // Initial fetch
        fetchRecentActivity();

        // Subscribe to real-time updates
        const channel = supabase
            .channel(`activity_feed:${clubId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'activity_log',
                    filter: `club_id=eq.${clubId}`,
                },
                (payload) => {
                    const newActivity = payload.new as ActivityItem;
                    setActivities((prev) => [newActivity, ...prev.slice(0, maxItems - 1)]);
                }
            )
            .subscribe((status) => {
                setIsLive(status === 'SUBSCRIBED');
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [clubId, maxItems]);

    const fetchRecentActivity = async () => {
        // In production, would fetch from activity_log table
        // For now, generate mock data
        const mockActivities: ActivityItem[] = [
            {
                id: '1',
                type: 'big_pot',
                message: 'SharkPlayer won a 15,000 chip pot',
                timestamp: new Date(Date.now() - 1000 * 60).toISOString(),
                metadata: { playerName: 'SharkPlayer', potSize: 15000 },
            },
            {
                id: '2',
                type: 'join_table',
                message: 'AceHunter joined NLH 5/10',
                timestamp: new Date(Date.now() - 1000 * 120).toISOString(),
                metadata: { playerName: 'AceHunter', tableName: 'NLH 5/10' },
            },
            {
                id: '3',
                type: 'tournament_start',
                message: 'Sunday Special $50K GTD started',
                timestamp: new Date(Date.now() - 1000 * 300).toISOString(),
            },
            {
                id: '4',
                type: 'achievement',
                message: 'ProGrinder unlocked "High Roller" badge',
                timestamp: new Date(Date.now() - 1000 * 600).toISOString(),
                metadata: { playerName: 'ProGrinder' },
            },
            {
                id: '5',
                type: 'player_join',
                message: 'NewPlayer42 joined the club',
                timestamp: new Date(Date.now() - 1000 * 900).toISOString(),
            },
        ];
        setActivities(mockActivities);
    };

    const getIcon = (type: ActivityItem['type']) => {
        switch (type) {
            case 'join_table': return '🎯';
            case 'leave_table': return '👋';
            case 'big_pot': return '💰';
            case 'player_join': return '👤';
            case 'tournament_start': return '🏆';
            case 'achievement': return '⭐';
            default: return '📢';
        }
    };

    const getTimeAgo = (timestamp: string) => {
        const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    };

    return (
        <div className="activity-feed">
            <div className="feed-header">
                <h3>🔴 Live Activity</h3>
                <span className={`live-indicator ${isLive ? 'live' : 'offline'}`}>
                    {isLive ? '● LIVE' : '○ OFFLINE'}
                </span>
            </div>

            <div className="feed-list">
                {activities.length === 0 ? (
                    <div className="feed-empty">
                        <p>No recent activity</p>
                    </div>
                ) : (
                    activities.map((activity) => (
                        <div key={activity.id} className={`feed-item ${activity.type}`}>
                            <span className="feed-icon">{getIcon(activity.type)}</span>
                            <div className="feed-content">
                                <p className="feed-message">{activity.message}</p>
                                <span className="feed-time">{getTimeAgo(activity.timestamp)}</span>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default ActivityFeed;

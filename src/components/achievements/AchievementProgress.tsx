/**
 * ♠ CLUB ARENA — Achievement Progress Tracker
 * Shows progress toward uncompleted achievements
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../stores/useUserStore';
import './AchievementProgress.css';

interface Achievement {
    id: string;
    name: string;
    description: string;
    icon: string;
    category: 'gameplay' | 'social' | 'winning' | 'special';
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
    progress: number;
    target: number;
    reward: number; // diamonds
    isCompleted: boolean;
}

interface AchievementProgressProps {
    limit?: number;
    showCompleted?: boolean;
    onAchievementClick?: (achievement: Achievement) => void;
}

export const AchievementProgress: React.FC<AchievementProgressProps> = ({
    limit = 4,
    showCompleted = false,
    onAchievementClick,
}) => {
    const { user } = useUserStore();
    const [achievements, setAchievements] = useState<Achievement[]>([]);
    const [filter, setFilter] = useState<'all' | 'gameplay' | 'social' | 'winning' | 'special'>('all');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadAchievements();
    }, [user?.id]);

    const loadAchievements = async () => {
        try {
            // Mock achievements for demo
            const mockAchievements: Achievement[] = [
                {
                    id: '1',
                    name: 'Hand Veteran',
                    description: 'Play 1,000 hands',
                    icon: '🃏',
                    category: 'gameplay',
                    rarity: 'common',
                    progress: 847,
                    target: 1000,
                    reward: 100,
                    isCompleted: false,
                },
                {
                    id: '2',
                    name: 'Social Butterfly',
                    description: 'Add 10 friends',
                    icon: '🦋',
                    category: 'social',
                    rarity: 'common',
                    progress: 7,
                    target: 10,
                    reward: 50,
                    isCompleted: false,
                },
                {
                    id: '3',
                    name: 'Big Winner',
                    description: 'Win a pot over 100BB',
                    icon: '💰',
                    category: 'winning',
                    rarity: 'rare',
                    progress: 0,
                    target: 1,
                    reward: 200,
                    isCompleted: false,
                },
                {
                    id: '4',
                    name: 'Tournament Champion',
                    description: 'Win 5 tournaments',
                    icon: '🏆',
                    category: 'special',
                    rarity: 'epic',
                    progress: 3,
                    target: 5,
                    reward: 500,
                    isCompleted: false,
                },
                {
                    id: '5',
                    name: 'Royal Flush',
                    description: 'Make a royal flush',
                    icon: '👑',
                    category: 'special',
                    rarity: 'legendary',
                    progress: 0,
                    target: 1,
                    reward: 1000,
                    isCompleted: false,
                },
            ];
            setAchievements(mockAchievements);
        } catch (error) {
            console.error('Failed to load achievements:', error);
        } finally {
            setLoading(false);
        }
    };

    const getRarityColor = (rarity: Achievement['rarity']) => {
        switch (rarity) {
            case 'common': return '#95a5a6';
            case 'rare': return '#3498db';
            case 'epic': return '#9b59b6';
            case 'legendary': return '#f1c40f';
        }
    };

    const filteredAchievements = achievements
        .filter(a => showCompleted || !a.isCompleted)
        .filter(a => filter === 'all' || a.category === filter)
        .sort((a, b) => (b.progress / b.target) - (a.progress / a.target))
        .slice(0, limit);

    if (loading) {
        return (
            <div className="achievement-progress loading">
                <div className="spinner" />
            </div>
        );
    }

    return (
        <div className="achievement-progress">
            <div className="progress-header">
                <h3>🏅 Achievements</h3>
                <a href="/achievements" className="view-all">View All →</a>
            </div>

            {/* Category Filters */}
            <div className="category-filters">
                {(['all', 'gameplay', 'social', 'winning', 'special'] as const).map(cat => (
                    <button
                        key={cat}
                        className={`cat-btn ${filter === cat ? 'active' : ''}`}
                        onClick={() => setFilter(cat)}
                    >
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </button>
                ))}
            </div>

            {/* Achievement Cards */}
            <div className="achievements-grid">
                {filteredAchievements.map((achievement) => {
                    const percent = Math.min(100, Math.round((achievement.progress / achievement.target) * 100));
                    return (
                        <div
                            key={achievement.id}
                            className={`achievement-card rarity-${achievement.rarity}`}
                            onClick={() => onAchievementClick?.(achievement)}
                        >
                            <div className="achievement-icon">{achievement.icon}</div>
                            <div className="achievement-info">
                                <div className="achievement-header">
                                    <span className="achievement-name">{achievement.name}</span>
                                    <span
                                        className="rarity-badge"
                                        style={{ color: getRarityColor(achievement.rarity) }}
                                    >
                                        {achievement.rarity}
                                    </span>
                                </div>
                                <p className="achievement-desc">{achievement.description}</p>
                                <div className="progress-bar">
                                    <div
                                        className="progress-fill"
                                        style={{
                                            width: `${percent}%`,
                                            background: getRarityColor(achievement.rarity),
                                        }}
                                    />
                                </div>
                                <div className="progress-text">
                                    <span>{achievement.progress}/{achievement.target}</span>
                                    <span className="reward">💎 {achievement.reward}</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default AchievementProgress;

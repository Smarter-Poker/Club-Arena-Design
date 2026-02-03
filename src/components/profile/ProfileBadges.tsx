/**
 * ♠ CLUB ARENA — Profile Badges
 * Display player achievements and status badges
 */

import React from 'react';
import './ProfileBadges.css';

interface Badge {
    id: string;
    name: string;
    icon: string;
    color: string;
    description: string;
    earnedAt?: string;
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

interface ProfileBadgesProps {
    badges: Badge[];
    maxDisplay?: number;
    size?: 'sm' | 'md' | 'lg';
    showTooltips?: boolean;
    onBadgeClick?: (badge: Badge) => void;
}

export const ProfileBadges: React.FC<ProfileBadgesProps> = ({
    badges,
    maxDisplay = 5,
    size = 'md',
    showTooltips = true,
    onBadgeClick,
}) => {
    const displayBadges = badges.slice(0, maxDisplay);
    const overflowCount = Math.max(0, badges.length - maxDisplay);

    const getRarityGlow = (rarity: Badge['rarity']) => {
        switch (rarity) {
            case 'legendary': return '0 0 10px rgba(241, 196, 15, 0.5)';
            case 'epic': return '0 0 8px rgba(155, 89, 182, 0.4)';
            case 'rare': return '0 0 6px rgba(52, 152, 219, 0.3)';
            default: return 'none';
        }
    };

    return (
        <div className={`profile-badges size-${size}`}>
            {displayBadges.map((badge) => (
                <div
                    key={badge.id}
                    className={`badge-item rarity-${badge.rarity}`}
                    style={{
                        background: badge.color,
                        boxShadow: getRarityGlow(badge.rarity),
                    }}
                    onClick={() => onBadgeClick?.(badge)}
                    title={showTooltips ? `${badge.name}: ${badge.description}` : undefined}
                >
                    <span className="badge-icon">{badge.icon}</span>
                </div>
            ))}
            {overflowCount > 0 && (
                <div className="badge-overflow">
                    +{overflowCount}
                </div>
            )}
        </div>
    );
};

// Common badge presets
export const BADGE_PRESETS: Record<string, Omit<Badge, 'id' | 'earnedAt'>> = {
    verified: {
        name: 'Verified Player',
        icon: '✓',
        color: '#3498db',
        description: 'Identity verified',
        rarity: 'common',
    },
    vip: {
        name: 'VIP Member',
        icon: '⭐',
        color: '#9b59b6',
        description: 'VIP subscription active',
        rarity: 'epic',
    },
    whale: {
        name: 'High Roller',
        icon: '🐋',
        color: '#1abc9c',
        description: 'Played $10K+ stakes',
        rarity: 'legendary',
    },
    champion: {
        name: 'Tournament Champion',
        icon: '🏆',
        color: '#f1c40f',
        description: 'Won a major tournament',
        rarity: 'legendary',
    },
    veteran: {
        name: 'Veteran Player',
        icon: '🎖️',
        color: '#e74c3c',
        description: '1+ year member',
        rarity: 'rare',
    },
    streaker: {
        name: 'Hot Streak',
        icon: '🔥',
        color: '#e67e22',
        description: '7-day winning streak',
        rarity: 'rare',
    },
    mentor: {
        name: 'Community Mentor',
        icon: '📚',
        color: '#27ae60',
        description: 'Helped 50+ players',
        rarity: 'epic',
    },
    agent: {
        name: 'Club Agent',
        icon: '🤝',
        color: '#2c3e50',
        description: 'Authorized agent',
        rarity: 'rare',
    },
};

export default ProfileBadges;

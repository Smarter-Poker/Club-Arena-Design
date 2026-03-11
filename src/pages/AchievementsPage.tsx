/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  ACHIEVEMENTS PAGE — Player Achievements & Badges with Real-Time Unlocks
 * ═══════════════════════════════════════════════════════════════════════════════
 * Display unlocked achievements, progress, and badges
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase'
import { masterBus } from '../core/MasterBus';;
import { useUserStore } from '../stores/useUserStore';
import AchievementBadge, { AchievementGrid } from '../components/achievements/AchievementBadge';
import { achievementService, ACHIEVEMENTS as SERVICE_ACHIEVEMENTS } from '../services/AchievementService';
import './AchievementsPage.css';

type AchievementCategory = 'all' | 'poker' | 'social' | 'financial' | 'tournament';

interface Achievement {
    id: string;
    name: string;
    description: string;
    icon: string;
    category: AchievementCategory;

    rarity: 'common' | 'rare' | 'epic' | 'legendary';
    progress: number; // 0-100
    unlocked: boolean;
    unlockedAt?: string;
    requirement: string;
}

// Achievement definitions
const ACHIEVEMENTS: Omit<Achievement, 'progress' | 'unlocked' | 'unlockedAt'>[] = [
    // Poker achievements
    { id: 'first_hand', name: 'First Hand', description: 'Play your first hand of poker', icon: '', category: 'poker', rarity: 'common', requirement: 'Play 1 hand' },
    { id: 'hundred_hands', name: 'Centurion', description: 'Play 100 hands', icon: '💯', category: 'poker', rarity: 'common', requirement: 'Play 100 hands' },
    { id: 'thousand_hands', name: 'Grinder', description: 'Play 1,000 hands', icon: '', category: 'poker', rarity: 'rare', requirement: 'Play 1,000 hands' },
    { id: 'ten_thousand', name: 'Marathon Runner', description: 'Play 10,000 hands', icon: '🏃', category: 'poker', rarity: 'epic', requirement: 'Play 10,000 hands' },
    { id: 'royal_flush', name: 'Royal Blood', description: 'Hit a Royal Flush', icon: '', category: 'poker', rarity: 'legendary', requirement: 'Get Royal Flush' },
    { id: 'straight_flush', name: 'Straight Shooter', description: 'Hit a Straight Flush', icon: '🌊', category: 'poker', rarity: 'epic', requirement: 'Get Straight Flush' },
    { id: 'quads', name: 'Four of a Kind', description: 'Hit Quad Aces', icon: '', category: 'poker', rarity: 'rare', requirement: 'Get Quad Aces' },

    // Social achievements
    { id: 'first_club', name: 'Club Member', description: 'Join your first club', icon: '', category: 'social', rarity: 'common', requirement: 'Join 1 club' },
    { id: 'five_clubs', name: 'Social Butterfly', description: 'Join 5 different clubs', icon: '🦋', category: 'social', rarity: 'rare', requirement: 'Join 5 clubs' },
    { id: 'first_friend', name: 'Friendly', description: 'Add your first friend', icon: '', category: 'social', rarity: 'common', requirement: 'Add 1 friend' },
    { id: 'popular', name: 'Popular', description: 'Have 50 friends', icon: '', category: 'social', rarity: 'epic', requirement: 'Add 50 friends' },

    // Financial achievements  
    { id: 'first_win', name: 'Winner', description: 'Win your first pot', icon: '', category: 'financial', rarity: 'common', requirement: 'Win 1 pot' },
    { id: 'big_winner', name: 'Big Winner', description: 'Win a pot over 1,000 chips', icon: '', category: 'financial', rarity: 'rare', requirement: 'Win 1K+ pot' },
    { id: 'profitable', name: 'Profitable', description: 'Reach 10,000 lifetime profit', icon: '', category: 'financial', rarity: 'epic', requirement: '10K profit' },

    // Tournament achievements
    { id: 'first_tourney', name: 'Tournament Player', description: 'Play in a tournament', icon: '', category: 'tournament', rarity: 'common', requirement: 'Enter 1 tournament' },
    { id: 'final_table', name: 'Final Tablist', description: 'Make a final table', icon: '', category: 'tournament', rarity: 'rare', requirement: 'Make final table' },
    { id: 'champion', name: 'Champion', description: 'Win a tournament', icon: '', category: 'tournament', rarity: 'epic', requirement: 'Win tournament' },
    { id: 'ten_wins', name: 'Serial Winner', description: 'Win 10 tournaments', icon: '', category: 'tournament', rarity: 'legendary', requirement: 'Win 10 tournaments' },
];

export default function AchievementsPage() {
    const navigate = useNavigate();
    const { user } = useUserStore();
    const [category, setCategory] = useState<AchievementCategory>('all');
    const [achievements, setAchievements] = useState<Achievement[]>([]);
    const [loading, setLoading] = useState(true);

    const [newUnlock, setNewUnlock] = useState<Achievement | null>(null);
    const [visibleBadges, setVisibleBadges] = useState(new Set<number>());
    const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const loadAchievementsRef = useRef<(() => Promise<void>) | null>(null);

    useEffect(() => {
        if (user?.id) {
            loadAchievements();

            // Subscribe to real-time achievement unlocks
            const channelKey = `user-achievements-${user.id}`;

            const channel = masterBus.getOrCreateChannel(channelKey);
                channel
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'user_achievements',
                        filter: `user_id=eq.${user.id}`,
                    },
                    async (payload) => {
                        // New achievement unlocked!
                        const achievementId = (payload.new as any).achievement_id;
                        const achievement = ACHIEVEMENTS.find(a => a.id === achievementId);
                        if (achievement) {
                            setNewUnlock({
                                ...achievement,
                                progress: 100,
                                unlocked: true,
                                unlockedAt: new Date().toISOString(),
                            });

                            // Auto-hide after 5 seconds (clear previous timer)
                            if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
                            unlockTimerRef.current = setTimeout(() => setNewUnlock(null), 5000);

                            // Reload achievements
                            if (loadAchievementsRef.current) {
                                await loadAchievementsRef.current();
                            }
                        }
                    }
                )
                .subscribe();

            return () => {
                masterBus.removeRegisteredChannel(channelKey);
                if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
            };
        }
    }, [user?.id]);

    const loadAchievements = async () => {
        setLoading(true);
        try {
            // Get user's achievements from AchievementService
            const userAchievements = await achievementService.getUserAchievements(user?.id || '');
            const allAchievements = achievementService.getAll();

            // Create a map of user progress
            const progressMap = new Map(
                userAchievements.map(ua => [ua.achievementId, { progress: ua.progress, unlockedAt: ua.unlockedAt }])
            );

            // Merge with local ACHIEVEMENTS for display
            const merged: Achievement[] = ACHIEVEMENTS.map(a => {
                const userProgress = progressMap.get(a.id);
                const serviceAchievement = allAchievements.find(sa => sa.id === a.id);
                return {
                    ...a,
                    progress: userProgress?.progress || 0,
                    unlocked: (userProgress?.progress || 0) >= (serviceAchievement?.requirement || 100),
                    unlockedAt: userProgress?.unlockedAt,
                };
            });

            setAchievements(merged);


        } catch (error) {
            console.error('Failed to load achievements:', error);
        }
        setLoading(false);
    };

    // Store loadAchievements in ref for use in realtime callbacks
    useEffect(() => {
        loadAchievementsRef.current = loadAchievements;
    }, [user?.id]);

    const filteredAchievements = category === 'all'
        ? achievements
        : achievements.filter(a => a.category === category);

    const unlockedCount = achievements.filter(a => a.unlocked).length;

    // Stagger badge cards
    useEffect(() => {
        setVisibleBadges(new Set());
        const timers = filteredAchievements.map((_, i) =>
            setTimeout(() => setVisibleBadges(prev => new Set([...prev, i])), i * 45)
        );
        return () => timers.forEach(t => clearTimeout(t));
    }, [filteredAchievements.length]);

    const getRarityColor = (rarity: string): string => {
        switch (rarity) {
            case 'legendary': return '#ff9800';
            case 'epic': return '#9c27b0';
            case 'rare': return '#2196f3';
            default: return '#9e9e9e';
        }
    };

    return (
        <div className="achievements-page">

            {/* Progress Summary */}
            <div className="progress-summary">
                <div className="summary-stat">
                    <span className="stat-value">{unlockedCount}/{achievements.length}</span>
                    <span className="stat-label">Unlocked</span>
                </div>

            </div>

            {/* Category Filter */}
            <div className="category-filter">
                {(['all', 'poker', 'social', 'financial', 'tournament'] as AchievementCategory[]).map(cat => (
                    <button
                        key={cat}
                        className={category === cat ? 'active' : ''}
                        onClick={() => setCategory(cat)}
                    >
                        {cat === 'all' ? ' All' :
                            cat === 'poker' ? ' Poker' :
                                cat === 'social' ? ' Social' :
                                    cat === 'financial' ? ' Financial' :
                                        ' Tournament'}
                    </button>
                ))}
            </div>

            {/* Achievements Grid */}
            <AchievementGrid>
                {loading ? (
                    <div className="loading-state"><div className="spinner" /></div>
                ) : (
                    filteredAchievements.map((achievement, index) => (
                        <div
                            key={achievement.id}
                            style={{
                                opacity: visibleBadges.has(index) ? 1 : 0,
                                transform: visibleBadges.has(index) ? 'scale(1)' : 'scale(0.85)',
                                transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                            }}
                        >
                            <AchievementBadge
                                icon={achievement.icon}
                                name={achievement.name}
                                description={achievement.description}
                                progress={achievement.progress}
                                unlocked={achievement.unlocked}
                                rarity={achievement.rarity}
                                unlockedAt={achievement.unlockedAt}
                            />
                        </div>
                    ))
                )}
            </AchievementGrid>

            {/* New Achievement Unlock Popup */}
            {newUnlock && (
                <div className="unlock-popup">
                    <div className="unlock-content">
                        <div className="unlock-icon">{newUnlock.icon}</div>
                        <div className="unlock-text">
                            <span className="unlock-label"> Achievement Unlocked!</span>
                            <span className="unlock-name">{newUnlock.name}</span>

                        </div>
                    </div>
                    <button className="unlock-dismiss" onClick={() => setNewUnlock(null)}>✕</button>
                </div>
            )}
        </div>
    );
}


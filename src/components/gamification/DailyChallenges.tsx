/**
 * ♠ CLUB ARENA — Daily Challenges System
 * Gamification 2.0 with streak rewards and XP progression
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../stores/useUserStore';
import { useToast } from '../common/Toast';
import './DailyChallenges.css';

interface Challenge {
    id: string;
    title: string;
    description: string;
    icon: string;
    xpReward: number;
    diamondReward?: number;
    progress: number;
    target: number;
    completed: boolean;
    claimed: boolean;
    type: 'daily' | 'weekly' | 'achievement';
}

interface StreakInfo {
    currentStreak: number;
    longestStreak: number;
    lastPlayDate: string;
    nextMilestone: number;
    milestoneReward: number;
}

export const DailyChallenges: React.FC = () => {
    const { user } = useUserStore();
    const toast = useToast();
    const [challenges, setChallenges] = useState<Challenge[]>([]);
    const [streak, setStreak] = useState<StreakInfo>({
        currentStreak: 7,
        longestStreak: 14,
        lastPlayDate: new Date().toISOString(),
        nextMilestone: 10,
        milestoneReward: 100,
    });
    const [xp, setXp] = useState({ current: 2450, level: 12, nextLevel: 3000 });
    const [showAnimation, setShowAnimation] = useState(false);

    useEffect(() => {
        loadChallenges();
    }, []);

    const loadChallenges = () => {
        // Mock challenges - would fetch from Supabase
        const mockChallenges: Challenge[] = [
            {
                id: '1',
                title: 'Table Time',
                description: 'Play 30 minutes today',
                icon: '⏱️',
                xpReward: 50,
                progress: 22,
                target: 30,
                completed: false,
                claimed: false,
                type: 'daily',
            },
            {
                id: '2',
                title: 'Hand Master',
                description: 'Win 10 hands',
                icon: '🃏',
                xpReward: 75,
                diamondReward: 5,
                progress: 10,
                target: 10,
                completed: true,
                claimed: false,
                type: 'daily',
            },
            {
                id: '3',
                title: 'Big Pot Hunter',
                description: 'Win a pot over 1000 chips',
                icon: '💰',
                xpReward: 100,
                progress: 0,
                target: 1,
                completed: false,
                claimed: false,
                type: 'daily',
            },
            {
                id: '4',
                title: 'Tournament Warrior',
                description: 'Finish top 3 in a tournament',
                icon: '🏆',
                xpReward: 200,
                diamondReward: 20,
                progress: 0,
                target: 1,
                completed: false,
                claimed: false,
                type: 'weekly',
            },
            {
                id: '5',
                title: 'Social Butterfly',
                description: 'Share 3 hands',
                icon: '📤',
                xpReward: 50,
                progress: 1,
                target: 3,
                completed: false,
                claimed: false,
                type: 'weekly',
            },
        ];
        setChallenges(mockChallenges);
    };

    const claimReward = async (challenge: Challenge) => {
        if (!challenge.completed || challenge.claimed) return;

        setShowAnimation(true);

        // Update XP
        setXp((prev) => ({
            ...prev,
            current: prev.current + challenge.xpReward,
        }));

        // Mark as claimed
        setChallenges((prev) =>
            prev.map((c) => c.id === challenge.id ? { ...c, claimed: true } : c)
        );

        toast.success(`+${challenge.xpReward} XP${challenge.diamondReward ? ` +${challenge.diamondReward} 💎` : ''}`);

        setTimeout(() => setShowAnimation(false), 2000);
    };

    const dailyChallenges = challenges.filter((c) => c.type === 'daily');
    const weeklyChallenges = challenges.filter((c) => c.type === 'weekly');
    const xpProgress = (xp.current / xp.nextLevel) * 100;

    return (
        <div className="daily-challenges">
            {/* XP Progress Bar */}
            <div className="xp-header">
                <div className="level-badge">
                    <span className="level-num">LV {xp.level}</span>
                </div>
                <div className="xp-bar-container">
                    <div className="xp-bar" style={{ width: `${xpProgress}%` }} />
                    <span className="xp-text">{xp.current.toLocaleString()} / {xp.nextLevel.toLocaleString()} XP</span>
                </div>
            </div>

            {/* Streak Display */}
            <div className="streak-card">
                <div className="streak-flame">🔥</div>
                <div className="streak-info">
                    <span className="streak-count">{streak.currentStreak} Day Streak!</span>
                    <span className="streak-text">
                        {streak.nextMilestone - streak.currentStreak} days to {streak.milestoneReward}💎 bonus
                    </span>
                </div>
                <div className="streak-calendar">
                    {[...Array(7)].map((_, i) => (
                        <div
                            key={i}
                            className={`calendar-day ${i < streak.currentStreak % 7 ? 'filled' : ''}`}
                        >
                            {i < streak.currentStreak % 7 ? '✓' : '○'}
                        </div>
                    ))}
                </div>
            </div>

            {/* Daily Challenges */}
            <section className="challenges-section">
                <h3>📅 Daily Challenges</h3>
                <div className="challenges-list">
                    {dailyChallenges.map((challenge) => (
                        <div
                            key={challenge.id}
                            className={`challenge-card ${challenge.completed ? 'completed' : ''} ${challenge.claimed ? 'claimed' : ''}`}
                        >
                            <span className="challenge-icon">{challenge.icon}</span>
                            <div className="challenge-content">
                                <span className="challenge-title">{challenge.title}</span>
                                <span className="challenge-desc">{challenge.description}</span>
                                <div className="progress-bar">
                                    <div
                                        className="progress-fill"
                                        style={{ width: `${(challenge.progress / challenge.target) * 100}%` }}
                                    />
                                </div>
                                <span className="progress-text">
                                    {challenge.progress}/{challenge.target}
                                </span>
                            </div>
                            <div className="challenge-reward">
                                {challenge.completed && !challenge.claimed ? (
                                    <button
                                        className="claim-btn"
                                        onClick={() => claimReward(challenge)}
                                    >
                                        Claim
                                    </button>
                                ) : challenge.claimed ? (
                                    <span className="claimed-check">✓</span>
                                ) : (
                                    <span className="xp-badge">+{challenge.xpReward} XP</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Weekly Challenges */}
            <section className="challenges-section">
                <h3>📆 Weekly Challenges</h3>
                <div className="challenges-list">
                    {weeklyChallenges.map((challenge) => (
                        <div
                            key={challenge.id}
                            className={`challenge-card ${challenge.completed ? 'completed' : ''}`}
                        >
                            <span className="challenge-icon">{challenge.icon}</span>
                            <div className="challenge-content">
                                <span className="challenge-title">{challenge.title}</span>
                                <span className="challenge-desc">{challenge.description}</span>
                                <div className="progress-bar">
                                    <div
                                        className="progress-fill"
                                        style={{ width: `${(challenge.progress / challenge.target) * 100}%` }}
                                    />
                                </div>
                                <span className="progress-text">
                                    {challenge.progress}/{challenge.target}
                                </span>
                            </div>
                            <div className="challenge-reward">
                                <span className="xp-badge">+{challenge.xpReward} XP</span>
                                {challenge.diamondReward && (
                                    <span className="diamond-badge">+{challenge.diamondReward} 💎</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* XP Gain Animation */}
            {showAnimation && (
                <div className="xp-animation">
                    <span>+XP</span>
                </div>
            )}
        </div>
    );
};

export default DailyChallenges;

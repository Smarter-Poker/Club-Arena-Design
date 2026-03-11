/**
 * ♠ CLUB ARENA — Daily Challenges System
 * Gamification 2.0 with streak rewards and chip progression
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../stores/useUserStore';
import { useToast } from '../common/Toast';
import dailyChallengeService from '../../services/DailyChallengeService';
import './DailyChallenges.css';

interface Challenge {
    id: string;
    title: string;
    description: string;
    icon: string;
    chipReward: number;
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
        currentStreak: 0,
        longestStreak: 0,
        lastPlayDate: new Date().toISOString(),
        nextMilestone: 7,
        milestoneReward: 100,
    });

    const [showAnimation, setShowAnimation] = useState(false);

    useEffect(() => {
        if (user?.id) {
            loadChallenges();
        }
    }, [user?.id]);

    const loadChallenges = async () => {
        if (!user?.id) return;
        try {
            const [userChallenges, stats] = await Promise.all([
                dailyChallengeService.getTodaysChallenges(user.id),
                dailyChallengeService.getStats(user.id)
            ]);

            const mappedChallenges: Challenge[] = userChallenges.map((uc: any) => ({
                id: uc.id,
                title: uc.challenge.name,
                description: uc.challenge.description,
                icon: uc.challenge.icon || '🎯',
                chipReward: uc.challenge.chipReward,
                progress: uc.progress,
                target: uc.challenge.requirement,
                completed: uc.completed,
                claimed: !!uc.completedAt,
                type: 'daily'
            }));

            setChallenges(mappedChallenges);
            setStreak(prev => ({
                ...prev,
                currentStreak: stats.currentStreak
            }));
        } catch (error) {
            console.error('Failed to load daily challenges:', error);
        }
    };

    const claimReward = async (challenge: Challenge) => {
        if (!challenge.completed || challenge.claimed || !user?.id) return;

        setShowAnimation(true);



        // Mark as claimed
        setChallenges((prev) =>
            prev.map((c) => c.id === challenge.id ? { ...c, claimed: true } : c)
        );

        toast.success(`+${challenge.chipReward} Chips${challenge.diamondReward ? ` +${challenge.diamondReward} 💎` : ''}`);

        setTimeout(() => setShowAnimation(false), 2000);
    };

    const dailyChallenges = challenges.filter((c) => c.type === 'daily');
    const weeklyChallenges = challenges.filter((c) => c.type === 'weekly');


    return (
        <div className="daily-challenges">


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
                                    <span className="chip-badge">+{challenge.chipReward} Chips</span>
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
                                <span className="chip-badge">+{challenge.chipReward} Chips</span>
                                {challenge.diamondReward && (
                                    <span className="diamond-badge">+{challenge.diamondReward} 💎</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </section>


        </div>
    );
};

export default DailyChallenges;

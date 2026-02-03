/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  DAILY CHALLENGES WIDGET — Self-Contained Challenge Display
 * ═══════════════════════════════════════════════════════════════════════════════
 * Displays today's challenges with progress and claim functionality
 * Wired to DailyChallengeService for Supabase data
 */

import React, { useState, useEffect } from 'react';
import { dailyChallengeService, type UserDailyChallenge } from '../../services/DailyChallengeService';
import { DailyChallenges } from './DailyChallenges';
import { useUserStore } from '../../stores/useUserStore';
import { useToast } from '../../components/common/Toast';

interface Challenge {
    id: string;
    title: string;
    description: string;
    progress: number;
    target: number;
    reward: { type: 'chips' | 'diamonds' | 'xp'; amount: number };
    expiresAt?: Date;
    completed: boolean;
}

export const DailyChallengesWidget: React.FC = () => {
    const { user } = useUserStore();
    const toast = useToast();
    const [challenges, setChallenges] = useState<Challenge[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user?.id) return;
        loadChallenges();
    }, [user?.id]);

    const loadChallenges = async () => {
        if (!user?.id) return;
        setLoading(true);
        try {
            const data = await dailyChallengeService.getTodaysChallenges(user.id);
            const mapped: Challenge[] = data.map((c: UserDailyChallenge) => ({
                id: c.id,
                title: c.challenge.name,
                description: c.challenge.description,
                progress: c.progress,
                target: c.challenge.requirement,
                reward: {
                    type: c.challenge.chipReward > 0 ? 'chips' : 'xp',
                    amount: c.challenge.chipReward > 0 ? c.challenge.chipReward : c.challenge.xpReward,
                },
                expiresAt: new Date(Date.now() + 86400000), // Expires at end of day
                completed: c.completed,
            }));
            setChallenges(mapped);
        } catch (error) {
            console.error('Failed to load challenges:', error);
        }
        setLoading(false);
    };

    const handleClaimReward = async (challengeId: string) => {
        // Rewards are automatically claimed on completion by the service
        toast.success(' Reward already claimed!');
        // Remove from list
        setChallenges(prev => prev.filter(c => c.id !== challengeId));
    };

    if (loading) {
        return (
            <div className="daily-challenges-widget loading">
                <div className="loading-spinner" />
                <p>Loading challenges...</p>
            </div>
        );
    }

    if (challenges.length === 0) {
        return (
            <div className="daily-challenges-widget empty">
                <span className="empty-icon">★</span>
                <p>All challenges completed for today!</p>
            </div>
        );
    }

    return (
        <DailyChallenges
            challenges={challenges}
            onClaimReward={handleClaimReward}
        />
    );
};

export default DailyChallengesWidget;

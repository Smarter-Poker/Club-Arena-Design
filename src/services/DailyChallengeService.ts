/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 📆 DAILY CHALLENGE SERVICE — Rotating Challenge Engine
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Provides rotating daily challenges that refresh each day.
 * Players can complete challenges for XP, chips, and other rewards.
 */

import { supabase } from '../lib/supabase';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type ChallengeType =
    | 'hands_played'
    | 'hands_won'
    | 'showdowns'
    | 'tournaments_played'
    | 'login_streak'
    | 'rakeback_earned'
    | 'friends_added';

export interface DailyChallenge {
    id: string;
    name: string;
    description: string;
    type: ChallengeType;
    requirement: number;
    xpReward: number;
    chipReward: number;
    icon: string;
}

export interface UserDailyChallenge {
    id: string;
    challengeId: string;
    userId: string;
    progress: number;
    completed: boolean;
    completedAt?: string;
    challenge: DailyChallenge;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHALLENGE POOL
// ═══════════════════════════════════════════════════════════════════════════════

export const CHALLENGE_POOL: DailyChallenge[] = [
    // Easy Challenges (daily grind)
    { id: 'hands_10', name: 'Warm Up', description: 'Play 10 hands today', type: 'hands_played', requirement: 10, xpReward: 25, chipReward: 50, icon: '' },
    { id: 'hands_25', name: 'Getting Serious', description: 'Play 25 hands today', type: 'hands_played', requirement: 25, xpReward: 50, chipReward: 100, icon: '' },
    { id: 'hands_50', name: 'Grinder', description: 'Play 50 hands today', type: 'hands_played', requirement: 50, xpReward: 100, chipReward: 200, icon: '' },

    // Win Challenges
    { id: 'wins_3', name: 'Triple Threat', description: 'Win 3 hands today', type: 'hands_won', requirement: 3, xpReward: 40, chipReward: 75, icon: '' },
    { id: 'wins_5', name: 'High Five', description: 'Win 5 hands today', type: 'hands_won', requirement: 5, xpReward: 75, chipReward: 150, icon: '✋' },
    { id: 'wins_10', name: 'Ten Bagger', description: 'Win 10 hands today', type: 'hands_won', requirement: 10, xpReward: 150, chipReward: 300, icon: '' },

    // Showdown Challenges
    { id: 'showdown_3', name: 'Show Your Cards', description: 'Reach 3 showdowns today', type: 'showdowns', requirement: 3, xpReward: 30, chipReward: 60, icon: '👀' },
    { id: 'showdown_5', name: 'Showdown King', description: 'Reach 5 showdowns today', type: 'showdowns', requirement: 5, xpReward: 60, chipReward: 120, icon: '' },

    // Tournament Challenges
    { id: 'tourney_1', name: 'Tournament Time', description: 'Play 1 tournament today', type: 'tournaments_played', requirement: 1, xpReward: 50, chipReward: 100, icon: '' },
    { id: 'tourney_3', name: 'Tournament Regular', description: 'Play 3 tournaments today', type: 'tournaments_played', requirement: 3, xpReward: 150, chipReward: 300, icon: '' },

    // Social Challenges
    { id: 'friend_1', name: 'Make a Friend', description: 'Add 1 friend today', type: 'friends_added', requirement: 1, xpReward: 30, chipReward: 50, icon: '' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

class DailyChallengeServiceClass {
    /**
     * Get today's challenges for a user
     * Assigns 3 random challenges if not already assigned
     */
    async getTodaysChallenges(userId: string): Promise<UserDailyChallenge[]> {
        const today = this.getTodayKey();

        // Check if challenges already assigned
        const { data: existing } = await supabase
            .from('user_daily_challenges')
            .select('*, challenge:challenge_id(*)')
            .eq('user_id', userId)
            .eq('assigned_date', today);

        if (existing && existing.length > 0) {
            return existing.map(this.mapToUserChallenge);
        }

        // Assign new challenges
        const todaysChallenges = this.selectDailyChallenges(3);
        const inserts = todaysChallenges.map(c => ({
            user_id: userId,
            challenge_id: c.id,
            assigned_date: today,
            progress: 0,
            completed: false,
        }));

        await supabase.from('user_daily_challenges').insert(inserts);

        // Return with challenge data
        return todaysChallenges.map((c, i) => ({
            id: `${userId}-${c.id}-${today}`,
            challengeId: c.id,
            userId,
            progress: 0,
            completed: false,
            challenge: c,
        }));
    }

    /**
     * Update progress on a challenge type
     * Called by AchievementTriggerService or directly from game events
     */
    async updateProgress(
        userId: string,
        type: ChallengeType,
        amount: number = 1
    ): Promise<{ completed: UserDailyChallenge[] }> {
        const today = this.getTodayKey();
        const completed: UserDailyChallenge[] = [];

        // Get today's challenges of this type
        const { data: challenges } = await supabase
            .from('user_daily_challenges')
            .select('*, challenge:challenge_id(*)')
            .eq('user_id', userId)
            .eq('assigned_date', today)
            .eq('completed', false);

        if (!challenges) return { completed };

        for (const uc of challenges) {
            const challenge = CHALLENGE_POOL.find(c => c.id === uc.challenge_id);
            if (!challenge || challenge.type !== type) continue;

            const newProgress = Math.min(uc.progress + amount, challenge.requirement);
            const isComplete = newProgress >= challenge.requirement;

            await supabase
                .from('user_daily_challenges')
                .update({
                    progress: newProgress,
                    completed: isComplete,
                    completed_at: isComplete ? new Date().toISOString() : null,
                })
                .eq('id', uc.id);

            if (isComplete) {
                // Award rewards
                await this.awardRewards(userId, challenge);
                completed.push({
                    id: uc.id,
                    challengeId: uc.challenge_id,
                    userId,
                    progress: newProgress,
                    completed: true,
                    completedAt: new Date().toISOString(),
                    challenge,
                });
            }
        }

        return { completed };
    }

    /**
     * Award rewards for completing a challenge
     */
    private async awardRewards(userId: string, challenge: DailyChallenge): Promise<void> {
        // Award XP
        if (challenge.xpReward > 0) {
            await supabase.rpc('add_player_xp', {
                p_user_id: userId,
                p_amount: challenge.xpReward,
                p_reason: `Daily Challenge: ${challenge.name}`,
            });
        }

        // Award chips through wallet
        if (challenge.chipReward > 0) {
            // Add to player wallet
            const { data: wallet } = await supabase
                .from('player_wallets')
                .select('promo_balance')
                .eq('user_id', userId)
                .maybeSingle();

            if (wallet) {
                await supabase
                    .from('player_wallets')
                    .update({
                        promo_balance: (wallet.promo_balance || 0) + challenge.chipReward,
                    })
                    .eq('user_id', userId);
            }
        }
    }

    /**
     * Get challenge completion stats for a user
     */
    async getStats(userId: string): Promise<{
        totalCompleted: number;
        currentStreak: number;
        totalXpEarned: number;
        totalChipsEarned: number;
    }> {
        const { data } = await supabase
            .from('user_daily_challenges')
            .select('challenge_id, completed, assigned_date')
            .eq('user_id', userId)
            .eq('completed', true);

        if (!data) {
            return { totalCompleted: 0, currentStreak: 0, totalXpEarned: 0, totalChipsEarned: 0 };
        }

        const totalCompleted = data.length;
        let totalXpEarned = 0;
        let totalChipsEarned = 0;

        for (const uc of data) {
            const challenge = CHALLENGE_POOL.find(c => c.id === uc.challenge_id);
            if (challenge) {
                totalXpEarned += challenge.xpReward;
                totalChipsEarned += challenge.chipReward;
            }
        }

        // Calculate streak (consecutive days with at least 1 completion)
        const dates = [...new Set(data.map(d => d.assigned_date))].sort().reverse();
        let currentStreak = 0;
        const today = this.getTodayKey();

        for (const date of dates) {
            const expectedDate = this.subtractDays(today, currentStreak);
            if (date === expectedDate) {
                currentStreak++;
            } else {
                break;
            }
        }

        return { totalCompleted, currentStreak, totalXpEarned, totalChipsEarned };
    }

    /**
     * Select random challenges for today
     */
    private selectDailyChallenges(count: number): DailyChallenge[] {
        // Use date-based seed for consistent challenges across all users
        const seed = this.getTodayKey().replace(/-/g, '');
        const shuffled = [...CHALLENGE_POOL].sort((a, b) => {
            const hashA = this.simpleHash(seed + a.id);
            const hashB = this.simpleHash(seed + b.id);
            return hashA - hashB;
        });
        return shuffled.slice(0, count);
    }

    /**
     * Get today's date key (YYYY-MM-DD)
     */
    private getTodayKey(): string {
        return new Date().toISOString().split('T')[0];
    }

    /**
     * Subtract days from a date
     */
    private subtractDays(dateStr: string, days: number): string {
        const date = new Date(dateStr);
        date.setDate(date.getDate() - days);
        return date.toISOString().split('T')[0];
    }

    /**
     * Simple hash for seeded randomization
     */
    private simpleHash(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash |= 0;
        }
        return hash;
    }

    /**
     * Map database row to typed object
     */
    private mapToUserChallenge(row: any): UserDailyChallenge {
        const challenge = CHALLENGE_POOL.find(c => c.id === row.challenge_id) || {
            id: row.challenge_id,
            name: 'Unknown',
            description: '',
            type: 'hands_played' as ChallengeType,
            requirement: 0,
            xpReward: 0,
            chipReward: 0,
            icon: '❓',
        };

        return {
            id: row.id,
            challengeId: row.challenge_id,
            userId: row.user_id,
            progress: row.progress,
            completed: row.completed,
            completedAt: row.completed_at,
            challenge,
        };
    }
}

export const dailyChallengeService = new DailyChallengeServiceClass();
export default dailyChallengeService;

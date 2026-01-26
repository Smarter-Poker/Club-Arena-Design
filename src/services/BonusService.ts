/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  BONUS SERVICE — Daily & Special Bonuses
 * Handles daily login bonuses, special promotions, and rewards
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { supabase } from '../lib/supabase';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface DailyBonus {
    day: number;
    claimed: boolean;
    reward: number;
    rewardType: 'chips' | 'xp' | 'vip_points';
    claimedAt?: string;
}

export interface SpecialBonus {
    id: string;
    name: string;
    description: string;
    reward: number;
    rewardType: 'chips' | 'xp' | 'vip_points' | 'item';
    condition: string;
    progress: number;
    target: number;
    claimed: boolean;
    expiresAt?: string;
}

export interface BonusStatus {
    dailyBonuses: DailyBonus[];
    currentDay: number;
    canClaimDaily: boolean;
    nextDailyReset: string;
    specialBonuses: SpecialBonus[];
    streak: number;
}

// Daily bonus rewards by day (7-day cycle)
const DAILY_REWARDS = [
    { day: 1, reward: 100, type: 'chips' },
    { day: 2, reward: 50, type: 'xp' },
    { day: 3, reward: 200, type: 'chips' },
    { day: 4, reward: 100, type: 'xp' },
    { day: 5, reward: 500, type: 'chips' },
    { day: 6, reward: 200, type: 'vip_points' },
    { day: 7, reward: 1000, type: 'chips' } // Jackpot day!
];

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class BonusServiceClass {
    /**
     * Get user's bonus status
     */
    async getBonusStatus(userId: string): Promise<BonusStatus> {
        // Get user's bonus data
        const { data: bonusData } = await supabase
            .from('user_bonuses')
            .select('*')
            .eq('user_id', userId)
            .single();

        const today = new Date().toISOString().split('T')[0];
        const lastClaim = bonusData?.last_daily_claim?.split('T')[0];
        const canClaimDaily = lastClaim !== today;
        const currentDay = ((bonusData?.daily_streak || 0) % 7) + 1;

        // Build daily bonuses array
        const dailyBonuses: DailyBonus[] = DAILY_REWARDS.map((r, i) => ({
            day: r.day,
            claimed: i < (bonusData?.daily_streak || 0) % 7,
            reward: r.reward,
            rewardType: r.type as DailyBonus['rewardType']
        }));

        // Get special bonuses
        const { data: specialData } = await supabase
            .from('special_bonuses')
            .select('*')
            .eq('user_id', userId)
            .eq('claimed', false)
            .gte('expires_at', new Date().toISOString());

        const specialBonuses: SpecialBonus[] = (specialData || []).map(b => ({
            id: b.id,
            name: b.name,
            description: b.description,
            reward: b.reward,
            rewardType: b.reward_type,
            condition: b.condition,
            progress: b.progress || 0,
            target: b.target,
            claimed: b.claimed,
            expiresAt: b.expires_at
        }));

        // Calculate next reset (midnight UTC)
        const tomorrow = new Date();
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        tomorrow.setUTCHours(0, 0, 0, 0);

        return {
            dailyBonuses,
            currentDay,
            canClaimDaily,
            nextDailyReset: tomorrow.toISOString(),
            specialBonuses,
            streak: bonusData?.daily_streak || 0
        };
    }

    /**
     * Claim daily bonus
     */
    async claimDailyBonus(userId: string): Promise<{ success: boolean; reward: number; rewardType: string }> {
        const status = await this.getBonusStatus(userId);

        if (!status.canClaimDaily) {
            throw new Error('Daily bonus already claimed today');
        }

        const reward = DAILY_REWARDS[(status.currentDay - 1) % 7];
        const now = new Date().toISOString();

        // Update or insert bonus record
        const { error } = await supabase
            .from('user_bonuses')
            .upsert({
                user_id: userId,
                daily_streak: status.streak + 1,
                last_daily_claim: now
            }, { onConflict: 'user_id' });

        if (error) {
            console.error('[Bonus] Failed to claim:', error);
            throw new Error('Failed to claim bonus');
        }

        // Award the reward
        await this.awardReward(userId, reward.reward, reward.type);

        return {
            success: true,
            reward: reward.reward,
            rewardType: reward.type
        };
    }

    /**
     * Claim special bonus
     */
    async claimSpecialBonus(userId: string, bonusId: string): Promise<boolean> {
        // Check if bonus exists and is claimable
        const { data: bonus } = await supabase
            .from('special_bonuses')
            .select('*')
            .eq('id', bonusId)
            .eq('user_id', userId)
            .single();

        if (!bonus) {
            throw new Error('Bonus not found');
        }

        if (bonus.claimed) {
            throw new Error('Bonus already claimed');
        }

        if (bonus.progress < bonus.target) {
            throw new Error('Bonus requirements not met');
        }

        // Mark as claimed
        await supabase
            .from('special_bonuses')
            .update({ claimed: true, claimed_at: new Date().toISOString() })
            .eq('id', bonusId);

        // Award reward
        await this.awardReward(userId, bonus.reward, bonus.reward_type);

        return true;
    }

    /**
     * Update bonus progress
     */
    async updateProgress(userId: string, bonusId: string, amount: number = 1): Promise<number> {
        const { data } = await supabase
            .from('special_bonuses')
            .select('progress, target')
            .eq('id', bonusId)
            .eq('user_id', userId)
            .single();

        if (!data) return 0;

        const newProgress = Math.min(data.progress + amount, data.target);

        await supabase
            .from('special_bonuses')
            .update({ progress: newProgress })
            .eq('id', bonusId);

        return newProgress;
    }

    /**
     * Award reward to user
     */
    private async awardReward(userId: string, amount: number, type: string): Promise<void> {
        switch (type) {
            case 'chips':
                // Add to user's wallet
                await supabase.rpc('add_chips', { p_user_id: userId, p_amount: amount });
                break;
            case 'xp':
                // Add XP
                await supabase.rpc('add_xp', { p_user_id: userId, p_amount: amount });
                break;
            case 'vip_points':
                // Add VIP points
                await supabase.rpc('add_vip_points', { p_user_id: userId, p_amount: amount });
                break;
        }

    }
}

// Export singleton
export const bonusService = new BonusServiceClass();

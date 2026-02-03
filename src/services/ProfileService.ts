/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  PROFILE SERVICE — User Profile Management
 * Handles XP, VIP levels, streaks, and avatars
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { supabase } from '../lib/supabase';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface UserProfile {
    id: string;
    userId: string;
    username: string;
    displayName?: string;
    avatarUrl?: string;
    bio?: string;

    // XP & Leveling
    xp: number;
    level: number;
    xpToNextLevel: number;

    // VIP
    vipTier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
    vipPoints: number;

    // Streaks
    currentStreak: number;
    longestStreak: number;
    lastLoginDate?: string;

    // Stats
    handsPlayed: number;
    tournamentsWon: number;
    totalWinnings: number;

    // Timestamps
    createdAt: string;
    updatedAt: string;
}

export interface ProfileStats {
    totalHands: number;
    winRate: number;
    avgProfit: number;
    biggestWin: number;
    favoriteVariant: string;
}

// VIP thresholds
const VIP_THRESHOLDS = {
    bronze: 0,
    silver: 1000,
    gold: 5000,
    platinum: 25000,
    diamond: 100000
};

// XP per level formula: level * 100
const xpForLevel = (level: number) => level * 100;

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class ProfileServiceClass {
    /**
     * Get user profile
     */
    async getProfile(userId: string): Promise<UserProfile | null> {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error || !data) return null;

        return this.mapProfile(data);
    }

    /**
     * Get profile by username
     */
    async getProfileByUsername(username: string): Promise<UserProfile | null> {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('username', username)
            .single();

        if (error || !data) return null;

        return this.mapProfile(data);
    }

    /**
     * Update profile
     */
    async updateProfile(userId: string, updates: Partial<{
        displayName: string;
        bio: string;
        avatarUrl: string;
    }>): Promise<boolean> {
        const dbUpdates: Record<string, unknown> = {};
        if (updates.displayName !== undefined) dbUpdates.display_name = updates.displayName;
        if (updates.bio !== undefined) dbUpdates.bio = updates.bio;
        if (updates.avatarUrl !== undefined) dbUpdates.avatar_url = updates.avatarUrl;

        const { error } = await supabase
            .from('profiles')
            .update(dbUpdates)
            .eq('id', userId);

        return !error;
    }

    /**
     * Add XP to user
     */
    async addXP(userId: string, amount: number): Promise<{ newXP: number; leveledUp: boolean; newLevel: number }> {
        const profile = await this.getProfile(userId);
        if (!profile) throw new Error('Profile not found');

        let newXP = profile.xp + amount;
        let newLevel = profile.level;
        let leveledUp = false;

        // Check for level up
        while (newXP >= xpForLevel(newLevel + 1)) {
            newXP -= xpForLevel(newLevel + 1);
            newLevel++;
            leveledUp = true;
        }

        await supabase
            .from('profiles')
            .update({ xp: newXP, level: newLevel })
            .eq('id', userId);

        return { newXP, leveledUp, newLevel };
    }

    /**
     * Add VIP points
     */
    async addVIPPoints(userId: string, points: number): Promise<{ newPoints: number; newTier: string }> {
        const profile = await this.getProfile(userId);
        if (!profile) throw new Error('Profile not found');

        const newPoints = profile.vipPoints + points;
        let newTier = profile.vipTier;

        // Check for tier upgrade
        if (newPoints >= VIP_THRESHOLDS.diamond) newTier = 'diamond';
        else if (newPoints >= VIP_THRESHOLDS.platinum) newTier = 'platinum';
        else if (newPoints >= VIP_THRESHOLDS.gold) newTier = 'gold';
        else if (newPoints >= VIP_THRESHOLDS.silver) newTier = 'silver';

        await supabase
            .from('profiles')
            .update({ vip_points: newPoints, vip_tier: newTier })
            .eq('id', userId);

        return { newPoints, newTier };
    }

    /**
     * Update daily streak
     */
    async updateStreak(userId: string): Promise<{ currentStreak: number; isNewDay: boolean }> {
        const profile = await this.getProfile(userId);
        if (!profile) throw new Error('Profile not found');

        const today = new Date().toISOString().split('T')[0];
        const lastLogin = profile.lastLoginDate?.split('T')[0];

        let currentStreak = profile.currentStreak;
        let isNewDay = false;

        if (lastLogin !== today) {
            isNewDay = true;
            const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

            if (lastLogin === yesterday) {
                // Consecutive day - increment streak
                currentStreak++;
            } else {
                // Streak broken - reset to 1
                currentStreak = 1;
            }

            const longestStreak = Math.max(currentStreak, profile.longestStreak);

            await supabase
                .from('profiles')
                .update({
                    current_streak: currentStreak,
                    longest_streak: longestStreak,
                    last_login_date: today
                })
                .eq('id', userId);
        }

        return { currentStreak, isNewDay };
    }

    /**
     * Get player stats
     */
    async getStats(userId: string): Promise<ProfileStats | null> {
        // Get from hand_results or similar table
        const { data } = await supabase
            .from('hand_results')
            .select('profit, game_variant')
            .eq('user_id', userId);

        if (!data || data.length === 0) {
            return {
                totalHands: 0,
                winRate: 0,
                avgProfit: 0,
                biggestWin: 0,
                favoriteVariant: 'No Limit Hold\'em'
            };
        }

        const totalHands = data.length;
        const wins = data.filter(h => h.profit > 0).length;
        const winRate = (wins / totalHands) * 100;
        const avgProfit = data.reduce((sum, h) => sum + h.profit, 0) / totalHands;
        const biggestWin = Math.max(...data.map(h => h.profit));

        // Find favorite variant
        const variantCounts: Record<string, number> = {};
        data.forEach(h => {
            variantCounts[h.game_variant] = (variantCounts[h.game_variant] || 0) + 1;
        });
        const favoriteVariant = Object.entries(variantCounts)
            .sort((a, b) => b[1] - a[1])[0]?.[0] || 'No Limit Hold\'em';

        return {
            totalHands,
            winRate: Math.round(winRate * 10) / 10,
            avgProfit: Math.round(avgProfit * 100) / 100,
            biggestWin,
            favoriteVariant
        };
    }

    /**
     * Get leaderboard
     */
    async getLeaderboard(metric: 'xp' | 'winnings' | 'hands', limit: number = 10): Promise<UserProfile[]> {
        const orderColumn = {
            xp: 'xp',
            winnings: 'total_winnings',
            hands: 'hands_played'
        }[metric];

        const { data } = await supabase
            .from('profiles')
            .select('*')
            .order(orderColumn, { ascending: false })
            .limit(limit);

        return (data || []).map(this.mapProfile);
    }

    /**
     * Check if user has accepted Club Arena TOS
     */
    async hasTOSAccepted(userId: string): Promise<boolean> {
        const { data, error } = await supabase
            .from('profiles')
            .select('club_arena_tos_accepted_at')
            .eq('id', userId)
            .single();

        if (error || !data) return false;
        return !!data.club_arena_tos_accepted_at;
    }

    /**
     * Accept Club Arena TOS
     */
    async acceptTOS(userId: string): Promise<boolean> {
        const { error } = await supabase
            .from('profiles')
            .update({ club_arena_tos_accepted_at: new Date().toISOString() })
            .eq('id', userId);

        if (error) {
            console.error('[TOS] Failed to accept TOS:', error);
            return false;
        }
        return true;
    }

    /**
     * Map database record to UserProfile
     */
    private mapProfile(data: Record<string, unknown>): UserProfile {
        const level = (data.level as number) || 1;
        return {
            id: data.id as string,
            userId: data.id as string,
            username: data.username as string,
            displayName: data.display_name as string | undefined,
            avatarUrl: data.avatar_url as string | undefined,
            bio: data.bio as string | undefined,
            xp: (data.xp as number) || 0,
            level,
            xpToNextLevel: xpForLevel(level + 1),
            vipTier: (data.vip_tier as UserProfile['vipTier']) || 'bronze',
            vipPoints: (data.vip_points as number) || 0,
            currentStreak: (data.current_streak as number) || 0,
            longestStreak: (data.longest_streak as number) || 0,
            lastLoginDate: data.last_login_date as string | undefined,
            handsPlayed: (data.hands_played as number) || 0,
            tournamentsWon: (data.tournaments_won as number) || 0,
            totalWinnings: (data.total_winnings as number) || 0,
            createdAt: data.created_at as string,
            updatedAt: data.updated_at as string
        };
    }
}

// Export singleton
export const profileService = new ProfileServiceClass();

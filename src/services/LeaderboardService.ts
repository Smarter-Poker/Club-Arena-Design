/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  LEADERBOARD SERVICE — Player Rankings & Stats
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Manages club and union leaderboards with:
 * - Daily, weekly, monthly, and all-time rankings
 * - Multiple metrics: profit, hands played, VPIP, PFR, ROI
 * - XP integration for progression rewards
 */

import { supabase } from '../lib/supabase';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type LeaderboardPeriod = 'daily' | 'weekly' | 'monthly' | 'all_time';
export type LeaderboardMetric = 'profit' | 'hands_played' | 'vpip' | 'pfr' | 'roi' | 'tournaments_won';

export interface LeaderboardEntry {
    rank: number;
    userId: string;
    username: string;
    avatar?: string;
    value: number;
    metric: LeaderboardMetric;
    change: number; // Position change from previous period
    xpEarned?: number;
}

export interface PlayerStats {
    userId: string;
    handsPlayed: number;
    profit: number;
    vpip: number;       // Voluntarily Put $ In Pot %
    pfr: number;        // Pre-Flop Raise %
    threeBet: number;   // 3-Bet %
    wtsd: number;       // Went To Showdown %
    wsd: number;        // Won $ at Showdown %
    aggFactor: number;  // Aggression Factor
    roi: number;        // Tournament ROI %
    tournamentsPlayed: number;
    tournamentsWon: number;
    lastUpdated: string;
}

export interface HandResultForStats {
    handId: string;
    userId: string;
    isVoluntary: boolean;    // Did they put money in voluntarily?
    isPreflopRaise: boolean; // Did they raise preflop?
    wentToShowdown: boolean;
    wonAtShowdown: boolean;
    profit: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

// XP rewards for leaderboard positions
const LEADERBOARD_XP_REWARDS: Record<LeaderboardPeriod, number[]> = {
    daily: [50, 30, 20, 10, 10, 5, 5, 5, 5, 5],   // Top 10
    weekly: [200, 125, 75, 50, 50, 25, 25, 25, 25, 25],
    monthly: [500, 300, 200, 100, 100, 50, 50, 50, 50, 50],
    all_time: [], // No rewards for all-time
};

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export const LeaderboardService = {
    /**
     * Get leaderboard for a club
     */
    async getClubLeaderboard(
        clubId: string,
        metric: LeaderboardMetric = 'profit',
        period: LeaderboardPeriod = 'weekly',
        limit: number = 10
    ): Promise<LeaderboardEntry[]> {
        const { data, error } = await supabase.rpc('get_club_leaderboard', {
            p_club_id: clubId,
            p_metric: metric,
            p_period: period,
            p_limit: limit,
        });

        if (error) {
            console.error('LeaderboardService.getClubLeaderboard error:', error);
            return [];
        }

        return (data || []).map((row: any, index: number) => ({
            rank: index + 1,
            userId: row.user_id,
            username: row.username,
            avatar: row.avatar_url,
            value: row.value,
            metric,
            change: row.position_change || 0,
            xpEarned: LEADERBOARD_XP_REWARDS[period][index] || 0,
        }));
    },

    /**
     * Get leaderboard for a union (all member clubs combined)
     */
    async getUnionLeaderboard(
        unionId: string,
        metric: LeaderboardMetric = 'profit',
        period: LeaderboardPeriod = 'weekly',
        limit: number = 20
    ): Promise<LeaderboardEntry[]> {
        const { data, error } = await supabase.rpc('get_union_leaderboard', {
            p_union_id: unionId,
            p_metric: metric,
            p_period: period,
            p_limit: limit,
        });

        if (error) {
            console.error('LeaderboardService.getUnionLeaderboard error:', error);
            return [];
        }

        return (data || []).map((row: any, index: number) => ({
            rank: index + 1,
            userId: row.user_id,
            username: row.username,
            avatar: row.avatar_url,
            value: row.value,
            metric,
            change: row.position_change || 0,
            xpEarned: LEADERBOARD_XP_REWARDS[period][index] || 0,
        }));
    },

    /**
     * Get player's detailed stats
     */
    async getPlayerStats(userId: string, clubId?: string): Promise<PlayerStats | null> {
        let query = supabase
            .from('player_stats')
            .select('*')
            .eq('user_id', userId);

        if (clubId) {
            query = query.eq('club_id', clubId);
        }

        const { data, error } = await query.single();

        if (error) {
            console.error('LeaderboardService.getPlayerStats error:', error);
            return null;
        }

        return {
            userId: data.user_id,
            handsPlayed: data.hands_played,
            profit: data.total_profit,
            vpip: data.vpip,
            pfr: data.pfr,
            threeBet: data.three_bet,
            wtsd: data.wtsd,
            wsd: data.wsd,
            aggFactor: data.agg_factor,
            roi: data.tournament_roi,
            tournamentsPlayed: data.tournaments_played,
            tournamentsWon: data.tournaments_won,
            lastUpdated: data.updated_at,
        };
    },

    /**
     * Update player stats after a completed hand
     * Called by HandController after each hand
     */
    async updateHandStats(result: HandResultForStats & { clubId?: string; clubName?: string }): Promise<void> {
        // Use upsert to atomically update stat counters
        const { error } = await supabase.rpc('update_player_hand_stats', {
            p_user_id: result.userId,
            p_profit: result.profit,
            p_is_voluntary: result.isVoluntary,
            p_is_preflop_raise: result.isPreflopRaise,
            p_went_to_showdown: result.wentToShowdown,
            p_won_at_showdown: result.wonAtShowdown,
        });

        if (error) {
            console.error('LeaderboardService.updateHandStats error:', error);
        }

        // Track for POY batched submission (cash games)
        if (result.clubId) {
            try {
                const { POYService } = await import('./POYService');
                POYService.trackHandResult({
                    userId: result.userId,
                    clubId: result.clubId,
                    clubName: result.clubName,
                    profit: result.profit,
                });
            } catch (e) {
                // Silent fail for POY tracking
            }
        }
    },

    /**
     * Get user's rank on a specific leaderboard
     */
    async getUserRank(
        userId: string,
        clubId: string,
        metric: LeaderboardMetric = 'profit',
        period: LeaderboardPeriod = 'weekly'
    ): Promise<{ rank: number; total: number } | null> {
        const { data, error } = await supabase.rpc('get_user_leaderboard_rank', {
            p_user_id: userId,
            p_club_id: clubId,
            p_metric: metric,
            p_period: period,
        });

        if (error) {
            console.error('LeaderboardService.getUserRank error:', error);
            return null;
        }

        return {
            rank: data.rank,
            total: data.total_players,
        };
    },

    /**
     * Calculate XP reward based on leaderboard position
     */
    calculateXPReward(rank: number, period: LeaderboardPeriod): number {
        const rewards = LEADERBOARD_XP_REWARDS[period];
        if (rank > 0 && rank <= rewards.length) {
            return rewards[rank - 1];
        }
        return 0;
    },

    /**
     * Process end-of-period leaderboard rewards
     * Called by scheduled job at period boundaries
     */
    async processLeaderboardRewards(
        clubId: string,
        period: LeaderboardPeriod
    ): Promise<{ awarded: number; totalXP: number }> {
        const leaderboard = await this.getClubLeaderboard(clubId, 'profit', period, 10);

        let totalXP = 0;
        let awarded = 0;

        for (const entry of leaderboard) {
            const xp = this.calculateXPReward(entry.rank, period);
            if (xp > 0) {
                // Award XP via Identity DNA system
                // XPEventBus.emit('LEADERBOARD_REWARD', { userId: entry.userId, xp, rank: entry.rank, period })
                totalXP += xp;
                awarded++;
            }
        }

        return { awarded, totalXP };
    },

    /**
     * Get period date boundaries
     */
    getPeriodBoundaries(period: LeaderboardPeriod): { start: Date; end: Date } {
        const now = new Date();
        const end = new Date(now);
        let start: Date;

        switch (period) {
            case 'daily':
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                break;
            case 'weekly':
                const dayOfWeek = now.getDay();
                start = new Date(now);
                start.setDate(now.getDate() - dayOfWeek);
                start.setHours(0, 0, 0, 0);
                break;
            case 'monthly':
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case 'all_time':
                start = new Date(0);
                break;
        }

        return { start, end };
    },
};

export default LeaderboardService;

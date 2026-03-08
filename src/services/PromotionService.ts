/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  PROMOTION SERVICE — Club Promotions & Campaign Management
 * Handles promotions, bonuses, leaderboards, and special events
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { supabase } from '../lib/supabase';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type PromotionType = 'bonus' | 'freeroll' | 'leaderboard' | 'rakeback' | 'special' | 'deposit_match' | 'refer_friend';

export interface Promotion {
    id: string;
    clubId: string;
    title: string;
    description: string;
    type: PromotionType;
    imageUrl?: string;
    startDate: string;
    endDate: string;
    prizePool?: number;
    isActive: boolean;
    requirements?: string;
    terms?: string;
    maxClaims?: number;
    claimCount: number;
    minDeposit?: number;
    bonusPercent?: number;
    wagerRequirement?: number;
    createdAt: string;
}

export interface PromotionClaim {
    id: string;
    promotionId: string;
    userId: string;
    claimedAt: string;
    status: 'pending' | 'active' | 'completed' | 'expired';
    bonusAmount?: number;
    wagerProgress?: number;
    wagerRequired?: number;
}

export interface LeaderboardEntry {
    rank: number;
    userId: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    score: number;
    prize?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROMOTION SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class PromotionServiceClass {

    // ─────────────────────────────────────────────────────────────────────────────
    // Promotion CRUD
    // ─────────────────────────────────────────────────────────────────────────────

    async getPromotions(clubId?: string, filter?: 'active' | 'upcoming' | 'ended'): Promise<Promotion[]> {
        let query = supabase
            .from('promotions')
            .select('*')
            .order('start_date', { ascending: false });

        if (clubId) {
            query = query.eq('club_id', clubId);
        }

        const now = new Date().toISOString();
        if (filter === 'active') {
            query = query.lte('start_date', now).gte('end_date', now);
        } else if (filter === 'upcoming') {
            query = query.gt('start_date', now);
        } else if (filter === 'ended') {
            query = query.lt('end_date', now);
        }

        const { data, error } = await query.limit(50);

        if (error) {
            console.error('[PromotionService] Error fetching promotions:', error);
            return [];
        }

        return (data || []).map(this.mapPromotion);
    }

    async getPromotion(promotionId: string): Promise<Promotion | null> {
        const { data, error } = await supabase
            .from('promotions')
            .select('*')
            .eq('id', promotionId)
            .single();

        if (error || !data) return null;
        return this.mapPromotion(data);
    }

    async createPromotion(clubId: string, config: Partial<Promotion>): Promise<Promotion> {
        const { data, error } = await supabase
            .from('promotions')
            .insert({
                club_id: clubId,
                title: config.title,
                description: config.description,
                type: config.type || 'bonus',
                image_url: config.imageUrl,
                start_date: config.startDate,
                end_date: config.endDate,
                prize_pool: config.prizePool,
                is_active: true,
                requirements: config.requirements,
                terms: config.terms,
                max_claims: config.maxClaims,
                min_deposit: config.minDeposit,
                bonus_percent: config.bonusPercent,
                wager_requirement: config.wagerRequirement
            })
            .select()
            .single();

        if (error) throw error;
        return this.mapPromotion(data);
    }

    async updatePromotion(promotionId: string, updates: Partial<Promotion>): Promise<void> {
        const { error } = await supabase
            .from('promotions')
            .update({
                title: updates.title,
                description: updates.description,
                type: updates.type,
                image_url: updates.imageUrl,
                start_date: updates.startDate,
                end_date: updates.endDate,
                prize_pool: updates.prizePool,
                is_active: updates.isActive,
                requirements: updates.requirements,
                terms: updates.terms
            })
            .eq('id', promotionId);

        if (error) throw error;
    }

    async deletePromotion(promotionId: string): Promise<void> {
        const { error } = await supabase
            .from('promotions')
            .delete()
            .eq('id', promotionId);

        if (error) throw error;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Claiming Promotions
    // ─────────────────────────────────────────────────────────────────────────────

    async claimPromotion(promotionId: string, userId: string): Promise<PromotionClaim> {
        // Check if already claimed
        const { data: existingClaim } = await supabase
            .from('promotion_claims')
            .select('id')
            .eq('promotion_id', promotionId)
            .eq('user_id', userId)
            .single();

        if (existingClaim) {
            throw new Error('Promotion already claimed');
        }

        // Get promotion details
        const promo = await this.getPromotion(promotionId);
        if (!promo) throw new Error('Promotion not found');

        // Check if max claims reached
        if (promo.maxClaims && promo.claimCount >= promo.maxClaims) {
            throw new Error('Promotion is fully claimed');
        }

        // Check if promotion is active
        const now = new Date();
        if (new Date(promo.startDate) > now || new Date(promo.endDate) < now) {
            throw new Error('Promotion is not active');
        }

        // Create claim
        const { data, error } = await supabase
            .from('promotion_claims')
            .insert({
                promotion_id: promotionId,
                user_id: userId,
                status: promo.wagerRequirement ? 'active' : 'completed',
                bonus_amount: promo.prizePool ? Math.trunc(promo.prizePool * 100 / (promo.maxClaims || 100)) / 100 : 0,
                wager_progress: 0,
                wager_required: promo.wagerRequirement || 0
            })
            .select()
            .single();

        if (error) throw error;

        // Atomically increment claim count via direct update
        const { data: promoData } = await supabase
            .from('promotions')
            .select('claim_count')
            .eq('id', promotionId)
            .single();

        if (promoData) {
            await supabase
                .from('promotions')
                .update({ claim_count: (promoData.claim_count || 0) + 1 })
                .eq('id', promotionId);
        }

        return this.mapClaim(data);
    }

    async getUserClaims(userId: string): Promise<PromotionClaim[]> {
        const { data, error } = await supabase
            .from('promotion_claims')
            .select(`
                *,
                promotions(title, type)
            `)
            .eq('user_id', userId)
            .order('claimed_at', { ascending: false });

        if (error) return [];
        return (data || []).map(this.mapClaim);
    }

    async updateWagerProgress(claimId: string, wagerAmount: number): Promise<void> {
        // Use direct update for atomic increment to prevent race conditions
        // on concurrent wager events
        const { data: claim } = await supabase
            .from('promotion_claims')
            .select('wager_progress')
            .eq('id', claimId)
            .single();

        if (claim) {
            const { error } = await supabase
                .from('promotion_claims')
                .update({ wager_progress: (claim.wager_progress || 0) + wagerAmount })
                .eq('id', claimId);

            if (error) {
                console.error('[PromotionService] Failed to update wager progress:', error);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Leaderboards
    // ─────────────────────────────────────────────────────────────────────────────

    async getLeaderboard(promotionId: string, limit: number = 10): Promise<LeaderboardEntry[]> {
        const { data, error } = await supabase
            .from('promotion_leaderboards')
            .select(`
                rank,
                score,
                prize,
                profiles(id, username, display_name, avatar_url)
            `)
            .eq('promotion_id', promotionId)
            .order('rank', { ascending: true })
            .limit(limit);

        if (error || !data) return [];

        return data.map((entry: any) => {
            const profile = entry.profiles as { id: string; username: string; display_name: string; avatar_url?: string } | null;
            return {
                rank: entry.rank,
                userId: profile?.id || '',
                username: profile?.username || '',
                displayName: profile?.display_name || '',
                avatarUrl: profile?.avatar_url,
                score: entry.score,
                prize: entry.prize
            };
        });
    }

    async updateLeaderboardScore(promotionId: string, userId: string, score: number): Promise<void> {
        // Upsert the score
        await supabase
            .from('promotion_leaderboards')
            .upsert({
                promotion_id: promotionId,
                user_id: userId,
                score,
                updated_at: new Date().toISOString()
            }, { onConflict: 'promotion_id,user_id' });

        // Recalculate ranks
        await supabase.rpc('recalculate_leaderboard_ranks', {
            p_promotion_id: promotionId
        });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Deposit Match Bonuses
    // ─────────────────────────────────────────────────────────────────────────────

    async applyDepositBonus(userId: string, depositAmount: number): Promise<number> {
        // Find applicable deposit bonus promotion
        const { data: promotions } = await supabase
            .from('promotions')
            .select('*')
            .eq('type', 'deposit_match')
            .eq('is_active', true)
            .lte('start_date', new Date().toISOString())
            .gte('end_date', new Date().toISOString())
            .limit(1);

        if (!promotions?.length) return 0;

        const promo = this.mapPromotion(promotions[0]);

        if (promo.minDeposit && depositAmount < promo.minDeposit) {
            return 0;
        }

        const bonusAmount = Math.trunc(depositAmount * (promo.bonusPercent || 100) / 100 * 100) / 100;
        const maxBonus = promo.prizePool || 500;
        const finalBonus = Math.min(bonusAmount, maxBonus);

        // Create the claim
        await this.claimPromotion(promo.id, userId);

        // Add bonus to promo wallet
        await supabase.rpc('add_to_promo_wallet', {
            p_user_id: userId,
            p_amount: finalBonus,
            p_description: `Deposit bonus: ${promo.title}`
        });

        return finalBonus;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Referral System
    // ─────────────────────────────────────────────────────────────────────────────

    async processReferral(referredUserId: string, referrerCode: string): Promise<void> {
        // Find referrer by code
        const { data: referrer } = await supabase
            .from('profiles')
            .select('id')
            .eq('referral_code', referrerCode)
            .single();

        if (!referrer) return;

        // Check for refer-a-friend promotion
        const { data: promotions } = await supabase
            .from('promotions')
            .select('*')
            .eq('type', 'refer_friend')
            .eq('is_active', true)
            .limit(1);

        if (!promotions?.length) return;

        const promo = this.mapPromotion(promotions[0]);

        // Award referrer bonus
        await supabase.rpc('add_to_promo_wallet', {
            p_user_id: referrer.id,
            p_amount: promo.prizePool || 10,
            p_description: 'Referral bonus'
        });

        // Record the referral
        await supabase
            .from('referrals')
            .insert({
                referrer_id: referrer.id,
                referred_id: referredUserId,
                promotion_id: promo.id,
                bonus_amount: promo.prizePool || 10
            });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Mappers
    // ─────────────────────────────────────────────────────────────────────────────

    private mapPromotion(data: any): Promotion {
        return {
            id: data.id,
            clubId: data.club_id,
            title: data.title,
            description: data.description,
            type: data.type,
            imageUrl: data.image_url,
            startDate: data.start_date,
            endDate: data.end_date,
            prizePool: data.prize_pool,
            isActive: data.is_active,
            requirements: data.requirements,
            terms: data.terms,
            maxClaims: data.max_claims,
            claimCount: data.claim_count || 0,
            minDeposit: data.min_deposit,
            bonusPercent: data.bonus_percent,
            wagerRequirement: data.wager_requirement,
            createdAt: data.created_at
        };
    }

    private mapClaim(data: any): PromotionClaim {
        return {
            id: data.id,
            promotionId: data.promotion_id,
            userId: data.user_id,
            claimedAt: data.claimed_at,
            status: data.status,
            bonusAmount: data.bonus_amount,
            wagerProgress: data.wager_progress,
            wagerRequired: data.wager_required
        };
    }
}

export const promotionService = new PromotionServiceClass();

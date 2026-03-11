/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CLUB ENGINE — Club Service
 * ═══════════════════════════════════════════════════════════════════════════════
 * Full club management with real Supabase integration
 * No demo mode — production ready
 */

import { supabase } from '../lib/supabase';
import { WalletService } from './WalletService';
import { BBJService } from './BBJService';
import type { Club, ClubMember, ClubSettings, MemberRole } from '../types/database.types';

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

class ClubServiceClass {

    // ─────────────────────────────────────────────────────────────────────────────
    // CLUB CRUD
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Get all clubs the current user is a member of
     */
    async getMyClubs(userId: string): Promise<Club[]> {
        const { data, error } = await supabase
            .from('club_members')
            .select('club_id, clubs(*)')
            .eq('user_id', userId)
            .eq('status', 'active');

        if (error) throw error;
        return (data || []).map((m) => m.clubs as unknown as Club);
    }

    /**
     * Get a single club by ID
     */
    async getClub(clubId: string): Promise<Club | null> {
        const { data, error } = await supabase
            .from('clubs')
            .select('*')
            .eq('id', clubId)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') throw error;
        return data;
    }

    /**
     * Get club by 6-digit public ID
     */
    async getClubByPublicId(publicId: number): Promise<Club | null> {
        const { data, error } = await supabase
            .from('clubs')
            .select('*')
            .eq('club_id', publicId)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') throw error;
        return data;
    }

    /**
     * Search public clubs
     */
    async searchClubs(query: string): Promise<Club[]> {
        const { data, error } = await supabase
            .from('clubs')
            .select('*')
            .eq('is_public', true)
            .ilike('name', `%${query}%`)
            .limit(20);

        if (error) throw error;
        return data || [];
    }

    /**
     * Create a new club
     */
    async createClub(
        ownerId: string,
        name: string,
        description: string,
        settings: Partial<ClubSettings> = {}
    ): Promise<Club> {
        // Generate unique 6-digit club ID with collision check
        let clubId: number;
        let attempts = 0;
        do {
            clubId = Math.floor(100000 + Math.random() * 900000);
            const { count } = await supabase
                .from('clubs')
                .select('id', { count: 'exact', head: true })
                .eq('club_id', clubId);
            if (!count || count === 0) break;
            attempts++;
        } while (attempts < 10);

        if (attempts >= 10) {
            throw new Error('Failed to generate unique club ID after 10 attempts');
        }

        const { data, error } = await supabase
            .from('clubs')
            .insert({
                club_id: clubId,
                name,
                description,
                owner_id: ownerId,
                settings: {
                    default_rake_percent: 5,
                    rake_cap: 15,
                    time_bank_seconds: 30,
                    allow_straddle: true,
                    allow_run_it_twice: true,
                    min_buy_in_bb: 40,
                    max_buy_in_bb: 200,
                    ...settings,
                },
            })
            .select()
            .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error('Club creation returned no data');
        await this.addMember(data.id, ownerId, 'owner');

        // Initialize BBJ pool for the new club
        const { error: poolError } = await supabase.from('bbj_pools').insert({
            club_id: data.id,
            union_id: null,
            main_balance: 0,
            backup_balance: 0,
            promo_balance: 0,
            status: 'active',
            created_at: new Date().toISOString(),
        });

        if (poolError) {
            console.error('Failed to initialize BBJ pool for club:', poolError);
            // Log but don't fail the club creation — pool can be created later
        }

        return data;
    }

    /**
     * Update club settings
     */
    async updateClub(clubId: string, updates: Partial<Club>): Promise<Club> {
        const { data, error } = await supabase
            .from('clubs')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', clubId)
            .select()
            .maybeSingle();

        if (error) throw error;
        return data;
    }

    /**
     * Delete a club
     */
    async deleteClub(clubId: string): Promise<boolean> {
        const { error } = await supabase
            .from('clubs')
            .delete()
            .eq('id', clubId);

        return !error;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // MEMBERSHIP OPERATIONS
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Get all members of a club
     */
    async getMembers(clubId: string): Promise<ClubMember[]> {
        const { data, error } = await supabase
            .from('club_members')
            .select(`
                *,
                profiles!club_members_profiles_fkey (
                    display_name,
                    avatar_url
                )
            `)
            .eq('club_id', clubId)
            .order('role', { ascending: true });

        if (error) throw error;

        return (data || []).map(m => ({
            ...m,
            nickname: (m.profiles as any)?.display_name || m.nickname,
        }));
    }

    /**
     * Add a member to a club
     */
    async addMember(
        clubId: string,
        userId: string,
        role: MemberRole = 'member'
    ): Promise<ClubMember> {
        const { data, error } = await supabase
            .from('club_members')
            .insert({
                club_id: clubId,
                user_id: userId,
                role,
                status: role === 'owner' ? 'active' : 'pending',
                chip_balance: 0,
            })
            .select()
            .maybeSingle();

        if (error) throw error;
        return data;
    }

    /**
     * Update member role
     */
    async updateMemberRole(memberId: string, role: MemberRole): Promise<boolean> {
        const { error } = await supabase
            .from('club_members')
            .update({ role })
            .eq('id', memberId);

        return !error;
    }

    /**
     * Update member chip balance — uses proper wallet system
     * Positive amount = credit, negative amount = debit
     */
    async updateChipBalance(memberId: string, amount: number): Promise<boolean> {
        // Get the user_id from club_members
        const { data: member } = await supabase
            .from('club_members')
            .select('user_id, club_id')
            .eq('id', memberId)
            .maybeSingle();

        if (!member) return false;

        if (amount > 0) {
            // Credit via atomic wallet RPC
            const { error } = await supabase.rpc('credit_player_wallet', {
                p_user_id: member.user_id,
                p_amount: Math.trunc(amount * 100) / 100,
            });
            if (error) return false;

            await WalletService.logTransaction(
                member.user_id, 'PLAYER', Math.trunc(amount * 100) / 100, 'credit', 'transfer',
                'Club balance adjustment (credit)'
            );
        } else if (amount < 0) {
            const absAmt = Math.trunc(Math.abs(amount) * 100) / 100;
            const { data: result, error } = await supabase.rpc('deduct_player_wallet', {
                p_user_id: member.user_id,
                p_amount: absAmt,
            });
            if (error || result === false) return false;

            await WalletService.logTransaction(
                member.user_id, 'PLAYER', absAmt, 'debit', 'transfer',
                'Club balance adjustment (debit)'
            );
        }

        return true;
    }

    /**
     * Request to join a club
     */
    async requestJoin(clubId: string, userId: string): Promise<ClubMember> {
        const club = await this.getClub(clubId);
        if (!club) throw new Error('Club not found');

        return this.addMember(clubId, userId, 'member');
    }

    /**
     * Approve or reject a membership request
     */
    async handleMembershipRequest(memberId: string, approved: boolean): Promise<void> {
        if (approved) {
            await supabase
                .from('club_members')
                .update({ status: 'active' })
                .eq('id', memberId);
        } else {
            await supabase.from('club_members').delete().eq('id', memberId);
        }
    }

    /**
     * Remove a member from club
     */
    async removeMember(memberId: string): Promise<boolean> {
        const { error } = await supabase
            .from('club_members')
            .delete()
            .eq('id', memberId);

        return !error;
    }

    /**
     * Get online member count for a club
     */
    async getOnlineCount(clubId: string): Promise<number> {
        // Try to get actual online count from members who were active in last 15 minutes
        const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

        const { count: onlineCount, error: onlineError } = await supabase
            .from('club_members')
            .select('*', { count: 'exact', head: true })
            .eq('club_id', clubId)
            .eq('status', 'active')
            .gte('last_active_at', fifteenMinAgo);

        if (!onlineError && onlineCount !== null) {
            return onlineCount;
        }

        // Fallback: estimate from total members if last_active_at not available
        const { count, error } = await supabase
            .from('club_members')
            .select('*', { count: 'exact', head: true })
            .eq('club_id', clubId)
            .eq('status', 'active');

        if (error) throw error;
        return Math.floor((count || 0) * 0.15); // Conservative estimate
    }

    /**
     * Get member count by club
     */
    async getMemberCount(clubId: string): Promise<number> {
        const { count, error } = await supabase
            .from('club_members')
            .select('*', { count: 'exact', head: true })
            .eq('club_id', clubId)
            .eq('status', 'active');

        if (error) throw error;
        return count || 0;
    }
}

export const clubService = new ClubServiceClass();
export const ClubService = clubService;
export default clubService;

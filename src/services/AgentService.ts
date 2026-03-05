/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CLUB ENGINE — Agent Service
 * ═══════════════════════════════════════════════════════════════════════════════
 * Full agent management with hierarchy, credit, and commission tracking
 * 
 * HIERARCHY:
 * - Club assigns: rakeback % + credit limit → Agent
 * - Super Agent assigns: credit limit → Agent
 * - Agent assigns: credit limit → Sub-Agent
 */

import { supabase } from '../lib/supabase';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type AgentRole = 'super_agent' | 'agent' | 'sub_agent';
export type AgentStatus = 'active' | 'suspended' | 'frozen';

export interface Agent {
    id: string;
    userId: string;
    clubId: string;
    membershipId?: string;

    // Role & Status
    role: AgentRole;
    status: AgentStatus;

    // Hierarchy
    parentAgentId?: string;
    parentAgentName?: string;

    // Commission Rates (MANDATORY when creating)
    commissionRate: number;      // Rate they receive from club/parent (max 70%)
    playerRakebackRate: number;  // Rate they give to players (max 50%)

    // Credit (MANDATORY when creating)
    creditLimit: number;
    creditUsed: number;
    isPrepaid: boolean;

    // Triple Wallet
    businessBalance: number;
    playerBalance: number;
    promoBalance: number;

    // Stats
    totalPlayers: number;
    activePlayerCount: number;
    subAgentCount: number;
    weeklyRakeGenerated: number;
    lifetimeEarnings: number;

    // Display
    displayName?: string;
    avatarUrl?: string;

    // Timestamps
    joinedAt: string;
    lastActiveAt?: string;
}

export interface CreateAgentInput {
    userId: string;
    clubId: string;
    role: AgentRole;
    parentAgentId?: string;
    commissionRate: number;      // MANDATORY
    playerRakebackRate: number;  // MANDATORY
    creditLimit: number;         // MANDATORY
    isPrepaid?: boolean;
}

export interface AgentPlayer {
    id: string;
    userId: string;
    displayName: string;
    avatarUrl?: string;
    chipBalance: number;
    rakebackPercent: number;
    joinedAt: string;
    isOnline: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

class AgentServiceClass {

    // ─────────────────────────────────────────────────────────────────────────────
    // AGENT CRUD
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Get all agents for a club
     */
    async getAgents(clubId: string): Promise<Agent[]> {
        const { data, error } = await supabase
            .from('agents')
            .select(`
                *,
                parent:parent_agent_id (
                    id,
                    user_id,
                    profiles!agents_profiles_fkey (
                        display_name
                    )
                ),
                profiles!agents_profiles_fkey (
                    display_name,
                    avatar_url
                )
            `)
            .eq('club_id', clubId)
            .order('joined_at', { ascending: false });

        if (error) throw error;

        return (data || []).map(a => ({
            id: a.id,
            userId: a.user_id,
            clubId: a.club_id,
            membershipId: a.membership_id,
            role: a.role as AgentRole,
            status: a.status as AgentStatus,
            parentAgentId: a.parent_agent_id,
            parentAgentName: (a.parent as any)?.profiles?.display_name,
            commissionRate: Number(a.commission_rate),
            playerRakebackRate: Number(a.player_rakeback_rate),
            creditLimit: Number(a.credit_limit),
            creditUsed: Number(a.credit_used),
            isPrepaid: a.is_prepaid,
            businessBalance: Number(a.business_balance),
            playerBalance: Number(a.player_balance),
            promoBalance: Number(a.promo_balance),
            totalPlayers: a.total_players,
            activePlayerCount: a.active_player_count,
            subAgentCount: a.sub_agent_count,
            weeklyRakeGenerated: Number(a.weekly_rake_generated),
            lifetimeEarnings: Number(a.lifetime_earnings),
            displayName: (a.profiles as any)?.display_name,
            avatarUrl: (a.profiles as any)?.avatar_url,
            joinedAt: a.joined_at,
            lastActiveAt: a.last_active_at,
        }));
    }

    /**
     * Get a single agent by ID
     */
    async getAgent(agentId: string): Promise<Agent | null> {
        const { data, error } = await supabase
            .from('agents')
            .select(`
                *,
                parent:parent_agent_id (
                    id,
                    profiles!agents_profiles_fkey (
                        display_name
                    )
                ),
                profiles!agents_profiles_fkey (
                    display_name,
                    avatar_url
                )
            `)
            .eq('id', agentId)
            .single();

        if (error || !data) return null;

        return {
            id: data.id,
            userId: data.user_id,
            clubId: data.club_id,
            membershipId: data.membership_id,
            role: data.role as AgentRole,
            status: data.status as AgentStatus,
            parentAgentId: data.parent_agent_id,
            parentAgentName: (data.parent as any)?.profiles?.display_name,
            commissionRate: Number(data.commission_rate),
            playerRakebackRate: Number(data.player_rakeback_rate),
            creditLimit: Number(data.credit_limit),
            creditUsed: Number(data.credit_used),
            isPrepaid: data.is_prepaid,
            businessBalance: Number(data.business_balance),
            playerBalance: Number(data.player_balance),
            promoBalance: Number(data.promo_balance),
            totalPlayers: data.total_players,
            activePlayerCount: data.active_player_count,
            subAgentCount: data.sub_agent_count,
            weeklyRakeGenerated: Number(data.weekly_rake_generated),
            lifetimeEarnings: Number(data.lifetime_earnings),
            displayName: (data.profiles as any)?.display_name,
            avatarUrl: (data.profiles as any)?.avatar_url,
            joinedAt: data.joined_at,
            lastActiveAt: data.last_active_at,
        };
    }

    /**
     * Create a new agent (promote player to agent)
     * REQUIRES: commissionRate, playerRakebackRate, creditLimit
     */
    async createAgent(input: CreateAgentInput): Promise<Agent> {
        // Validate mandatory fields
        if (input.commissionRate === undefined) throw new Error('Commission rate is required');
        if (input.playerRakebackRate === undefined) throw new Error('Rakeback rate is required');
        if (input.creditLimit === undefined) throw new Error('Credit limit is required');

        // Validate caps
        if (input.commissionRate > 0.70) throw new Error('Commission rate cannot exceed 70%');
        if (input.playerRakebackRate > 0.50) throw new Error('Rakeback rate cannot exceed 50%');

        // Get or create membership
        const { data: membership } = await supabase
            .from('club_members')
            .select('id')
            .eq('club_id', input.clubId)
            .eq('user_id', input.userId)
            .single();

        // If sub-agent, verify parent exists and has capacity + rate limits
        if (input.parentAgentId) {
            const parent = await this.getAgent(input.parentAgentId);
            if (!parent) throw new Error('Parent agent not found');
            if (parent.role === 'sub_agent') throw new Error('Sub-agents cannot have sub-agents');
            if (input.commissionRate > parent.commissionRate) {
                throw new Error(`Commission rate (${input.commissionRate}) cannot exceed parent rate (${parent.commissionRate})`);
            }
            if (input.playerRakebackRate > parent.playerRakebackRate) {
                throw new Error(`Rakeback rate cannot exceed parent rate (${parent.playerRakebackRate})`);
            }
        }

        const { data, error } = await supabase
            .from('agents')
            .insert({
                user_id: input.userId,
                club_id: input.clubId,
                membership_id: membership?.id,
                role: input.role,
                parent_agent_id: input.parentAgentId,
                commission_rate: input.commissionRate,
                player_rakeback_rate: input.playerRakebackRate,
                credit_limit: input.creditLimit,
                is_prepaid: input.isPrepaid || false,
            })
            .select()
            .single();

        if (error) throw error;

        // Update membership role
        if (membership?.id) {
            await supabase
                .from('club_members')
                .update({ role: input.role })
                .eq('id', membership.id);
        }

        return this.getAgent(data.id) as Promise<Agent>;
    }

    /**
     * Update agent status
     */
    async updateAgentStatus(agentId: string, status: AgentStatus): Promise<boolean> {
        const { error } = await supabase
            .from('agents')
            .update({ status })
            .eq('id', agentId);

        return !error;
    }

    /**
     * Update agent role (promote/demote)
     */
    async updateAgentRole(agentId: string, newRole: AgentRole): Promise<boolean> {
        // Get current agent info
        const { data: agent } = await supabase
            .from('agents')
            .select('role, membership_id')
            .eq('id', agentId)
            .single();

        if (!agent) return false;

        // Update agent role
        const { error } = await supabase
            .from('agents')
            .update({ role: newRole })
            .eq('id', agentId);

        if (error) return false;

        // Also update membership role if exists
        if (agent.membership_id) {
            await supabase
                .from('club_members')
                .update({ role: newRole })
                .eq('id', agent.membership_id);
        }

        return true;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // CREDIT MANAGEMENT
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Set credit limit (Club → Agent, Agent → Sub-Agent)
     */
    async setCreditLimit(agentId: string, newLimit: number, assignedBy: string, reason?: string): Promise<boolean> {
        if (newLimit < 0) throw new Error('Credit limit cannot be negative');

        // Get current limit and parent info for logging + validation
        const { data: agent } = await supabase
            .from('agents')
            .select('credit_limit, parent_agent_id')
            .eq('id', agentId)
            .single();

        if (!agent) throw new Error('Agent not found');

        // If sub-agent, verify limit doesn't exceed parent's
        if (agent.parent_agent_id) {
            const { data: parent } = await supabase
                .from('agents')
                .select('credit_limit')
                .eq('id', agent.parent_agent_id)
                .single();
            if (parent && newLimit > Number(parent.credit_limit)) {
                throw new Error('Credit limit cannot exceed parent agent limit');
            }
        }

        const oldLimit = Number(agent.credit_limit);

        // Update limit
        const { error } = await supabase
            .from('agents')
            .update({ credit_limit: newLimit })
            .eq('id', agentId);

        if (error) return false;

        // Log the assignment
        await supabase.from('credit_assignments').insert({
            agent_id: agentId,
            assigned_by: assignedBy,
            old_limit: oldLimit,
            new_limit: newLimit,
            reason,
        });

        return true;
    }

    /**
     * Update commission/rakeback rates
     */
    async updateRates(
        agentId: string,
        commissionRate?: number,
        playerRakebackRate?: number
    ): Promise<boolean> {
        const updates: any = {};

        if (commissionRate !== undefined) {
            if (commissionRate > 0.70) throw new Error('Commission rate cannot exceed 70%');
            updates.commission_rate = commissionRate;
        }

        if (playerRakebackRate !== undefined) {
            if (playerRakebackRate > 0.50) throw new Error('Rakeback rate cannot exceed 50%');
            updates.player_rakeback_rate = playerRakebackRate;
        }

        if (Object.keys(updates).length === 0) return true;

        const { error } = await supabase
            .from('agents')
            .update(updates)
            .eq('id', agentId);

        return !error;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // PLAYER MANAGEMENT
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Get players under an agent
     */
    async getAgentPlayers(agentId: string): Promise<AgentPlayer[]> {
        const { data: agent } = await supabase
            .from('agents')
            .select('membership_id')
            .eq('id', agentId)
            .single();

        if (!agent) return [];

        const { data, error } = await supabase
            .from('club_members')
            .select(`
                id,
                user_id,
                chip_balance,
                rakeback_percent,
                joined_at,
                profiles!club_members_profiles_fkey (
                    display_name,
                    avatar_url,
                    is_online
                )
            `)
            .eq('agent_id', agent.membership_id);

        if (error) throw error;

        return (data || []).map(m => ({
            id: m.id,
            userId: m.user_id,
            displayName: (m.profiles as any)?.display_name || 'Unknown',
            avatarUrl: (m.profiles as any)?.avatar_url,
            chipBalance: m.chip_balance || 0,
            rakebackPercent: m.rakeback_percent || 0,
            joinedAt: m.joined_at,
            isOnline: (m.profiles as any)?.is_online || false,
        }));
    }

    /**
     * Assign a player to an agent
     */
    async assignPlayer(memberId: string, agentMembershipId: string): Promise<boolean> {
        const { error } = await supabase
            .from('club_members')
            .update({ agent_id: agentMembershipId })
            .eq('id', memberId);

        return !error;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // WALLET OPERATIONS
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Self-transfer between agent wallets
     */
    async selfTransfer(
        agentId: string,
        amount: number,
        fromWallet: 'business' | 'player' | 'promo',
        toWallet: 'business' | 'player' | 'promo'
    ): Promise<boolean> {
        if (amount <= 0) throw new Error('Transfer amount must be positive');
        if (fromWallet === toWallet) throw new Error('Cannot transfer to the same wallet');

        // Use RPC for atomic wallet-to-wallet transfer to prevent race conditions
        const { error } = await supabase.rpc('wallet_internal_transfer', {
            p_agent_id: agentId,
            p_amount: amount,
            p_from_wallet: fromWallet,
            p_to_wallet: toWallet,
        });

        if (error) {
            console.error('[AgentService] selfTransfer failed:', error);
            throw new Error(error.message || 'Self-transfer failed');
        }

        return true;
    }

    /**
     * Transfer chips to a player
     */
    async transferToPlayer(
        agentId: string,
        playerId: string,
        clubId: string,
        amount: number
    ): Promise<boolean> {
        if (amount <= 0) throw new Error('Transfer amount must be positive');

        // Get agent's business balance
        const { data: agent } = await supabase
            .from('agents')
            .select('business_balance')
            .eq('id', agentId)
            .single();

        if (!agent) throw new Error('Agent not found');
        if (Number(agent.business_balance) < amount) throw new Error('Insufficient balance');

        // STEP 1: Debit agent first
        const { error: debitError } = await supabase
            .from('agents')
            .update({ business_balance: Number(agent.business_balance) - amount })
            .eq('id', agentId);

        if (debitError) throw debitError;

        // STEP 2: Credit player via atomic RPC — rollback agent on failure
        const { error: rpcError } = await supabase.rpc('add_chips', {
            p_user_id: playerId,
            p_amount: amount,
        });

        if (rpcError) {
            // Rollback: re-credit agent
            console.error('[AgentService] Player credit failed, rolling back agent debit:', rpcError);
            await supabase
                .from('agents')
                .update({ business_balance: Number(agent.business_balance) })
                .eq('id', agentId);
            throw new Error('Failed to credit player — agent balance restored');
        }

        return true;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // HIERARCHY (for AgentHierarchyTree)
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Get agent hierarchy tree for a club
     */
    async getAgentHierarchy(clubId: string): Promise<any[]> {
        const agents = await this.getAgents(clubId);

        // Build tree structure
        const agentMap = new Map<string, any>();
        const rootAgents: any[] = [];

        // First pass: create nodes
        for (const agent of agents) {
            agentMap.set(agent.id, {
                ...agent,
                children: [],
            });
        }

        // Second pass: build tree
        for (const agent of agents) {
            const node = agentMap.get(agent.id)!;
            if (agent.parentAgentId && agentMap.has(agent.parentAgentId)) {
                agentMap.get(agent.parentAgentId)!.children.push(node);
            } else {
                rootAgents.push(node);
            }
        }

        return rootAgents;
    }

    /**
     * Distribute chips from agent to sub-agents or players
     */
    async distributeChips(
        fromAgentId: string,
        distributions: Array<{ toId: string; type: 'agent' | 'player'; amount: number }>
    ): Promise<boolean> {
        const agent = await this.getAgent(fromAgentId);
        if (!agent) throw new Error('Agent not found');

        const totalAmount = distributions.reduce((sum, d) => sum + d.amount, 0);
        if (agent.businessBalance < totalAmount) {
            throw new Error('Insufficient balance for distribution');
        }

        // STEP 1: Deduct from source FIRST to prevent chip duplication
        const { error: deductError } = await supabase.from('agents').update({
            business_balance: agent.businessBalance - totalAmount,
        }).eq('id', fromAgentId);

        if (deductError) throw new Error('Failed to deduct from source agent');

        // STEP 2: Process each distribution
        let distributed = 0;
        for (const dist of distributions) {
            try {
                if (dist.type === 'agent') {
                    const subAgent = await this.getAgent(dist.toId);
                    if (!subAgent) {
                        console.warn(`[AgentService] Sub-agent ${dist.toId} not found, skipping`);
                        continue;
                    }
                    await supabase.from('agents').update({
                        business_balance: subAgent.businessBalance + dist.amount,
                    }).eq('id', dist.toId);
                } else {
                    await supabase.rpc('add_chips', {
                        p_user_id: dist.toId,
                        p_amount: dist.amount,
                    });
                }
                distributed += dist.amount;
            } catch (err) {
                console.error(`[AgentService] Distribution to ${dist.toId} failed:`, err);
                // Continue with remaining distributions — partial failures are logged
            }
        }

        // If nothing was distributed, refund the full deduction
        if (distributed === 0 && distributions.length > 0) {
            await supabase.from('agents').update({
                business_balance: agent.businessBalance,
            }).eq('id', fromAgentId);
            throw new Error('All distributions failed — balance restored');
        }

        return true;
    }

    /**
     * Transfer chips from one agent to another (horizontal peer transfer)
     * Unlike distributeChips which is parent→child, this allows any agent-to-agent transfer
     * within the same club hierarchy.
     */
    async transferToAgent(
        fromAgentId: string,
        toAgentId: string,
        amount: number,
        reason?: string
    ): Promise<{ success: boolean; transactionId?: string }> {
        // 1. Validate both agents exist and are in the same club
        const fromAgent = await this.getAgent(fromAgentId);
        const toAgent = await this.getAgent(toAgentId);

        if (!fromAgent) throw new Error('Source agent not found');
        if (!toAgent) throw new Error('Destination agent not found');
        if (fromAgent.clubId !== toAgent.clubId) {
            throw new Error('Agents must be in the same club');
        }

        // 2. Validate sufficient balance
        if (fromAgent.businessBalance < amount) {
            throw new Error('Insufficient balance for transfer');
        }

        // 3. Validate amount is positive
        if (amount <= 0) {
            throw new Error('Transfer amount must be positive');
        }

        // 4. Execute the transfer atomically
        const { error: fromError } = await supabase
            .from('agents')
            .update({
                business_balance: fromAgent.businessBalance - amount,
            })
            .eq('id', fromAgentId);

        if (fromError) throw fromError;

        const { error: toError } = await supabase
            .from('agents')
            .update({
                business_balance: toAgent.businessBalance + amount,
            })
            .eq('id', toAgentId);

        if (toError) {
            // Rollback the deduction
            await supabase
                .from('agents')
                .update({
                    business_balance: fromAgent.businessBalance,
                })
                .eq('id', fromAgentId);
            throw toError;
        }

        // 5. Log the transaction
        const { data: transaction } = await supabase
            .from('chip_transactions')
            .insert({
                club_id: fromAgent.clubId,
                from_user_id: fromAgent.userId,
                to_user_id: toAgent.userId,
                amount,
                transaction_type: 'agent_transfer',
                notes: reason || `Agent transfer: ${fromAgent.displayName || fromAgentId} → ${toAgent.displayName || toAgentId}`,
            })
            .select('id')
            .single();

        return {
            success: true,
            transactionId: transaction?.id,
        };
    }

    /**
     * Get transfer history between agents
     */
    async getAgentTransferHistory(agentId: string, limit = 50): Promise<{
        id: string;
        fromAgentName: string;
        toAgentName: string;
        amount: number;
        notes: string;
        createdAt: string;
    }[]> {
        const agent = await this.getAgent(agentId);
        if (!agent) return [];

        const { data, error } = await supabase
            .from('chip_transactions')
            .select('id, from_user_id, to_user_id, amount, notes, created_at')
            .eq('transaction_type', 'agent_transfer')
            .or(`from_user_id.eq.${agent.userId},to_user_id.eq.${agent.userId}`)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error || !data) return [];

        // Fetch user display names
        const userIds = [...new Set(data.flatMap(t => [t.from_user_id, t.to_user_id]))];
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, display_name')
            .in('id', userIds);

        const nameMap = new Map(profiles?.map(p => [p.id, p.display_name]) || []);

        return data.map(t => ({
            id: t.id,
            fromAgentName: nameMap.get(t.from_user_id) || 'Unknown',
            toAgentName: nameMap.get(t.to_user_id) || 'Unknown',
            amount: t.amount,
            notes: t.notes || '',
            createdAt: t.created_at,
        }));
    }
}

export const AgentService = new AgentServiceClass();
export default AgentService;

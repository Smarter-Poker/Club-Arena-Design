/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  SETTLEMENT SERVICE — Weekly Financial Settlement Automation
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Handles Union Cross-Club Wires and Monday Payouts.
 *
 * SETTLEMENT CYCLE:
 * - Sunday 11:59:59 PM PST → Snapshot all ledgers
 * - Monday 4:00 AM PST → Process payouts
 *
 * FORMULA:
 * Wire = (Net Player P/L) + (Gross Rake Return) - (Union Tax 10%)
 */

import { supabase } from '../lib/supabase';
import { CommissionService } from './CommissionService';
import { WalletService } from './WalletService';
import { pushNotificationService } from './PushNotificationService';
import { masterBus } from '../core/MasterBus';
import { retryAsync } from '../utils/retryAsync';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type SettlementStatus = 'open' | 'processing' | 'settled' | 'disputed';

export interface SettlementPeriod {
  id: string;
  periodNumber: number;
  year: number;
  startAt: string;
  endAt: string;
  status: SettlementStatus;
  totalRakeCollected: number;
  totalBBJContributions: number;
  totalPlayerWinnings: number;
  totalPlayerLosses: number;
  totalHandsDealt: number;
  settledAt?: string;
  settledBy?: string;
}

export interface ClubSettlement {
  id: string;
  periodId: string;
  clubId: string;
  clubName: string;
  totalRakeCollected: number;
  totalJackpotContributions: number;
  totalPromoCosts: number;
  uniquePlayers: number;
  totalHandsDealt: number;
  platformFee: number;
  agentCommissions: number;
  grossRevenue: number;
  netRevenue: number;
  status: 'pending' | 'finalized' | 'disputed';
}

export interface AgentSettlement {
  id: string;
  periodId: string;
  agentId: string;
  agentName: string;
  totalRakeGenerated: number;
  commissionRate: number;
  commissionEarned: number;
  creditExtended: number;
  creditRepaid: number;
  netSettlement: number;
  activePlayers: number;
  status: 'pending' | 'approved' | 'paid' | 'disputed';
}

export interface UnionWireCalculation {
  clubId: string;
  clubName: string;
  netPlayerPL: number;
  grossRake: number;
  unionTax: number;
  finalWire: number;
  action: 'COLLECT_FROM_UNION' | 'PAY_TO_UNION';
}

export interface SettlementSummary {
  period: SettlementPeriod;
  clubSettlements: ClubSettlement[];
  agentSettlements: AgentSettlement[];
  unionWires: UnionWireCalculation[];
  totalPlatformRevenue: number;
  totalAgentPayouts: number;
  totalPlayerRakeback: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export const SettlementService = {
  // ─────────────────────────────────────────────────────────────────────────────
  // PERIOD MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get or create the current settlement period
   */
  async getCurrentPeriod(): Promise<SettlementPeriod> {
    const { data, error } = await retryAsync(
      () => supabase.rpc('get_current_settlement_period'),
      3
    );
    if (error) throw error;

    // RPC returns table - use first row or create default period
    if (data && data.length > 0) {
      const period = data[0];
      return {
        id: period.id || 'default',
        periodNumber: 1,
        year: new Date().getFullYear(),
        startAt: period.period_start,
        endAt: period.period_end,
        status: period.status || 'open',
        totalRakeCollected: period.total_rake || 0,
        totalBBJContributions: 0,
        totalPlayerWinnings: 0,
        totalPlayerLosses: 0,
        totalHandsDealt: 0,
      };
    }

    // Return default empty period if none exists
    return {
      id: 'default',
      periodNumber: 1,
      year: new Date().getFullYear(),
      startAt: new Date().toISOString(),
      endAt: new Date().toISOString(),
      status: 'open',
      totalRakeCollected: 0,
      totalBBJContributions: 0,
      totalPlayerWinnings: 0,
      totalPlayerLosses: 0,
      totalHandsDealt: 0,
    };
  },

  /**
   * Get historical periods
   */
  async getPeriodHistory(limit: number = 12): Promise<SettlementPeriod[]> {
    const { data, error } = await supabase
      .from('settlement_periods')
      .select('*')
      .order('start_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data.map(this.mapPeriod);
  },

  /**
   * Close period and begin processing
   */
  async closePeriod(periodId: string): Promise<boolean> {
    const { error } = await supabase
      .from('settlement_periods')
      .update({ status: 'processing' })
      .eq('id', periodId);

    if (error) throw error;
    return true;
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // SETTLEMENT CALCULATIONS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Calculate union wire for a club
   */
  calculateUnionWire(
    clubId: string,
    clubName: string,
    netPlayerPL: number,
    grossRake: number
  ): UnionWireCalculation {
    const unionTax = grossRake * 0.1; // 10% Union Tax
    const finalWire = netPlayerPL + grossRake - unionTax;

    return {
      clubId,
      clubName,
      netPlayerPL,
      grossRake,
      unionTax,
      finalWire,
      action: finalWire >= 0 ? 'COLLECT_FROM_UNION' : 'PAY_TO_UNION',
    };
  },

  /**
   * Generate all settlements for a period
   */
  async generateSettlements(periodId: string): Promise<SettlementSummary> {
    const { data, error } = await retryAsync(
      () =>
        supabase.rpc('generate_period_settlements', {
          p_period_id: periodId,
        }),
      3
    );

    if (error) throw error;
    return data;
  },

  /**
   * Calculate agent settlement for a specific agent
   */
  async calculateAgentSettlement(periodId: string, agentId: string): Promise<AgentSettlement> {
    try {
      // Try calculate_agent_settlement first
      const { data, error } = await retryAsync(
        () =>
          supabase.rpc('calculate_agent_settlement', {
            p_period_id: periodId,
            p_agent_id: agentId,
          }),
        3
      );

      if (error) {
        console.warn(
          '[Settlement] calculate_agent_settlement not available, trying calculate_agent_spread'
        );
        // Fall back to calculate_agent_spread if available
        const { data: spreadData, error: spreadError } = await retryAsync(
          () =>
            supabase.rpc('calculate_agent_spread', {
              p_period_id: periodId,
              p_agent_id: agentId,
            }),
          3
        );

        if (!spreadError && spreadData) {
          return spreadData;
        }

        // Return default if both fail
        console.warn('[Settlement] Falling back to default settlement');
        return {
          id: `${agentId}-${periodId}`,
          periodId,
          agentId,
          agentName: 'Unknown',
          totalRakeGenerated: 0,
          commissionRate: 0,
          commissionEarned: 0,
          creditExtended: 0,
          creditRepaid: 0,
          netSettlement: 0,
          activePlayers: 0,
          status: 'pending',
        };
      }
      return data;
    } catch (err) {
      console.warn('[Settlement] Error calculating agent settlement:', err);
      throw err;
    }
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // PAYOUT EXECUTION
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Execute Monday payout cycle
   */
  async executeMondayPayouts(periodId: string): Promise<{
    agentsPaid: number;
    playersWithRakeback: number;
    totalDisbursed: number;
  }> {
    // 1. Get all approved agent settlements
    const { data: agentSettlements } = await supabase
      .from('agent_settlements')
      .select('*')
      .eq('period_id', periodId)
      .eq('status', 'approved');

    let agentsPaid = 0;
    let totalDisbursed = 0;

    // 2. Process each agent payout
    for (const settlement of agentSettlements || []) {
      // IDEMPOTENCY GUARD: Atomically claim this settlement by transitioning approved → processing.
      // If another instance already claimed it (0 rows affected), skip gracefully.
      const { data: claimData, error: claimError } = await supabase
        .from('agent_settlements')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', settlement.id)
        .eq('status', 'approved') // Only claim if still 'approved' — prevents double-pay
        .select('id');

      if (claimError || !claimData || claimData.length === 0) {
        console.warn(
          `[Settlement] Skipping agent ${settlement.agent_id}: ` +
            `already claimed by another instance or status changed`
        );
        continue;
      }

      // Skip agents with zero or negative settlements (e.g. excess credit extended)
      if (settlement.net_settlement <= 0) {
        console.warn(
          `[Settlement] Skipping agent ${settlement.agent_id}: ` +
            `net_settlement=${settlement.net_settlement} (non-positive)`
        );
        await supabase
          .from('agent_settlements')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            notes: 'Zero/negative net — no disbursement',
          })
          .eq('id', settlement.id);
        agentsPaid++;
        continue;
      }

      try {
        await WalletService.creditCommission(
          settlement.agent_id,
          settlement.net_settlement,
          periodId
        );

        await supabase
          .from('agent_settlements')
          .update({ status: 'paid', paid_at: new Date().toISOString() })
          .eq('id', settlement.id);

        // Send push notification to agent
        pushNotificationService
          .notifySettlement(settlement.agent_id, settlement.net_settlement, 'Weekly Commission')
          .catch((err) => console.warn('[Settlement] Agent push failed:', err));

        agentsPaid++;
        totalDisbursed += settlement.net_settlement;
      } catch (err) {
        console.error(`Failed to pay agent ${settlement.agent_id}:`, err);
        // Revert to 'approved' so a retry can pick it up
        await supabase
          .from('agent_settlements')
          .update({ status: 'approved', notes: `Payout failed: ${err}` })
          .eq('id', settlement.id);
      }
    }

    // 3. Process player rakeback
    const { data: playerSnapshots } = await supabase
      .from('player_weekly_snapshots')
      .select('*')
      .eq('period_id', periodId)
      .gt('rakeback_earned', 0);

    let playersWithRakeback = 0;
    for (const snapshot of playerSnapshots || []) {
      try {
        // IDEMPOTENCY GUARD: Check if rakeback was already paid for this period
        // (In a real system, we'd transition a status column on the snapshot itself,
        // but for now we look for an existing transaction to prevent double-pay on retry)
        const { data: existingTx } = await supabase
          .from('wallet_transactions')
          .select('id')
          .eq('user_id', snapshot.player_id)
          .eq('type', 'credit')
          .eq('category', 'rakeback')
          // Using periodId as description or related context would be safer,
          // but we verify based on recent timestamps as a basic guard
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .limit(1);

        if (existingTx && existingTx.length > 0) {
          console.warn(
            `[Settlement] Skipping rakeback for ${snapshot.player_id}: already paid recently`
          );
          continue;
        }

        await WalletService.creditRakeback(snapshot.player_id, snapshot.rakeback_earned, periodId);

        // Send push notification to player
        pushNotificationService
          .notifySettlement(snapshot.player_id, snapshot.rakeback_earned, 'Weekly Rakeback')
          .catch((err) => console.warn('[Settlement] Player push failed:', err));

        playersWithRakeback++;
        totalDisbursed += snapshot.rakeback_earned;
      } catch (err) {
        console.error(`Failed rakeback for player ${snapshot.player_id}:`, err);
      }
    }

    // 4. Finalize or mark partial based on payout success
    const totalExpected = (agentSettlements?.length || 0) + (playerSnapshots?.length || 0);
    const totalSucceeded = agentsPaid + playersWithRakeback;
    const successRate = totalExpected > 0 ? totalSucceeded / totalExpected : 1;

    if (totalExpected === 0 || successRate === 1) {
      // All payouts succeeded — finalize via direct update
      await supabase
        .from('settlement_periods')
        .update({ status: 'settled', settled_at: new Date().toISOString() })
        .eq('id', periodId);
    } else {
      // Partial success — mark for manual reconciliation (never auto-finalize partial)
      console.error(
        `[Settlement] Only ${totalSucceeded}/${totalExpected} payouts succeeded ` +
          `(${Math.round(successRate * 100)}%) for period ${periodId} — marking PARTIAL.`
      );
      await supabase
        .from('settlement_periods')
        .update({
          status: 'partial',
          notes: `${totalSucceeded}/${totalExpected} payouts succeeded (${Math.round(successRate * 100)}%). Manual reconciliation required.`,
        })
        .eq('id', periodId);
    }

    // 5. Emit settlement completion bus event for real-time dashboard updates
    masterBus.emit('SETTLEMENT_COMPLETED', {
      periodId,
      agentsPaid,
      playersWithRakeback,
      totalDisbursed,
      successRate: totalExpected > 0 ? totalSucceeded / totalExpected : 1,
      status: successRate === 1 ? 'settled' : 'partial',
    });

    return { agentsPaid, playersWithRakeback, totalDisbursed };
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // UNION RAKE BACK — Weekly 90% Distribution
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Execute weekly union settlement: distribute 90% of collected rake back to clubs.
   * Union keeps 10% and holds ALL BBJ and Promotional chips.
   *
   * FLOW:
   * 1. Query all rake_history for this period, grouped by club
   * 2. For each club in a union: compute 90% rake back
   * 3. Credit 90% to club owner's wallet from union owner's wallet
   * 4. Log all transactions with full audit trail
   */
  async executeUnionRakeBack(
    unionId: string,
    periodStart: string,
    periodEnd: string
  ): Promise<{
    clubsPaid: number;
    totalRakeBack: number;
    unionRetained: number;
  }> {
    // Get union info
    const { data: union } = await supabase
      .from('unions')
      .select('owner_id, name')
      .eq('id', unionId)
      .maybeSingle();

    if (!union?.owner_id) throw new Error('Union not found');

    // Get all clubs in this union
    const { data: clubs } = await supabase
      .from('clubs')
      .select('id, name, owner_id')
      .eq('union_id', unionId);

    if (!clubs || clubs.length === 0) return { clubsPaid: 0, totalRakeBack: 0, unionRetained: 0 };

    let clubsPaid = 0;
    let totalRakeBack = 0;
    let totalCollected = 0;

    for (const club of clubs) {
      // Sum rake collected for this club in the period
      const { data: rakeData } = await supabase
        .from('rake_history')
        .select('rake_amount')
        .eq('club_id', club.id)
        .gte('collected_at', periodStart)
        .lt('collected_at', periodEnd);

      const clubRake = (rakeData || []).reduce((sum, r) => sum + Number(r.rake_amount), 0);
      if (clubRake <= 0) continue;

      totalCollected += clubRake;

      // 90% goes back to club owner
      const rakeBack = Math.trunc(clubRake * 0.9 * 100) / 100;

      if (rakeBack > 0 && club.owner_id) {
        // Deduct from union owner
        const { data: deductResult } = await retryAsync(
          () =>
            supabase.rpc('deduct_player_wallet', {
              p_user_id: union.owner_id,
              p_amount: rakeBack,
            }),
          3
        );

        if (deductResult === false) {
          console.error(
            `[Settlement] Union owner insufficient balance for rake back to ${club.name}`
          );
          continue;
        }

        // Credit to club owner — rollback union debit on failure
        const { error: creditError } = await retryAsync(
          () =>
            supabase.rpc('credit_player_wallet', {
              p_user_id: club.owner_id,
              p_amount: rakeBack,
            }),
          3
        );

        if (creditError) {
          console.error(
            `[Settlement] CRITICAL: Credit to club owner failed, rolling back union debit:`,
            creditError
          );
          const { error: rollbackErr } = await retryAsync(
            () =>
              supabase.rpc('credit_player_wallet', {
                p_user_id: union.owner_id,
                p_amount: rakeBack,
              }),
            3
          );
          if (rollbackErr)
            console.error(
              `[Settlement] CRITICAL: Rollback also failed — ${rakeBack} chips lost: ${rollbackErr.message}`
            );
          continue;
        }

        // Log both sides
        await WalletService.logTransaction(
          union.owner_id,
          'PLAYER',
          rakeBack,
          'debit',
          'settlement',
          `Weekly rake back to ${club.name}: 90% of ${clubRake}`,
          undefined,
          undefined,
          club.id
        );

        await WalletService.logTransaction(
          club.owner_id,
          'PLAYER',
          rakeBack,
          'credit',
          'settlement',
          `Weekly rake back from ${union.name}: 90% of ${clubRake} collected`,
          undefined,
          undefined,
          unionId
        );

        // Emit bus event so UI updates immediately
        masterBus.emit('BALANCE_UPDATED', {
          source: 'union_rakeback_deduct',
          userId: union.owner_id,
        });
        masterBus.emit('BALANCE_UPDATED', {
          source: 'union_rakeback_credit',
          userId: club.owner_id,
        });

        clubsPaid++;
        totalRakeBack += rakeBack;
      }
    }

    const unionRetained = Math.trunc((totalCollected - totalRakeBack) * 100) / 100;

    return { clubsPaid, totalRakeBack, unionRetained };
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // REPORTING
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get club settlement report
   */
  async getClubReport(clubId: string, periodId?: string): Promise<ClubSettlement | null> {
    const { data, error } = await supabase
      .from('club_settlements')
      .select('*')
      .eq('club_id', clubId)
      .eq('period_id', periodId || (await this.getCurrentPeriod()).id)
      .maybeSingle();

    if (error) return null;
    return this.mapClubSettlement(data);
  },

  /**
   * Get agent settlement report
   */
  async getAgentReport(agentId: string, periodId?: string): Promise<AgentSettlement | null> {
    const { data, error } = await supabase
      .from('agent_settlements')
      .select('*')
      .eq('agent_id', agentId)
      .eq('period_id', periodId || (await this.getCurrentPeriod()).id)
      .maybeSingle();

    if (error) return null;
    return this.mapAgentSettlement(data);
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  mapPeriod(p: any): SettlementPeriod {
    return {
      id: p.id,
      periodNumber: p.period_number,
      year: p.year,
      startAt: p.start_at,
      endAt: p.end_at,
      status: p.status,
      totalRakeCollected: p.total_rake_collected || 0,
      totalBBJContributions: p.total_bbj_contributions || 0,
      totalPlayerWinnings: p.total_player_winnings || 0,
      totalPlayerLosses: p.total_player_losses || 0,
      totalHandsDealt: p.total_hands_dealt || 0,
      settledAt: p.settled_at,
      settledBy: p.settled_by,
    };
  },

  mapClubSettlement(s: any): ClubSettlement {
    return {
      id: s.id,
      periodId: s.period_id,
      clubId: s.club_id,
      clubName: s.club_name || 'Unknown Club',
      totalRakeCollected: s.total_rake_collected,
      totalJackpotContributions: s.total_jackpot_contributions,
      totalPromoCosts: s.total_promo_costs,
      uniquePlayers: s.unique_players,
      totalHandsDealt: s.total_hands_dealt,
      platformFee: s.platform_fee,
      agentCommissions: s.agent_commissions,
      grossRevenue: s.gross_revenue,
      netRevenue: s.net_revenue,
      status: s.status,
    };
  },

  mapAgentSettlement(s: any): AgentSettlement {
    return {
      id: s.id,
      periodId: s.period_id,
      agentId: s.agent_id,
      agentName: s.agent_name || 'Unknown Agent',
      totalRakeGenerated: s.total_rake_generated,
      commissionRate: s.commission_rate,
      commissionEarned: s.commission_earned,
      creditExtended: s.total_credit_extended || 0,
      creditRepaid: s.total_credit_repaid || 0,
      netSettlement: s.net_settlement,
      activePlayers: s.active_players || 0,
      status: s.status,
    };
  },
};

export default SettlementService;

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 💳 CREDIT SERVICE — Agent Credit Line Management
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Manages Credit Lines, Pre-Paid Status, and Debt Calculation.
 *
 * CREDIT TYPES:
 * - PREPAID: Agent pays upfront, no credit extended
 * - CREDIT LINE: Agent plays on credit, settles weekly
 *
 * DEBT FORMULA:
 * Debt = Credit Limit - Current Balance
 * Example: 10,000 Limit - 2,500 Balance = 7,500 Owed
 *
 * SETTLEMENT CYCLE:
 * - Sunday 11:59:59 PM PST → Generate invoices
 * - Monday 4:00 AM PST → Process payments
 */

import { supabase } from '../lib/supabase';
import { WalletService } from './WalletService';
import { FinancialAlertService } from './FinancialAlertService';
import { SettlementService } from './SettlementService';
import { masterBus } from '../core/MasterBus';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type CreditStatus = 'good_standing' | 'warning' | 'suspended' | 'frozen';
export type InvoiceStatus = 'pending' | 'partial' | 'paid' | 'overdue' | 'disputed';

export interface CreditAccount {
  agentId: string;
  agentName: string;
  creditLimit: number;
  currentBalance: number;
  isPrepaid: boolean;
  status: CreditStatus;
  utilizationPercent: number;
  lastSettlementDate?: string;
  nextSettlementDate: string;
}

export interface DebtCalculation {
  agentId: string;
  creditLimit: number;
  currentBalance: number;
  debtOwed: number;
  isPrepaid: boolean;
  gracePeriodRemaining: number; // hours
}

export interface CreditInvoice {
  id: string;
  agentId: string;
  agentName: string;
  periodStart: string;
  periodEnd: string;
  debtOwed: number;
  amountPaid: number;
  amountRemaining: number;
  status: InvoiceStatus;
  dueDate: string;
  createdAt: string;
  paidAt?: string;
}

export interface CreditPayment {
  id: string;
  invoiceId: string;
  amount: number;
  paymentMethod: 'wallet' | 'diamonds' | 'external';
  transactionId?: string;
  createdAt: string;
}

export interface CreditLimitRequest {
  id: string;
  agentId: string;
  agentName: string;
  currentLimit: number;
  requestedLimit: number;
  reason: string;
  status: 'pending' | 'approved' | 'denied';
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export const CreditService = {
  // ─────────────────────────────────────────────────────────────────────────────
  // CREDIT LINE MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get credit account for an agent
   */
  async getCreditAccount(agentId: string): Promise<CreditAccount | null> {
    const { data: agent, error } = await supabase
      .from('agents')
      .select(
        'id, user_id, credit_limit, agent_wallet_balance, is_prepaid, status, profiles!agents_profiles_fkey(display_name)'
      )
      .eq('id', agentId)
      .maybeSingle();

    if (error || !agent) return null;

    const utilization =
      agent.credit_limit > 0
        ? ((agent.credit_limit - agent.agent_wallet_balance) / agent.credit_limit) * 100
        : 0;

    return {
      agentId: agent.id,
      agentName: (agent.profiles as any)?.display_name || 'Unknown',
      creditLimit: agent.credit_limit || 0,
      currentBalance: agent.agent_wallet_balance || 0,
      isPrepaid: agent.is_prepaid || false,
      status: this.calculateStatus(utilization),
      utilizationPercent: Math.round(utilization),
      nextSettlementDate: this.getNextSettlementDate(),
    };
  },

  /**
   * Set credit line for an agent
   */
  async setCreditLine(agentId: string, limit: number, isPrepaid: boolean): Promise<boolean> {
    const { error } = await supabase
      .from('agents')
      .update({
        credit_limit: limit,
        is_prepaid: isPrepaid,
        updated_at: new Date().toISOString(),
      })
      .eq('id', agentId);

    if (error) throw error;
    return true;
  },

  /**
   * Increase credit limit (with approval tracking)
   */
  async requestCreditIncrease(
    agentId: string,
    requestedLimit: number,
    reason: string
  ): Promise<CreditLimitRequest> {
    const account = await this.getCreditAccount(agentId);
    if (!account) throw new Error('Agent not found');

    const { data, error } = await supabase
      .from('credit_limit_requests')
      .insert({
        agent_id: agentId,
        current_limit: account.creditLimit,
        requested_limit: requestedLimit,
        reason,
        status: 'pending',
      })
      .select()
      .maybeSingle();

    if (error) throw error;
    return this.mapCreditRequest(data, account.agentName);
  },

  /**
   * Approve/Deny credit increase request
   */
  async reviewCreditRequest(
    requestId: string,
    approved: boolean,
    reviewerId: string
  ): Promise<boolean> {
    const status = approved ? 'approved' : 'denied';

    const { data: request, error: fetchError } = await supabase
      .from('credit_limit_requests')
      .select('agent_id, requested_limit')
      .eq('id', requestId)
      .maybeSingle();

    if (fetchError || !request) throw fetchError || new Error('Credit request not found');

    // Update request
    await supabase
      .from('credit_limit_requests')
      .update({
        status,
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    // If approved, update credit limit
    if (approved) {
      await supabase
        .from('agents')
        .update({ credit_limit: request.requested_limit })
        .eq('id', request.agent_id);
    }

    return true;
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // DEBT CALCULATION
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Calculate current debt for an agent
   */
  async calculateDebt(agentId: string): Promise<DebtCalculation> {
    const { data: agent, error } = await supabase
      .from('agents')
      .select('credit_limit, agent_wallet_balance, is_prepaid')
      .eq('id', agentId)
      .maybeSingle();

    if (error || !agent) throw error || new Error('Agent not found');

    if (agent.is_prepaid) {
      return {
        agentId,
        creditLimit: 0,
        currentBalance: agent.agent_wallet_balance,
        debtOwed: 0,
        isPrepaid: true,
        gracePeriodRemaining: 0,
      };
    }

    const debt = agent.credit_limit - agent.agent_wallet_balance;

    return {
      agentId,
      creditLimit: agent.credit_limit,
      currentBalance: agent.agent_wallet_balance,
      debtOwed: Math.max(0, debt),
      isPrepaid: false,
      gracePeriodRemaining: this.getGracePeriodRemaining(),
    };
  },

  /**
   * Calculate debt for all agents in a club
   */
  async calculateClubDebt(clubId: string): Promise<DebtCalculation[]> {
    const { data: agents, error } = await supabase
      .from('agents')
      .select('id, credit_limit, agent_wallet_balance, is_prepaid')
      .eq('club_id', clubId)
      .eq('is_prepaid', false);

    if (error) throw error;

    return (agents || []).map((agent) => ({
      agentId: agent.id,
      creditLimit: agent.credit_limit || 0,
      currentBalance: agent.agent_wallet_balance || 0,
      debtOwed: Math.max(0, (agent.credit_limit || 0) - (agent.agent_wallet_balance || 0)),
      isPrepaid: false,
      gracePeriodRemaining: this.getGracePeriodRemaining(),
    }));
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // INVOICING
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Generate Sunday invoice for an agent
   */
  async generateSundayInvoice(agentId: string): Promise<CreditInvoice | null> {
    const debt = await this.calculateDebt(agentId);
    if (debt.debtOwed <= 0 || debt.isPrepaid) return null;

    const account = await this.getCreditAccount(agentId);
    if (!account) return null;

    const now = new Date();
    const periodEnd = new Date(now);
    const periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dueDate = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48 hour grace

    const { data, error } = await supabase
      .from('credit_invoices')
      .insert({
        agent_id: agentId,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        debt_owed: debt.debtOwed,
        amount_paid: 0,
        amount_remaining: debt.debtOwed,
        status: 'pending',
        due_date: dueDate.toISOString(),
      })
      .select()
      .maybeSingle();

    if (error) throw error;
    return this.mapInvoice(data, account.agentName);
  },

  /**
   * Get invoices for an agent
   */
  async getAgentInvoices(agentId: string): Promise<CreditInvoice[]> {
    const { data, error } = await supabase
      .from('credit_invoices')
      .select('*, agents:agent_id(profiles!agents_profiles_fkey(display_name))')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map((inv) => this.mapInvoice(inv, inv.agents?.profiles?.display_name));
  },

  /**
   * Process payment on an invoice
   */
  async processPayment(
    invoiceId: string,
    amount: number,
    method: 'wallet' | 'diamonds' | 'external'
  ): Promise<CreditPayment> {
    // Get current invoice
    const { data: invoice, error: fetchError } = await supabase
      .from('credit_invoices')
      .select('*')
      .eq('id', invoiceId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!invoice) throw new Error(`Invoice not found: ${invoiceId}`);

    // STEP 1: If paying from wallet, deduct FIRST (before recording anything)
    if (method === 'wallet') {
      // Get agent's user_id for wallet deduction
      const { data: agentData } = await supabase
        .from('agents')
        .select('user_id')
        .eq('id', invoice.agent_id)
        .maybeSingle();

      if (!agentData?.user_id) {
        throw new Error('Agent user not found for wallet deduction');
      }

      const amt = Math.trunc(amount * 100) / 100;
      const { data: deductResult, error: deductError } = await supabase.rpc(
        'deduct_player_wallet',
        {
          p_user_id: agentData.user_id,
          p_amount: amt,
        }
      );
      if (deductError) {
        throw new Error(`Wallet deduction failed: ${deductError.message}`);
      }
      if (!deductResult) {
        throw new Error('Insufficient wallet balance for payment');
      }

      // Log transaction for audit trail
      await WalletService.logTransaction(
        agentData.user_id,
        'PLAYER',
        amt,
        'debit',
        'settlement',
        `Credit invoice payment: ${invoiceId}`
      );

      // Emit bus event so UI (header balances, cashier) updates immediately
      masterBus.emit('BALANCE_UPDATED', {
        source: 'credit_payment',
        userId: agentData.user_id,
        amount: -amt,
      });
    }

    // STEP 2: Atomically update invoice amounts using ALREADY-FETCHED invoice data (no re-fetch TOCTOU)
    const newAmountPaid = (invoice?.amount_paid || 0) + amount;
    const newAmountRemaining = Math.max(0, (invoice?.amount_remaining || 0) - amount);

    const { error: updateError } = await supabase
      .from('credit_invoices')
      .update({
        amount_paid: newAmountPaid,
        amount_remaining: newAmountRemaining,
        status: newAmountRemaining <= 0 ? 'paid' : 'partial',
      })
      .eq('id', invoiceId);

    if (updateError) {
      // Rollback wallet deduction if invoice update failed — use the correct inverse RPC
      if (method === 'wallet') {
        try {
          const { data: agentForRollback } = await supabase
            .from('agents')
            .select('user_id')
            .eq('id', invoice.agent_id)
            .maybeSingle();

          if (agentForRollback?.user_id) {
            const { error: rollbackErr2 } = await supabase.rpc('credit_player_wallet', {
              p_user_id: agentForRollback.user_id,
              p_amount: amount,
            });
            if (rollbackErr2) {
              console.error(
                `[CreditService] CRITICAL: Wallet rollback failed for agent ${invoice.agent_id}: ${rollbackErr2.message}`
              );
              FinancialAlertService.logCritical(
                'CreditService',
                'Wallet rollback failed after invoice update failure',
                {
                  invoiceId,
                  agentId: invoice.agent_id,
                  amount,
                  rollbackError: rollbackErr2.message,
                }
              );
            }
          }
        } catch (rollbackErr) {
          console.error('[CreditService] Rollback failed:', rollbackErr);
        }
      }
      throw new Error(`Invoice update failed: ${updateError.message}`);
    }

    // STEP 3: Record payment (after money has moved)
    const { data: payment, error: payError } = await supabase
      .from('credit_payments')
      .insert({
        invoice_id: invoiceId,
        amount,
        payment_method: method,
      })
      .select()
      .maybeSingle();

    if (payError) throw payError;

    return {
      id: payment.id,
      invoiceId,
      amount,
      paymentMethod: method,
      transactionId: payment.transaction_id,
      createdAt: payment.created_at,
    };
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // SUSPENSION & ENFORCEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Check if agent should be suspended for overdue debt
   */
  async checkSuspension(agentId: string): Promise<{ shouldSuspend: boolean; reason?: string }> {
    const invoices = await this.getAgentInvoices(agentId);
    const overdueInvoices = invoices.filter(
      (i) => i.status !== 'paid' && new Date(i.dueDate) < new Date()
    );

    if (overdueInvoices.length === 0) {
      return { shouldSuspend: false };
    }

    const totalOverdue = overdueInvoices.reduce((sum, i) => sum + i.amountRemaining, 0);

    return {
      shouldSuspend: true,
      reason: `${overdueInvoices.length} overdue invoice(s) totaling ${totalOverdue} chips`,
    };
  },

  /**
   * Suspend agent for overdue debt
   */
  async suspendAgent(agentId: string, reason: string): Promise<boolean> {
    await supabase
      .from('agents')
      .update({
        status: 'suspended',
        suspension_reason: reason,
        suspended_at: new Date().toISOString(),
      })
      .eq('id', agentId);

    return true;
  },

  /**
   * Reinstate suspended agent after payment
   */
  async reinstateAgent(agentId: string): Promise<boolean> {
    // Check all invoices are paid
    const invoices = await this.getAgentInvoices(agentId);
    const hasOverdue = invoices.some(
      (i) => i.status !== 'paid' && new Date(i.dueDate) < new Date()
    );

    if (hasOverdue) {
      throw new Error('Cannot reinstate: overdue invoices exist');
    }

    await supabase
      .from('agents')
      .update({
        status: 'active',
        suspension_reason: null,
        suspended_at: null,
      })
      .eq('id', agentId);

    return true;
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  calculateStatus(utilizationPercent: number): CreditStatus {
    if (utilizationPercent >= 100) return 'frozen';
    if (utilizationPercent >= 90) return 'suspended';
    if (utilizationPercent >= 75) return 'warning';
    return 'good_standing';
  },

  getNextSettlementDate(): string {
    const now = new Date();
    const dayOfWeek = now.getDay();
    // Sunday = 0 → settlement is today; otherwise, days until next Sunday
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    const nextSunday = new Date(now.getTime() + daysUntilSunday * 24 * 60 * 60 * 1000);
    nextSunday.setHours(23, 59, 59, 0);
    return nextSunday.toISOString();
  },

  getGracePeriodRemaining(): number {
    const now = new Date();
    const dayOfWeek = now.getDay();

    // If it's Sunday or Monday, we're in grace period
    if (dayOfWeek === 0) return 48;
    if (dayOfWeek === 1) {
      const hoursToday = now.getHours();
      return Math.max(0, 48 - 24 - hoursToday);
    }
    return 0;
  },

  mapInvoice(inv: any, agentName?: string): CreditInvoice {
    return {
      id: inv.id,
      agentId: inv.agent_id,
      agentName: agentName || 'Unknown',
      periodStart: inv.period_start,
      periodEnd: inv.period_end,
      debtOwed: inv.debt_owed,
      amountPaid: inv.amount_paid || 0,
      amountRemaining: inv.amount_remaining || inv.debt_owed,
      status: inv.status,
      dueDate: inv.due_date,
      createdAt: inv.created_at,
      paidAt: inv.paid_at,
    };
  },

  mapCreditRequest(req: any, agentName: string): CreditLimitRequest {
    return {
      id: req.id,
      agentId: req.agent_id,
      agentName,
      currentLimit: req.current_limit,
      requestedLimit: req.requested_limit,
      reason: req.reason,
      status: req.status,
      reviewedBy: req.reviewed_by,
      reviewedAt: req.reviewed_at,
      createdAt: req.created_at,
    };
  },
};

export default CreditService;

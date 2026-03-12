/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  FINANCIAL ALERT SERVICE — Critical Error Logging for Financial Operations
 * ═══════════════════════════════════════════════════════════════════════════════
 * Logs critical financial errors to Supabase for ops visibility and emits
 * bus events for real-time dashboard monitoring.
 *
 * Usage:
 *   import { FinancialAlertService } from './FinancialAlertService';
 *   FinancialAlertService.logCritical('CreditService', 'Wallet rollback failed', { invoiceId, agentId });
 */

import { supabase } from '../lib/supabase';
import { masterBus } from '../core/MasterBus';

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface FinancialAlert {
  id?: string;
  severity: AlertSeverity;
  source: string;        // e.g. 'CreditService', 'CashoutService'
  message: string;
  context: Record<string, unknown>;
  resolved: boolean;
  createdAt: string;
}

export const FinancialAlertService = {

  /**
   * Log a critical financial error — persists to DB and emits bus event.
   * For operations where money may be in an inconsistent state.
   */
  async logCritical(
    source: string,
    message: string,
    context: Record<string, unknown> = {}
  ): Promise<void> {
    await this._log('critical', source, message, context);
  },

  /**
   * Log a warning — operation succeeded but with degraded behavior.
   * For retry-able failures or non-blocking audit issues.
   */
  async logWarning(
    source: string,
    message: string,
    context: Record<string, unknown> = {}
  ): Promise<void> {
    await this._log('warning', source, message, context);
  },

  /**
   * Internal: persist alert to DB + emit bus event
   */
  async _log(
    severity: AlertSeverity,
    source: string,
    message: string,
    context: Record<string, unknown>
  ): Promise<void> {
    const alert: Omit<FinancialAlert, 'id'> = {
      severity,
      source,
      message,
      context,
      resolved: false,
      createdAt: new Date().toISOString(),
    };

    // 1. Persist to Supabase for ops dashboard
    try {
      await supabase.from('financial_alerts').insert({
        severity: alert.severity,
        source: alert.source,
        message: alert.message,
        context: alert.context,
        resolved: false,
        created_at: alert.createdAt,
      });
    } catch (err) {
      // If the table doesn't exist yet, log to console as fallback
      console.error(`[FinancialAlert] DB insert failed — ${severity.toUpperCase()}: ${source}: ${message}`, context, err);
    }

    // 2. Emit bus event for real-time dashboard
    try {
      masterBus.emit('FINANCIAL_ALERT', {
        severity,
        source,
        message,
        context,
        timestamp: alert.createdAt,
      });
    } catch {
      // Bus emission failure is non-fatal
    }

    // 3. Always log to console for server-side visibility
    const prefix = severity === 'critical' ? '🔴 CRITICAL' : severity === 'warning' ? '🟡 WARNING' : 'ℹ️ INFO';
    console.error(`[FinancialAlert] ${prefix}: ${source}: ${message}`, context);
  },

  /**
   * Get unresolved alerts (for admin dashboard)
   */
  async getUnresolved(limit = 50): Promise<FinancialAlert[]> {
    const { data } = await supabase
      .from('financial_alerts')
      .select('*')
      .eq('resolved', false)
      .order('created_at', { ascending: false })
      .limit(limit);

    return (data || []).map((a: any) => ({
      id: a.id,
      severity: a.severity,
      source: a.source,
      message: a.message,
      context: a.context || {},
      resolved: a.resolved,
      createdAt: a.created_at,
    }));
  },

  /**
   * Resolve an alert (mark as handled)
   */
  async resolve(alertId: string): Promise<void> {
    await supabase
      .from('financial_alerts')
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .eq('id', alertId);
  },
};

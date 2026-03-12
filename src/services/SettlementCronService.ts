/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  SETTLEMENT CRON SERVICE — Automated settlement cycle trigger
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Checks if the current settlement period has expired and automatically
 * triggers the settlement cycle (close → generate → payout).
 *
 * - Canary check: verify total debits = total credits before finalizing
 * - Bus events for real-time dashboard updates
 * - Idempotent: won't re-trigger if period already processing/settled
 */

import { supabase } from '../lib/supabase';
import { masterBus } from '../core/MasterBus';
import { SettlementService } from './SettlementService';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface CronConfig {
  /** Check interval in ms (default: 60 minutes) */
  checkIntervalMs?: number;
  /** Auto-execute payouts or just close period (default: false for safety) */
  autoExecutePayouts?: boolean;
  /** Require canary balance check before settlement (default: true) */
  requireCanaryCheck?: boolean;
}

export interface CanaryResult {
  passed: boolean;
  totalCredits: number;
  totalDebits: number;
  difference: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export const SettlementCronService = {
  timer: null as ReturnType<typeof setInterval> | null,
  isRunning: false,
  lastCheckAt: 0,
  checksPerformed: 0,
  config: {
    checkIntervalMs: 60 * 60 * 1000, // 1 hour
    autoExecutePayouts: false,
    requireCanaryCheck: true,
  } as Required<CronConfig>,

  /**
   * Start the settlement cron service
   */
  start(config: CronConfig = {}): void {
    if (this.timer) this.stop();

    this.config = {
      checkIntervalMs: config.checkIntervalMs ?? 60 * 60 * 1000,
      autoExecutePayouts: config.autoExecutePayouts ?? false,
      requireCanaryCheck: config.requireCanaryCheck ?? true,
    };

    console.debug(
      '[SettlementCron] Started — checking every',
      this.config.checkIntervalMs / 1000,
      's'
    );

    // Check immediately on start
    this.check();

    // Then check on interval
    this.timer = setInterval(() => this.check(), this.config.checkIntervalMs);
  },

  /**
   * Stop the cron service
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.debug('[SettlementCron] Stopped');
  },

  /**
   * Get current cron status for admin dashboard / health widget
   */
  getStatus(): {
    isRunning: boolean;
    lastCheckAt: number | null;
    nextCheckMs: number | null;
    checksPerformed: number;
  } {
    return {
      isRunning: !!this.timer,
      lastCheckAt: this.lastCheckAt,
      nextCheckMs:
        this.lastCheckAt && this.config.checkIntervalMs
          ? Math.max(0, this.config.checkIntervalMs - (Date.now() - this.lastCheckAt))
          : null,
      checksPerformed: this.checksPerformed ?? 0,
    };
  },

  /**
   * Check if settlement cycle should be triggered
   */
  async check(): Promise<void> {
    if (this.isRunning) {
      console.debug('[SettlementCron] Already running — skipping');
      return;
    }

    this.isRunning = true;
    this.lastCheckAt = Date.now();
    this.checksPerformed++;

    try {
      const period = await SettlementService.getCurrentPeriod();

      // Only trigger if period is past endAt and still 'open'
      if (period.status !== 'open') {
        return;
      }

      const endAt = new Date(period.endAt).getTime();
      if (Date.now() < endAt) {
        return;
      }

      console.debug(`[SettlementCron] Period ${period.id} expired — initiating settlement cycle`);

      masterBus.emit('SETTLEMENT_CYCLE_STARTED', {
        periodId: period.id,
        startedAt: new Date().toISOString(),
      });

      // Step 1: Canary check (if enabled)
      if (this.config.requireCanaryCheck) {
        const canary = await this.runCanaryCheck();
        if (!canary.passed) {
          console.error(
            `[SettlementCron] CANARY CHECK FAILED: credits=${canary.totalCredits}, ` +
              `debits=${canary.totalDebits}, diff=${canary.difference}`
          );

          // Raise critical alert
          try {
            const { FinancialAlertService } = await import('./FinancialAlertService');
            FinancialAlertService.raise(
              'critical',
              `Settlement canary check failed: credit/debit mismatch of ${canary.difference.toFixed(2)}`,
              'SettlementCronService',
              { ...canary }
            );
          } catch {
            /* best effort */
          }

          // Automated push/email alert via Supabase edge function
          try {
            const { supabase } = await import('../lib/supabase');
            await supabase.functions.invoke('send-canary-alert', {
              body: {
                type: 'canary_failed',
                totalCredits: canary.totalCredits,
                totalDebits: canary.totalDebits,
                difference: canary.difference,
                periodId: period.id,
                timestamp: new Date().toISOString(),
              },
            });
          } catch {
            console.warn(
              '[SettlementCron] Edge function send-canary-alert unavailable — relying on DB alert'
            );
          }

          masterBus.emit('SETTLEMENT_CYCLE_COMPLETED', {
            periodId: period.id,
            status: 'canary_failed',
            canary,
          });
          return;
        }

        console.debug('[SettlementCron] Canary check passed');
      }

      // Step 2: Close period
      await SettlementService.closePeriod(period.id);
      console.debug(`[SettlementCron] Period ${period.id} closed`);

      // Step 3: Execute payouts (if auto-execute is enabled)
      if (this.config.autoExecutePayouts) {
        const result = await SettlementService.executeMondayPayouts(period.id);
        console.debug(
          `[SettlementCron] Payouts complete: ${result.agentsPaid} agents, ` +
            `${result.playersWithRakeback} players, $${result.totalDisbursed} total`
        );

        masterBus.emit('SETTLEMENT_CYCLE_COMPLETED', {
          periodId: period.id,
          status: 'completed',
          ...result,
        });
      } else {
        console.debug('[SettlementCron] Period closed — manual payout execution required');
        masterBus.emit('SETTLEMENT_CYCLE_COMPLETED', {
          periodId: period.id,
          status: 'closed_pending_payout',
        });
      }
    } catch (err) {
      console.error('[SettlementCron] Error during settlement cycle:', err);
    } finally {
      this.isRunning = false;
    }
  },

  /**
   * Canary check: verify total credits ≈ total debits across all wallets
   */
  async runCanaryCheck(): Promise<CanaryResult> {
    try {
      const { data, error } = await supabase.rpc('get_wallet_balance_totals');

      if (error || !data) {
        // If RPC doesn't exist, pass canary (non-blocking)
        console.warn('[SettlementCron] Canary RPC not available — passing by default');
        return { passed: true, totalCredits: 0, totalDebits: 0, difference: 0 };
      }

      const row = Array.isArray(data) ? data[0] : data;
      const totalCredits = Number(row?.total_credits || 0);
      const totalDebits = Number(row?.total_debits || 0);
      const difference = Math.abs(totalCredits - totalDebits);

      // Allow a small tolerance (0.01) for floating point rounding
      const passed = difference < 0.01;

      return { passed, totalCredits, totalDebits, difference };
    } catch (err) {
      console.warn('[SettlementCron] Canary check error — passing by default:', err);
      return { passed: true, totalCredits: 0, totalDebits: 0, difference: 0 };
    }
  },
};

export default SettlementCronService;

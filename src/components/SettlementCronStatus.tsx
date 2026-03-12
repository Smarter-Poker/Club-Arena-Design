/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  SETTLEMENT CRON STATUS WIDGET — Admin health indicator
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Small dashboard widget showing cron status, last check time, and next check ETA.
 * Auto-refreshes every 30s.
 */

import { useEffect, useState, useCallback } from 'react';
import { SettlementCronService } from '../services/SettlementCronService';
import { masterBus } from '../core/MasterBus';

interface CronStatusData {
  isRunning: boolean;
  lastCheckAt: string | null;
  nextCheckIn: string;
  checksPerformed: number;
  snapshotCountdown: string;
  payoutCountdown: string;
}

export function SettlementCronStatus() {
  const [status, setStatus] = useState<CronStatusData>({
    isRunning: false,
    lastCheckAt: null,
    nextCheckIn: '--',
    checksPerformed: 0,
    snapshotCountdown: '--',
    payoutCountdown: '--',
  });

  const refresh = useCallback(() => {
    const cronStatus = SettlementCronService.getStatus();
    const snapshotDate = SettlementCronService.getNextSundaySnapshot();
    const payoutDate = SettlementCronService.getNextMondayPayout();
    setStatus({
      isRunning: cronStatus.isRunning,
      lastCheckAt: cronStatus.lastCheckAt
        ? new Date(cronStatus.lastCheckAt).toLocaleTimeString()
        : null,
      nextCheckIn: cronStatus.nextCheckMs ? `${Math.round(cronStatus.nextCheckMs / 1000)}s` : '--',
      checksPerformed: cronStatus.checksPerformed || 0,
      snapshotCountdown: SettlementCronService.formatCountdown(snapshotDate),
      payoutCountdown: SettlementCronService.formatCountdown(payoutDate),
    });
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 30_000);

    // Also refresh on settlement events
    const unsub = masterBus.subscribe('SETTLEMENT_CYCLE_COMPLETED', refresh);

    return () => {
      clearInterval(timer);
      unsub();
    };
  }, [refresh]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 16px',
        borderRadius: 8,
        backgroundColor: status.isRunning ? 'rgba(46, 204, 113, 0.1)' : 'rgba(231, 76, 60, 0.1)',
        border: `1px solid ${status.isRunning ? 'rgba(46, 204, 113, 0.3)' : 'rgba(231, 76, 60, 0.3)'}`,
        fontSize: 12,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: '#ccc',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: status.isRunning ? '#2ecc71' : '#e74c3c',
          display: 'inline-block',
        }}
      />
      <div style={{ flex: 1 }}>
        <strong style={{ color: '#fff', fontSize: 13 }}>Settlement Cron</strong>
        <div style={{ opacity: 0.7, marginTop: 2 }}>
          {status.isRunning ? 'Running' : 'Stopped'}
          {status.lastCheckAt && ` · Last: ${status.lastCheckAt}`}
          {status.nextCheckIn !== '--' && ` · Next: ${status.nextCheckIn}`}
          {status.checksPerformed > 0 && ` · Checks: ${status.checksPerformed}`}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 11 }}>
          <span style={{ color: '#f59e0b' }}>📸 Snapshot: {status.snapshotCountdown}</span>
          <span style={{ color: '#22c55e' }}>💰 Payout: {status.payoutCountdown}</span>
        </div>
      </div>
    </div>
  );
}

export default SettlementCronStatus;

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  FINANCIAL ALERTS PAGE — Admin Ops Dashboard for Critical Financial Errors
 * ═══════════════════════════════════════════════════════════════════════════════
 * Shows unresolved financial alerts with severity badges, one-click resolve,
 * and auto-refresh via Supabase real-time subscription on `financial_alerts`.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { masterBus } from '../core/MasterBus';
import { FinancialAlertService, FinancialAlert } from '../services/FinancialAlertService';
import { useAuthUser } from '../hooks/useAuthUser';
import './FinancialAlertsPage.css';
import PageSkeleton from '../components/common/PageSkeleton';
import { useVisibilityRefresh } from '../hooks/useVisibilityRefresh';
import { useToast } from '../components/common/Toast';

export default function FinancialAlertsPage() {
  const { user } = useAuthUser();
  useVisibilityRefresh(() => loadAlerts());
  const toast = useToast();
  const [alerts, setAlerts] = useState<FinancialAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning'>('all');

  const loadAlerts = useCallback(async (getIsMounted?: () => boolean) => {
    setLoading(true);
    try {
      const data = await FinancialAlertService.getUnresolved(100);
      if (getIsMounted && !getIsMounted()) return;
      setAlerts(data);
    } catch (err) {
      if (getIsMounted && !getIsMounted()) return;
      console.error('[FinancialAlerts] Failed to load alerts:', err);
      toast.error('Failed to load financial alerts');
    }
    if (getIsMounted && !getIsMounted()) return;
    setLoading(false);
  }, []);

  useEffect(() => {
    let isMounted = true;
    loadAlerts(() => isMounted);
    return () => {
      isMounted = false;
    };
  }, [loadAlerts]);

  // ── Supabase Real-time: auto-refresh when new alerts are inserted ──
  useEffect(() => {
    let isMounted = true;
    const channelKey = 'financial-alerts-realtime';
    const channel = masterBus.getOrCreateChannel(channelKey);
    channel
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'financial_alerts' },
        () => {
          if (isMounted) loadAlerts(() => isMounted);
        }
      )
      .subscribe();
    return () => {
      isMounted = false;
      masterBus.removeRegisteredChannel(channelKey);
    };
  }, [loadAlerts]);

  // ── Bus Listeners: react to all financial/security events ──
  useEffect(() => {
    let isMounted = true;
    const unsub1 = masterBus.subscribeDebounced(
      'FINANCIAL_ALERT',
      () => {
        if (isMounted) loadAlerts(() => isMounted);
      },
      1000
    );
    const unsub2 = masterBus.subscribeDebounced(
      'COLLUSION_DETECTED',
      () => {
        if (isMounted) loadAlerts(() => isMounted);
      },
      1000
    );
    const unsub3 = masterBus.subscribeDebounced(
      'VALIDATION_MISMATCH',
      () => {
        if (isMounted) loadAlerts(() => isMounted);
      },
      1000
    );
    const unsub4 = masterBus.subscribeDebounced(
      'CHIPS_ADDED',
      () => {
        if (isMounted) loadAlerts(() => isMounted);
      },
      2000
    );
    const unsub5 = masterBus.subscribeDebounced(
      'CHIPS_WITHDRAWN',
      () => {
        if (isMounted) loadAlerts(() => isMounted);
      },
      2000
    );
    return () => {
      isMounted = false;
      unsub1();
      unsub2();
      unsub3();
      unsub4();
      unsub5();
    };
  }, [loadAlerts]);

  const handleResolve = async (alertId: string) => {
    setResolving(alertId);
    try {
      await FinancialAlertService.resolve(alertId);
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    } catch (err) {
      console.error('[FinancialAlerts] Failed to resolve alert:', err);
      toast.error('Failed to resolve alert');
    }
    setResolving(null);
  };

  const filteredAlerts = filter === 'all' ? alerts : alerts.filter((a) => a.severity === filter);

  const criticalCount = alerts.filter((a) => a.severity === 'critical').length;
  const warningCount = alerts.filter((a) => a.severity === 'warning').length;

  if (loading && alerts.length === 0) {
    return (
      <div className="financial-alerts-page">
        <div className="alerts-header">
          <h2>🔔 Financial Alerts</h2>
        </div>
        <div className="loading-state">
          <PageSkeleton variant="financial" />
          <p>Loading alerts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="financial-alerts-page">
      <div className="alerts-header">
        <h2>🔔 Financial Alerts</h2>
        <div className="alert-stats">
          {criticalCount > 0 && <span className="stat critical">🔴 {criticalCount} critical</span>}
          {warningCount > 0 && <span className="stat warning">🟡 {warningCount} warning</span>}
          {alerts.length === 0 && <span className="stat clear">✅ All clear</span>}
        </div>
        <button className="refresh-btn" onClick={() => loadAlerts()} title="Refresh">
          ↻
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="filter-tabs">
        <button
          className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All ({alerts.length})
        </button>
        <button
          className={`filter-tab critical ${filter === 'critical' ? 'active' : ''}`}
          onClick={() => setFilter('critical')}
        >
          Critical ({criticalCount})
        </button>
        <button
          className={`filter-tab warning ${filter === 'warning' ? 'active' : ''}`}
          onClick={() => setFilter('warning')}
        >
          Warning ({warningCount})
        </button>
      </div>

      {/* Alert List */}
      {filteredAlerts.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">◉</span>
          <p>{filter === 'all' ? 'No unresolved alerts' : `No ${filter} alerts`}</p>
        </div>
      ) : (
        <div className="alert-list">
          {filteredAlerts.map((alert) => (
            <div key={alert.id} className={`alert-card severity-${alert.severity}`}>
              <div className="alert-header">
                <span className={`severity-badge ${alert.severity}`}>
                  {alert.severity === 'critical' ? '🔴' : '🟡'} {alert.severity.toUpperCase()}
                </span>
                <span className="alert-source">{alert.source}</span>
                <span className="alert-time">{new Date(alert.createdAt).toLocaleString()}</span>
              </div>
              <p className="alert-message">{alert.message}</p>
              {alert.context && Object.keys(alert.context).length > 0 && (
                <details className="alert-context">
                  <summary>Context Details</summary>
                  <pre>{JSON.stringify(alert.context, null, 2)}</pre>
                </details>
              )}
              <div className="alert-actions">
                <button
                  className="resolve-btn"
                  onClick={() => alert.id && handleResolve(alert.id)}
                  disabled={resolving === alert.id}
                >
                  {resolving === alert.id ? 'Resolving...' : '✓ Mark Resolved'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

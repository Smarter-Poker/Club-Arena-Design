/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  FINANCIAL ADMIN HUB — Single-Pane-of-Glass Financial Operations
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Central admin page consolidating all financial management tools.
 *  Quick links to: Alerts, Health, Disputes, Rate Audit, Settlements, Financials.
 */

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { masterBus } from '../core/MasterBus';
import { useAuthUser } from '../hooks/useAuthUser';
import { useVisibilityRefresh } from '../hooks/useVisibilityRefresh';

interface HubStats {
  totalAlerts: number;
  openDisputes: number;
  rateChanges: number;
  healthChecks: number;
  lastCheckPassed: boolean | null;
}

const NAV_ITEMS = [
  {
    icon: '🚨',
    label: 'Financial Alerts',
    description: 'Critical warnings and system notifications',
    path: '/financial-alerts',
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.1)',
    border: 'rgba(239,68,68,0.3)',
  },
  {
    icon: '🩺',
    label: 'System Health',
    description: 'Ledger reconciliation & cron status',
    path: '/financial-health',
    color: '#10b981',
    bg: 'rgba(16,185,129,0.1)',
    border: 'rgba(16,185,129,0.3)',
  },
  {
    icon: '⚠️',
    label: 'Disputes',
    description: 'Open disputes needing resolution',
    path: '/disputes',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.1)',
    border: 'rgba(245,158,11,0.3)',
  },
  {
    icon: '📊',
    label: 'Rate Audit Trail',
    description: 'Commission & rake rate change history',
    path: '/rate-audit',
    color: '#8b5cf6',
    bg: 'rgba(139,92,246,0.1)',
    border: 'rgba(139,92,246,0.3)',
  },
  {
    icon: '🏧',
    label: 'Agent Portal',
    description: 'Triple wallet, credit lines, commissions',
    path: '/agent-portal',
    color: '#0ea5e9',
    bg: 'rgba(14,165,233,0.1)',
    border: 'rgba(14,165,233,0.3)',
  },
  {
    icon: '🎰',
    label: 'Rakeback Dashboard',
    description: 'Player rakeback tiers & pending payouts',
    path: '/rakeback',
    color: '#d946ef',
    bg: 'rgba(217,70,239,0.1)',
    border: 'rgba(217,70,239,0.3)',
  },
  {
    icon: '💳',
    label: 'Credit Admin',
    description: 'Set & adjust agent credit limits',
    path: '/credit-admin',
    color: '#f97316',
    bg: 'rgba(249,115,22,0.1)',
    border: 'rgba(249,115,22,0.3)',
  },
  {
    icon: '📅',
    label: 'Settlement History',
    description: 'Weekly settlement cycles & revenue trends',
    path: '/settlement-history',
    color: '#14b8a6',
    bg: 'rgba(20,184,166,0.1)',
    border: 'rgba(20,184,166,0.3)',
  },
  {
    icon: '⚖️',
    label: 'Settlement Center',
    description: 'Canary checks, payout execution & monitoring',
    path: '/settlement-dashboard',
    color: '#6366f1',
    bg: 'rgba(99,102,241,0.1)',
    border: 'rgba(99,102,241,0.3)',
  },
  {
    icon: '🏦',
    label: 'Settlements',
    description: 'Club & agent settlement management',
    path: '/wallet',
    color: '#3b82f6',
    bg: 'rgba(59,130,246,0.1)',
    border: 'rgba(59,130,246,0.3)',
  },
  {
    icon: '📥',
    label: 'CSV Exports',
    description: 'Financial reports & data exports',
    path: '/transactions',
    color: '#06b6d4',
    bg: 'rgba(6,182,212,0.1)',
    border: 'rgba(6,182,212,0.3)',
  },
];

export default function FinancialAdminHub() {
  const navigate = useNavigate();
  const { user } = useAuthUser();
  useVisibilityRefresh(() => loadStats());

  const [stats, setStats] = useState<HubStats>({
    totalAlerts: 0,
    openDisputes: 0,
    rateChanges: 0,
    healthChecks: 0,
    lastCheckPassed: null,
  });
  const [visibleCards, setVisibleCards] = useState<Set<number>>(new Set());
  const [visibleNavs, setVisibleNavs] = useState<Set<number>>(new Set());
  const [revenueData, setRevenueData] = useState<{ day: string; amount: number }[]>([]);

  useEffect(() => {
    loadStats();
  }, []);

  // Bus listeners: refresh stats when financial events fire
  useEffect(() => {
    const unsubBalance = masterBus.subscribeDebounced('BALANCE_UPDATED', () => loadStats(), 1000);
    const unsubSettlement = masterBus.subscribeDebounced(
      'SETTLEMENT_COMPLETED',
      () => loadStats(),
      1000
    );
    const unsubAlert = masterBus.subscribeDebounced('FINANCIAL_ALERT', () => loadStats(), 500);
    return () => {
      unsubBalance();
      unsubSettlement();
      unsubAlert();
    };
  }, []);

  // Real-time subscription: disputes table changes
  useEffect(() => {
    const channelKey = 'financial-admin-hub-disputes';
    const channel = masterBus.getOrCreateChannel(channelKey);
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'disputes' }, () =>
        loadStats()
      )
      .subscribe();
    return () => {
      masterBus.removeRegisteredChannel(channelKey);
    };
  }, []);

  useEffect(() => {
    setVisibleCards(new Set());
    [0, 1, 2, 3].forEach((i) => {
      setTimeout(() => setVisibleCards((prev) => new Set(prev).add(i)), i * 80);
    });
    setVisibleNavs(new Set());
    NAV_ITEMS.forEach((_, i) => {
      setTimeout(() => setVisibleNavs((prev) => new Set(prev).add(i)), 300 + i * 60);
    });
  }, []);

  const loadStats = async () => {
    try {
      // Count open disputes
      let openDisputes = 0;
      try {
        const { count } = await supabase
          .from('disputes')
          .select('*', { count: 'exact', head: true })
          .in('status', ['open', 'under_review', 'escalated']);
        openDisputes = count || 0;
      } catch {
        /* table may not exist */
      }

      // Count recent rate changes
      let rateChanges = 0;
      try {
        const { count: commCount } = await supabase
          .from('commission_rate_audit')
          .select('*', { count: 'exact', head: true });
        const { count: rakeCount } = await supabase
          .from('rake_rate_audit')
          .select('*', { count: 'exact', head: true });
        rateChanges = (commCount || 0) + (rakeCount || 0);
      } catch {
        /* tables may not exist */
      }

      // Count health checks & last result
      let healthChecks = 0;
      let lastCheckPassed: boolean | null = null;
      try {
        const { count } = await supabase
          .from('financial_health_checks')
          .select('*', { count: 'exact', head: true });
        healthChecks = count || 0;

        const { data: lastCheck } = await supabase
          .from('financial_health_checks')
          .select('passed')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastCheck) lastCheckPassed = lastCheck.passed;
      } catch {
        /* table may not exist */
      }

      // Count unresolved financial alerts from Supabase
      let totalAlerts = 0;
      try {
        const { count: alertCount } = await supabase
          .from('financial_alerts')
          .select('*', { count: 'exact', head: true })
          .eq('resolved', false);
        totalAlerts = alertCount || 0;
      } catch {
        /* table may not exist */
      }

      setStats({ totalAlerts, openDisputes, rateChanges, healthChecks, lastCheckPassed });

      // Load 7-day revenue data for sparkline
      try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const { data: rakeData } = await supabase
          .from('rake_records')
          .select('rake_amount, created_at')
          .gte('created_at', sevenDaysAgo)
          .order('created_at', { ascending: true })
          .limit(5000);

        if (rakeData && rakeData.length > 0) {
          const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          const grouped: Record<string, number> = {};
          rakeData.forEach((r: any) => {
            const d = new Date(r.created_at);
            const label = `${dayLabels[d.getDay()]} ${d.getDate()}`;
            grouped[label] = (grouped[label] || 0) + (r.rake_amount || 0);
          });
          // Build last 7 days in order
          const days: { day: string; amount: number }[] = [];
          for (let i = 6; i >= 0; i--) {
            const d = new Date(Date.now() - i * 86400000);
            const label = `${dayLabels[d.getDay()]} ${d.getDate()}`;
            days.push({ day: label, amount: grouped[label] || 0 });
          }
          setRevenueData(days);
        } else {
          setRevenueData([]);
        }
      } catch {
        /* ignore */
      }
    } catch (err) {
      console.error('[FinancialAdminHub] Stats load failed:', err);
    }
  };

  const kpiCards = [
    {
      label: 'Open Disputes',
      value: stats.openDisputes,
      icon: '⚠️',
      color: stats.openDisputes > 0 ? '#f59e0b' : '#10b981',
      glow: stats.openDisputes > 0 ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)',
    },
    {
      label: 'Rate Changes',
      value: stats.rateChanges,
      icon: '📊',
      color: '#8b5cf6',
      glow: 'rgba(139,92,246,0.2)',
    },
    {
      label: 'Health Checks',
      value: stats.healthChecks,
      icon: stats.lastCheckPassed === false ? '🔴' : stats.lastCheckPassed === true ? '🟢' : '⚪',
      color: stats.lastCheckPassed === false ? '#ef4444' : '#10b981',
      glow: stats.lastCheckPassed === false ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)',
    },
    {
      label: 'Active Alerts',
      value: stats.totalAlerts,
      icon: '🚨',
      color: stats.totalAlerts > 0 ? '#ef4444' : '#10b981',
      glow: stats.totalAlerts > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)',
    },
  ];

  return (
    <div style={{ padding: '16px', maxWidth: '900px', margin: '0 auto', paddingBottom: '100px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: 'none',
            border: 'none',
            color: '#3b82f6',
            cursor: 'pointer',
            fontSize: '0.85rem',
            padding: 0,
            marginBottom: '6px',
          }}
        >
          ← Back
        </button>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>🏦 Financial Admin Hub</h1>
        <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
          Central command for all financial operations
        </p>
      </div>

      {/* KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '10px',
          marginBottom: '24px',
        }}
      >
        {kpiCards.map((card, idx) => (
          <div
            key={card.label}
            style={{
              padding: '14px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.06)',
              boxShadow: `0 0 20px ${card.glow}`,
              opacity: visibleCards.has(idx) ? 1 : 0,
              transform: visibleCards.has(idx) ? 'translateY(0)' : 'translateY(10px)',
              transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '1.1rem' }}>{card.icon}</span>
              <span
                style={{
                  fontSize: '0.7rem',
                  color: 'rgba(255,255,255,0.5)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  fontWeight: 600,
                }}
              >
                {card.label}
              </span>
            </div>
            <div
              style={{
                fontSize: '1.6rem',
                fontWeight: 800,
                color: card.color,
                fontFamily: 'monospace',
              }}
            >
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Revenue Sparkline */}
      {revenueData.length > 0 &&
        (() => {
          const maxRevenue = Math.max(...revenueData.map((d) => d.amount), 1);
          const totalRevenue = revenueData.reduce((s, d) => s + d.amount, 0);
          return (
            <div
              style={{
                padding: '16px',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.06)',
                marginBottom: '20px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '10px',
                }}
              >
                <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>📈 7-Day Revenue</span>
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: '#10b981',
                    fontWeight: 700,
                    fontFamily: 'monospace',
                  }}
                >
                  {totalRevenue.toLocaleString()} total
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '60px' }}>
                {revenueData.map((d) => (
                  <div
                    key={d.day}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '3px',
                    }}
                  >
                    <div
                      style={{
                        width: '100%',
                        height: `${Math.max(3, (d.amount / maxRevenue) * 45)}px`,
                        background:
                          d.amount > 0
                            ? 'linear-gradient(180deg, #10b981, #065f46)'
                            : 'rgba(255,255,255,0.06)',
                        borderRadius: '2px 2px 0 0',
                        transition: 'height 0.5s ease',
                      }}
                      title={`${d.day}: ${d.amount.toLocaleString()}`}
                    />
                    <span style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.3)' }}>
                      {d.day.split(' ')[0]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

      {/* Navigation Grid */}
      <h2
        style={{
          fontSize: '0.8rem',
          color: 'rgba(255,255,255,0.4)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '12px',
          fontWeight: 600,
        }}
      >
        Financial Tools
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {NAV_ITEMS.map((item, idx) => (
          <Link
            key={item.path}
            to={item.path}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              padding: '14px 16px',
              background: item.bg,
              borderRadius: '12px',
              border: `1px solid ${item.border}`,
              textDecoration: 'none',
              color: 'inherit',
              opacity: visibleNavs.has(idx) ? 1 : 0,
              transform: visibleNavs.has(idx) ? 'translateX(0)' : 'translateX(-12px)',
              transition: 'all 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            }}
          >
            <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>{item.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: item.color }}>
                {item.label}
              </div>
              <div
                style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', marginTop: '2px' }}
              >
                {item.description}
              </div>
            </div>
            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '1rem' }}>→</span>
          </Link>
        ))}
      </div>

      {/* Footer Status */}
      <div
        style={{
          marginTop: '24px',
          padding: '12px 16px',
          background: 'rgba(255,255,255,0.02)',
          borderRadius: '10px',
          border: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.7rem',
          color: 'rgba(255,255,255,0.35)',
        }}
      >
        <span>Financial Engine v3.0 • All services operational</span>
        <span>
          System Health:{' '}
          {stats.lastCheckPassed === true
            ? '🟢 Passing'
            : stats.lastCheckPassed === false
              ? '🔴 Failing'
              : '⚪ Unknown'}
        </span>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { masterBus } from '../../core/MasterBus';
import './AnalyticsDashboard.css';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface PositionStat {
  position: string;
  hands_played: number;
  hands_won: number;
  total_profit: number;
  vpip_count: number;
  pfr_count: number;
  vpip_pct: number; // Computed client-side from vpip_count / hands_played
}

interface VipLedgerEntry {
  id: string;
  user_id: string;
  amount: number;
  transaction_type: string;
  description: string;
  created_at: string;
}

interface ClubAggregate {
  totalHands: number;
  totalRake: number;
  activePlayers: number;
  totalVipPointsIssued: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// POSITION COLORS (consistent across the chart)
// ═══════════════════════════════════════════════════════════════════════════════

const POSITION_COLORS: Record<string, string> = {
  BTN: 'linear-gradient(90deg, #22c55e, #16a34a)',
  CO: 'linear-gradient(90deg, #3b82f6, #2563eb)',
  HJ: 'linear-gradient(90deg, #a855f7, #9333ea)',
  MP: 'linear-gradient(90deg, #f59e0b, #d97706)',
  UTG: 'linear-gradient(90deg, #ef4444, #dc2626)',
  SB: 'linear-gradient(90deg, #06b6d4, #0891b2)',
  BB: 'linear-gradient(90deg, #ec4899, #db2777)',
};

const ALL_POSITIONS = ['BTN', 'CO', 'HJ', 'MP', 'UTG', 'SB', 'BB'];

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function AnalyticsDashboard() {
  const [positionStats, setPositionStats] = useState<PositionStat[]>([]);
  const [vipLedger, setVipLedger] = useState<VipLedgerEntry[]>([]);
  const [aggregate, setAggregate] = useState<ClubAggregate>({
    totalHands: 0,
    totalRake: 0,
    activePlayers: 0,
    totalVipPointsIssued: 0,
  });
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // ── Data loaders ────────────────────────────────────────────────────────

  const loadPositionStats = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('player_position_stats')
        .select('position, hands_played, hands_won, total_profit, vpip_count, pfr_count')
        .order('hands_played', { ascending: false })
        .limit(50);

      if (!error && data) {
        // Aggregate by position across all users
        const byPosition = new Map<string, PositionStat>();
        for (const row of data) {
          const existing = byPosition.get(row.position);
          if (existing) {
            existing.hands_played += row.hands_played || 0;
            existing.hands_won += row.hands_won || 0;
            existing.total_profit += row.total_profit || 0;
            existing.vpip_count += row.vpip_count || 0;
            existing.pfr_count += row.pfr_count || 0;
            existing.vpip_pct =
              existing.hands_played > 0
                ? Math.round((existing.vpip_count / existing.hands_played) * 100)
                : 0;
          } else {
            const hp = row.hands_played || 0;
            const vc = row.vpip_count || 0;
            byPosition.set(row.position, {
              position: row.position,
              hands_played: hp,
              hands_won: row.hands_won || 0,
              total_profit: row.total_profit || 0,
              vpip_count: vc,
              pfr_count: row.pfr_count || 0,
              vpip_pct: hp > 0 ? Math.round((vc / hp) * 100) : 0,
            });
          }
        }
        setPositionStats(Array.from(byPosition.values()));
      }
    } catch (err) {
      console.error('[AnalyticsDashboard] Error loading position stats:', err);
    }
  }, []);

  const loadVipLedger = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('vip_points_ledger')
        .select('id, user_id, amount, transaction_type, description, created_at')
        .order('created_at', { ascending: false })
        .limit(20);

      if (!error && data) {
        setVipLedger(data);
      }
    } catch (err) {
      console.error('[AnalyticsDashboard] Error loading VIP ledger:', err);
    }
  }, []);

  const loadAggregates = useCallback(async () => {
    try {
      // Total hands from position stats
      const { data: handData } = await supabase
        .from('player_position_stats')
        .select('hands_played');
      const totalHands = (handData || []).reduce((acc, r) => acc + (r.hands_played || 0), 0);

      // Total VIP points issued
      const { data: vipData } = await supabase
        .from('vip_points_ledger')
        .select('amount')
        .gt('amount', 0);
      const totalVip = (vipData || []).reduce((acc, r) => acc + (r.amount || 0), 0);

      // Active players (players with any position stats)
      const { data: playerData } = await supabase.from('player_position_stats').select('user_id');
      const uniquePlayers = new Set((playerData || []).map((r) => r.user_id));

      // Total rake from position stats total_profit (negative profit = rake)
      const totalRake = Math.abs(
        (handData || []).reduce(
          (acc, r) => acc + Math.min(0, r.hands_played ? -0.05 * r.hands_played : 0),
          0
        )
      );

      setAggregate({
        totalHands,
        totalRake: Math.round(totalRake * 100) / 100,
        activePlayers: uniquePlayers.size,
        totalVipPointsIssued: totalVip,
      });
    } catch (err) {
      console.error('[AnalyticsDashboard] Error loading aggregates:', err);
    }
  }, []);

  const refreshAll = useCallback(() => {
    loadPositionStats();
    loadVipLedger();
    loadAggregates();
    setLastRefresh(new Date());
  }, [loadPositionStats, loadVipLedger, loadAggregates]);

  // ── Mount & Bus listeners ───────────────────────────────────────────────

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    // Auto-refresh every 30 seconds
    const interval = setInterval(refreshAll, 30_000);
    return () => clearInterval(interval);
  }, [refreshAll]);

  useEffect(() => {
    // Debounce bus events — HAND_COMPLETED can fire very rapidly across many tables.
    // Without debounce, 30+ tables dealing simultaneously = 90+ queries/sec.
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(refreshAll, 5000); // 5s debounce
    };

    const unsubHand = masterBus.subscribe('HAND_COMPLETED', debouncedRefresh);
    const unsubSettlement = masterBus.subscribe('SETTLEMENT_COMPLETED', refreshAll);
    const unsubVip = masterBus.subscribe('MILESTONE_UNLOCKED', refreshAll);
    return () => {
      unsubHand();
      unsubSettlement();
      unsubVip();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [refreshAll]);

  // ── Computed values ─────────────────────────────────────────────────────

  const maxHandsPlayed = Math.max(1, ...positionStats.map((s) => s.hands_played));

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="analytics-dashboard">
      <header className="analytics-header">
        <h1>📊 Club Analytics Dashboard</h1>
        <p>
          Real-time player position stats and VIP economy overview
          <span className="refresh-indicator">
            <span className="refresh-dot" />
            Live — updated {lastRefresh.toLocaleTimeString()}
          </span>
        </p>
      </header>

      {/* ── Summary Cards ───────────────────────────────────────────────── */}
      <div className="analytics-summary">
        <div className="summary-card">
          <div className="label">Total Hands Tracked</div>
          <div className="value text-blue">{aggregate.totalHands.toLocaleString()}</div>
        </div>
        <div className="summary-card">
          <div className="label">Active Players</div>
          <div className="value text-green">{aggregate.activePlayers.toLocaleString()}</div>
        </div>
        <div className="summary-card">
          <div className="label">Est. Total Rake</div>
          <div className="value text-amber">${aggregate.totalRake.toLocaleString()}</div>
        </div>
        <div className="summary-card">
          <div className="label">VIP Points Issued</div>
          <div className="value text-purple">{aggregate.totalVipPointsIssued.toLocaleString()}</div>
        </div>
      </div>

      {/* ── Charts Grid ─────────────────────────────────────────────────── */}
      <div className="analytics-grid">
        {/* Position Win Rate Chart */}
        <div className="chart-card">
          <h3>Win Rate by Position</h3>
          {positionStats.length > 0 ? (
            <div className="position-bars">
              {ALL_POSITIONS.map((pos) => {
                const stat = positionStats.find((s) => s.position === pos);
                const winRate = stat
                  ? Math.round((stat.hands_won / Math.max(1, stat.hands_played)) * 100)
                  : 0;
                const barWidth = stat ? Math.round((stat.hands_played / maxHandsPlayed) * 100) : 0;

                return (
                  <div key={pos} className="position-bar-row">
                    <span className="position-label">{pos}</span>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{
                          width: `${Math.max(barWidth, 5)}%`,
                          background: POSITION_COLORS[pos] || '#6366f1',
                        }}
                      >
                        <span>{winRate}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <div className="icon">📈</div>
              <p>No position stats yet. Data populates as hands are dealt.</p>
            </div>
          )}
        </div>

        {/* VPIP by Position */}
        <div className="chart-card">
          <h3>VPIP % by Position</h3>
          {positionStats.length > 0 ? (
            <div className="position-bars">
              {ALL_POSITIONS.map((pos) => {
                const stat = positionStats.find((s) => s.position === pos);
                const vpip = stat?.vpip_pct || 0;

                return (
                  <div key={pos} className="position-bar-row">
                    <span className="position-label">{pos}</span>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{
                          width: `${Math.max(vpip, 3)}%`,
                          background: POSITION_COLORS[pos] || '#6366f1',
                        }}
                      >
                        <span>{vpip}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <div className="icon">🎯</div>
              <p>VPIP data populates as hands are dealt.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── VIP Points Ledger ───────────────────────────────────────────── */}
      <h2 className="section-header">Recent VIP Points Activity</h2>
      {vipLedger.length > 0 ? (
        <div className="chart-card">
          <table className="vip-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {vipLedger.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    {new Date(entry.created_at).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td>
                    <span className={`vip-type-badge ${entry.transaction_type}`}>
                      {(entry.transaction_type || 'unknown').toUpperCase()}
                    </span>
                  </td>
                  <td
                    style={{
                      color: entry.amount >= 0 ? '#22c55e' : '#ef4444',
                      fontWeight: 600,
                    }}
                  >
                    {entry.amount >= 0 ? '+' : ''}
                    {entry.amount.toLocaleString()}
                  </td>
                  <td style={{ color: '#94a3b8' }}>{entry.description || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart-card">
          <div className="empty-state">
            <div className="icon">💎</div>
            <p>No VIP points transactions yet.</p>
          </div>
        </div>
      )}
    </div>
  );
}

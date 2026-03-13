/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  RAKEBACK DASHBOARD — Player-Facing Rakeback Tier & Earnings View
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Shows the player their current rakeback tier, pending rakeback, and history.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { masterBus } from '../core/MasterBus';
import { useAuthUser } from '../hooks/useAuthUser';
import { useVisibilityRefresh } from '../hooks/useVisibilityRefresh';
import { useToast } from '../components/common/Toast';
import PageSkeleton from '../components/common/PageSkeleton';

interface RakebackStats {
  totalRakeContributed: number;
  totalRakebackEarned: number;
  pendingRakeback: number;
  currentTier: string;
  nextTier: string | null;
  tierProgress: number; // 0-100
  handsPlayed: number;
}

const TIERS = [
  { name: 'Bronze', minRake: 0, percent: 10, color: '#cd7f32', icon: '🥉' },
  { name: 'Silver', minRake: 100, percent: 15, color: '#c0c0c0', icon: '🥈' },
  { name: 'Gold', minRake: 500, percent: 20, color: '#ffd700', icon: '🥇' },
  { name: 'Platinum', minRake: 2000, percent: 25, color: '#e5e4e2', icon: '💎' },
  { name: 'Diamond', minRake: 10000, percent: 30, color: '#b9f2ff', icon: '👑' },
];

export default function RakebackDashboard() {
  const navigate = useNavigate();
  const { user } = useAuthUser();
  const toast = useToast();

  const [stats, setStats] = useState<RakebackStats>({
    totalRakeContributed: 0,
    totalRakebackEarned: 0,
    pendingRakeback: 0,
    currentTier: 'Bronze',
    nextTier: 'Silver',
    tierProgress: 0,
    handsPlayed: 0,
  });
  const [recentPayouts, setRecentPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleSections, setVisibleSections] = useState<Set<number>>(new Set());
  const isMounted = useRef(true);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  useVisibilityRefresh(() => loadData());

  useEffect(() => {
    loadData();
    [0, 1, 2, 3, 4].forEach((i) => {
      setTimeout(() => setVisibleSections((prev) => new Set(prev).add(i)), i * 80);
    });
  }, [user?.id]);

  useEffect(() => {
    const unsub = masterBus.subscribeDebounced('BALANCE_UPDATED', () => loadData(), 1000);
    const unsub2 = masterBus.subscribeDebounced('HAND_COMPLETED', () => loadData(), 2000);
    return () => {
      unsub();
      unsub2();
    };
  }, []);

  const loadData = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      // Count rake from wallet transactions
      const { data: rakeData } = await supabase
        .from('wallet_transactions')
        .select('amount')
        .eq('user_id', user.id)
        .eq('category', 'rake')
        .eq('type', 'debit');

      const totalRakeContributed = Math.abs(
        (rakeData || []).reduce((s, r) => s + (r.amount || 0), 0)
      );

      // Count rakeback credits
      const { data: rakebackData } = await supabase
        .from('wallet_transactions')
        .select('amount, created_at')
        .eq('user_id', user.id)
        .eq('category', 'rakeback')
        .eq('type', 'credit')
        .order('created_at', { ascending: false })
        .limit(20);

      const totalRakebackEarned = (rakebackData || []).reduce((s, r) => s + (r.amount || 0), 0);
      if (!isMounted.current) return;
      setRecentPayouts(rakebackData || []);

      // Determine tier
      let currentTierIdx = 0;
      for (let i = TIERS.length - 1; i >= 0; i--) {
        if (totalRakeContributed >= TIERS[i].minRake) {
          currentTierIdx = i;
          break;
        }
      }
      const currentTier = TIERS[currentTierIdx];
      const nextTier = currentTierIdx < TIERS.length - 1 ? TIERS[currentTierIdx + 1] : null;

      // Calculate progress to next tier
      let tierProgress = 100;
      if (nextTier) {
        const range = nextTier.minRake - currentTier.minRake;
        const progress = totalRakeContributed - currentTier.minRake;
        tierProgress = Math.min(100, (progress / range) * 100);
      }

      // Pending rakeback estimate
      const pendingRakeback =
        totalRakeContributed * (currentTier.percent / 100) - totalRakebackEarned;

      // Hands played (approximate from hand events)
      const { count: handsPlayed } = await supabase
        .from('wallet_transactions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('category', 'rake');

      if (!isMounted.current) return;
      setStats({
        totalRakeContributed,
        totalRakebackEarned,
        pendingRakeback: Math.max(0, pendingRakeback),
        currentTier: currentTier.name,
        nextTier: nextTier?.name || null,
        tierProgress,
        handsPlayed: handsPlayed || 0,
      });
    } catch (err) {
      if (!isMounted.current) return;
      console.error('[RakebackDashboard] Load failed:', err);
      toast.error('Failed to load rakeback data');
    }
    if (isMounted.current) setLoading(false);
  };

  const currentTierData = TIERS.find((t) => t.name === stats.currentTier) || TIERS[0];

  const sectionStyle = (idx: number): React.CSSProperties => ({
    opacity: visibleSections.has(idx) ? 1 : 0,
    transform: visibleSections.has(idx) ? 'translateY(0)' : 'translateY(10px)',
    transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
  });

  return (
    <div style={{ padding: '16px', maxWidth: '600px', margin: '0 auto', paddingBottom: '100px' }}>
      {/* Header */}
      {loading ? (
        <PageSkeleton variant="stats" />
      ) : (
        <>
          <div style={{ marginBottom: '24px', ...sectionStyle(0) }}>
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
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>
              🎰 Rakeback Dashboard
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
              Earn cashback on every hand you play
            </p>
          </div>

          {/* Current Tier */}
          <div
            style={{
              padding: '20px',
              background: `linear-gradient(135deg, rgba(255,255,255,0.03), ${currentTierData.color}15)`,
              borderRadius: '14px',
              border: `1px solid ${currentTierData.color}40`,
              marginBottom: '16px',
              textAlign: 'center',
              ...sectionStyle(1),
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '4px' }}>{currentTierData.icon}</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: currentTierData.color }}>
              {stats.currentTier} Tier
            </div>
            <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>
              {currentTierData.percent}% Rakeback Rate
            </div>

            {stats.nextTier && (
              <div style={{ marginTop: '12px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.65rem',
                    color: 'rgba(255,255,255,0.4)',
                    marginBottom: '4px',
                  }}
                >
                  <span>{stats.currentTier}</span>
                  <span>{stats.nextTier}</span>
                </div>
                <div
                  style={{
                    width: '100%',
                    height: '6px',
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: '3px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      background: `linear-gradient(90deg, ${currentTierData.color}, ${currentTierData.color}aa)`,
                      width: `${stats.tierProgress}%`,
                      borderRadius: '3px',
                      transition: 'width 0.8s ease',
                    }}
                  />
                </div>
                <div
                  style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}
                >
                  {stats.tierProgress.toFixed(0)}% to next tier
                </div>
              </div>
            )}
          </div>

          {/* Stats Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '10px',
              marginBottom: '16px',
              ...sectionStyle(2),
            }}
          >
            {[
              {
                label: 'Total Rake',
                value: stats.totalRakeContributed.toLocaleString(),
                icon: '🃏',
                color: '#f59e0b',
              },
              {
                label: 'Rakeback Earned',
                value: stats.totalRakebackEarned.toLocaleString(),
                icon: '💰',
                color: '#10b981',
              },
              {
                label: 'Pending',
                value: stats.pendingRakeback.toLocaleString(),
                icon: '⏳',
                color: '#8b5cf6',
              },
              {
                label: 'Hands Played',
                value: stats.handsPlayed.toLocaleString(),
                icon: '🎯',
                color: '#3b82f6',
              },
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  padding: '12px',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div
                  style={{
                    fontSize: '0.65rem',
                    color: 'rgba(255,255,255,0.4)',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                    letterSpacing: '0.5px',
                  }}
                >
                  {s.icon} {s.label}
                </div>
                <div
                  style={{
                    fontSize: '1.2rem',
                    fontWeight: 800,
                    color: s.color,
                    fontFamily: 'monospace',
                    marginTop: '4px',
                  }}
                >
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          {/* Tier Breakdown */}
          <div
            style={{
              padding: '16px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.06)',
              marginBottom: '16px',
              ...sectionStyle(3),
            }}
          >
            <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '10px' }}>
              📊 All Tiers
            </div>
            {TIERS.map((tier) => (
              <div
                key={tier.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '6px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}
              >
                <span style={{ fontSize: '1rem' }}>{tier.icon}</span>
                <span
                  style={{
                    flex: 1,
                    fontSize: '0.8rem',
                    fontWeight: stats.currentTier === tier.name ? 700 : 400,
                    color: stats.currentTier === tier.name ? tier.color : 'rgba(255,255,255,0.5)',
                  }}
                >
                  {tier.name}
                </span>
                <span
                  style={{
                    fontSize: '0.7rem',
                    color: 'rgba(255,255,255,0.4)',
                    fontFamily: 'monospace',
                  }}
                >
                  {tier.minRake.toLocaleString()} rake
                </span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: tier.color }}>
                  {tier.percent}%
                </span>
              </div>
            ))}
          </div>

          {/* Recent Payouts */}
          <div
            style={{
              padding: '16px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.06)',
              ...sectionStyle(4),
            }}
          >
            <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '10px' }}>
              💸 Recent Rakeback Payouts
            </div>
            {recentPayouts.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '20px',
                  color: 'rgba(255,255,255,0.3)',
                  fontSize: '0.8rem',
                }}
              >
                No payouts yet — keep playing!
              </div>
            ) : (
              recentPayouts.slice(0, 10).map((p, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '6px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    fontSize: '0.8rem',
                  }}
                >
                  <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {new Date(p.created_at).toLocaleDateString()}
                  </span>
                  <span style={{ color: '#10b981', fontWeight: 700, fontFamily: 'monospace' }}>
                    +{p.amount?.toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

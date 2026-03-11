/**
 *  BAD BEAT JACKPOT PAGE — Live Jackpot Updates
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { masterBus } from '../core/MasterBus';
import { useUserStore } from '../stores/useUserStore';
import { useToast } from '../components/common/Toast';
import ClubBottomNav from '../components/club/ClubBottomNav';
import './BadBeatJackpotPage.css';

interface JackpotInfo {
  id: string;
  club_id: string;
  pool_amount: number;
  main_balance: number;
  backup_balance: number;
  promo_balance: number;
  hands_contributed: number;
  last_hit_at?: string;
  last_hit_amount?: number;
}

interface JackpotHistory {
  id: string;
  awarded_at: string;
  total_payout: number;
  winner_hand: string;
  loser_hand: string;
  winner_display_name?: string;
  loser_display_name?: string;
}

export default function BadBeatJackpotPage() {
  const navigate = useNavigate();
  const { clubId } = useParams();
  const { user } = useUserStore();
  const toast = useToast();

  const [jackpot, setJackpot] = useState<JackpotInfo | null>(null);
  const [history, setHistory] = useState<JackpotHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [justUpdated, setJustUpdated] = useState(false);
  const [visibleHistoryRows, setVisibleHistoryRows] = useState(new Set<number>());
  const [playerContribution, setPlayerContribution] = useState(0);
  const prevAmountRef = useRef<number>(0);

  useEffect(() => {
    if (clubId) {
      loadJackpotData();

      // Real-time jackpot updates
      const channelKey = 'jackpot-live';

      const channel = masterBus.getOrCreateChannel(channelKey);
      channel
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'bbj_pools',
            filter: `club_id=eq.${clubId}`,
          },
          (payload) => {
            // Jackpot updated!
            const newData = payload.new as JackpotInfo;
            if (newData.pool_amount > prevAmountRef.current) {
              setJustUpdated(true);
              setTimeout(() => setJustUpdated(false), 2000);
            }
            prevAmountRef.current = newData.pool_amount;
            setJackpot(newData);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'bbj_winners',
            filter: `club_id=eq.${clubId}`,
          },
          (payload) => {
            // Jackpot hit!
            toast.success(' BAD BEAT JACKPOT HIT!');
            loadJackpotData();
          }
        )
        .subscribe();

      return () => {
        masterBus.removeRegisteredChannel(channelKey);
      };
    }
  }, [clubId]);

  const loadJackpotData = useCallback(async () => {
    setLoading(true);
    try {
      // Load jackpot info from bbj_pools
      const { data: jackpotData } = await supabase
        .from('bbj_pools')
        .select('*')
        .eq('club_id', clubId)
        .maybeSingle();

      if (jackpotData) {
        setJackpot(jackpotData);
        prevAmountRef.current = jackpotData.pool_amount;
      }

      // Load history from bbj_winners
      const { data: historyData } = await supabase
        .from('bbj_winners')
        .select('*')
        .eq('club_id', clubId)
        .order('awarded_at', { ascending: false })
        .limit(10);

      if (historyData) {
        setHistory(historyData);
      }

      // Load player's personal contribution
      if (user?.id) {
        const { data: contribData } = await supabase
          .from('bbj_contributions')
          .select('amount')
          .eq('club_id', clubId)
          .eq('player_id', user.id);

        const total = (contribData || []).reduce((sum, c) => sum + (c.amount || 0), 0);
        setPlayerContribution(total);
      }
    } catch (error) {
      console.error('Failed to load jackpot:', error);
      toast.error('Failed to load jackpot data.');
    }
    setLoading(false);
  }, [clubId]);

  // Stagger history rows
  useEffect(() => {
    setVisibleHistoryRows(new Set());
    const timers = history.map((_, i) =>
      setTimeout(() => setVisibleHistoryRows((prev) => new Set([...prev, i])), i * 50)
    );
    return () => timers.forEach((t) => clearTimeout(t));
  }, [history.length]);

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="bbj-page">
        <div className="loading-state">
          <div className="spinner" />
        </div>
        {clubId && <ClubBottomNav clubId={clubId} />}
      </div>
    );
  }

  return (
    <div className="bbj-page">
      {/* Current Jackpot — Main Balance */}
      <div className="jackpot-display">
        <div className="jackpot-glow" />
        <span className="jackpot-label">Main Jackpot</span>
        <span className="jackpot-amount">
          {(jackpot?.main_balance || jackpot?.pool_amount || 0).toLocaleString()}
        </span>
      </div>

      {/* Triple-Bank Breakdown */}
      <div className="jackpot-info" style={{ marginBottom: '0.5rem' }}>
        <div
          className="info-card"
          style={{
            border: '1px solid rgba(0, 122, 255, 0.3)',
            background: 'rgba(0, 122, 255, 0.08)',
          }}
        >
          <span className="info-label">🏦 Backup Pool</span>
          <span className="info-value" style={{ color: '#007aff' }}>
            {(jackpot?.backup_balance || 0).toLocaleString()} chips
          </span>
        </div>
        <div
          className="info-card"
          style={{
            border: '1px solid rgba(175, 82, 222, 0.3)',
            background: 'rgba(175, 82, 222, 0.08)',
          }}
        >
          <span className="info-label">🎁 Promo Pool</span>
          <span className="info-value" style={{ color: '#af52de' }}>
            {(jackpot?.promo_balance || 0).toLocaleString()} chips
          </span>
        </div>
      </div>

      {/* Info Cards */}
      <div className="jackpot-info">
        <div className="info-card">
          <span className="info-label">Qualifying Hand</span>
          <span className="info-value">Quad 2s or better beaten</span>
        </div>
        <div className="info-card">
          <span className="info-label">Hands Dealt</span>
          <span className="info-value">{(jackpot?.hands_contributed || 0).toLocaleString()}</span>
        </div>
        {playerContribution > 0 && (
          <div
            className="info-card"
            style={{
              border: '1px solid rgba(52, 199, 89, 0.3)',
              background: 'rgba(52, 199, 89, 0.08)',
            }}
          >
            <span className="info-label">Your Contribution</span>
            <span className="info-value" style={{ color: '#34c759' }}>
              {playerContribution.toLocaleString()} chips
            </span>
          </div>
        )}
      </div>

      {/* Payout Structure */}
      <div className="payout-structure">
        <h3>Payout Structure</h3>
        <div className="payout-bars">
          <div className="payout-bar">
            <span className="payout-label">Loser (Bad Beat)</span>
            <div className="bar-fill" style={{ width: '50%' }} />
            <span className="payout-percent">50%</span>
          </div>
          <div className="payout-bar">
            <span className="payout-label">Winner</span>
            <div className="bar-fill" style={{ width: '25%' }} />
            <span className="payout-percent">25%</span>
          </div>
          <div className="payout-bar">
            <span className="payout-label">Table Share</span>
            <div className="bar-fill" style={{ width: '25%' }} />
            <span className="payout-percent">25%</span>
          </div>
        </div>
      </div>

      {/* History */}
      <div className="jackpot-history">
        <h3>Recent Hits</h3>
        {history.length === 0 ? (
          <div className="empty-state">
            <p>No jackpot hits yet. Will you be the first?</p>
          </div>
        ) : (
          <div className="history-list">
            {history.map((hit, index) => (
              <div
                key={hit.id}
                className="history-row"
                style={{
                  opacity: visibleHistoryRows.has(index) ? 1 : 0,
                  transform: visibleHistoryRows.has(index) ? 'translateY(0)' : 'translateY(8px)',
                  transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                }}
              >
                <div className="hit-info">
                  <span className="hit-date">{formatDate(hit.awarded_at)}</span>
                  <span className="hit-hands">
                    {hit.loser_hand} beat by {hit.winner_hand}
                  </span>
                </div>
                <div className="hit-amount">{hit.total_payout.toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      {clubId && <ClubBottomNav clubId={clubId} />}
    </div>
  );
}

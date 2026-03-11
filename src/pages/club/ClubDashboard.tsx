/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CLUB DASHBOARD — Comprehensive Club Analytics
 * ═══════════════════════════════════════════════════════════════════════════════
 * Full analytics dashboard for club owners and admins
 * Features:
 * - Club Stats Cards with key metrics
 * - Activity Feed with real-time updates
 * - Leaderboard for top players
 * - Quick actions for club management
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { masterBus } from '../../core/MasterBus';
import { useUserStore } from '../../stores/useUserStore';
import { getLocalStorage, setLocalStorage } from '../../lib/storage';
import ClubStatsCards from '../../components/club/ClubStatsCards';
import ClubActivityFeed from '../../components/club/ClubActivityFeed';
import LeaderboardCard from '../../components/leaderboard/LeaderboardCard';
import ClubBottomNav from '../../components/club/ClubBottomNav';
import styles from './ClubDashboard.module.css';

interface ClubInfo {
  id: string;
  name: string;
  avatarUrl?: string;
  memberCount: number;
  tableCount: number;
  createdAt: string;
}

interface TopPlayer {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  totalProfit: number;
  handsPlayed: number;
  rank: number;
}

export default function ClubDashboard() {
  const [searchParams] = useSearchParams();
  const { clubId: routeClubId } = useParams<{ clubId?: string }>();
  const clubId = routeClubId || searchParams.get('club') || undefined;
  const { user } = useUserStore();
  const [club, setClub] = useState<ClubInfo | null>(null);
  const [topPlayers, setTopPlayers] = useState<TopPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'activity' | 'players' | 'tables'>(() =>
    getLocalStorage('ca_dashboard_tab', 'overview')
  );
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'all'>(() =>
    getLocalStorage('ca_dashboard_range', 'week')
  );
  const [visiblePlayers, setVisiblePlayers] = useState<Set<number>>(new Set());
  useEffect(() => {
    setLocalStorage('ca_dashboard_tab', activeTab);
  }, [activeTab]);
  useEffect(() => {
    setLocalStorage('ca_dashboard_range', dateRange);
  }, [dateRange]);
  const [userRole, setUserRole] = useState<'owner' | 'admin' | 'agent' | 'member'>('member');

  // Store refs to avoid stale closures in subscription callbacks
  const clubRefRef = useRef(club);
  const topPlayersRefRef = useRef(topPlayers);

  useEffect(() => {
    clubRefRef.current = club;
  }, [club]);

  useEffect(() => {
    topPlayersRefRef.current = topPlayers;
  }, [topPlayers]);

  useEffect(() => {
    if (clubId) {
      loadDashboardData();
    }
  }, [clubId, dateRange]);

  // Leaderboard player stagger animation
  useEffect(() => {
    setVisiblePlayers(new Set());
    topPlayers.forEach((_, i) => {
      setTimeout(() => setVisiblePlayers((prev) => new Set(prev).add(i)), i * 60);
    });
  }, [topPlayers]);

  // Real-time subscription for table changes
  useEffect(() => {
    if (!clubId) return;

    const channelKey = `club-dashboard-tables-${clubId}`;

    const channel = masterBus.getOrCreateChannel(channelKey);
    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tables',
          filter: `club_id=eq.${clubId}`,
        },
        () => {
          loadDashboardData();
        }
      )
      .subscribe();

    return () => {
      masterBus.removeRegisteredChannel(channelKey);
    };
  }, [clubId]);

  // Real-time subscription for club member changes
  useEffect(() => {
    if (!clubId) return;

    const channelKey = `club-dashboard-members-${clubId}`;

    const channel = masterBus.getOrCreateChannel(channelKey);
    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'club_members',
          filter: `club_id=eq.${clubId}`,
        },
        () => {
          loadDashboardData();
        }
      )
      .subscribe();

    return () => {
      masterBus.removeRegisteredChannel(channelKey);
    };
  }, [clubId]);

  // Real-time subscription for hand history (to update stats)
  useEffect(() => {
    if (!clubId) return;

    const channelKey = `club-dashboard-hands-${clubId}`;

    const channel = masterBus.getOrCreateChannel(channelKey);
    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'hand_history',
          filter: `club_id=eq.${clubId}`,
        },
        () => {
          loadDashboardData();
        }
      )
      .subscribe();

    return () => {
      masterBus.removeRegisteredChannel(channelKey);
    };
  }, [clubId]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Load club info
      const { data: clubData } = await supabase
        .from('clubs')
        .select('id, name, avatar_url, created_at')
        .eq('id', clubId)
        .single();

      if (clubData) {
        // Get member count — exclude horses
        const { count: memberCount } = await supabase
          .from('club_members')
          .select('user_id, profiles!inner(id)', { count: 'exact', head: true })
          .eq('club_id', clubId)
          .eq('profiles.is_horse', false);

        // Get table count
        const { count: tableCount } = await supabase
          .from('tables')
          .select('*', { count: 'exact', head: true })
          .eq('club_id', clubId);

        setClub({
          id: clubData.id,
          name: clubData.name,
          avatarUrl: clubData.avatar_url,
          memberCount: memberCount || 0,
          tableCount: tableCount || 0,
          createdAt: clubData.created_at,
        });
      }

      // Load top players by profit (chips_won - chips_lost)
      // Fetch extra candidates since profit != chips_won rank; re-sort client-side
      const { data: playersData } = await supabase
        .from('club_members')
        .select(
          `
                    user_id,
                    chips_won,
                    chips_lost,
                    hands_played,
                    profiles!inner(display_name, avatar_url, is_horse)
                `
        )
        .eq('club_id', clubId)
        .eq('profiles.is_horse', false)
        .order('chips_won', { ascending: false })
        .limit(50);

      if (playersData) {
        const sorted = playersData
          .map((p: any) => ({
            userId: p.user_id,
            displayName: p.profiles?.display_name || 'Player',
            avatarUrl: p.profiles?.avatar_url,
            totalProfit: (p.chips_won || 0) - (p.chips_lost || 0),
            handsPlayed: p.hands_played || 0,
            rank: 0,
          }))
          .sort((a: any, b: any) => b.totalProfit - a.totalProfit)
          .slice(0, 10)
          .map((p: any, idx: number) => ({ ...p, rank: idx + 1 }));
        setTopPlayers(sorted);
      }
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    }
    setLoading(false);
  };

  const formatChips = (num: number): string => {
    return (Math.trunc(num * 100) / 100).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatInt = (num: number): string => {
    return Math.trunc(num).toLocaleString('en-US');
  };

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <p>Loading dashboard...</p>
      </div>
    );
  }

  if (!club) {
    return (
      <div className={styles.error}>
        <h2>Club Not Found</h2>
        <Link to="/clubs">← Back to Clubs</Link>
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      {/* Dashboard Header */}
      <header className={styles.header}>
        <div className={styles.clubInfo}>
          <div className={styles.clubAvatar}>
            {club.avatarUrl ? (
              <img src={club.avatarUrl} alt={club.name} />
            ) : (
              <span>{club.name.charAt(0)}</span>
            )}
          </div>
          <div className={styles.clubMeta}>
            <h1>{club.name}</h1>
            <p>
              {club.memberCount} members • {club.tableCount} tables
            </p>
          </div>
        </div>
        <div className={styles.quickActions}>
          <Link to={`/clubs/${clubId}/create-table`} className={styles.actionBtn}>
            ➕ New Table
          </Link>
          <Link to={`/clubs/${clubId}/announcements`} className={styles.actionBtn}>
            Announce
          </Link>
          <Link to={`/clubs/${clubId}/settings`} className={styles.actionBtn}>
            Settings
          </Link>
        </div>
      </header>

      {/* Date Range Filter */}
      <div className={styles.filterBar}>
        <span className={styles.filterLabel}> Time Range:</span>
        <div className={styles.filterButtons}>
          {(['today', 'week', 'month', 'all'] as const).map((range) => (
            <button
              key={range}
              className={`${styles.filterBtn} ${dateRange === range ? styles.active : ''}`}
              onClick={() => setDateRange(range)}
            >
              {range.charAt(0).toUpperCase() + range.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Navigation */}
      <nav className={styles.tabNav}>
        {[
          { id: 'overview', label: ' Overview', icon: '' },
          { id: 'activity', label: '📡 Activity', icon: '📡' },
          { id: 'players', label: ' Players', icon: '' },
          { id: 'tables', label: ' Tables', icon: '' },
        ].map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''}`}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Tab Content */}
      <div className={styles.content}>
        {activeTab === 'overview' && (
          <div className={styles.overviewGrid}>
            {/* Stats Cards */}
            <section className={styles.statsSection}>
              <h2> Club Metrics</h2>
              {clubId && <ClubStatsCards clubId={clubId} />}
            </section>

            {/* Top Players Leaderboard */}
            <section className={styles.leaderboardSection}>
              <h2> Top Players</h2>
              <div className={styles.leaderboard}>
                {topPlayers.length === 0 ? (
                  <p className={styles.empty}>No player data yet</p>
                ) : (
                  topPlayers.map((player, idx) => (
                    <div
                      key={player.userId}
                      className={styles.playerRow}
                      style={{
                        opacity: visiblePlayers.has(idx) ? 1 : 0,
                        transform: visiblePlayers.has(idx) ? 'translateY(0)' : 'translateY(8px)',
                        transition: 'all 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                      }}
                    >
                      <span className={styles.rank}>
                        {player.rank <= 3 ? ['', '', ''][player.rank - 1] : `#${player.rank}`}
                      </span>
                      <div className={styles.playerAvatar}>
                        {player.avatarUrl ? <img src={player.avatarUrl} alt="" /> : ''}
                      </div>
                      <span className={styles.playerName}>{player.displayName}</span>
                      <span
                        className={`${styles.profit} ${player.totalProfit >= 0 ? styles.positive : styles.negative}`}
                      >
                        {player.totalProfit >= 0 ? '+' : ''}
                        {formatChips(player.totalProfit)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Quick Activity Preview */}
            <section className={styles.activityPreview}>
              <h2>📡 Recent Activity</h2>
              {clubId && <ClubActivityFeed clubId={clubId} limit={5} />}
              <Link to={`/clubs/${clubId}/dashboard?tab=activity`} className={styles.viewAllLink}>
                View All Activity →
              </Link>
            </section>
          </div>
        )}

        {activeTab === 'activity' && (
          <div className={styles.activityFull}>
            <h2>📡 Club Activity Feed</h2>
            {clubId && <ClubActivityFeed clubId={clubId} limit={50} />}
          </div>
        )}

        {activeTab === 'players' && (
          <div className={styles.playersSection}>
            <div className={styles.sectionHeader}>
              <h2> Club Members ({club.memberCount})</h2>
              <Link to={`/clubs/${clubId}/members`} className={styles.manageLink}>
                Manage Members →
              </Link>
            </div>
            <div className={styles.playersList}>
              {topPlayers.map((player) => (
                <div key={player.userId} className={styles.playerCard}>
                  <div className={styles.playerAvatar}>
                    {player.avatarUrl ? <img src={player.avatarUrl} alt="" /> : ''}
                  </div>
                  <div className={styles.playerInfo}>
                    <span className={styles.playerName}>{player.displayName}</span>
                    <span className={styles.playerStats}>
                      {formatInt(player.handsPlayed)} hands played
                    </span>
                  </div>
                  <span
                    className={`${styles.profit} ${player.totalProfit >= 0 ? styles.positive : styles.negative}`}
                  >
                    {player.totalProfit >= 0 ? '+' : ''}
                    {formatChips(player.totalProfit)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'tables' && (
          <div className={styles.tablesSection}>
            <div className={styles.sectionHeader}>
              <h2> Club Tables ({club.tableCount})</h2>
              <Link to={`/clubs/${clubId}/create-table`} className={styles.createBtn}>
                + Create Table
              </Link>
            </div>
            <Link to={`/clubs/${clubId}/lobby`} className={styles.lobbyLink}>
              View Table Lobby →
            </Link>
          </div>
        )}
      </div>

      {clubId && <ClubBottomNav clubId={clubId} userRole={userRole} />}
    </div>
  );
}

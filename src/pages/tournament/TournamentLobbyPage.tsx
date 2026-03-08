/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  TOURNAMENT LOBBY PAGE — Browse & Register for Tournaments
 * ═══════════════════════════════════════════════════════════════════════════════
 * Central hub for discovering and joining tournaments across all clubs
 */

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../stores/useUserStore';
import { tournamentService } from '../../services/TournamentService';
import TournamentLobbyCard from '../../components/tournament/TournamentLobbyCard';
import { CardSkeleton } from '../../components/skeletons/CardSkeleton';
import SmarterHeader from '../../components/layout/SmarterHeader';
import { useToast } from '../../components/common/Toast';
import { ArenaTrainingController } from '../../services/ArenaTrainingController';
import styles from './TournamentLobbyPage.module.css';

type TournamentStatus = 'all' | 'upcoming' | 'REGISTERING' | 'RUNNING' | 'COMPLETED';
type TournamentTypeFilter = 'all' | 'mtt' | 'sng' | 'spin' | 'bounty' | 'pko' | 'mystery';

interface Tournament {
    id: string;
    name: string;
    clubId: string;
    clubName: string;
    buyIn: number;
    prizePool: number;
    guaranteedPrize: number;
    startTime: string;
    status: 'ANNOUNCED' | 'REGISTERING' | 'RUNNING' | 'COMPLETED' | 'CANCELLED';
    currentPlayers: number;
    maxPlayers: number;
    startingChips: number;
    blindsUp: number;
    isRegistered: boolean;
    gameType: string;
    lateRegMins: number;
    isRebuy: boolean;
    variant: string;
    tournamentType: string;
    isBounty: boolean;
    isPko: boolean;
    isMysteryBounty: boolean;
    bountyAmount: number;
    isMultiDay: boolean;
    isPinned: boolean;
}

export default function TournamentLobbyPage() {
    const { clubId } = useParams<{ clubId?: string }>();
    const { user } = useUserStore();
    const toast = useToast();
    const [tournaments, setTournaments] = useState<Tournament[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<TournamentStatus>('all');
    const [typeFilter, setTypeFilter] = useState<TournamentTypeFilter>('all');
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        loadTournaments();
    }, [clubId, statusFilter]);

    // Subscribe to realtime tournament updates
    useEffect(() => {
        const channel = supabase
            .channel('tournament-lobby-updates')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'tournaments',
                },
                (payload) => {
                    if (payload.eventType === 'UPDATE') {
                        // Update tournament in list
                        setTournaments(prev => prev.map(t =>
                            t.id === payload.new.id
                                ? {
                                    ...t,
                                    currentPlayers: payload.new.current_players,
                                    prizePool: payload.new.prize_pool,
                                    status: payload.new.status,
                                }
                                : t
                        ));
                    } else if (payload.eventType === 'INSERT') {
                        // Reload to get new tournament with club name
                        loadTournaments();
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [clubId]);

    const loadTournaments = async () => {
        setLoading(true);
        try {
            // Fetch active tournaments first (REGISTERING/RUNNING/ANNOUNCED), then completed
            // Two queries to ensure active tournaments always appear regardless of limit
            const fields = `
                    id,
                    name,
                    club_id,
                    buy_in_amount,
                    buy_in_fee,
                    prize_pool,
                    guaranteed_prize,
                    start_time,
                    status,
                    current_players,
                    max_players,
                    starting_chips,
                    game_type,
                    variant,
                    tournament_type,
                    late_reg_mins,
                    is_rebuy,
                    is_bounty,
                    is_pko,
                    is_mystery_bounty,
                    bounty_amount,
                    is_multi_day,
                    is_pinned,
                    clubs!club_id(name)
                `;

            // 72-hour display window: only show tournaments starting within 72h (or already running)
            const now = new Date();
            const seventyTwoHoursOut = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();

            let activeQuery = supabase.from('tournaments').select(fields)
                .in('status', ['ANNOUNCED', 'REGISTERING', 'RUNNING'])
                .lte('start_time', seventyTwoHoursOut)
                .order('is_pinned', { ascending: false })
                .order('start_time', { ascending: true });

            // Also fetch pinned tournaments regardless of start_time
            let pinnedQuery = supabase.from('tournaments').select(fields)
                .eq('is_pinned', true)
                .in('status', ['ANNOUNCED', 'REGISTERING', 'RUNNING'])
                .gt('start_time', seventyTwoHoursOut)
                .order('start_time', { ascending: true });

            let completedQuery = supabase.from('tournaments').select(fields)
                .in('status', ['COMPLETED', 'CANCELLED'])
                .order('start_time', { ascending: false })
                .limit(30);

            if (clubId) {
                activeQuery = activeQuery.eq('club_id', clubId);
                pinnedQuery = pinnedQuery.eq('club_id', clubId);
                completedQuery = completedQuery.eq('club_id', clubId);
            }

            // Apply status filter
            let data: any[] = [];
            let error: any = null;
            if (statusFilter === 'all' || statusFilter === 'upcoming') {
                const [activeRes, pinnedRes, completedRes] = await Promise.all([activeQuery, pinnedQuery, completedQuery]);
                error = activeRes.error || pinnedRes.error || completedRes.error;
                const active = activeRes.data || [];
                const pinned = pinnedRes.data || [];
                const completed = statusFilter === 'upcoming' ? [] : (completedRes.data || []);
                // Merge pinned (beyond 72h) with active, deduplicate by id
                const seen = new Set<string>();
                const merged: any[] = [];
                for (const t of [...pinned, ...active]) {
                    if (!seen.has(t.id)) { seen.add(t.id); merged.push(t); }
                }
                data = [...merged, ...completed];
            } else if (statusFilter === 'REGISTERING') {
                const res = await supabase.from('tournaments').select(fields).eq('status', 'REGISTERING').order('start_time', { ascending: true }).limit(50);
                data = res.data || []; error = res.error;
            } else if (statusFilter === 'RUNNING') {
                const res = await supabase.from('tournaments').select(fields).eq('status', 'RUNNING').order('start_time', { ascending: true }).limit(50);
                data = res.data || []; error = res.error;
            } else if (statusFilter === 'COMPLETED') {
                const res = await supabase.from('tournaments').select(fields).eq('status', 'COMPLETED').order('start_time', { ascending: false }).limit(50);
                data = res.data || []; error = res.error;
            }

            if (!error && data) {
                // Check which tournaments user is registered for
                let registrations: string[] = [];
                if (user?.id) {
                    const { data: regData } = await supabase
                        .from('tournament_players')
                        .select('tournament_id')
                        .eq('user_id', user.id);
                    registrations = regData?.map(r => r.tournament_id) || [];
                }

                const mapped: Tournament[] = data.map((t: any) => ({
                    id: t.id,
                    name: t.name,
                    clubId: t.club_id,
                    clubName: (t.clubs as any)?.name || 'Club',
                    buyIn: t.buy_in_amount || 0,
                    prizePool: t.prize_pool || 0,
                    startTime: t.start_time,
                    status: t.status,
                    currentPlayers: t.current_players || 0,
                    maxPlayers: t.max_players || 0, // 0 = unlimited (only SNG/Spin have caps)
                    startingChips: t.starting_chips || 0,
                    blindsUp: 10,
                    isRegistered: registrations.includes(t.id),
                    gameType: t.game_type || 'NLH',
                    lateRegMins: t.late_reg_mins || 0,
                    isRebuy: t.is_rebuy || false,
                    guaranteedPrize: t.guaranteed_prize || 0,
                    variant: t.variant || 'freezeout',
                    tournamentType: t.tournament_type || 'MTT',
                    isBounty: t.is_bounty || false,
                    isPko: t.is_pko || false,
                    isMysteryBounty: t.is_mystery_bounty || false,
                    bountyAmount: t.bounty_amount || 0,
                    isMultiDay: t.is_multi_day || false,
                    isPinned: t.is_pinned || false,
                }));

                setTournaments(mapped);
            }
        } catch (error) {
            console.error('Failed to load tournaments:', error);
        }
        setLoading(false);
    };

    const handleRegister = async (tournamentId: string) => {
        if (!user?.id) return;
        try {
            await tournamentService.registerPlayer(tournamentId, user.id, user.username || 'Player');
            toast.success('Registered! Buy-in deducted from your wallet');
            loadTournaments();
        } catch (error) {
            console.error('Registration failed:', error);
            const msg = (error as Error).message || 'Unknown error';
            toast.error(`Registration failed: ${msg}`);
            throw error; // Re-throw so card can react
        }
    };

    const handleUnregister = async (tournamentId: string) => {
        if (!user?.id) return;
        try {
            await tournamentService.unregisterPlayer(tournamentId, user.id);
            toast.success('Unregistered — buy-in refunded to your wallet');
            loadTournaments();
        } catch (error) {
            console.error('Unregistration failed:', error);
            const msg = (error as Error).message || 'Unknown error';
            toast.error(`Unregistration failed: ${msg}`);
        }
    };

    const filteredTournaments = tournaments.filter(t => {
        // Text search
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            if (!t.name.toLowerCase().includes(query) && !t.clubName.toLowerCase().includes(query)) {
                return false;
            }
        }
        // Type filter
        if (typeFilter !== 'all') {
            switch (typeFilter) {
                case 'mtt': return t.variant === 'freezeout' && !t.isBounty && !t.isPko && !t.isMysteryBounty;
                case 'sng': return t.variant === 'sng';
                case 'spin': return t.variant === 'spin';
                case 'bounty': return t.isBounty && !t.isPko && !t.isMysteryBounty;
                case 'pko': return t.isPko;
                case 'mystery': return t.isMysteryBounty;
            }
        }
        return true;
    }).sort((a, b) => {
        // Pinned tournaments always first
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        // Then by status priority: RUNNING > REGISTERING > ANNOUNCED > COMPLETED
        const statusPriority: Record<string, number> = { RUNNING: 0, REGISTERING: 1, ANNOUNCED: 2, COMPLETED: 3, CANCELLED: 4 };
        const aPriority = statusPriority[a.status] ?? 5;
        const bPriority = statusPriority[b.status] ?? 5;
        if (aPriority !== bPriority) return aPriority - bPriority;
        // Then by start time
        return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    });

    const upcomingCount = tournaments.filter(t => ['ANNOUNCED', 'REGISTERING'].includes(t.status)).length;
    const runningCount = tournaments.filter(t => t.status === 'RUNNING').length;

    return (
        <div className={styles.page}>
            <SmarterHeader title={clubId ? " Club Tournaments" : " Tournament Lobby"} />

            {/* Quick Stats */}
            <div className={styles.quickStats}>
                <div className={styles.stat}>
                    <span className={styles.statValue}>{upcomingCount}</span>
                    <span className={styles.statLabel}>Upcoming</span>
                </div>
                <div className={styles.stat}>
                    <span className={styles.statValue}>{runningCount}</span>
                    <span className={styles.statLabel}>Live Now</span>
                </div>
                <div className={styles.stat}>
                    <span className={styles.statValue}>{tournaments.length}</span>
                    <span className={styles.statLabel}>Total</span>
                </div>
            </div>

            {/* Search */}
            <div className={styles.searchBar}>
                <input
                    type="text"
                    placeholder="Search tournaments..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={styles.searchInput}
                />
            </div>

            {/* Status Filters */}
            <div className={styles.filters}>
                <div className={styles.filterGroup}>
                    {(['all', 'upcoming', 'REGISTERING', 'RUNNING', 'COMPLETED'] as TournamentStatus[]).map(status => (
                        <button
                            key={status}
                            className={`${styles.filterBtn} ${statusFilter === status ? styles.active : ''}`}
                            onClick={() => setStatusFilter(status as TournamentStatus)}
                        >
                            {status === 'all' ? 'All' :
                                status === 'upcoming' ? 'Upcoming' :
                                    status === 'REGISTERING' ? 'Registering' :
                                        status === 'RUNNING' ? 'Live' :
                                            'Completed'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Type Filters */}
            <div className={styles.filters}>
                <div className={styles.filterGroup}>
                    {(['all', 'mtt', 'sng', 'spin', 'bounty', 'pko', 'mystery'] as TournamentTypeFilter[]).map(tf => (
                        <button
                            key={tf}
                            className={`${styles.filterBtn} ${styles.typeBtn} ${typeFilter === tf ? styles.active : ''}`}
                            onClick={() => setTypeFilter(tf as TournamentTypeFilter)}
                        >
                            {tf === 'all' ? 'All Types' :
                                tf === 'mtt' ? 'MTT' :
                                    tf === 'sng' ? 'SNG' :
                                        tf === 'spin' ? 'Spin' :
                                            tf === 'bounty' ? 'Bounty' :
                                                tf === 'pko' ? 'PKO' :
                                                    'Mystery'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tournament List */}
            <div className={styles.tournamentList}>
                {loading ? (
                    <div className={styles.skeletonGrid}>
                        {[1, 2, 3, 4].map(i => (
                            <CardSkeleton key={i} hasImage={false} lines={4} />
                        ))}
                    </div>
                ) : filteredTournaments.length === 0 ? (
                    <div className={styles.empty}>
                        <span className={styles.emptyIcon}></span>
                        <p>No tournaments found</p>
                        {clubId && (
                            <Link to={`/clubs/${clubId}/create-tournament`} className={styles.createBtn}>
                                + Create Tournament
                            </Link>
                        )}
                    </div>
                ) : (
                    filteredTournaments.map(tournament => (
                        <TournamentLobbyCard
                            key={tournament.id}
                            tournament={{
                                id: tournament.id,
                                name: tournament.name,
                                type: tournament.variant === 'sng' ? 'sng' : tournament.variant === 'spin' ? 'spin' : 'mtt',
                                buyIn: tournament.buyIn,
                                prizePool: tournament.prizePool,
                                maxPlayers: tournament.maxPlayers,
                                registeredPlayers: tournament.currentPlayers,
                                startsAt: tournament.startTime,
                                status: tournament.status === 'COMPLETED' ? 'finished' : tournament.status === 'ANNOUNCED' ? 'registering' : tournament.status === 'REGISTERING' ? 'registering' : tournament.status === 'RUNNING' ? 'running' : 'cancelled',
                                blindStructure: `${tournament.blindsUp}m`,
                                gameType: tournament.gameType,
                                startingChips: tournament.startingChips,
                                lateRegMins: tournament.lateRegMins,
                                isRebuy: tournament.isRebuy,
                                guaranteedPrize: tournament.guaranteedPrize,
                                isBounty: tournament.isBounty,
                                isPko: tournament.isPko,
                                isMysteryBounty: tournament.isMysteryBounty,
                                bountyAmount: tournament.bountyAmount,
                                isMultiDay: tournament.isMultiDay,
                                isPinned: tournament.isPinned,
                            }}
                            onRegister={() => handleRegister(tournament.id)}
                        />
                    ))
                )}
            </div>
        </div>
    );
}

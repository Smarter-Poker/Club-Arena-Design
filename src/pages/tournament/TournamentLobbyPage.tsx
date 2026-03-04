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
import { ArenaTrainingController } from '../../services/ArenaTrainingController';
import styles from './TournamentLobbyPage.module.css';

type TournamentStatus = 'all' | 'upcoming' | 'registering' | 'running' | 'completed';
type TournamentType = 'all' | 'freeroll' | 'regular' | 'bounty' | 'satellite';

interface Tournament {
    id: string;
    name: string;
    clubId: string;
    clubName: string;
    buyIn: number;
    prizePool: number;
    startTime: string;
    status: 'scheduled' | 'registering' | 'running' | 'completed' | 'cancelled';
    currentPlayers: number;
    maxPlayers: number;
    startingChips: number;
    blindsUp: number;
    isRegistered: boolean;
    gameType: string;
}

export default function TournamentLobbyPage() {
    const { clubId } = useParams<{ clubId?: string }>();
    const { user } = useUserStore();
    const [tournaments, setTournaments] = useState<Tournament[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<TournamentStatus>('all');
    const [typeFilter, setTypeFilter] = useState<TournamentType>('all');
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
            let query = supabase
                .from('tournaments')
                .select(`
                    id,
                    name,
                    club_id,
                    buy_in,
                    prize_pool,
                    start_time,
                    status,
                    current_players,
                    max_players,
                    starting_chips,
                    blinds_up_minutes,
                    game_type,
                    clubs(name)
                `)
                .order('start_time', { ascending: true });

            if (clubId) {
                query = query.eq('club_id', clubId);
            }

            if (statusFilter !== 'all') {
                if (statusFilter === 'upcoming') {
                    query = query.in('status', ['scheduled', 'registering']);
                } else if (statusFilter === 'registering') {
                    query = query.eq('status', 'registering');
                } else if (statusFilter === 'running') {
                    query = query.eq('status', 'running');
                } else if (statusFilter === 'completed') {
                    query = query.eq('status', 'completed');
                }
            }

            const { data, error } = await query.limit(50);

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
                    clubName: t.clubs?.name || 'Unknown Club',
                    buyIn: t.buy_in_amount || 0,
                    prizePool: t.prize_pool || 0,
                    startTime: t.start_time,
                    status: t.status,
                    currentPlayers: t.current_players || 0,
                    maxPlayers: t.max_players || 100,
                    startingChips: t.starting_chips || 10000,
                    blindsUp: t.blinds_up_minutes || 10,
                    isRegistered: registrations.includes(t.id),
                    gameType: t.game_type || 'NLH'
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
            // Refresh list
            loadTournaments();
        } catch (error) {
            console.error('Registration failed:', error);
        }
    };

    const handleUnregister = async (tournamentId: string) => {
        if (!user?.id) return;
        try {
            await tournamentService.unregisterPlayer(tournamentId, user.id);
            loadTournaments();
        } catch (error) {
            console.error('Unregistration failed:', error);
        }
    };

    const filteredTournaments = tournaments.filter(t => {
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            return t.name.toLowerCase().includes(query) ||
                t.clubName.toLowerCase().includes(query);
        }
        return true;
    });

    const upcomingCount = tournaments.filter(t => ['scheduled', 'registering'].includes(t.status)).length;
    const runningCount = tournaments.filter(t => t.status === 'running').length;

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
                    placeholder=" Search tournaments..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={styles.searchInput}
                />
            </div>

            {/* Filters */}
            <div className={styles.filters}>
                <div className={styles.filterGroup}>
                    {(['all', 'upcoming', 'registering', 'running', 'completed'] as TournamentStatus[]).map(status => (
                        <button
                            key={status}
                            className={`${styles.filterBtn} ${statusFilter === status ? styles.active : ''}`}
                            onClick={() => setStatusFilter(status)}
                        >
                            {status === 'all' ? ' All' :
                                status === 'upcoming' ? ' Upcoming' :
                                    status === 'registering' ? 'Registering' :
                                        status === 'running' ? ' Live' :
                                            ' Completed'}
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
                                type: 'mtt',
                                buyIn: tournament.buyIn,
                                prizePool: tournament.prizePool,
                                maxPlayers: tournament.maxPlayers,
                                registeredPlayers: tournament.currentPlayers,
                                startsAt: tournament.startTime,
                                status: tournament.status === 'completed' ? 'finished' : tournament.status === 'scheduled' ? 'registering' : tournament.status as 'registering' | 'running' | 'cancelled' | 'finished',
                                blindStructure: `${tournament.blindsUp}m`
                            }}
                            onRegister={() => handleRegister(tournament.id)}
                        />
                    ))
                )}
            </div>
        </div>
    );
}

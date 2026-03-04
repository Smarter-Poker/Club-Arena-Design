/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  SPIN & GO LOBBY — Quick Tournament Registration
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../stores/useUserStore';
import { useToast } from '../common/Toast';
import './SpinAndGoLobby.css';

interface SpinAndGoLobbyProps {
    clubId: string;
    onRegister?: (tournamentId: string) => void;
}

interface SpinTournament {
    id: string;
    buyIn: number;
    players: number;
    maxPlayers: number;
    multipliers: number[];
    prizePool: number;
    status: 'registering' | 'spinning' | 'running' | 'complete';
    startAt?: Date;
}

const SPIN_MULTIPLIERS = [2, 3, 4, 5, 10, 25, 50, 100, 1000];

export function SpinAndGoLobby({ clubId, onRegister }: SpinAndGoLobbyProps) {
    const { user } = useUserStore();
    const toast = useToast();

    const [tournaments, setTournaments] = useState<SpinTournament[]>([]);
    const [loading, setLoading] = useState(true);
    const [registering, setRegistering] = useState<string | null>(null);

    useEffect(() => {
        loadTournaments();

        // Subscribe to updates
        const channel = supabase
            .channel('spin-tournaments')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'spin_tournaments',
                filter: `club_id=eq.${clubId}`
            }, () => loadTournaments())
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [clubId]);

    const loadTournaments = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('spin_tournaments')
                .select('*')
                .eq('club_id', clubId)
                .in('status', ['registering', 'spinning'])
                .order('buy_in', { ascending: true });

            if (!error && data) {
                setTournaments(data.map(t => ({
                    id: t.id,
                    buyIn: t.buy_in_amount,
                    players: t.player_count || 0,
                    maxPlayers: t.max_players || 3,
                    multipliers: t.multipliers || SPIN_MULTIPLIERS,
                    prizePool: t.prize_pool || 0,
                    status: t.status,
                    startAt: t.start_at ? new Date(t.start_at) : undefined
                })));
            }
        } catch (error) {
            toast.error('Failed to load spin tournaments');
        }
        setLoading(false);
    };

    const handleRegister = async (tournament: SpinTournament) => {
        if (!user?.id) {
            toast.error('Please log in');
            return;
        }

        setRegistering(tournament.id);
        try {
            const { error } = await supabase.rpc('register_for_tournament', {
                p_tournament_id: tournament.id,
                p_user_id: user.id
            });

            if (error) throw error;

            toast.success(`Registered for ${tournament.buyIn} Spin!`);
            onRegister?.(tournament.id);
            loadTournaments();
        } catch (error: any) {
            toast.error(error.message || 'Registration failed');
        }
        setRegistering(null);
    };

    if (loading) {
        return <div className="spin-lobby loading">Loading...</div>;
    }

    return (
        <div className="spin-lobby">
            <div className="spin-lobby__header">
                <h3> Spin & Go</h3>
                <span className="spin-lobby__subtitle">Win up to 1000x your buy-in!</span>
            </div>

            {tournaments.length === 0 ? (
                <div className="empty-state">No spin tournaments available</div>
            ) : (
                <div className="spin-grid">
                    {tournaments.map(t => (
                        <div
                            key={t.id}
                            className={`spin-card ${t.status}`}
                        >
                            <div className="spin-card__buyin">
                                <span className="value">{t.buyIn.toLocaleString()}</span>
                                <span className="label">Buy-In</span>
                            </div>

                            <div className="spin-card__multipliers">
                                {[2, 10, 100, 1000].map(m => (
                                    <span key={m} className="multiplier">
                                        {m}x
                                    </span>
                                ))}
                            </div>

                            <div className="spin-card__players">
                                <span className="count">{t.players}/{t.maxPlayers}</span>
                                <span className="label">Players</span>
                            </div>

                            {t.status === 'registering' && (
                                <button
                                    className="spin-card__register"
                                    onClick={() => handleRegister(t)}
                                    disabled={registering === t.id}
                                >
                                    {registering === t.id ? 'Registering...' : 'Register'}
                                </button>
                            )}

                            {t.status === 'spinning' && (
                                <div className="spin-card__spinning">
                                    <span className="spinner"></span>
                                    <span>Spinning...</span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default SpinAndGoLobby;

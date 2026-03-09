/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  TOURNAMENT REGISTRATION — Player Registration List
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../common/Toast';
import './TournamentRegistration.css';

interface TournamentRegistrationProps {
    tournamentId: string;
    isAdmin?: boolean;
    onUnregister?: () => void;
}

interface RegisteredPlayer {
    id: string;
    username: string;
    avatarUrl: string;
    registeredAt: Date;
    tableNumber?: number;
    seatNumber?: number;
    chipCount?: number;
    isEliminated: boolean;
}

export function TournamentRegistration({
    tournamentId,
    isAdmin,
    onUnregister
}: TournamentRegistrationProps) {
    const toast = useToast();
    const [players, setPlayers] = useState<RegisteredPlayer[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        loadPlayers();

        const channel = supabase
            .channel(`tournament-${tournamentId}-players`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'tournament_players',
                filter: `tournament_id=eq.${tournamentId}`
            }, () => loadPlayers())
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [tournamentId]);

    const loadPlayers = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('tournament_players')
                .select('*, player:profiles!user_id(username, avatar_url)')
                .eq('tournament_id', tournamentId)
                .order('created_at', { ascending: true });

            if (!error && data) {
                setPlayers(data.map((p: any) => ({
                    id: p.user_id,
                    username: p.player?.username || p.username || 'Unknown',
                    avatarUrl: p.player?.avatar_url || '',
                    registeredAt: new Date(p.created_at),
                    tableNumber: p.table_id || null,
                    seatNumber: p.seat_number,
                    chipCount: p.chips || 0,
                    isEliminated: p.status === 'eliminated'
                })));
            }
        } catch (error) {
            toast.error('Failed to load players');
        }
        setLoading(false);
    };

    const handleRemovePlayer = async (playerId: string) => {
        if (!isAdmin) return;

        try {
            // Fetch tournament to calculate refund amount
            const { data: tournament } = await supabase
                .from('tournaments')
                .select('buy_in_amount, buy_in_fee, status')
                .eq('id', tournamentId)
                .single();

            // Only allow admin removal before tournament starts (ANNOUNCED or REGISTERING)
            if (tournament && !['ANNOUNCED', 'REGISTERING'].includes(tournament.status)) {
                toast.error('Cannot remove players after tournament has started');
                return;
            }

            // Delete the tournament_players entry first
            const { error: delErr } = await supabase
                .from('tournament_players')
                .delete()
                .eq('tournament_id', tournamentId)
                .eq('user_id', playerId);

            if (delErr) throw delErr;

            // Refund the player's buy-in + fee
            if (tournament) {
                const refundAmount = Math.trunc(((tournament.buy_in_amount || 0) + (tournament.buy_in_fee || 0)) * 100) / 100;
                if (refundAmount > 0) {
                    const { error: refundErr } = await supabase.rpc('credit_player_wallet', {
                        p_user_id: playerId,
                        p_amount: refundAmount,
                    });

                    if (refundErr) {
                        console.error('[AdminRemove] Refund failed — re-inserting player:', refundErr);
                        // Re-insert the player since refund failed — preserve tournament integrity
                        try {
                            const playerEntry = players.find(p => p.id === playerId);
                            await supabase.from('tournament_players').insert({
                                tournament_id: tournamentId,
                                user_id: playerId,
                                username: playerEntry?.username || 'Player',
                                status: 'registered',
                            });
                            toast.error('Removal cancelled — refund failed, player re-inserted');
                        } catch (reinsertErr) {
                            console.error('[AdminRemove] CRITICAL: Re-insert failed after refund failure:', reinsertErr);
                            toast.error('CRITICAL: Player removed but refund failed — contact support');
                        }
                        return;
                    }

                    // Log the refund transaction
                    await supabase.rpc('log_wallet_transaction', {
                        p_user_id: playerId,
                        p_wallet_type: 'PLAYER',
                        p_amount: refundAmount,
                        p_type: 'credit',
                        p_category: 'refund',
                        p_description: `Admin removed from tournament — refund`,
                        p_table_id: null,
                        p_hand_id: null,
                        p_related_entity_id: tournamentId,
                    });
                }

                // Decrement current_players
                const { data: t } = await supabase
                    .from('tournaments')
                    .select('current_players')
                    .eq('id', tournamentId)
                    .single();

                if (t) {
                    await supabase
                        .from('tournaments')
                        .update({ current_players: Math.max((t.current_players || 1) - 1, 0) })
                        .eq('id', tournamentId);
                }
            }

            toast.success('Player removed and refunded');
            loadPlayers();
        } catch {
            toast.error('Failed to remove player');
        }
    };

    const filteredPlayers = players.filter(p =>
        p.username.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const activePlayers = filteredPlayers.filter(p => !p.isEliminated);
    const eliminatedPlayers = filteredPlayers.filter(p => p.isEliminated);

    if (loading) {
        return <div className="tournament-registration loading">Loading...</div>;
    }

    return (
        <div className="tournament-registration">
            <div className="registration__header">
                <h3> Registered Players ({players.length})</h3>
                <input
                    type="text"
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="search-input"
                />
            </div>

            {activePlayers.length > 0 && (
                <div className="player-list">
                    {activePlayers.map((player, idx) => (
                        <div key={player.id} className="player-row">
                            <span className="rank">#{idx + 1}</span>
                            <span className="avatar">{player.avatarUrl}</span>
                            <span className="username">{player.username}</span>
                            {player.tableNumber && (
                                <span className="seat">
                                    T{player.tableNumber}/S{player.seatNumber}
                                </span>
                            )}
                            {player.chipCount !== undefined && (
                                <span className="chips">{player.chipCount.toLocaleString()}</span>
                            )}
                            {isAdmin && (
                                <button
                                    className="remove-btn"
                                    onClick={() => handleRemovePlayer(player.id)}
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {eliminatedPlayers.length > 0 && (
                <div className="eliminated-section">
                    <h4>Eliminated ({eliminatedPlayers.length})</h4>
                    <div className="player-list eliminated">
                        {eliminatedPlayers.map((player, idx) => (
                            <div key={player.id} className="player-row eliminated">
                                <span className="avatar">{player.avatarUrl}</span>
                                <span className="username">{player.username}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {players.length === 0 && (
                <div className="empty-state">No players registered yet</div>
            )}
        </div>
    );
}

export default TournamentRegistration;

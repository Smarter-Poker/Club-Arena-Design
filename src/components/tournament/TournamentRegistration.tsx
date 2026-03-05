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
            await supabase
                .from('tournament_players')
                .delete()
                .eq('tournament_id', tournamentId)
                .eq('user_id', playerId);

            toast.success('Player removed');
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

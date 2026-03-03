import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { PresenceIndicator } from './PresenceIndicator';
import './OnlinePlayersList.css';

interface OnlinePlayer {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    status: 'online' | 'playing';
    currentTable?: string;
}

interface OnlinePlayersListProps {
    clubId?: string;
    limit?: number;
    onPlayerClick?: (player: OnlinePlayer) => void;
}

export const OnlinePlayersList: React.FC<OnlinePlayersListProps> = ({
    clubId,
    limit = 20,
    onPlayerClick
}) => {
    const [players, setPlayers] = useState<OnlinePlayer[]>([]);
    const [loading, setLoading] = useState(true);
    const [onlineCount, setOnlineCount] = useState(0);

    useEffect(() => {
        loadOnlinePlayers();

        // Subscribe to presence changes
        const channel = supabase
            .channel('online_players')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'player_presence'
            }, () => {
                loadOnlinePlayers();
            })
            .subscribe();

        // Refresh every 30 seconds
        const interval = setInterval(loadOnlinePlayers, 30000);

        return () => {
            supabase.removeChannel(channel);
            clearInterval(interval);
        };
    }, [clubId]);

    const loadOnlinePlayers = async () => {
        try {
            let query = supabase
                .from('player_presence')
                .select(`
                    user_id,
                    status,
                    current_table_id,
                    profiles:user_id (
                        username,
                        display_name,
                        avatar_url
                    )
                `)
                .in('status', ['online', 'playing'])
                .order('last_seen_at', { ascending: false })
                .limit(limit);

            if (clubId) {
                query = query.eq('club_id', clubId);
            }

            const { data, count } = await query;

            if (data) {
                const mapped = data.map((p: any) => ({
                    id: p.user_id,
                    username: p.profiles?.username || 'Unknown',
                    displayName: p.profiles?.display_name || p.profiles?.username || 'Unknown',
                    avatarUrl: p.profiles?.avatar_url,
                    status: p.status,
                    currentTable: p.current_table_id
                }));
                setPlayers(mapped);
                setOnlineCount(count || mapped.length);
            }
        } catch (error) {
            console.error('Failed to load online players:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <div className="online-players-loading">Loading...</div>;
    }

    return (
        <div className="online-players-list">
            <div className="list-header">
                <h4>Online Players</h4>
                <span className="online-count">{onlineCount} online</span>
            </div>

            {players.length === 0 ? (
                <div className="no-players">No players online</div>
            ) : (
                <div className="players-grid">
                    {players.map(player => (
                        <div
                            key={player.id}
                            className="player-card"
                            onClick={() => onPlayerClick?.(player)}
                        >
                            <div className="player-avatar">
                                {player.avatarUrl ? (
                                    <img src={player.avatarUrl} alt={player.displayName} />
                                ) : (
                                    <span>{(player.displayName || '?')[0]}</span>
                                )}
                                <PresenceIndicator userId={player.id} size="small" />
                            </div>
                            <div className="player-name">{player.displayName}</div>
                            {player.status === 'playing' && (
                                <div className="playing-badge"> In Game</div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default OnlinePlayersList;

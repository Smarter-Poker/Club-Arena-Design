import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import './OpponentStats.css';

interface OpponentData {
    playerId: string;
    username: string;
    avatar?: string;
    handsPlayed: number;
    netResult: number;
    vpip: number;
    pfr: number;
    threebet: number;
    note?: string;
}

interface OpponentStatsProps {
    userId: string;
    limit?: number;
    onViewProfile?: (playerId: string) => void;
}

export const OpponentStats: React.FC<OpponentStatsProps> = ({
    userId,
    limit = 10,
    onViewProfile
}) => {
    const [opponents, setOpponents] = useState<OpponentData[]>([]);
    const [loading, setLoading] = useState(true);
    const [sortBy, setSortBy] = useState<'hands' | 'profit' | 'loss'>('hands');

    useEffect(() => {
        loadOpponents();
    }, [userId, sortBy]);

    const loadOpponents = async () => {
        setLoading(true);
        try {
            // Query real opponent data from hand_results joined with profiles
            const { data, error } = await supabase.rpc('get_opponent_stats', {
                p_user_id: userId,
                p_limit: limit * 2, // Get extra for filtering
            });

            if (error) {
                console.error('[OpponentStats] RPC error:', error);
                // Fall back to direct query if RPC doesn't exist
                const { data: fallbackData } = await supabase
                    .from('hand_players')
                    .select(`
                        opponent_id:user_id,
                        profiles!hand_players_user_id_fkey(username, avatar_url)
                    `)
                    .neq('user_id', userId)
                    .limit(limit);

                if (fallbackData) {
                    // Aggregate by opponent (simplified)
                    const oppMap = new Map<string, OpponentData>();
                    for (const row of fallbackData) {
                        const id = row.opponent_id;
                        if (!oppMap.has(id)) {
                            oppMap.set(id, {
                                playerId: id,
                                username: (row.profiles as any)?.username || 'Unknown',
                                avatar: (row.profiles as any)?.avatar_url,
                                handsPlayed: 1,
                                netResult: 0,
                                vpip: 25, // Default values until HUD tracking is complete
                                pfr: 18,
                                threebet: 6,
                            });
                        } else {
                            oppMap.get(id)!.handsPlayed++;
                        }
                    }
                    setOpponents(Array.from(oppMap.values()).slice(0, limit));
                }
            } else if (data) {
                // Map RPC result to component format
                const mapped: OpponentData[] = data.map((row: any) => ({
                    playerId: row.opponent_id,
                    username: row.username || 'Unknown',
                    avatar: row.avatar_url,
                    handsPlayed: row.hands_played || 0,
                    netResult: row.net_result || 0,
                    vpip: row.vpip || 0,
                    pfr: row.pfr || 0,
                    threebet: row.three_bet || 0,
                    note: row.note,
                }));

                const sorted = [...mapped];
                if (sortBy === 'hands') {
                    sorted.sort((a, b) => b.handsPlayed - a.handsPlayed);
                } else if (sortBy === 'profit') {
                    sorted.sort((a, b) => b.netResult - a.netResult);
                } else {
                    sorted.sort((a, b) => a.netResult - b.netResult);
                }

                setOpponents(sorted.slice(0, limit));
            }
        } catch (error) {
            console.error('Failed to load opponents:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="opponent-stats">
            <div className="opponent-controls">
                <h3>Top Opponents</h3>
                <div className="sort-buttons">
                    <button
                        className={sortBy === 'hands' ? 'active' : ''}
                        onClick={() => setSortBy('hands')}
                    >
                        Most Hands
                    </button>
                    <button
                        className={sortBy === 'profit' ? 'active' : ''}
                        onClick={() => setSortBy('profit')}
                    >
                        Most Won
                    </button>
                    <button
                        className={sortBy === 'loss' ? 'active' : ''}
                        onClick={() => setSortBy('loss')}
                    >
                        Most Lost
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="loading">Loading opponents...</div>
            ) : (
                <div className="opponent-list">
                    {opponents.map((opp, idx) => (
                        <div
                            key={opp.playerId}
                            className="opponent-row"
                            onClick={() => onViewProfile?.(opp.playerId)}
                        >
                            <div className="opponent-rank">#{idx + 1}</div>
                            <div className="opponent-info">
                                <div className="opponent-avatar">
                                    {opp.avatar ? (
                                        <img src={opp.avatar} alt="" />
                                    ) : (
                                        <span>{opp.username[0]}</span>
                                    )}
                                </div>
                                <div className="opponent-name">
                                    <span className="username">{opp.username}</span>
                                    <span className="hands">{opp.handsPlayed.toLocaleString()} hands</span>
                                </div>
                            </div>
                            <div className="opponent-hud">
                                <span>{opp.vpip}/{opp.pfr}/{opp.threebet}</span>
                            </div>
                            <div className={`opponent-result ${opp.netResult >= 0 ? 'positive' : 'negative'}`}>
                                {opp.netResult >= 0 ? '+' : ''}{opp.netResult.toLocaleString()}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default OpponentStats;

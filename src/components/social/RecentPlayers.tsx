/**
 * ♠ CLUB ARENA — Recent Players
 * View players you've recently played with
 */

import React, { useState, useEffect } from 'react';
import './RecentPlayers.css';

interface RecentPlayer {
    id: string;
    username: string;
    avatar?: string;
    lastPlayedAt: string;
    tableName: string;
    handsPlayed: number;
    result: number;
    isFriend: boolean;
}

interface RecentPlayersProps {
    onAddFriend?: (playerId: string) => void;
    onViewProfile?: (playerId: string) => void;
    onInviteToTable?: (playerId: string) => void;
    onBlockPlayer?: (playerId: string) => void;
}

export const RecentPlayers: React.FC<RecentPlayersProps> = ({
    onAddFriend,
    onViewProfile,
    onInviteToTable,
    onBlockPlayer,
}) => {
    const [players, setPlayers] = useState<RecentPlayer[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadRecentPlayers();
    }, []);

    const loadRecentPlayers = async () => {
        try {
            // Mock data
            const mock: RecentPlayer[] = [
                { id: '1', username: 'SharkAttack', lastPlayedAt: new Date().toISOString(), tableName: 'High Stakes NLH', handsPlayed: 47, result: -320, isFriend: false },
                { id: '2', username: 'LuckyDraw', lastPlayedAt: new Date(Date.now() - 3600000).toISOString(), tableName: 'High Stakes NLH', handsPlayed: 23, result: 180, isFriend: true },
                { id: '3', username: 'FishOnTilt', lastPlayedAt: new Date(Date.now() - 7200000).toISOString(), tableName: 'PLO Action', handsPlayed: 89, result: 540, isFriend: false },
                { id: '4', username: 'NightOwl', lastPlayedAt: new Date(Date.now() - 86400000).toISOString(), tableName: 'NLH 1/2', handsPlayed: 112, result: -75, isFriend: false },
                { id: '5', username: 'PokerPro99', lastPlayedAt: new Date(Date.now() - 172800000).toISOString(), tableName: 'High Stakes NLH', handsPlayed: 156, result: 890, isFriend: true },
            ];
            setPlayers(mock);
        } catch (error) {
            console.error('Failed to load recent players:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now.getTime() - date.getTime();

        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return `${Math.floor(diff / 86400000)}d ago`;
    };

    return (
        <div className="recent-players">
            <div className="section-header">
                <h2>⏱️ Recent Players</h2>
            </div>

            <div className="players-list">
                {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="player-row skeleton" />
                    ))
                ) : players.length === 0 ? (
                    <div className="empty-state">
                        <span>👤</span>
                        <p>No recent players</p>
                    </div>
                ) : (
                    players.map(player => (
                        <div
                            key={player.id}
                            className="player-row"
                            onClick={() => onViewProfile?.(player.id)}
                        >
                            <div className="player-avatar">
                                {player.avatar ? (
                                    <img src={player.avatar} alt={player.username} />
                                ) : (
                                    <span>{player.username[0]}</span>
                                )}
                            </div>
                            <div className="player-info">
                                <div className="player-header">
                                    <span className="player-name">{player.username}</span>
                                    {player.isFriend && <span className="friend-badge">★</span>}
                                </div>
                                <span className="player-table">{player.tableName}</span>
                                <div className="player-meta">
                                    <span>{player.handsPlayed} hands</span>
                                    <span className={`result ${player.result >= 0 ? 'positive' : 'negative'}`}>
                                        {player.result >= 0 ? '+' : ''}{player.result}
                                    </span>
                                    <span className="time">{formatTime(player.lastPlayedAt)}</span>
                                </div>
                            </div>
                            <div className="player-actions">
                                {!player.isFriend && (
                                    <button
                                        className="action-btn add"
                                        onClick={(e) => { e.stopPropagation(); onAddFriend?.(player.id); }}
                                        title="Add friend"
                                    >
                                        ➕
                                    </button>
                                )}
                                <button
                                    className="action-btn invite"
                                    onClick={(e) => { e.stopPropagation(); onInviteToTable?.(player.id); }}
                                    title="Invite to table"
                                >
                                    🎰
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default RecentPlayers;

/**
 * ♠ CLUB ARENA — Player Search (Admin)
 * Search and manage players across clubs
 */

import React, { useState, useCallback } from 'react';
import './PlayerSearch.css';

interface Player {
    id: string;
    username: string;
    avatar?: string;
    email?: string;
    status: 'active' | 'banned' | 'suspended';
    joinedAt: string;
    lastActive: string;
    balance: number;
    clubs: string[];
}

interface PlayerSearchProps {
    onPlayerSelect?: (player: Player) => void;
    onBanPlayer?: (playerId: string) => void;
    onViewProfile?: (playerId: string) => void;
}

export const PlayerSearch: React.FC<PlayerSearchProps> = ({
    onPlayerSelect,
    onBanPlayer,
    onViewProfile,
}) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Player[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchType, setSearchType] = useState<'username' | 'email' | 'id'>('username');

    const handleSearch = useCallback(async () => {
        if (!query.trim()) return;

        setLoading(true);
        try {
            // Mock search results
            const mockResults: Player[] = [
                {
                    id: '1',
                    username: 'PokerPro99',
                    email: 'poker@example.com',
                    status: 'active' as const,
                    joinedAt: '2025-01-15',
                    lastActive: new Date().toISOString(),
                    balance: 5420,
                    clubs: ['High Rollers', 'PLO Masters'],
                },
                {
                    id: '2',
                    username: 'AceHunter',
                    email: 'ace@example.com',
                    status: 'active' as const,
                    joinedAt: '2025-03-20',
                    lastActive: new Date(Date.now() - 86400000).toISOString(),
                    balance: 1250,
                    clubs: ['High Rollers'],
                },
            ].filter(p =>
                p.username.toLowerCase().includes(query.toLowerCase()) ||
                p.email?.toLowerCase().includes(query.toLowerCase())
            );
            setResults(mockResults);
        } catch (error) {
            console.error('Failed to search players:', error);
        } finally {
            setLoading(false);
        }
    }, [query, searchType]);

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString();
    };

    const getStatusBadge = (status: Player['status']) => {
        switch (status) {
            case 'active': return <span className="status-badge active">Active</span>;
            case 'banned': return <span className="status-badge banned">Banned</span>;
            case 'suspended': return <span className="status-badge suspended">Suspended</span>;
        }
    };

    return (
        <div className="player-search">
            <div className="search-header">
                <h2>🔍 Player Search</h2>
            </div>

            {/* Search Bar */}
            <div className="search-controls">
                <div className="search-type">
                    {(['username', 'email', 'id'] as const).map(type => (
                        <button
                            key={type}
                            className={searchType === type ? 'active' : ''}
                            onClick={() => setSearchType(type)}
                        >
                            {type.charAt(0).toUpperCase() + type.slice(1)}
                        </button>
                    ))}
                </div>
                <div className="search-input">
                    <input
                        type="text"
                        placeholder={`Search by ${searchType}...`}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    />
                    <button className="search-btn" onClick={handleSearch}>
                        {loading ? '...' : '🔍'}
                    </button>
                </div>
            </div>

            {/* Results */}
            <div className="search-results">
                {results.length === 0 ? (
                    <div className="empty-state">
                        <span>👤</span>
                        <p>Search for players to manage</p>
                    </div>
                ) : (
                    results.map(player => (
                        <div
                            key={player.id}
                            className="player-row"
                            onClick={() => onPlayerSelect?.(player)}
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
                                    {getStatusBadge(player.status)}
                                </div>
                                <span className="player-email">{player.email}</span>
                                <div className="player-meta">
                                    <span>Joined: {formatDate(player.joinedAt)}</span>
                                    <span>Clubs: {player.clubs.length}</span>
                                    <span>Balance: ${player.balance.toLocaleString()}</span>
                                </div>
                            </div>
                            <div className="player-actions">
                                <button
                                    className="action-btn view"
                                    onClick={(e) => { e.stopPropagation(); onViewProfile?.(player.id); }}
                                >
                                    👁️
                                </button>
                                {player.status !== 'banned' && (
                                    <button
                                        className="action-btn ban"
                                        onClick={(e) => { e.stopPropagation(); onBanPlayer?.(player.id); }}
                                    >
                                        🚫
                                    </button>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default PlayerSearch;

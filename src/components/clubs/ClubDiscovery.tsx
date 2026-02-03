/**
 * ♠ CLUB ARENA — Club Discovery
 * Browse and search for clubs to join
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import './ClubDiscovery.css';

interface Club {
    id: string;
    name: string;
    logo?: string;
    description: string;
    memberCount: number;
    activeTableCount: number;
    minStakes: string;
    maxStakes: string;
    tags: string[];
    isPrivate: boolean;
    rating: number;
}

interface ClubDiscoveryProps {
    onJoinRequest?: (clubId: string) => void;
    onViewClub?: (club: Club) => void;
}

export const ClubDiscovery: React.FC<ClubDiscoveryProps> = ({
    onJoinRequest,
    onViewClub,
}) => {
    const [clubs, setClubs] = useState<Club[]>([]);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'all' | 'popular' | 'active' | 'new'>('popular');
    const [stakeFilter, setStakeFilter] = useState<'all' | 'micro' | 'low' | 'mid' | 'high'>('all');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadClubs();
    }, [filter, stakeFilter]);

    const loadClubs = async () => {
        setLoading(true);
        try {
            // Mock clubs for demo
            const mockClubs: Club[] = [
                {
                    id: '1',
                    name: 'High Rollers Union',
                    description: 'Elite poker club for serious players',
                    memberCount: 523,
                    activeTableCount: 12,
                    minStakes: '5/10',
                    maxStakes: '100/200',
                    tags: ['NLH', 'PLO', 'High Stakes'],
                    isPrivate: false,
                    rating: 4.8,
                },
                {
                    id: '2',
                    name: 'Grinders Paradise',
                    description: 'Low rake, 24/7 action, friendly community',
                    memberCount: 1247,
                    activeTableCount: 28,
                    minStakes: '0.25/0.50',
                    maxStakes: '2/4',
                    tags: ['Micro', 'Low Stakes', 'Beginner Friendly'],
                    isPrivate: false,
                    rating: 4.5,
                },
                {
                    id: '3',
                    name: 'PLO Masters',
                    description: 'Dedicated PLO club with regular tournaments',
                    memberCount: 312,
                    activeTableCount: 8,
                    minStakes: '1/2',
                    maxStakes: '25/50',
                    tags: ['PLO', 'PLO5', 'Tournaments'],
                    isPrivate: false,
                    rating: 4.6,
                },
                {
                    id: '4',
                    name: 'Night Owls',
                    description: 'Best late night action, 24/7 support',
                    memberCount: 789,
                    activeTableCount: 15,
                    minStakes: '0.50/1',
                    maxStakes: '10/20',
                    tags: ['24/7', 'Mixed Games', 'Fast Tables'],
                    isPrivate: true,
                    rating: 4.3,
                },
            ];
            setClubs(mockClubs);
        } catch (error) {
            console.error('Failed to load clubs:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredClubs = clubs.filter(club =>
        club.name.toLowerCase().includes(search.toLowerCase()) ||
        club.description.toLowerCase().includes(search.toLowerCase()) ||
        club.tags.some(tag => tag.toLowerCase().includes(search.toLowerCase()))
    );

    const renderStars = (rating: number) => {
        const full = Math.floor(rating);
        const half = rating % 1 >= 0.5;
        return (
            <span className="stars">
                {'★'.repeat(full)}
                {half && '½'}
                <span className="rating-value">{rating.toFixed(1)}</span>
            </span>
        );
    };

    return (
        <div className="club-discovery">
            <div className="discovery-header">
                <h2>🔍 Discover Clubs</h2>
            </div>

            {/* Search */}
            <div className="search-bar">
                <span className="search-icon">🔎</span>
                <input
                    type="text"
                    placeholder="Search clubs by name, game, or tag..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            {/* Filters */}
            <div className="filter-row">
                <div className="filter-group">
                    {(['all', 'popular', 'active', 'new'] as const).map(f => (
                        <button
                            key={f}
                            className={filter === f ? 'active' : ''}
                            onClick={() => setFilter(f)}
                        >
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                    ))}
                </div>
                <select
                    className="stake-select"
                    value={stakeFilter}
                    onChange={(e) => setStakeFilter(e.target.value as any)}
                >
                    <option value="all">All Stakes</option>
                    <option value="micro">Micro</option>
                    <option value="low">Low</option>
                    <option value="mid">Mid</option>
                    <option value="high">High</option>
                </select>
            </div>

            {/* Club Grid */}
            <div className="clubs-grid">
                {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="club-card skeleton" />
                    ))
                ) : filteredClubs.length === 0 ? (
                    <div className="empty-state">
                        <span>🏠</span>
                        <p>No clubs found matching your criteria</p>
                    </div>
                ) : (
                    filteredClubs.map(club => (
                        <div
                            key={club.id}
                            className="club-card"
                            onClick={() => onViewClub?.(club)}
                        >
                            <div className="club-header">
                                <div className="club-logo">
                                    {club.logo ? (
                                        <img src={club.logo} alt={club.name} />
                                    ) : (
                                        <span>{club.name[0]}</span>
                                    )}
                                </div>
                                <div className="club-meta">
                                    <h3>{club.name}</h3>
                                    {club.isPrivate && <span className="private-badge">🔒</span>}
                                </div>
                            </div>
                            <p className="club-desc">{club.description}</p>
                            <div className="club-tags">
                                {club.tags.slice(0, 3).map(tag => (
                                    <span key={tag} className="tag">{tag}</span>
                                ))}
                            </div>
                            <div className="club-stats">
                                <span>👥 {club.memberCount}</span>
                                <span>🎰 {club.activeTableCount} tables</span>
                                <span>💵 {club.minStakes} - {club.maxStakes}</span>
                            </div>
                            <div className="club-footer">
                                {renderStars(club.rating)}
                                <button
                                    className="join-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onJoinRequest?.(club.id);
                                    }}
                                >
                                    {club.isPrivate ? 'Request' : 'Join'}
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default ClubDiscovery;

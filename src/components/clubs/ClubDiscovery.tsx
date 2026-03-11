/**
 * ♠ CLUB ARENA — Club Discovery
 * Browse and search for clubs to join
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ClubsService } from '../../services/ClubsService';
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
            let fetchedClubs: any[] = [];
            if (search) {
                fetchedClubs = await ClubsService.search(search);
            } else {
                fetchedClubs = await ClubsService.search(''); // empty search for popular
            }
            
            // Map backend data to local Club interface
            const mappedClubs: Club[] = fetchedClubs.map(c => ({
                id: c.id,
                name: c.name,
                logo: c.logo_url || c.avatar_url,
                description: c.description || 'Welcome to our club!',
                memberCount: c.member_count || 0,
                activeTableCount: c.table_count || 0,
                minStakes: '1/2', // Default fallback
                maxStakes: '5/10', // Default fallback
                tags: ['Texas Holdem'],
                isPrivate: c.requires_approval || !c.is_public,
                rating: 5.0, // Default rating
            }));
            
            setClubs(mappedClubs);
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

/**
 *  SEARCH PAGE
 */

import { useState, useEffect, useCallback } from 'react';
import { useDebounce } from '../hooks/useDebounce';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/common/Toast';
import './SearchPage.css';

type SearchCategory = 'all' | 'clubs' | 'players' | 'tables';

interface SearchResult {
    id: string;
    type: 'club' | 'player' | 'table';
    name: string;
    subtitle?: string;
    avatar?: string;
}

export default function SearchPage() {
    const navigate = useNavigate();
    const toast = useToast();
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState<SearchCategory>('all');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [recentSearches, setRecentSearches] = useState<string[]>([]);
    const [visibleResults, setVisibleResults] = useState(new Set<number>());
    const [searchFocused, setSearchFocused] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem('recentSearches');
        if (saved) {
            try {
                setRecentSearches(JSON.parse(saved));
            } catch {
                localStorage.removeItem('recentSearches');
            }
        }
    }, []);

    const search = useCallback(async (searchQuery: string) => {
        if (!searchQuery.trim()) {
            setResults([]);
            return;
        }

        setLoading(true);
        const allResults: SearchResult[] = [];

        try {
            if (category === 'all' || category === 'clubs') {
                const { data: clubs } = await supabase
                    .from('clubs')
                    .select('id, name, avatar_url, member_count')
                    .ilike('name', `%${searchQuery}%`)
                    .limit(10);

                if (clubs) {
                    allResults.push(...clubs.map(c => ({
                        id: c.id,
                        type: 'club' as const,
                        name: c.name,
                        subtitle: `${c.member_count || 0} members`,
                        avatar: c.avatar_url,
                    })));
                }
            }

            if (category === 'all' || category === 'players') {
                const { data: players } = await supabase
                    .from('profiles')
                    .select('id, username, avatar_url')
                    .ilike('username', `%${searchQuery}%`)
                    .limit(10);

                if (players) {
                    allResults.push(...players.map(p => ({
                        id: p.id,
                        type: 'player' as const,
                        name: p.username,
                        avatar: p.avatar_url,
                    })));
                }
            }

            if (category === 'all' || category === 'tables') {
                const { data: tables } = await supabase
                    .from('tables')
                    .select('id, name, stakes, current_players, max_players')
                    .ilike('name', `%${searchQuery}%`)
                    .limit(10);

                if (tables) {
                    allResults.push(...tables.map(t => ({
                        id: t.id,
                        type: 'table' as const,
                        name: t.name,
                        subtitle: `${t.stakes} • ${t.current_players}/${t.max_players}`,
                    })));
                }
            }

            setResults(allResults);

            if (searchQuery.length >= 2) {
                setRecentSearches(prev => {
                    const updated = [searchQuery, ...prev.filter(s => s !== searchQuery)].slice(0, 5);
                    localStorage.setItem('recentSearches', JSON.stringify(updated));
                    return updated;
                });
            }
        } catch (error) {
            console.error('Search failed:', error);
            toast.error('Search failed. Please try again.');
        }
        setLoading(false);
    }, [category]);

    // Stagger result rows
    useEffect(() => {
        setVisibleResults(new Set());
        const timers = results.map((_, i) =>
            setTimeout(() => setVisibleResults(prev => new Set([...prev, i])), i * 45)
        );
        return () => timers.forEach(t => clearTimeout(t));
    }, [results.length]);

    const debouncedQuery = useDebounce(query, 300);
    useEffect(() => {
        search(debouncedQuery);
    }, [debouncedQuery, search]);

    const getIcon = (type: string): string => {
        switch (type) {
            case 'club': return '♠';
            case 'player': return '●';
            case 'table': return '■';
            default: return '○';
        }
    };

    const handleResultClick = (result: SearchResult) => {
        switch (result.type) {
            case 'club': navigate(`/clubs/${result.id}`); break;
            case 'player': navigate(`/profile/${result.id}`); break;
            case 'table': navigate(`/table/${result.id}`); break;
        }
    };

    return (
        <div className="search-page">

            <div className="search-bar">
                <input
                    type="text"
                    placeholder="Search clubs, players, tables..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    autoFocus
                    style={{
                        boxShadow: searchFocused ? '0 0 16px rgba(0, 212, 255, 0.4)' : 'none',
                        transition: 'box-shadow 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                    }}
                />
                {query && (
                    <button className="clear-btn" onClick={() => setQuery('')}>✕</button>
                )}
            </div>

            <div className="category-tabs">
                {(['all', 'clubs', 'players', 'tables'] as SearchCategory[]).map(cat => (
                    <button
                        key={cat}
                        className={category === cat ? 'active' : ''}
                        onClick={() => setCategory(cat)}
                    >
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </button>
                ))}
            </div>

            <div className="search-content">
                {loading ? (
                    <div className="loading-state"><div className="spinner" /></div>
                ) : query.length === 0 ? (
                    <div className="recent-searches">
                        <h3>Recent Searches</h3>
                        {recentSearches.length === 0 ? (
                            <p className="empty-text">No recent searches</p>
                        ) : (
                            recentSearches.map((s, i) => (
                                <button key={i} className="recent-item" onClick={() => setQuery(s)}>
                                    {s}
                                </button>
                            ))
                        )}
                    </div>
                ) : results.length === 0 ? (
                    <div className="empty-state">
                        <span className="empty-icon">○</span>
                        <p>No results for "{query}"</p>
                    </div>
                ) : (
                    <div className="results-list">
                        {results.map((result, index) => (
                            <div
                                key={`${result.type}-${result.id}`}
                                className="result-item"
                                onClick={() => handleResultClick(result)}
                                style={{
                                    opacity: visibleResults.has(index) ? 1 : 0,
                                    transform: visibleResults.has(index) ? 'translateY(0)' : 'translateY(8px)',
                                    transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                                }}
                            >
                                <div className="result-avatar">
                                    {result.avatar ? (
                                        <img src={result.avatar} alt="" loading="lazy" loading="lazy" />
                                    ) : (
                                        <span>{getIcon(result.type)}</span>
                                    )}
                                </div>
                                <div className="result-info">
                                    <span className="result-name">{result.name}</span>
                                    {result.subtitle && <span className="result-subtitle">{result.subtitle}</span>}
                                </div>
                                <span className="result-type">{result.type}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

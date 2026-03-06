/**
 *  CLUB ENGINE — Lobby Page
 * Main game lobby with tables, game types, and quick actions
 * WITH REAL-TIME UPDATES
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './LobbyPage.module.css';
import TableCard from '../components/lobby/TableCard';
import GameTypeTabs from '../components/lobby/GameTypeTabs';
import QuickActions from '../components/lobby/QuickActions';
import { tableService } from '../services/TableService';
import { supabase } from '../lib/supabase';
import { useUserStore } from '../stores/useUserStore';
import type { PokerTable } from '../types/database.types';

type GameFilter = 'all' | 'nlh' | 'plo' | 'ofc' | 'tournaments';

export default function LobbyPage() {
    const navigate = useNavigate();
    const { user } = useUserStore();
    const [activeFilter, setActiveFilter] = useState<GameFilter>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [tables, setTables] = useState<PokerTable[]>([]);
    const [loading, setLoading] = useState(true);
    const [onlinePlayers, setOnlinePlayers] = useState(0);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // UNION-FIRST: Check if user belongs to a union and redirect to union lobby
    useEffect(() => {
        const checkUnionMembership = async () => {
            if (!user?.id) return;
            try {
                // Find clubs the user belongs to
                const { data: memberships } = await supabase
                    .from('club_members')
                    .select('club_id')
                    .eq('user_id', user.id);

                if (!memberships?.length) return;

                // Check if any of these clubs are in a union
                const clubIds = memberships.map(m => m.club_id);
                const { data: unionClub } = await supabase
                    .from('union_clubs')
                    .select('union_id')
                    .in('club_id', clubIds)
                    .limit(1)
                    .maybeSingle();

                if (unionClub) {
                    // User's club is in a union — redirect to union lobby
                    navigate(`/unions/${unionClub.union_id}`, { replace: true });
                    return;
                }
            } catch (err) {
                console.warn('[LobbyPage] Union check failed, showing all tables:', err);
            }
        };

        checkUnionMembership();
    }, [user?.id, navigate]);

    // Fetch tables and subscribe to real-time updates
    useEffect(() => {
        const fetchTables = async () => {
            try {
                setLoading(true);
                // For users in unions, they'll be redirected above.
                // This fallback shows all tables for standalone (non-union) users.
                const activeTables = await tableService.getActiveTables();
                setTables(activeTables);
            } catch (error) {
                console.error('Failed to fetch tables:', error);
                setTables([]);
            } finally {
                setLoading(false);
            }
        };

        fetchTables();

        // Subscribe to real-time table changes
        const channel = supabase
            .channel('lobby-tables')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'tables',
                },
                (payload) => {
                    if (payload.eventType === 'INSERT') {
                        setTables(prev => [...prev, payload.new as PokerTable]);
                    } else if (payload.eventType === 'UPDATE') {
                        setTables(prev =>
                            prev.map(t => t.id === payload.new.id ? payload.new as PokerTable : t)
                        );
                    } else if (payload.eventType === 'DELETE') {
                        setTables(prev => prev.filter(t => t.id !== payload.old.id));
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'table_seats',
                },
                () => {
                    // Debounce seat changes to avoid rapid refetching
                    if (debounceRef.current) clearTimeout(debounceRef.current);
                    debounceRef.current = setTimeout(() => {
                        tableService.getActiveTables().then(setTables);
                    }, 500);
                }
            )
            .subscribe();

        // Get online player count
        const presenceChannel = supabase.channel('online-users');
        presenceChannel
            .on('presence', { event: 'sync' }, () => {
                const presenceState = presenceChannel.presenceState();
                setOnlinePlayers(Object.keys(presenceState).length);
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await presenceChannel.track({ online: true });
                }
            });

        // Cleanup — untrack presence + remove channels + clear debounce
        return () => {
            presenceChannel.untrack().catch(() => {});
            supabase.removeChannel(channel);
            supabase.removeChannel(presenceChannel);
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    const filteredTables = tables.filter(table => {
        if (activeFilter !== 'all') {
            if (activeFilter === 'nlh' && !['nlh', 'short_deck', 'flh'].includes(table.game_variant)) return false;
            if (activeFilter === 'plo' && !table.game_variant.startsWith('plo')) return false;
            if (activeFilter === 'ofc' && !table.game_variant.startsWith('ofc')) return false;
            if (activeFilter === 'tournaments' && (table as any).game_type !== 'tournament') return false;
        }
        if (searchQuery && !table.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });

    const totalPlaying = tables.reduce((sum, t) => sum + (t.current_players || 0), 0);

    return (
        <div className={styles.lobby}>
            {/* Hero Section */}
            <section className={styles.hero}>
                <div className={styles.heroContent}>
                    <h1 className={styles.heroTitle}>
                        <span className={styles.heroIcon}>♠</span>
                        Club Engine
                    </h1>
                    <p className={styles.heroSubtitle}>
                        Private poker clubs, better than ever.
                    </p>
                    <div className={styles.liveStats}>
                        <span className={styles.liveDot}></span>
                        <span>{onlinePlayers} online</span>
                        <span className={styles.divider}>•</span>
                        <span>{totalPlaying} playing</span>
                        <span className={styles.divider}>•</span>
                        <span>{tables.length} tables</span>
                    </div>
                </div>
                <QuickActions />
            </section>

            {/* Game Type Tabs */}
            <section className={styles.filterSection}>
                <GameTypeTabs
                    activeFilter={activeFilter}
                    onFilterChange={setActiveFilter}
                />

                <div className={styles.searchBox}>
                    <span className={styles.searchIcon}></span>
                    <input
                        type="text"
                        placeholder="Search tables..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className={styles.searchInput}
                    />
                </div>
            </section>

            {/* Tables Grid */}
            <section className={styles.tablesSection}>
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>Active Tables</h2>
                    <span className={styles.tableCount}>{filteredTables.length} tables</span>
                </div>

                {loading ? (
                    <div className={styles.emptyState}>
                        <span className={styles.emptyIcon}></span>
                        <h3>Loading tables...</h3>
                    </div>
                ) : filteredTables.length > 0 ? (
                    <div className={styles.tablesGrid}>
                        {filteredTables.map(table => (
                            <TableCard key={table.id} table={table} />
                        ))}
                    </div>
                ) : (
                    <div className={styles.emptyState}>
                        <span className={styles.emptyIcon}></span>
                        <h3>No tables found</h3>
                        <p>Try adjusting your filters or create a new table.</p>
                        <button className="btn btn-primary" onClick={() => navigate('/clubs')}>Create Table</button>
                    </div>
                )}
            </section>
        </div>
    );
}


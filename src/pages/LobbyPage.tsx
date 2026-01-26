/**
 *  CLUB ENGINE — Lobby Page
 * Main game lobby with tables, game types, and quick actions
 * WITH REAL-TIME UPDATES
 */

import { useState, useEffect } from 'react';
import styles from './LobbyPage.module.css';
import TableCard from '../components/lobby/TableCard';
import GameTypeTabs from '../components/lobby/GameTypeTabs';
import QuickActions from '../components/lobby/QuickActions';
import { tableService } from '../services/TableService';
import { supabase } from '../lib/supabase';
import type { PokerTable } from '../types/database.types';

type GameFilter = 'all' | 'nlh' | 'plo' | 'ofc' | 'tournaments';

export default function LobbyPage() {
    const [activeFilter, setActiveFilter] = useState<GameFilter>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [tables, setTables] = useState<PokerTable[]>([]);
    const [loading, setLoading] = useState(true);
    const [onlinePlayers, setOnlinePlayers] = useState(0);

    // Fetch tables and subscribe to real-time updates
    useEffect(() => {
        const fetchTables = async () => {
            try {
                setLoading(true);
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
                    // Refetch to get accurate player counts
                    tableService.getActiveTables().then(setTables);
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

        // Cleanup
        return () => {
            supabase.removeChannel(channel);
            supabase.removeChannel(presenceChannel);
        };
    }, []);

    const filteredTables = tables.filter(table => {
        if (activeFilter !== 'all') {
            if (activeFilter === 'nlh' && !['nlh', 'short_deck'].includes(table.game_variant)) return false;
            if (activeFilter === 'plo' && !table.game_variant.startsWith('plo')) return false;
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
                        <button className="btn btn-primary">Create Table</button>
                    </div>
                )}
            </section>
        </div>
    );
}


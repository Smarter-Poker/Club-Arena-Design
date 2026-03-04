/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DEALER PAGE — Admin Multi-Table Dealer Dashboard
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * React page that orchestrates simultaneous dealing across ALL tables with 2+ players.
 *
 * Features:
 * - Auto-discovers tables with seated players
 * - Starts HeadlessTableEngine for each table
 * - Real-time monitoring dashboard
 * - Shows table stakes, player count, hands dealt, engine status
 * - Auto-refresh every 5 seconds
 * - Uses useTabKeepAlive to prevent Chrome throttling
 *
 * Route: /dealer (no AuthGuard — this is an admin tool)
 */

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { HeadlessTableEngine } from '../engine/HeadlessTableEngine';
import { useTabKeepAlive } from '../hooks/useTabKeepAlive';

interface TableEngine {
    tableId: string;
    tableName: string;
    stakes: string;
    gameVariant: string;
    engine: HeadlessTableEngine;
    playerCount: number;
    handCount: number;
    isRunning: boolean;
    error?: string;
}

export default function DealerPage() {
    // Prevent Chrome from throttling this tab
    useTabKeepAlive();

    const [engines, setEngines] = useState<TableEngine[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastRefresh, setLastRefresh] = useState(new Date());
    const enginesRef = useRef<Map<string, HeadlessTableEngine>>(new Map());

    /**
     * Discover all tables with 2+ seated players
     */
    const discoverTables = async () => {
        try {
            // Query all tables
            const { data: allTables, error: tableError } = await supabase
                .from('tables')
                .select('id, name, small_blind, big_blind, game_variant');

            if (tableError || !allTables) {
                console.error('Failed to load tables:', tableError);
                return [];
            }

            const tableList: TableEngine[] = [];

            // For each table, count seated players
            for (const table of allTables) {
                const { data: seats, error: seatError } = await supabase
                    .from('table_seats')
                    .select('user_id')
                    .eq('table_id', table.id)
                    .is('left_at', null);

                if (!seatError && seats && seats.length >= 2) {
                    // Get or create engine for this table
                    let engine = enginesRef.current.get(table.id);
                    let isNewEngine = false;

                    if (!engine) {
                        engine = new HeadlessTableEngine(table.id, supabase);
                        enginesRef.current.set(table.id, engine);
                        isNewEngine = true;
                    }

                    tableList.push({
                        tableId: table.id,
                        tableName: table.name || `Table ${table.id.slice(0, 8)}`,
                        stakes: `${table.small_blind}/${table.big_blind}`,
                        gameVariant: table.game_variant || 'nlh',
                        engine,
                        playerCount: seats.length,
                        handCount: engine.getHandCount(),
                        isRunning: engine.isRunning(),
                    });

                    // Auto-start if this is a new engine
                    if (isNewEngine && !engine.isRunning()) {
                        console.log(`[DealerPage] Starting engine for ${table.name}`);
                        engine.start().catch(err => {
                            console.error(`Failed to start engine for ${table.id}:`, err);
                            // Mark error on table entry
                            setEngines(prev => prev.map(e =>
                                e.tableId === table.id
                                    ? { ...e, error: err.message }
                                    : e
                            ));
                        });
                    }
                }
            }

            return tableList;
        } catch (err) {
            console.error('Error discovering tables:', err);
            return [];
        }
    };

    /**
     * Refresh the dashboard
     */
    const refreshDashboard = async () => {
        const tables = await discoverTables();
        setEngines(tables);
        setLastRefresh(new Date());
    };

    // Initial load
    useEffect(() => {
        setLoading(true);
        refreshDashboard().finally(() => setLoading(false));
    }, []);

    // Auto-refresh every 5 seconds
    useEffect(() => {
        const interval = setInterval(refreshDashboard, 5000);
        return () => clearInterval(interval);
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            // Stop all engines on page unload
            enginesRef.current.forEach(engine => {
                if (engine.isRunning()) {
                    engine.stop();
                }
            });
        };
    }, []);

    if (loading && engines.length === 0) {
        return (
            <div style={styles.container}>
                <h1>Dealer Control Center</h1>
                <p>Loading tables...</p>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            <header style={styles.header}>
                <h1>Dealer Control Center</h1>
                <div style={styles.headerMeta}>
                    <span>Tables: {engines.length}</span>
                    <span style={styles.separator}>|</span>
                    <span>Last refresh: {lastRefresh.toLocaleTimeString()}</span>
                    <button onClick={refreshDashboard} style={styles.refreshBtn}>
                        Refresh Now
                    </button>
                </div>
            </header>

            {engines.length === 0 ? (
                <div style={styles.noTables}>
                    <p>No tables with 2+ players found.</p>
                    <p style={{ fontSize: '0.9em', color: '#666' }}>
                        Tables will appear here automatically when they have seated players.
                    </p>
                </div>
            ) : (
                <div style={styles.grid}>
                    {engines.map(table => (
                        <div key={table.tableId} style={styles.card}>
                            <div style={styles.cardHeader}>
                                <h3>{table.tableName}</h3>
                                <StatusBadge isRunning={table.isRunning} />
                            </div>

                            <div style={styles.cardBody}>
                                <div style={styles.row}>
                                    <span style={styles.label}>Stakes:</span>
                                    <span style={styles.value}>{table.stakes} ({table.gameVariant.toUpperCase()})</span>
                                </div>
                                <div style={styles.row}>
                                    <span style={styles.label}>Players:</span>
                                    <span style={styles.value}>{table.playerCount}</span>
                                </div>
                                <div style={styles.row}>
                                    <span style={styles.label}>Hands Dealt:</span>
                                    <span style={styles.value}>{table.handCount}</span>
                                </div>
                                <div style={styles.row}>
                                    <span style={styles.label}>Status:</span>
                                    <span style={{
                                        ...styles.value,
                                        color: table.error ? '#d32f2f' : table.isRunning ? '#388e3c' : '#ff9800'
                                    }}>
                                        {table.error ? `Error: ${table.error}` : table.isRunning ? 'Dealing' : 'Waiting'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <footer style={styles.footer}>
                <p>Auto-refresh interval: 5 seconds</p>
                <p style={{ fontSize: '0.85em', color: '#666' }}>
                    Tables with 2+ seated players are automatically discovered and dealt.
                </p>
            </footer>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS BADGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

function StatusBadge({ isRunning }: { isRunning: boolean }) {
    return (
        <div style={{
            ...styles.badge,
            backgroundColor: isRunning ? '#4caf50' : '#ff9800',
        }}>
            <span style={styles.badgeDot} />
            {isRunning ? 'Live' : 'Idle'}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const styles: Record<string, React.CSSProperties> = {
    container: {
        padding: '2rem',
        backgroundColor: '#f5f5f5',
        minHeight: '100vh',
        fontFamily: 'system-ui, -apple-system, sans-serif',
    },

    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem',
        backgroundColor: 'white',
        padding: '1.5rem',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    },

    headerMeta: {
        display: 'flex',
        gap: '1rem',
        alignItems: 'center',
        fontSize: '0.9em',
        color: '#666',
    },

    separator: {
        color: '#ccc',
    },

    refreshBtn: {
        padding: '0.5rem 1rem',
        backgroundColor: '#2196f3',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '0.9em',
        fontWeight: 500,
        transition: 'background-color 0.2s',
    },

    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: '1.5rem',
        marginBottom: '2rem',
    },

    card: {
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        overflow: 'hidden',
        transition: 'transform 0.2s, box-shadow 0.2s',
    },

    cardHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1rem 1.5rem',
        backgroundColor: '#f9f9f9',
        borderBottom: '1px solid #e0e0e0',
    },

    cardBody: {
        padding: '1.5rem',
    },

    row: {
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '0.75rem',
        fontSize: '0.95em',
    },

    label: {
        color: '#666',
        fontWeight: 500,
    },

    value: {
        fontWeight: 600,
        color: '#333',
    },

    badge: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.35rem 0.75rem',
        borderRadius: '20px',
        color: 'white',
        fontSize: '0.8em',
        fontWeight: 600,
    },

    badgeDot: {
        display: 'inline-block',
        width: '8px',
        height: '8px',
        backgroundColor: 'white',
        borderRadius: '50%',
        animation: 'pulse 2s infinite',
    },

    noTables: {
        textAlign: 'center',
        padding: '3rem',
        backgroundColor: 'white',
        borderRadius: '8px',
        color: '#666',
    },

    footer: {
        textAlign: 'center',
        color: '#999',
        fontSize: '0.85em',
        paddingTop: '2rem',
        borderTop: '1px solid #e0e0e0',
    },
};

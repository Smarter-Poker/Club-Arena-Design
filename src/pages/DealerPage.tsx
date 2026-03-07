/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DEALER PAGE — Admin Multi-Table Dealer & Tournament Dashboard
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Orchestrates simultaneous dealing across ALL cash tables + tournament tables.
 *
 * Cash Games:
 * - Auto-discovers tables with 2+ seated players
 * - Starts HeadlessTableEngine for each (staggered in batches of 5)
 *
 * Tournaments:
 * - Auto-discovers REGISTERING tournaments past their start time
 * - Starts TournamentEngine for each (staggered in batches of 3)
 * - Shows tournament status: blind level, remaining players, hands dealt
 *
 * Route: /dealer (no AuthGuard — this is an admin tool)
 */

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { HeadlessTableEngine } from '../engine/HeadlessTableEngine';
import { TournamentEngine } from '../engine/TournamentEngine';
import { useTabKeepAlive } from '../hooks/useTabKeepAlive';
import { horseOrchestrator } from '../services/HorseOrchestrator';
import { tournamentRecurringService } from '../services/TournamentRecurringService';
import { AutoRebuyService } from '../services/AutoRebuyService';
import { HorseLifecycleManager } from '../services/HorseLifecycleManager';
import { horseBugReporter } from '../services/HorseBugReporter';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

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

interface TournamentStatus {
    tournamentId: string;
    name: string;
    engine: TournamentEngine;
    playerCount: number;
    tableCount: number;
    handCount: number;
    currentLevel: number;
    isRunning: boolean;
    error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Stagger-start engines in batches to avoid overwhelming the browser */
const CASH_BATCH_SIZE = 5;
const TOURNAMENT_BATCH_SIZE = 3;
const BATCH_DELAY_MS = 500;

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function DealerPage() {
    useTabKeepAlive();

    const [engines, setEngines] = useState<TableEngine[]>([]);
    const [tournaments, setTournaments] = useState<TournamentStatus[]>([]);
    const [loading, setLoading] = useState(true);
    const [horseLaunchStatus, setHorseLaunchStatus] = useState<string | null>(null);
    const [horsesLaunched, setHorsesLaunched] = useState(false);
    const [isLaunching, setIsLaunching] = useState(false);
    const [startupProgress, setStartupProgress] = useState('');
    const [lastRefresh, setLastRefresh] = useState(new Date());
    const enginesRef = useRef<Map<string, HeadlessTableEngine>>(new Map());
    const tournamentsRef = useRef<Map<string, { engine: TournamentEngine; name: string }>>(new Map());
    const initialStartupDone = useRef(false);

    /**
     * Discover all cash tables with 2+ seated players (exclude tournament tables)
     * Uses a SINGLE seat query instead of N+1 queries per table.
     */
    const discoverTables = async (): Promise<TableEngine[]> => {
        try {
            const { data: allTables, error: tableError } = await supabase
                .from('tables')
                .select('id, name, small_blind, big_blind, game_variant, game_type, tournament_id');

            if (tableError || !allTables) {
                console.error('Failed to load tables:', tableError);
                return [];
            }

            // Filter out tournament tables — they're managed by TournamentEngine
            const cashTables = allTables.filter(t => !t.tournament_id && t.game_type !== 'tournament');

            // Single bulk query for ALL seat counts instead of N+1
            const cashTableIds = cashTables.map(t => t.id);
            const { data: allSeats, error: seatError } = await supabase
                .from('table_seats')
                .select('table_id, user_id')
                .in('table_id', cashTableIds)
                .is('left_at', null);

            if (seatError) {
                console.error('Failed to load seats:', seatError);
                return [];
            }

            // Group seats by table_id
            const seatsByTable = new Map<string, number>();
            for (const seat of (allSeats || [])) {
                seatsByTable.set(seat.table_id, (seatsByTable.get(seat.table_id) || 0) + 1);
            }

            const tableList: TableEngine[] = [];
            const newEngines: { table: typeof cashTables[0]; engine: HeadlessTableEngine }[] = [];

            for (const table of cashTables) {
                const seatCount = seatsByTable.get(table.id) || 0;
                if (seatCount < 2) continue;

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
                    playerCount: seatCount,
                    handCount: engine.getHandCount(),
                    isRunning: engine.isRunning(),
                });

                if (isNewEngine && !engine.isRunning()) {
                    newEngines.push({ table, engine });
                }
            }

            // Stagger-start new engines in batches
            if (newEngines.length > 0) {
                console.log(`[DealerPage] Starting ${newEngines.length} cash table engines in batches of ${CASH_BATCH_SIZE}`);
                for (let i = 0; i < newEngines.length; i += CASH_BATCH_SIZE) {
                    const batch = newEngines.slice(i, i + CASH_BATCH_SIZE);
                    setStartupProgress(`Starting cash tables ${i + 1}-${Math.min(i + CASH_BATCH_SIZE, newEngines.length)} of ${newEngines.length}...`);

                    for (const { table, engine } of batch) {
                        console.log(`[DealerPage] Starting engine for ${table.name}`);
                        engine.start().catch(err => {
                            console.error(`Failed to start engine for ${table.id}:`, err);
                            setEngines(prev => prev.map(e =>
                                e.tableId === table.id ? { ...e, error: err.message } : e
                            ));
                        });
                    }

                    // Wait between batches (skip wait on last batch)
                    if (i + CASH_BATCH_SIZE < newEngines.length) {
                        await sleep(BATCH_DELAY_MS);
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
     * Discover REGISTERING tournaments past their start time and start them.
     * Stagger-starts in batches to avoid overwhelming the browser.
     */
    const discoverTournaments = async (): Promise<TournamentStatus[]> => {
        try {
            const now = new Date().toISOString();

            // Find tournaments that should be started
            const { data: readyTournaments, error } = await supabase
                .from('tournaments')
                .select('id, name, start_time, current_players, status')
                .in('status', ['REGISTERING', 'ANNOUNCED'])
                .lte('start_time', now)
                .gte('current_players', 2);

            if (error) {
                console.error('Failed to discover tournaments:', error);
            }

            // Stagger-start any ready tournaments
            if (readyTournaments) {
                const newTournaments = readyTournaments.filter(t => !tournamentsRef.current.has(t.id));

                if (newTournaments.length > 0) {
                    console.log(`[DealerPage] Starting ${newTournaments.length} tournaments in batches of ${TOURNAMENT_BATCH_SIZE}`);

                    for (let i = 0; i < newTournaments.length; i += TOURNAMENT_BATCH_SIZE) {
                        const batch = newTournaments.slice(i, i + TOURNAMENT_BATCH_SIZE);
                        setStartupProgress(`Starting tournaments ${i + 1}-${Math.min(i + TOURNAMENT_BATCH_SIZE, newTournaments.length)} of ${newTournaments.length}...`);

                        for (const t of batch) {
                            console.log(`[DealerPage] Starting tournament: ${t.name} (${t.current_players} players)`);
                            const engine = new TournamentEngine(t.id, supabase);
                            tournamentsRef.current.set(t.id, { engine, name: t.name });

                            engine.start().catch(err => {
                                console.error(`Failed to start tournament ${t.id}:`, err);
                                setTournaments(prev => prev.map(te =>
                                    te.tournamentId === t.id ? { ...te, error: err.message } : te
                                ));
                            });
                        }

                        // Wait between batches (skip wait on last batch)
                        if (i + TOURNAMENT_BATCH_SIZE < newTournaments.length) {
                            await sleep(BATCH_DELAY_MS);
                        }
                    }
                }
            }

            // Also check for already RUNNING tournaments we should track
            const { data: runningTournaments } = await supabase
                .from('tournaments')
                .select('id, name')
                .eq('status', 'RUNNING');

            if (runningTournaments) {
                for (const t of runningTournaments) {
                    if (!tournamentsRef.current.has(t.id)) {
                        console.log(`[DealerPage] Tracking running tournament: ${t.name}`);
                        const engine = new TournamentEngine(t.id, supabase);
                        tournamentsRef.current.set(t.id, { engine, name: t.name });
                        engine.start().catch(err => {
                            console.error(`Failed to start running tournament ${t.id}:`, err);
                        });
                    }
                }
            }

            // Clean up stale finished engines — stop engine and remove from ref
            // so the list doesn't accumulate "Unknown/Finished" entries forever
            const staleIds: string[] = [];
            tournamentsRef.current.forEach(({ engine }, id) => {
                if (!engine.isRunning()) staleIds.push(id);
            });
            for (const id of staleIds) {
                const entry = tournamentsRef.current.get(id);
                if (entry) entry.engine.stop();
                tournamentsRef.current.delete(id);
            }

            // Fetch recently finished tournaments (last 2 hours) for display
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
            const { data: recentlyFinished } = await supabase
                .from('tournaments')
                .select('id, name, current_players, status, updated_at')
                .in('status', ['FINISHED', 'COMPLETED'])
                .gte('updated_at', twoHoursAgo)
                .order('updated_at', { ascending: false })
                .limit(10);

            // Build status list from tracked (running) tournaments + recently finished
            const statusList: TournamentStatus[] = [];

            // Active tournaments from engine refs
            tournamentsRef.current.forEach(({ engine, name }, id) => {
                statusList.push({
                    tournamentId: id,
                    name: name || engine.getTournamentName(),
                    engine,
                    playerCount: engine.getPlayerCount(),
                    tableCount: engine.getTableCount(),
                    handCount: engine.getHandCount(),
                    currentLevel: engine.getCurrentLevel(),
                    isRunning: engine.isRunning(),
                });
            });

            // Recently finished tournaments (display-only, no engine)
            if (recentlyFinished) {
                for (const t of recentlyFinished) {
                    // Skip if already in the active list
                    if (statusList.some(s => s.tournamentId === t.id)) continue;
                    statusList.push({
                        tournamentId: t.id,
                        name: t.name || 'Tournament',
                        engine: null as any, // No engine for finished tournaments
                        playerCount: 0,
                        tableCount: 0,
                        handCount: 0,
                        currentLevel: 0,
                        isRunning: false,
                    });
                }
            }

            return statusList;
        } catch (err) {
            console.error('Error discovering tournaments:', err);
            return [];
        }
    };

    /**
     * Refresh the dashboard
     */
    const refreshDashboard = async () => {
        const [tables, tournamentStatuses] = await Promise.all([
            discoverTables(),
            discoverTournaments(),
        ]);
        setEngines(tables);
        setTournaments(tournamentStatuses);
        setLastRefresh(new Date());
        if (!initialStartupDone.current) {
            initialStartupDone.current = true;
            setStartupProgress('');
        }
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

    // Start 24/7 horse services when horses are launched
    useEffect(() => {
        if (!horsesLaunched) return;

        console.log('[DealerPage] Starting 24/7 horse services...');

        // Start bug reporter for global error capture
        horseBugReporter.startCapturing();

        // Start recurring tournament creation (every 5 mins)
        tournamentRecurringService.start();

        // Start auto-rebuy monitoring (every 30 secs)
        AutoRebuyService.start();

        // Start lifecycle cleanup (every 60 secs)
        HorseLifecycleManager.start();

        console.log('[DealerPage] All 24/7 horse services ACTIVE');

        return () => {
            tournamentRecurringService.stop();
            AutoRebuyService.stop();
            HorseLifecycleManager.stop();
            horseBugReporter.stopCapturing();
            console.log('[DealerPage] 24/7 horse services stopped');
        };
    }, [horsesLaunched]);

    // Cleanup on unmount — stop all engines and clear refs to prevent duplicates
    useEffect(() => {
        return () => {
            enginesRef.current.forEach(engine => {
                if (engine.isRunning()) engine.stop();
            });
            enginesRef.current.clear();
            tournamentsRef.current.forEach(({ engine }) => {
                if (engine.isRunning()) engine.stop();
            });
            tournamentsRef.current.clear();
        };
    }, []);

    if (loading && engines.length === 0 && tournaments.length === 0) {
        return (
            <div style={styles.container}>
                <h1>Dealer Control Center</h1>
                <p>{startupProgress || 'Loading tables and tournaments...'}</p>
            </div>
        );
    }

    const totalHands = engines.reduce((s, e) => s + e.handCount, 0) +
        tournaments.reduce((s, t) => s + t.handCount, 0);

    return (
        <div style={styles.container}>
            <header style={styles.header}>
                <h1>Dealer Control Center</h1>
                <div style={styles.headerMeta}>
                    <span>Cash Tables: {engines.length}</span>
                    <span style={styles.separator}>|</span>
                    <span>Tournaments: {tournaments.length}</span>
                    <span style={styles.separator}>|</span>
                    <span>Total Hands: {totalHands}</span>
                    <span style={styles.separator}>|</span>
                    <span>Refresh: {lastRefresh.toLocaleTimeString()}</span>
                    <button onClick={refreshDashboard} style={styles.refreshBtn}>
                        Refresh Now
                    </button>
                    {!horsesLaunched && (
                        <button
                            disabled={isLaunching}
                            onClick={async () => {
                                if (isLaunching) return; // Guard against double-clicks
                                setIsLaunching(true);
                                setHorseLaunchStatus('Launching horses...');
                                try {
                                    const result = await horseOrchestrator.launch();
                                    setHorseLaunchStatus(`Launched: ${result.tablesCreated} cash tables, ${result.horsesSeated} horses + tournaments`);
                                    setHorsesLaunched(true);
                                    // Refresh dashboard to pick up new tables
                                    setTimeout(refreshDashboard, 2000);
                                } catch (err: any) {
                                    setHorseLaunchStatus(`Error: ${err.message}`);
                                    setIsLaunching(false); // Re-enable on error so user can retry
                                }
                            }}
                            style={{ ...styles.refreshBtn, background: isLaunching ? '#888' : '#4caf50', marginLeft: '8px', opacity: isLaunching ? 0.6 : 1 }}
                        >
                            {isLaunching ? 'Launching...' : 'Launch 100 Horses'}
                        </button>
                    )}
                    {horseLaunchStatus && (
                        <span style={{ color: horseLaunchStatus.includes('Error') ? '#d32f2f' : '#4caf50', marginLeft: '8px', fontSize: '0.85em' }}>
                            {horseLaunchStatus}
                        </span>
                    )}
                </div>
            </header>

            {/* ═══════ TOURNAMENTS SECTION ═══════ */}
            {tournaments.length > 0 && (
                <>
                    <h2 style={styles.sectionTitle}>Tournaments</h2>
                    <div style={styles.grid}>
                        {tournaments.map(t => (
                            <div key={t.tournamentId} style={{ ...styles.card, borderLeft: '4px solid #9c27b0' }}>
                                <div style={styles.cardHeader}>
                                    <h3>{t.name}</h3>
                                    <TournamentBadge isRunning={t.isRunning} />
                                </div>
                                <div style={styles.cardBody}>
                                    <div style={styles.row}>
                                        <span style={styles.label}>Players Left:</span>
                                        <span style={styles.value}>{t.playerCount}</span>
                                    </div>
                                    <div style={styles.row}>
                                        <span style={styles.label}>Tables:</span>
                                        <span style={styles.value}>{t.tableCount}</span>
                                    </div>
                                    <div style={styles.row}>
                                        <span style={styles.label}>Blind Level:</span>
                                        <span style={styles.value}>{t.currentLevel + 1}</span>
                                    </div>
                                    <div style={styles.row}>
                                        <span style={styles.label}>Hands Dealt:</span>
                                        <span style={styles.value}>{t.handCount}</span>
                                    </div>
                                    <div style={styles.row}>
                                        <span style={styles.label}>Status:</span>
                                        <span style={{
                                            ...styles.value,
                                            color: t.error ? '#d32f2f' : t.isRunning ? '#7b1fa2' : '#ff9800'
                                        }}>
                                            {t.error ? `Error: ${t.error}` : t.isRunning ? 'In Progress' : 'Finished'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* ═══════ CASH TABLES SECTION ═══════ */}
            <h2 style={styles.sectionTitle}>Cash Tables</h2>
            {engines.length === 0 ? (
                <div style={styles.noTables}>
                    <p>No cash tables with 2+ players found.</p>
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
                                    <span style={styles.value}>{table.stakes} ({(table.gameVariant || 'NLH').toUpperCase()})</span>
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
                    Cash tables with 2+ seated players are auto-dealt. REGISTERING tournaments past their start time are auto-started.
                </p>
            </footer>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BADGE COMPONENTS
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

function TournamentBadge({ isRunning }: { isRunning: boolean }) {
    return (
        <div style={{
            ...styles.badge,
            backgroundColor: isRunning ? '#9c27b0' : '#616161',
        }}>
            <span style={styles.badgeDot} />
            {isRunning ? 'Running' : 'Done'}
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

    sectionTitle: {
        fontSize: '1.3em',
        fontWeight: 600,
        color: '#333',
        marginBottom: '1rem',
        marginTop: '0.5rem',
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

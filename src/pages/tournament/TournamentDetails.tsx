/**
 * ♠ CLUB ARENA — Tournament Details Page
 * PokerBros-style tournament registration (PLAY CHIPS ONLY)
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { tournamentService } from '../../services/TournamentService';
import { supabase } from '../../lib/supabase';
import type { Tournament } from '../../types/database.types';
import { useAuthUser } from '../../hooks/useAuthUser';
import TournamentBracket from '../../components/tournament/TournamentBracket';
import './TournamentDetails.css';
import { useToast } from '../../components/common/Toast';

type TabId = 'detail' | 'entries' | 'ranking' | 'unions' | 'tables' | 'rewards';

interface TournamentEntry {
    id: string;
    user_id: string;
    username: string;
    avatar_url: string | null;
    position?: number;
    chips?: number;
    status: 'registered' | 'playing' | 'eliminated' | 'finished';
}

interface TournamentTable {
    id: string;
    name: string;
    status: string;
    max_players: number;
    current_players: number;
    small_blind: number;
    big_blind: number;
}

export default function TournamentDetails() {
    const { tournamentId } = useParams<{ tournamentId: string }>();
    const navigate = useNavigate();
    const { user, isHydrating } = useAuthUser();
    const toast = useToast();

    const [tournament, setTournament] = useState<Tournament | null>(null);
    const [activeTab, setActiveTab] = useState<TabId>('detail');
    const [entries, setEntries] = useState<TournamentEntry[]>([]);
    const [isRegistered, setIsRegistered] = useState(false);
    const [tables, setTables] = useState<TournamentTable[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showSignUpModal, setShowSignUpModal] = useState(false);
    const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0 });

    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (tournamentId) {
            loadTournament();
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [tournamentId]);

    useEffect(() => {
        if (tournament?.start_time) {
            startCountdown();
        }
    }, [tournament]);

    // Re-check registration status when user hydrates after tournament loaded
    useEffect(() => {
        if (user && tournament && entries.length > 0) {
            const registered = entries.some(e => e.user_id === user.id);
            setIsRegistered(registered);
        }
    }, [user, entries]);

    const loadTournament = async () => {
        if (!tournamentId) return;
        setIsLoading(true);
        try {
            const data = await tournamentService.getTournament(tournamentId);
            setTournament(data);

            if (data) {
                // Fetch tournament entries from supabase
                const { data: playersData, error } = await supabase
                    .from('tournament_players')
                    .select('id, user_id, username, chips, status, position')
                    .eq('tournament_id', data.id)
                    .order('registered_at', { ascending: true });

                if (!error && playersData) {
                    setEntries(playersData.map((e: {
                        id: string;
                        user_id: string;
                        username?: string | null;
                        chips?: number;
                        status: string;
                        position?: number | null;
                    }) => ({
                        id: e.id,
                        user_id: e.user_id,
                        username: e.username || 'Player',
                        avatar_url: null,
                        chips: e.chips || data.starting_chips,
                        position: e.position || undefined,
                        status: e.status as TournamentEntry['status'],
                    })));

                    // Check if current user is registered
                    if (user) {
                        const isUserRegistered = playersData.some((e: { user_id: string }) => e.user_id === user.id);
                        setIsRegistered(isUserRegistered);
                    }
                } else {
                    setEntries([]);
                }

                // Fetch tournament tables
                if (data.status === 'RUNNING') {
                    const { data: tablesData } = await supabase
                        .from('tables')
                        .select('id, name, status, max_players, current_players, small_blind, big_blind')
                        .eq('tournament_id', data.id);
                    setTables((tablesData || []) as TournamentTable[]);
                }
            }
        } catch (error) {
            console.error('Failed to load tournament:', error);
        }
        setIsLoading(false);
    };

    const startCountdown = () => {
        if (timerRef.current) clearInterval(timerRef.current);

        const updateCountdown = () => {
            if (!tournament) return;

            const now = new Date().getTime();

            // For RUNNING tournaments, show elapsed time since start
            if (tournament.status === 'RUNNING' && tournament.started_at) {
                const started = new Date(tournament.started_at).getTime();
                const elapsed = now - started;

                const hours = Math.floor(elapsed / (1000 * 60 * 60));
                const minutes = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((elapsed % (1000 * 60)) / 1000);

                setCountdown({ hours, minutes, seconds });
                return;
            }

            // For COMPLETED tournaments, show total duration
            if (tournament.status === 'COMPLETED' && tournament.started_at && tournament.ended_at) {
                const started = new Date(tournament.started_at).getTime();
                const ended = new Date(tournament.ended_at).getTime();
                const duration = ended - started;

                const hours = Math.floor(duration / (1000 * 60 * 60));
                const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((duration % (1000 * 60)) / 1000);

                setCountdown({ hours, minutes, seconds });
                if (timerRef.current) clearInterval(timerRef.current);
                return;
            }

            // For upcoming tournaments, countdown to start
            if (!tournament.start_time) return;
            const start = new Date(tournament.start_time).getTime();
            const diff = start - now;

            if (diff <= 0) {
                setCountdown({ hours: 0, minutes: 0, seconds: 0 });
                if (timerRef.current) clearInterval(timerRef.current);
                return;
            }

            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            setCountdown({ hours, minutes, seconds });
        };

        updateCountdown();
        timerRef.current = setInterval(updateCountdown, 1000);
    };

    const handleRegister = async () => {
        if (!tournament) return;
        if (!user) {
            toast.error('Loading your profile... please try again in a moment');
            return;
        }
        setShowSignUpModal(false);

        try {
            await tournamentService.registerPlayer(tournament.id, user.id, user.username || 'Player');
            setIsRegistered(true);
            // Defer reload so the UI updates instantly (fixes INP)
            setTimeout(() => loadTournament(), 50);
        } catch (error) {
            console.error('Registration failed:', error);
            const msg = (error as Error).message || 'Unknown error';
            toast.error(`Registration failed: ${msg}`);
        }
    };

    const handleUnregister = async () => {
        if (!tournament) return;
        if (!user) {
            toast.error('Loading your profile... please try again in a moment');
            return;
        }

        try {
            await tournamentService.unregisterPlayer(tournament.id, user.id);
            setIsRegistered(false);
            toast.success('Unregistered — buy-in refunded to your wallet');
            // Defer reload so the UI updates instantly (fixes INP)
            setTimeout(() => loadTournament(), 50);
        } catch (error) {
            console.error('Unregistration failed:', error);
            const msg = (error as Error).message || 'Unknown error';
            toast.error(`Unregister failed: ${msg}`);
        }
    };

    const formatCountdown = () => {
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${pad(countdown.hours)}:${pad(countdown.minutes)}:${pad(countdown.seconds)}`;
    };

    const formatDate = (date: string | null | undefined) => {
        if (!date) return 'TBD';
        return new Date(date).toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        }).replace(',', '');
    };

    const tabs: { id: TabId; label: string }[] = [
        { id: 'detail', label: 'Detail' },
        { id: 'entries', label: 'Entries' },
        { id: 'ranking', label: 'Ranking' },
        { id: 'unions', label: 'Unions' },
        { id: 'tables', label: 'Tables' },
        { id: 'rewards', label: 'Rewards' },
    ];

    if (isLoading) {
        return (
            <div className="tournament-details loading">
                <div className="loader-spinner" />
                <p>Loading tournament...</p>
            </div>
        );
    }

    if (!tournament) {
        return (
            <div className="tournament-details error">
                <h2>Tournament not found</h2>
                <Link to="/clubs" className="btn btn-primary">Back to Clubs</Link>
            </div>
        );
    }

    return (
        <div className="tournament-details">
            {/* Header */}
            <header className="details-header">
                <button className="back-btn" onClick={() => navigate(-1)}>‹‹</button>
                <h1>Game Details</h1>
                <div className="header-spacer" />
            </header>

            {/* Tabs */}
            <div className="details-tabs">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        className={`tab ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tournament Title */}
            <div className="tournament-title">
                <h2>{tournament.name}</h2>
                <span className="tournament-id">ID:{tournament.id.slice(0, 8)}</span>
                <button className="qr-btn">⊞</button>
            </div>

            {/* Tournament Description */}
            <div className="tournament-desc">
                <p>{tournament.name}</p>
                <p>{tournament.buy_in_amount}+{tournament.buy_in_fee || 0} CHIPS BUY-IN</p>
                <p>REBUY / NO ADD-ON</p>
            </div>

            {activeTab === 'detail' && (
                <>
                    {/* Countdown Timer */}
                    <div className="countdown-section">
                        <div className="countdown-display">
                            {formatCountdown()}
                        </div>
                        <div className="start-time">
                            {tournament.status === 'RUNNING' ? (
                                <span>Running since {formatDate(tournament.started_at)}</span>
                            ) : tournament.status === 'COMPLETED' ? (
                                <span>Completed — Total Duration</span>
                            ) : (
                                <span>Starts {formatDate(tournament.start_time)}</span>
                            )}
                        </div>
                    </div>

                    {/* Quick Stats */}
                    <div className="quick-stats">
                        <div className="stat">
                            <span className="stat-label">Status</span>
                            <span className="stat-value">{tournament.status}</span>
                        </div>
                        <div className="stat">
                            <span className="stat-label">Current Level</span>
                            <span className="stat-value">{tournament.current_level || 0}</span>
                        </div>
                        <div className="stat">
                            <span className="stat-label">Remaining</span>
                            <span className="stat-value">{entries.filter(e => e.status === 'playing' || e.status === 'registered').length}/{tournament.max_players || entries.length}</span>
                        </div>
                        <div className="stat">
                            <span className="stat-label">Avg. Stack</span>
                            <span className="stat-value">{entries.filter(e => e.status === 'playing').length > 0 ? Math.round(entries.filter(e => e.status === 'playing').reduce((s, e) => s + (e.chips || 0), 0) / entries.filter(e => e.status === 'playing').length).toLocaleString() : (tournament.starting_chips || 10000).toLocaleString()}</span>
                        </div>
                        <div className="stat">
                            <span className="stat-label">Tables</span>
                            <span className="stat-value">{tables.length}</span>
                        </div>
                        <div className="stat">
                            <span className="stat-label">Eliminated</span>
                            <span className="stat-value">{entries.filter(e => e.status === 'eliminated').length}</span>
                        </div>
                    </div>

                    {/* Game Info */}
                    <div className="game-info-section">
                        <div className="info-row">
                            <span className="info-label">Game Type:</span>
                            <span className="info-value highlight">{(tournament.game_type || 'nlh').toUpperCase()} ({tournament.max_players || 9} max)</span>
                        </div>
                        <div className="info-row">
                            <span className="info-label">Buy-in:</span>
                            <span className="info-value">{tournament.buy_in_amount}+{tournament.buy_in_fee || 0} chips <span className="badge-reentry">Re-entry</span></span>
                        </div>
                        {(() => {
                            const entryPrizePool = tournament.buy_in_amount * (entries.length || tournament.current_players || 0);
                            const hasGuarantee = (tournament.guaranteed_prize || 0) > 0;
                            const effectivePrizePool = hasGuarantee
                                ? Math.max(entryPrizePool, tournament.guaranteed_prize || 0)
                                : entryPrizePool;
                            return (
                                <div className="info-row">
                                    <span className="info-label">Prize Pool:</span>
                                    <span className="info-value">
                                        {effectivePrizePool > 0 ? effectivePrizePool.toLocaleString() : 'Based on entries'}
                                        {hasGuarantee && <> <span className="badge-gtd">{(tournament.guaranteed_prize || 0).toLocaleString()} GTD</span></>}
                                    </span>
                                </div>
                            );
                        })()}
                        <div className="info-row half">
                            <span className="info-label">Entries:</span>
                            <span className="info-value">{entries.length}</span>
                        </div>
                        <div className="info-row half">
                            <span className="info-label">Max Entries:</span>
                            <span className="info-value">{tournament.max_players || 'Unlimited'}</span>
                        </div>
                        <div className="info-row half">
                            <span className="info-label">Re-entry:</span>
                            <span className="info-value">{tournament.buy_in_amount}+{tournament.buy_in_fee || 0} chips</span>
                        </div>
                        <div className="info-row half">
                            <span className="info-label">Add-on:</span>
                            <span className="info-value">No Add-on</span>
                        </div>
                        <div className="info-row half">
                            <span className="info-label">Starting Chips:</span>
                            <span className="info-value">{(tournament.starting_chips || 10000).toLocaleString()}</span>
                        </div>
                        <div className="info-row half">
                            <span className="info-label">Big Blind Ante:</span>
                            <span className="info-value">No</span>
                        </div>
                        <div className="info-row">
                            <span className="info-label">Blind Structure:</span>
                            <span className="info-value">Standard <button className="help-btn">?</button></span>
                        </div>
                    </div>
                </>
            )}

            {activeTab === 'entries' && (
                <div className="entries-list">
                    {entries.length === 0 ? (
                        <div className="empty-state">
                            <p>No entries yet. Be the first to register!</p>
                        </div>
                    ) : (
                        entries.map((entry, idx) => (
                            <div key={entry.id} className="entry-row">
                                <span className="entry-rank">{idx + 1}</span>
                                <div className="entry-avatar"></div>
                                <div className="entry-info">
                                    <span className="entry-name">{entry.username}</span>
                                    <span className="entry-chips">{entry.chips || tournament.starting_chips} chips</span>
                                </div>
                                <span className={`entry-status ${entry.status}`}>{entry.status}</span>
                            </div>
                        ))
                    )}
                </div>
            )}

            {activeTab === 'ranking' && (
                <div className="ranking-section">
                    <TournamentBracket
                        tournamentId={tournamentId || ''}
                        totalPlayers={tournament.max_players || 0}
                    />
                </div>
            )}

            {activeTab === 'tables' && (
                <div className="tables-section">
                    <div className="tables-header">
                        <h3>Active Tables ({tables.length})</h3>
                        <span className="table-balance-indicator">Auto-balancing enabled</span>
                    </div>
                    <div className="tables-grid">
                        {tables.length === 0 ? (
                            <div className="empty-state">
                                <p>{tournament.status === 'RUNNING' ? 'Loading tables...' : 'Tables will be created when the tournament starts.'}</p>
                            </div>
                        ) : (
                            tables.map((table, idx) => (
                                <Link
                                    key={table.id}
                                    to={`/table/${table.id}`}
                                    className="table-card"
                                    style={{ textDecoration: 'none', color: 'inherit' }}
                                >
                                    <div className="table-num">{table.name || `Table ${idx + 1}`}</div>
                                    <div className="table-players">{table.current_players}/{table.max_players} players</div>
                                    <div className="table-blinds">{table.small_blind}/{table.big_blind}</div>
                                    <div className="table-status">{table.status}</div>
                                </Link>
                            ))
                        )}
                    </div>
                    <div className="balance-info">
                        <p>Tables are automatically balanced when player counts differ by 2+</p>
                    </div>
                </div>
            )}

            {activeTab === 'rewards' && (() => {
                const entryCount = entries.length || tournament.current_players || 0;
                const entryPrizePool = tournament.buy_in_amount * entryCount;
                const hasGuarantee = (tournament.guaranteed_prize || 0) > 0;
                const effectivePrizePool = hasGuarantee
                    ? Math.max(entryPrizePool, tournament.guaranteed_prize || 0)
                    : entryPrizePool;

                return (
                <div className="rewards-section">
                    <h3>Payout Structure</h3>
                    <div className="prize-pool-display">
                        <span className="prize-label">Total Prize Pool</span>
                        <span className="prize-amount">
                            {effectivePrizePool > 0 ? `${effectivePrizePool.toLocaleString()} chips` : 'Based on entries'}
                        </span>
                        {hasGuarantee && (
                            <span className="prize-gtd">{(tournament.guaranteed_prize || 0).toLocaleString()} GTD</span>
                        )}
                    </div>
                    <div className="payout-table">
                        {(tournament.payout_structure && tournament.payout_structure.length > 0) ? (
                            (typeof tournament.payout_structure === 'string'
                                ? (() => { try { return JSON.parse(tournament.payout_structure); } catch { return []; } })()
                                : tournament.payout_structure
                            ).map((payout: { position?: number; place?: number; percentage: number }) => {
                                const pos = payout.position || payout.place || 0;
                                return (
                                    <div key={pos} className="payout-row">
                                        <span className="payout-place">
                                            {pos === 1 && '1st'}
                                            {pos === 2 && '2nd'}
                                            {pos === 3 && '3rd'}
                                            {pos > 3 && `#${pos}`}
                                        </span>
                                        <span className="payout-percent">{payout.percentage}%</span>
                                        <span className="payout-chips">
                                            {effectivePrizePool > 0 ? (Math.trunc(effectivePrizePool * payout.percentage / 100 * 100) / 100).toLocaleString() : '—'}
                                        </span>
                                    </div>
                                );
                            })
                        ) : (
                            /* Default payout structure if none defined */
                            <>
                                <div className="payout-row"><span className="payout-place">🥇</span><span className="payout-percent">50%</span><span className="payout-chips">{effectivePrizePool > 0 ? Math.floor(effectivePrizePool * 0.5).toLocaleString() : '—'}</span></div>
                                <div className="payout-row"><span className="payout-place">🥈</span><span className="payout-percent">30%</span><span className="payout-chips">{effectivePrizePool > 0 ? Math.floor(effectivePrizePool * 0.3).toLocaleString() : '—'}</span></div>
                                <div className="payout-row"><span className="payout-place">🥉</span><span className="payout-percent">20%</span><span className="payout-chips">{effectivePrizePool > 0 ? Math.floor(effectivePrizePool * 0.2).toLocaleString() : '—'}</span></div>
                            </>
                        )}
                    </div>
                    {tournament.blind_structure && (() => {
                        const blinds = typeof tournament.blind_structure === 'string'
                            ? (() => { try { return JSON.parse(tournament.blind_structure); } catch { return []; } })()
                            : tournament.blind_structure;
                        return blinds.length > 0 ? (
                            <>
                                <h3 style={{ marginTop: '24px' }}>Blind Structure</h3>
                                <div className="blinds-table">
                                    <div className="blinds-header">
                                        <span>Level</span>
                                        <span>Blinds</span>
                                        <span>Ante</span>
                                        <span>Duration</span>
                                    </div>
                                    {blinds.slice(0, 10).map((level: any) => (
                                        <div key={level.level} className={`blinds-row ${tournament.current_level === level.level ? 'current-level' : ''}`}>
                                            <span className="level-num">{level.level}</span>
                                            <span className="level-blinds">{level.small_blind || level.smallBlind}/{level.big_blind || level.bigBlind}</span>
                                            <span className="level-ante">{level.ante || '-'}</span>
                                            <span className="level-duration">{level.duration_minutes || level.durationMinutes}m</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : null;
                    })()}
                </div>
                );
            })()}

            {/* Footer Actions */}
            <div className="details-footer">
                <button className="btn btn-share">Share</button>
                {tournament.status === 'RUNNING' ? (
                    <span className="tournament-status-badge running">In Progress</span>
                ) : tournament.status === 'COMPLETED' ? (
                    <span className="tournament-status-badge completed">Completed</span>
                ) : tournament.status === 'CANCELLED' ? (
                    <span className="tournament-status-badge cancelled">Cancelled</span>
                ) : isRegistered ? (
                    <button className="btn btn-unregister" onClick={handleUnregister}>
                        Unregister
                    </button>
                ) : (
                    <button className="btn btn-register" onClick={() => setShowSignUpModal(true)}>
                        Register
                    </button>
                )}
            </div>

            {/* Sign Up Modal */}
            {showSignUpModal && (
                <div className="modal-overlay" onClick={() => setShowSignUpModal(false)}>
                    <div className="signup-modal" onClick={(e) => e.stopPropagation()}>
                        <button className="modal-close" onClick={() => setShowSignUpModal(false)}>✕</button>
                        <h2>Sign Up</h2>
                        <div className="signup-row">
                            <span className="signup-label">Buy-in:</span>
                            <span className="signup-value">{tournament.buy_in_amount} chips</span>
                        </div>
                        <div className="signup-row">
                            <span className="signup-label">Rake (fee):</span>
                            <span className="signup-value">{tournament.buy_in_fee || 0} chips</span>
                        </div>
                        <div className="signup-row total">
                            <span className="signup-label">Total:</span>
                            <span className="signup-value">{tournament.buy_in_amount + (tournament.buy_in_fee || 0)} chips</span>
                        </div>
                        <div className="signup-row">
                            <span className="signup-label">Start time:</span>
                            <span className="signup-value">{formatDate(tournament.start_time)}</span>
                        </div>
                        <p className="signup-note">Cannot unregister within 1 minute of the start time</p>
                        <div className="signup-actions">
                            <button className="btn btn-cancel" onClick={() => setShowSignUpModal(false)}>
                                Cancel
                            </button>
                            <button className="btn btn-confirm" onClick={handleRegister}>
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export { TournamentDetails };

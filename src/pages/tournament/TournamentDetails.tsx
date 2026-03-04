/**
 * ♠ CLUB ARENA — Tournament Details Page
 * PokerBros-style tournament registration (PLAY CHIPS ONLY)
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { tournamentService } from '../../services/TournamentService';
import { supabase } from '../../lib/supabase';
import type { Tournament } from '../../types/database.types';
import { useUserStore } from '../../stores/useUserStore';
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

export default function TournamentDetails() {
    const { tournamentId } = useParams<{ tournamentId: string }>();
    const navigate = useNavigate();
    const { user } = useUserStore();
    const toast = useToast();

    const [tournament, setTournament] = useState<Tournament | null>(null);
    const [activeTab, setActiveTab] = useState<TabId>('detail');
    const [entries, setEntries] = useState<TournamentEntry[]>([]);
    const [isRegistered, setIsRegistered] = useState(false);
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
        if (tournament?.scheduled_start) {
            startCountdown();
        }
    }, [tournament]);

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
                    .select('id, user_id, username, avatar_url, chips, status')
                    .eq('tournament_id', data.id)
                    .order('created_at', { ascending: true });

                if (!error && playersData) {
                    setEntries(playersData.map((e: {
                        id: string;
                        user_id: string;
                        username?: string;
                        avatar_url?: string | null;
                        chips?: number;
                        status: string;
                    }) => ({
                        id: e.id,
                        user_id: e.user_id,
                        username: e.username || 'Player',
                        avatar_url: e.avatar_url || null,
                        chips: e.chips || data.starting_chips,
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
            }
        } catch (error) {
            console.error('Failed to load tournament:', error);
        }
        setIsLoading(false);
    };

    const startCountdown = () => {
        if (timerRef.current) clearInterval(timerRef.current);

        const updateCountdown = () => {
            if (!tournament?.scheduled_start) return;

            const now = new Date().getTime();
            const start = new Date(tournament.scheduled_start).getTime();
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
        if (!tournament || !user) return;
        setShowSignUpModal(false);

        try {
            // Use registerPlayer method with correct signature
            await tournamentService.registerPlayer(tournament.id, user.id, user.username || 'Player');
            setIsRegistered(true);
            loadTournament(); // Refresh entries
        } catch (error) {
            console.error('Registration failed:', error);
            toast.error('Registration failed. Please try again.');
        }
    };

    const handleUnregister = async () => {
        if (!tournament || !user) return;

        try {
            await tournamentService.unregisterPlayer(tournament.id, user.id);
            setIsRegistered(false);
            loadTournament();
        } catch (error) {
            console.error('Unregistration failed:', error);
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
                <p>{tournament.buy_in} CHIPS BUY-IN</p>
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
                            {formatDate(tournament.scheduled_start)}
                        </div>
                    </div>

                    {/* Quick Stats */}
                    <div className="quick-stats">
                        <div className="stat">
                            <span className="stat-label">Blinds Up</span>
                            <span className="stat-value">10:00</span>
                        </div>
                        <div className="stat">
                            <span className="stat-label">Late Registration</span>
                            <span className="stat-value">level 15</span>
                        </div>
                        <div className="stat">
                            <span className="stat-label">Current Level</span>
                            <span className="stat-value">0</span>
                        </div>
                        <div className="stat">
                            <span className="stat-label">Remaining Players</span>
                            <span className="stat-value">{tournament.current_players}/{tournament.max_players}</span>
                        </div>
                        <div className="stat">
                            <span className="stat-label">Avg. Stack</span>
                            <span className="stat-value">{tournament.starting_chips}K</span>
                        </div>
                        <div className="stat">
                            <span className="stat-label">Early Bird</span>
                            <span className="stat-value">LVL 2/+20% chips</span>
                        </div>
                    </div>

                    {/* Game Info */}
                    <div className="game-info-section">
                        <div className="info-row">
                            <span className="info-label">Game Type:</span>
                            <span className="info-value highlight">NLH (9 max)</span>
                        </div>
                        <div className="info-row">
                            <span className="info-label">Buy-in:</span>
                            <span className="info-value">{tournament.buy_in} chips <span className="badge-reentry">Re-entry</span></span>
                        </div>
                        <div className="info-row">
                            <span className="info-label">Prize Pool:</span>
                            <span className="info-value">{tournament.prize_pool || tournament.buy_in * tournament.current_players}K <span className="badge-gtd">GTD</span></span>
                        </div>
                        <div className="info-row half">
                            <span className="info-label">Entries:</span>
                            <span className="info-value">{entries.length}</span>
                        </div>
                        <div className="info-row half">
                            <span className="info-label">Entries Range:</span>
                            <span className="info-value">5-7K</span>
                        </div>
                        <div className="info-row half">
                            <span className="info-label">Re-entry:</span>
                            <span className="info-value">{tournament.buy_in} (x No Limit)</span>
                        </div>
                        <div className="info-row half">
                            <span className="info-label">Add-on:</span>
                            <span className="info-value">No Add-on</span>
                        </div>
                        <div className="info-row half">
                            <span className="info-label">Starting Chips:</span>
                            <span className="info-value">{tournament.starting_chips}K</span>
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
                        totalPlayers={tournament.max_players}
                    />
                </div>
            )}

            {activeTab === 'tables' && (
                <div className="tables-section">
                    <div className="tables-header">
                        <h3>Active Tables</h3>
                        <span className="table-balance-indicator">⚖️ Auto-balancing enabled</span>
                    </div>
                    <div className="tables-grid">
                        {/* Placeholder for active tables - would be fetched from tournament tables */}
                        <div className="table-card">
                            <div className="table-num">Table 1</div>
                            <div className="table-players">9/9 players</div>
                            <div className="table-blinds">25/50</div>
                        </div>
                        <div className="table-card">
                            <div className="table-num">Table 2</div>
                            <div className="table-players">8/9 players</div>
                            <div className="table-blinds">25/50</div>
                            <span className="needs-balance">⚠️ Needs player</span>
                        </div>
                    </div>
                    <div className="balance-info">
                        <p>🔄 Tables are automatically balanced when player counts differ by 2+</p>
                    </div>
                </div>
            )}

            {activeTab === 'rewards' && (
                <div className="rewards-section">
                    <h3>Payout Structure</h3>
                    <div className="prize-pool-display">
                        <span className="prize-label">Total Prize Pool</span>
                        <span className="prize-amount">
                            {(tournament.prize_pool || tournament.buy_in * tournament.current_players).toLocaleString()} chips
                        </span>
                    </div>
                    <div className="payout-table">
                        {(tournament.payout_structure && tournament.payout_structure.length > 0) ? (
                            tournament.payout_structure.map((payout) => (
                                <div key={payout.place} className="payout-row">
                                    <span className="payout-place">
                                        {payout.place === 1 && '🥇'}
                                        {payout.place === 2 && '🥈'}
                                        {payout.place === 3 && '🥉'}
                                        {payout.place > 3 && `#${payout.place}`}
                                    </span>
                                    <span className="payout-percent">{payout.percentage}%</span>
                                    <span className="payout-chips">
                                        {Math.floor((tournament.prize_pool || tournament.buy_in * tournament.current_players) * payout.percentage / 100).toLocaleString()}
                                    </span>
                                </div>
                            ))
                        ) : (
                            /* Default payout structure if none defined */
                            <>
                                <div className="payout-row"><span className="payout-place">🥇</span><span className="payout-percent">50%</span><span className="payout-chips">{Math.floor((tournament.prize_pool || tournament.buy_in * tournament.current_players) * 0.5).toLocaleString()}</span></div>
                                <div className="payout-row"><span className="payout-place">🥈</span><span className="payout-percent">30%</span><span className="payout-chips">{Math.floor((tournament.prize_pool || tournament.buy_in * tournament.current_players) * 0.3).toLocaleString()}</span></div>
                                <div className="payout-row"><span className="payout-place">🥉</span><span className="payout-percent">20%</span><span className="payout-chips">{Math.floor((tournament.prize_pool || tournament.buy_in * tournament.current_players) * 0.2).toLocaleString()}</span></div>
                            </>
                        )}
                    </div>
                    {tournament.blind_structure && tournament.blind_structure.length > 0 && (
                        <>
                            <h3 style={{ marginTop: '24px' }}>Blind Structure</h3>
                            <div className="blinds-table">
                                <div className="blinds-header">
                                    <span>Level</span>
                                    <span>Blinds</span>
                                    <span>Ante</span>
                                    <span>Duration</span>
                                </div>
                                {tournament.blind_structure.slice(0, 10).map((level) => (
                                    <div key={level.level} className="blinds-row">
                                        <span className="level-num">{level.level}</span>
                                        <span className="level-blinds">{level.smallBlind}/{level.bigBlind}</span>
                                        <span className="level-ante">{level.ante || '-'}</span>
                                        <span className="level-duration">{level.durationMinutes}m</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Footer Actions */}
            <div className="details-footer">
                <button className="btn btn-share">Share</button>
                {isRegistered ? (
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
                            <span className="signup-label">Entry Fee:</span>
                            <span className="signup-value">{tournament.buy_in} chips</span>
                        </div>
                        <div className="signup-row">
                            <span className="signup-label">Start time:</span>
                            <span className="signup-value">{formatDate(tournament.scheduled_start)}</span>
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

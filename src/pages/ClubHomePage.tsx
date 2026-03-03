/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CLUB HOME PAGE — PokerBros-Style Club Dashboard
 * ═══════════════════════════════════════════════════════════════════════════════
 * Main page after entering a club. Shows:
 * - Modified Smarter.Poker header (No XP, No Search, Settings = Club Settings)
 * - Club card with avatar, name, ID, member count
 * - Wallet display (Gold + Diamond chips)
 * - Bad Beat Jackpot display
 * - Game type filters (ALL, Hold'em, Omaha, Mixed, MTT, SNG)
 * - "Create New Table" button for club owners
 * - Active tables/games grid
 */

import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useUserStore } from '../stores/useUserStore';
import { useWalletStore } from '../stores/useWalletStore';
import haptic from '../services/HapticService';
import ClubBottomNav from '../components/club/ClubBottomNav';
import './ClubHomePage.css';

// Types
interface ClubData {
    id: string;
    club_id: number;
    name: string;
    description: string;
    avatar_url: string;
    member_count: number;
    online_count: number;
}

interface TableData {
    id: string;
    name: string;
    game_variant: string;
    stakes: string;
    current_players: number;
    max_players: number;
    status: string;
    small_blind: number;
    big_blind: number;
}

interface WalletBalances {
    gold: number;
    diamonds: number;
}

interface UserProfileData {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    player_number: number;
}

type GameFilter = 'ALL' | 'Hold\'em' | 'Omaha' | 'Mixed' | 'MTT' | 'SNG';

export default function ClubHomePage() {
    const { clubId } = useParams<{ clubId: string }>();
    const navigate = useNavigate();
    const { user } = useUserStore();
    const { diamonds } = useWalletStore();

    const [club, setClub] = useState<ClubData | null>(null);
    const [tables, setTables] = useState<TableData[]>([]);
    const [wallet, setWallet] = useState<WalletBalances>({ gold: 0, diamonds: 0 });
    const [jackpotAmount, setJackpotAmount] = useState(0);
    const [activeFilter, setActiveFilter] = useState<GameFilter>('ALL');
    const [isOwner, setIsOwner] = useState(false);
    const [loading, setLoading] = useState(true);
    const [userRole, setUserRole] = useState<'owner' | 'admin' | 'agent' | 'member'>('member');
    const [deletingTableId, setDeletingTableId] = useState<string | null>(null);

    // User profile data
    const [userProfile, setUserProfile] = useState<UserProfileData | null>(null);
    const [playerNumber, setPlayerNumber] = useState<string>('0000000');

    const filters: GameFilter[] = ['ALL', 'Hold\'em', 'Omaha', 'Mixed', 'MTT', 'SNG'];

    // Load user profile on mount
    useEffect(() => {
        loadUserProfile();
    }, []);

    useEffect(() => {
        if (clubId) {
            loadClubData();
        }
    }, [clubId]);

    const loadUserProfile = async () => {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) return;

        const { data: profileData } = await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url, player_number')
            .eq('id', authUser.id)
            .single();

        if (profileData) {
            setUserProfile(profileData as UserProfileData);
            // Format player number WITHOUT leading zeros
            // Use a deterministic hash of user ID as fallback if player_number is not set,
            // so the same user always sees the same number (not random on each render)
            const pNum = (profileData as any).player_number ||
                Math.abs([...profileData.id].reduce((h, c) => (h << 5) - h + c.charCodeAt(0), 0) % 9999999) + 1;
            setPlayerNumber(pNum.toString());
        }
    };

    const loadClubData = async () => {
        if (!clubId) return;
        setLoading(true);

        try {
            // Load club info
            const { data: clubData, error: clubError } = await supabase
                .from('clubs')
                .select('*')
                .eq('id', clubId)
                .single();

            if (clubError || !clubData) {
                console.error('Failed to load club:', clubError);
                setLoading(false);
                return;
            }

            setClub(clubData);

            // Check if current user is owner
            const { data: { user: authUser } } = await supabase.auth.getUser();
            if (authUser) {
                setIsOwner(clubData.owner_id === authUser.id);

                // Load user's wallet and role for this club
                const { data: memberData } = await supabase
                    .from('club_members')
                    .select('chip_balance, role')
                    .eq('club_id', clubId)
                    .eq('user_id', authUser.id)
                    .single();

                if (memberData) {
                    setWallet({
                        gold: memberData.chip_balance || 0,
                        diamonds: 0 // Note: Real diamond balance comes from useWalletStore
                    });
                    setUserRole(memberData.role || 'member');
                }
            }

            // Load tables
            const { data: tableData } = await supabase
                .from('tables')
                .select('*')
                .eq('club_id', clubId)
                .eq('is_deleted', false)
                .order('created_at', { ascending: false });

            if (tableData) {
                setTables(tableData);
            }

            // Load BBJ amount (bbj_pools table may not exist yet — graceful fallback)
            try {
                const { data: bbjData, error: bbjError } = await supabase
                    .from('bbj_pools')
                    .select('main_balance')
                    .limit(1)
                    .single();

                if (!bbjError && bbjData) {
                    setJackpotAmount(bbjData.main_balance || 0);
                }
            } catch {
                // BBJ table doesn't exist yet — show 0
            }

        } catch (error) {
            console.error('Error loading club data:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredTables = tables.filter(table => {
        if (activeFilter === 'ALL') return true;
        if (activeFilter === 'Hold\'em') return table.game_variant?.toLowerCase().includes('nlh') || table.game_variant?.toLowerCase().includes('holdem');
        if (activeFilter === 'Omaha') return table.game_variant?.toLowerCase().includes('plo') || table.game_variant?.toLowerCase().includes('omaha');
        if (activeFilter === 'MTT') return false;
        if (activeFilter === 'SNG') return false;
        return true;
    });

    const formatNumber = (num: number) => {
        return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const formatJackpot = (num: number) => {
        return num.toString().padStart(9, '0').replace(/(\d{3})(?=\d)/g, '$1,');
    };

    if (loading) {
        return (
            <div className="club-home loading">
                <div className="loader">Loading Club...</div>
            </div>
        );
    }

    if (!club) {
        return (
            <div className="club-home error">
                <h2>Club Not Found</h2>
                <Link to="/clubs" className="btn btn-primary">Back to Clubs</Link>
            </div>
        );
    }

    return (
        <div className="club-home">
            {/* ═══════════════════════════════════════════════════════════════════
                QUICK ACTION ICONS ROW
            ═══════════════════════════════════════════════════════════════════ */}
            <div className="club-home__actions-row">
                <button className="club-home__back-btn" onClick={() => { haptic.light(); navigate('/clubs'); }}>
                    ‹‹
                </button>
                <div className="club-home__quick-icons">
                    <button className="quick-icon" title="Events" onClick={() => haptic.selection()}>
                        <span className="icon-events"></span>
                    </button>
                    <button className="quick-icon" title="Leaderboard" onClick={() => haptic.selection()}>
                        <span className="icon-leaderboard"></span>
                    </button>
                </div>
                <div className="club-home__bbj">
                    <div className="bbj-label">BAD BEAT<br />JACKPOT</div>
                    <div className="bbj-amount">{formatJackpot(jackpotAmount)}</div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════════
                CLUB CARD + WALLET DISPLAY
            ═══════════════════════════════════════════════════════════════════ */}
            <div className="club-home__club-section">
                <div className="club-home__club-card">
                    <div className="club-card__avatar">
                        {club.avatar_url ? (
                            <img src={club.avatar_url} alt={club.name} />
                        ) : (
                            <span className="club-card__avatar-placeholder">&#9824;</span>
                        )}
                    </div>
                    <div className="club-card__info">
                        <h2 className="club-card__name">{club.name}</h2>
                        <div className="club-card__meta">
                            <span className="club-card__id">ID: {club.club_id}</span>
                            <span className="club-card__members">{club.member_count || 0}</span>
                            <button className="club-card__share" title="Share" onClick={() => haptic.medium()}>
                                <span className="icon-link"></span>
                            </button>
                        </div>
                    </div>
                </div>
                <div className="club-home__wallet">
                    <div className="wallet-row gold">
                        <span className="wallet-icon gold-icon"></span>
                        <span className="wallet-amount">{formatNumber(wallet.gold)}</span>
                        <button className="wallet-add-btn" onClick={() => haptic.medium()}>+</button>
                    </div>
                    <div className="wallet-row diamond">
                        <span className="wallet-icon diamond-icon"></span>
                        <span className="wallet-amount">{formatNumber(wallet.diamonds)}</span>
                        <button className="wallet-add-btn">+</button>
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════════
                CLUB INTRODUCTION
            ═══════════════════════════════════════════════════════════════════ */}
            <div className="club-home__intro">
                <p>{club.description || 'Enter the club introduction...(5000 characters limit).'}</p>
            </div>

            {/* ═══════════════════════════════════════════════════════════════════
                GAME TYPE FILTERS
            ═══════════════════════════════════════════════════════════════════ */}
            <div className="club-home__filters">
                {filters.map(filter => (
                    <button
                        key={filter}
                        className={`filter-tab ${activeFilter === filter ? 'active' : ''}`}
                        onClick={() => { haptic.selection(); setActiveFilter(filter); }}
                    >
                        {filter}
                    </button>
                ))}
                <button className="filter-more" onClick={() => haptic.light()}>▼</button>
            </div>

            {/* ═══════════════════════════════════════════════════════════════════
                GAMES GRID - Tables & Create New Table Button
            ═══════════════════════════════════════════════════════════════════ */}
            <div className="club-home__games">
                {/* CREATE NEW TABLE - Only visible to owners/admins */}
                {(isOwner || userRole === 'admin') && (
                    <Link to={`/clubs/${clubId}/create-table`} className="create-table-card">
                        <div className="create-table-card__table">
                            <div className="new-badge">NEW</div>
                            <div className="plus-icon">+</div>
                        </div>
                        <span className="create-table-card__label">Create new table</span>
                    </Link>
                )}

                {/* EXISTING TABLES */}
                {filteredTables.map(table => (
                    <div key={table.id} className="table-card-wrapper" style={{ position: 'relative' }}>
                        <Link
                            to={`/table/${table.id}`}
                            className="table-card"
                        >
                            <div className="table-card__header">
                                <span className="table-card__variant">{table.game_variant}</span>
                                <span className="table-card__seats">{table.max_players} Max</span>
                            </div>
                            <div className="table-card__body">
                                <h3 className="table-card__name">{table.name}</h3>
                                <div className="table-card__stakes">
                                    {table.small_blind}/{table.big_blind}
                                </div>
                                <div className="table-card__players">
                                    {table.current_players || 0}/{table.max_players} playing
                                </div>
                            </div>
                            <div className="table-card__status">
                                <span className={`status-dot ${table.status}`}></span>
                                {table.status}
                            </div>
                        </Link>
                        {/* Delete button for owners/admins */}
                        {(isOwner || userRole === 'admin') && (
                            <button
                                className="table-card__delete-btn"
                                onClick={async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (!confirm(`Delete table "${table.name}"?`)) return;
                                    setDeletingTableId(table.id);
                                    try {
                                        const { error } = await supabase.rpc('soft_delete_table', { table_id: table.id });
                                        if (error) throw error;
                                        setTables(prev => prev.filter(t => t.id !== table.id));
                                    } catch (err) {
                                        console.error('Failed to delete table:', err);
                                        alert('Failed to delete table');
                                    } finally {
                                        setDeletingTableId(null);
                                    }
                                }}
                                disabled={deletingTableId === table.id}
                                title="Delete table"
                            >
                                {deletingTableId === table.id ? '...' : '\u2715'}
                            </button>
                        )}
                    </div>
                ))}

                {/* EMPTY STATE */}
                {filteredTables.length === 0 && !isOwner && (
                    <div className="empty-tables">
                        <p>No tables available</p>
                        <p className="empty-hint">Check back later or wait for the owner to create tables.</p>
                    </div>
                )}
            </div>

            {/* ═══════════════════════════════════════════════════════════════════
                BACKGROUND IMAGE (Premium Bar Scene)
            ═══════════════════════════════════════════════════════════════════ */}
            <div className="club-home__background"></div>

            {/* ═══════════════════════════════════════════════════════════════════
                BOTTOM NAVIGATION BAR
            ═══════════════════════════════════════════════════════════════════ */}
            {clubId && (
                <ClubBottomNav
                    clubId={clubId}
                    userRole={userRole}
                    clubName={club?.name}
                />
            )}
        </div>
    );
}

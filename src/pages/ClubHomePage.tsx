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

import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useUserStore } from '../stores/useUserStore';
import { useWalletStore } from '../stores/useWalletStore';
import haptic from '../services/HapticService';
import ClubBottomNav from '../components/club/ClubBottomNav';
import { CashGameCard, TournamentCard, SNGCard, SpinCard } from '../components/lobby/DynamicGameCard';
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
    min_buy_in: number;
    max_buy_in: number;
    settings?: string;
}

interface TournamentData {
    id: string;
    name: string;
    game_type: string;
    buy_in_amount: number;
    buy_in_fee: number;
    guaranteed_prize: number | null;
    start_time: string;
    status: string;
    current_players: number;
    max_players: number;
    starting_chips: number;
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

type GameFilter = 'ALL' | 'Hold\'em' | 'Omaha' | 'Mixed' | 'MTT' | 'Spin-It' | 'SN';

// Premium number animation hook
function useCountAnimation(target: number, duration: number = 1000) {
    const [display, setDisplay] = useState(0);
    useEffect(() => {
        let startTime: number;
        let animationFrame: number;
        const animate = (time: number) => {
            if (!startTime) startTime = time;
            const progress = Math.min((time - startTime) / duration, 1);
            setDisplay(Math.floor(target * progress));
            if (progress < 1) animationFrame = requestAnimationFrame(animate);
        };
        animationFrame = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animationFrame);
    }, [target, duration]);
    return display;
}

export default function ClubHomePage() {
    const { clubId } = useParams<{ clubId: string }>();
    const navigate = useNavigate();
    const { user } = useUserStore();
    const { diamonds } = useWalletStore();

    // Refs to avoid stale closures in realtime subscriptions
    const clubIdRef = useRef(clubId);

    const [club, setClub] = useState<ClubData | null>(null);
    const [tables, setTables] = useState<TableData[]>([]);
    const [tournaments, setTournaments] = useState<TournamentData[]>([]);
    const [wallet, setWallet] = useState<WalletBalances>({ gold: 0, diamonds: 0 });
    const [jackpotAmount, setJackpotAmount] = useState(0);
    const [activeFilter, setActiveFilter] = useState<GameFilter>('ALL');
    const [isOwner, setIsOwner] = useState(false);
    const [loading, setLoading] = useState(true);
    const [userRole, setUserRole] = useState<'owner' | 'admin' | 'agent' | 'member'>('member');
    const [deletingTableId, setDeletingTableId] = useState<string | null>(null);
    const [isInUnion, setIsInUnion] = useState(false);

    // User profile data
    const [userProfile, setUserProfile] = useState<UserProfileData | null>(null);
    const [playerNumber, setPlayerNumber] = useState<string>('0000000');

    const filters: GameFilter[] = ['ALL', 'Hold\'em', 'Omaha', 'Mixed', 'MTT', 'Spin-It', 'SN'];

    // Premium number animations for stats
    const animatedMemberCount = useCountAnimation(club?.member_count || 0, 800);
    const animatedTableCount = useCountAnimation(club ? (tables.filter(t => t.status === 'running').length) : 0, 800);

    // Load user profile on mount
    useEffect(() => {
        loadUserProfile();
    }, []);

    useEffect(() => {
        if (clubId) {
            clubIdRef.current = clubId;
            loadClubData();
        }
    }, [clubId]);

    // ── Realtime subscription: live table updates (player counts, status) ──
    useEffect(() => {
        if (!clubId) return;

        const channel = supabase
            .channel(`club-tables-${clubId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'tables',
                    filter: `club_id=eq.${clubId}`,
                },
                (payload) => {
                    if (payload.eventType === 'UPDATE' && payload.new) {
                        setTables(prev =>
                            prev.map(t => t.id === payload.new.id ? { ...t, ...payload.new } : t)
                        );
                    } else if (payload.eventType === 'INSERT' && payload.new) {
                        setTables(prev => [payload.new as any, ...prev]);
                    } else if (payload.eventType === 'DELETE' && payload.old) {
                        setTables(prev => prev.filter(t => t.id !== (payload.old as any).id));
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'tournaments',
                    filter: `club_id=eq.${clubId}`,
                },
                (payload) => {
                    if (payload.eventType === 'UPDATE' && payload.new) {
                        setTournaments(prev =>
                            prev.map(t => t.id === payload.new.id ? { ...t, ...payload.new } : t)
                        );
                    } else if (payload.eventType === 'INSERT' && payload.new) {
                        setTournaments(prev => [payload.new as any, ...prev]);
                    } else if (payload.eventType === 'DELETE' && payload.old) {
                        setTournaments(prev => prev.filter(t => t.id !== (payload.old as any).id));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [clubId]);

    // ── Realtime subscription: club member count updates ──
    useEffect(() => {
        if (!clubId) return;

        const memberChannel = supabase
            .channel(`club-members-${clubId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'club_members',
                    filter: `club_id=eq.${clubId}`,
                },
                (payload) => {
                    if (payload.eventType === 'INSERT' || payload.eventType === 'DELETE') {
                        // Refresh club data to get updated member count
                        loadClubData();
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(memberChannel);
        };
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

            // Check if this club is inside a union
            let unionId: string | null = null;
            let unionClubIds: string[] = [clubId];
            try {
                const { data: ucRow, error: ucErr } = await supabase
                    .from('union_clubs')
                    .select('union_id')
                    .eq('club_id', clubId)
                    .limit(1)
                    .maybeSingle();
                if (!ucErr && ucRow) {
                    setIsInUnion(true);
                    unionId = ucRow.union_id;

                    // Get ALL club IDs in this union for aggregated queries
                    const { data: allUcRows } = await supabase
                        .from('union_clubs')
                        .select('club_id')
                        .eq('union_id', unionId);
                    if (allUcRows && allUcRows.length > 0) {
                        unionClubIds = allUcRows.map(r => r.club_id);
                    }
                }
            } catch {
                // Query error — fail-open for standalone clubs
            }

            // Load tables — union clubs get ALL union member tables
            const { data: tableData } = await supabase
                .from('tables')
                .select('*')
                .in('club_id', unionClubIds)
                .eq('is_deleted', false)
                .order('created_at', { ascending: false });

            if (tableData) {
                setTables(tableData);
            }

            // Load tournaments — union clubs get ALL union member tournaments + XMTT
            let allTournaments: TournamentData[] = [];

            // Club/union member tournaments
            const { data: clubTournamentData } = await supabase
                .from('tournaments')
                .select('*')
                .in('club_id', unionClubIds)
                .neq('status', 'COMPLETED')
                .order('start_time', { ascending: true });

            if (clubTournamentData) {
                allTournaments = [...clubTournamentData];
            }

            // If in union, also fetch XMTT (union-wide) tournaments
            if (unionId) {
                const { data: xmttData } = await supabase
                    .from('tournaments')
                    .select('*')
                    .eq('union_id', unionId)
                    .eq('is_xmtt', true)
                    .neq('status', 'COMPLETED')
                    .order('start_time', { ascending: true });

                if (xmttData) {
                    // Merge and deduplicate by id
                    const existingIds = new Set(allTournaments.map(t => t.id));
                    for (const xmtt of xmttData) {
                        if (!existingIds.has(xmtt.id)) {
                            allTournaments.push(xmtt);
                        }
                    }
                }
            }

            setTournaments(allTournaments);

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

    // Filter tables (hide tables when MTT/Spin-It/SN tab is active)
    const showTournaments = activeFilter === 'MTT' || activeFilter === 'SN' || activeFilter === 'Spin-It';
    const filteredTables = tables.filter(table => {
        if (showTournaments) return false; // Hide tables when viewing tournaments
        if (activeFilter === 'ALL') return true;
        if (activeFilter === 'Hold\'em') return table.game_variant?.toLowerCase().includes('nlh') || table.game_variant?.toLowerCase().includes('holdem');
        if (activeFilter === 'Omaha') return table.game_variant?.toLowerCase().includes('plo') || table.game_variant?.toLowerCase().includes('omaha');
        if (activeFilter === 'Mixed') {
            const v = table.game_variant?.toLowerCase() || '';
            return v.includes('pineapple') || v.includes('short_deck') || v.includes('ofc') || v.includes('mixed') || v.includes('double');
        }
        return true;
    });

    // Filter tournaments for MTT/SN/Spin-It tabs
    const filteredTournaments = tournaments.filter(t => {
        const isSpin = t.name.toLowerCase().includes('spin');
        const isSNG = !isSpin && (t.name.toLowerCase().includes('sng') || t.max_players <= 10);
        const isMTT = !isSpin && !isSNG;

        if (activeFilter === 'MTT') return isMTT;
        if (activeFilter === 'SN') return isSNG;
        if (activeFilter === 'Spin-It') return isSpin;
        if (activeFilter === 'ALL') return true;
        return false;
    });

    const formatNumber = (num: number) => {
        return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const formatTournamentTime = (isoTime: string) => {
        const d = new Date(isoTime);
        const now = new Date();
        const diff = d.getTime() - now.getTime();
        if (diff < 0) return 'LIVE';
        if (diff < 3600000) return `${Math.ceil(diff / 60000)}m`;
        if (diff < 86400000) return `${Math.ceil(diff / 3600000)}h`;
        return d.toLocaleDateString('en-US', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    };

    const formatJackpot = (num: number) => {
        if (num === 0) return '—';
        return num.toLocaleString();
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
            <style>{`
                @keyframes slideInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes slideInLeft { from { opacity: 0; transform: translateX(-16px); } to { opacity: 1; transform: translateX(0); } }
                .club-home__stats-animated { animation: slideInUp 0.6s cubic-bezier(0.34, 1.56, 0.64, 1); }
                .club-home__games-item-animated { animation: slideInUp 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; opacity: 0; }
                @keyframes shimmer { 0% { background-position: -1000px 0; } 100% { background-position: 1000px 0; } }
                .club-home__skeleton { background: linear-gradient(90deg, rgba(255,255,255,0.1) 25%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.1) 75%, rgba(255,255,255,0.1)); background-size: 1000px 100%; animation: shimmer 2s infinite; }
            `}</style>
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
                <div className="club-home__bbj" style={{ animation: `slideInUp 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both` }}>
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
                {/* CREATE NEW TABLE - Only visible to owners/admins of STANDALONE clubs (not in a union) */}
                {(isOwner || userRole === 'admin') && !isInUnion && (
                    <Link to={`/clubs/${clubId}/create-table`} className="create-table-card">
                        <div className="create-table-card__table">
                            <div className="new-badge">NEW</div>
                            <div className="plus-icon">+</div>
                        </div>
                        <span className="create-table-card__label">Create new table</span>
                    </Link>
                )}

                {/* EXISTING TABLES — Dynamic PokerBros-style cards */}
                {filteredTables.map((table, idx) => (
                    <div
                        key={table.id}
                        style={{
                            animation: `slideInUp 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) ${idx * 0.08}s both`
                        }}
                    >
                        <CashGameCard
                            table={table}
                            isAdmin={isOwner || userRole === 'admin'}
                            onDelete={async (id) => {
                            if (!confirm(`Delete table "${table.name}"?`)) return;
                            setDeletingTableId(id);
                            try {
                                const { error } = await supabase.from('tables').update({ status: 'deleted', is_active: false }).eq('id', id);
                                if (error) throw error;
                                setTables(prev => prev.filter(t => t.id !== id));
                            } catch (err) {
                                console.error('Failed to delete table:', err);
                                alert('Failed to delete table');
                            } finally {
                                setDeletingTableId(null);
                            }
                        }}
                        />
                    </div>
                ))}

                {/* TOURNAMENT CARDS — Dynamic PokerBros-style cards */}
                {filteredTournaments.map((tournament, idx) => {
                    const isSNG = tournament.name.toLowerCase().includes('sng') || tournament.max_players <= 10;
                    const isSpin = tournament.name.toLowerCase().includes('spin');
                    const staggerIdx = filteredTables.length + idx;

                    return (
                        <div
                            key={tournament.id}
                            style={{
                                animation: `slideInUp 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) ${staggerIdx * 0.08}s both`
                            }}
                        >
                            {isSpin && <SpinCard tournament={tournament} />}
                            {isSNG && !isSpin && <SNGCard tournament={tournament} />}
                            {!isSpin && !isSNG && <TournamentCard tournament={tournament} />}
                        </div>
                    );
                })}

                {/* EMPTY STATE */}
                {filteredTables.length === 0 && filteredTournaments.length === 0 && !isOwner && (
                    <div className="empty-tables">
                        <p>{showTournaments ? 'No tournaments available' : 'No tables available'}</p>
                        <p className="empty-hint">Check back later or wait for the owner to create {showTournaments ? 'tournaments' : 'tables'}.</p>
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

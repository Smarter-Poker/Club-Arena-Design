/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ♠ CLUB ARENA — Home Page (Redesigned Card Grid Layout)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Layout Structure:
 * - GlobalHeader (hub-style, hidden in iframe)
 * - Action Bar: CREATE A CLUB | FIND A PLAYER | JOIN A CLUB
 * - Featured Club: Shark Club (visible to ALL users)
 * - My Clubs Grid: All clubs the user owns or has joined
 * - Bottom 5 tiles: Player Stats, Leaderboards, Cashier, Diamond Store, Hand History
 */

import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useUserStore } from '../stores/useUserStore';
import { ClubsService } from '../services/ClubsService';
import { useToast } from '../components/common/Toast';
import GlobalHeader from '../components/navigation/GlobalHeader';
import haptic from '../services/HapticService';
import styles from './HomePage.module.css';

// Lazy-load heavy components to reduce initial bundle
const CreateClubModal = lazy(() => import('../components/modals/CreateClubModal'));
const FindPlayerModal = lazy(() => import('../components/modals/FindPlayerModal'));
const ClubStatsPanel = lazy(() => import('../components/club/ClubStatsPanel'));

const LAST_VISITED_KEY = 'club_arena_last_visited';
const LAST_CLUB_KEY = 'club_arena_last_club'; // For Cashier routing

// Custom frame images for cards
const getFrameImage = (index: number) => `${import.meta.env.BASE_URL}images/frames/frame-${(index % 5) + 1}.jpg`;

// Action button images
const ACTION_BAR_HORIZONTAL = `${import.meta.env.BASE_URL}images/icons/action-bar-horizontal.png`;

// Bottom Row Tile Images (baked cards)
const TILE_PLAYER_STATS = `${import.meta.env.BASE_URL}images/tiles/player-stats.jpg`;
const TILE_LEADERBOARDS = `${import.meta.env.BASE_URL}images/tiles/leaderboards.jpg`;
const TILE_CASHIER = `${import.meta.env.BASE_URL}images/tiles/cashier.jpg`;
const TILE_MARKETPLACE = `${import.meta.env.BASE_URL}images/tiles/marketplace.jpg`;
const TILE_HAND_HISTORIES = `${import.meta.env.BASE_URL}images/tiles/hand-histories.jpg`;

export default function HomePage() {
    const navigate = useNavigate();
    const { user } = useUserStore();
    const toast = useToast();

    // Detect if running inside iframe (World Hub embedding)
    const [isInIframe, setIsInIframe] = useState(false);

    useEffect(() => {
        const inIframe = window.parent !== window;
        setIsInIframe(inIframe);
        if (inIframe) {
            document.body.classList.add('embedded-in-iframe');
        }
        return () => {
            document.body.classList.remove('embedded-in-iframe');
        };
    }, []);

    // Real data states
    const [diamonds, setDiamonds] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [userClubs, setUserClubs] = useState<any[]>([]);

    // JOIN A CLUB modal state
    const [showJoinModal, setShowJoinModal] = useState(false);
    const [showCreateClubModal, setShowCreateClubModal] = useState(false);
    const [clubCode, setClubCode] = useState('');
    const [isValidatingCode, setIsValidatingCode] = useState(false);
    const [showReferralPrompt, setShowReferralPrompt] = useState(false);
    const [validClubId, setValidClubId] = useState<string | null>(null);
    const [referralCode, setReferralCode] = useState('');
    const joinInputRef = useRef<HTMLInputElement>(null);

    // Find Player modal state
    const [showFindPlayerModal, setShowFindPlayerModal] = useState(false);

    // Shark Club stats state
    const [sharkClubId, setSharkClubId] = useState<string | null>(null);
    const [sharkClubStats, setSharkClubStats] = useState({
        totalMembers: 0,
        clubLevel: 1,
        activePlayers: 0,
    });

    // Fetch user stats and clubs from Supabase
    useEffect(() => {
        async function fetchUserData() {
            setIsLoading(true);
            try {
                const { data: { user: authUser } } = await supabase.auth.getUser();
                if (authUser) {
                    // Fetch diamonds from profile
                    const { data: profileData } = await supabase
                        .from('profiles')
                        .select('diamonds')
                        .eq('id', authUser.id)
                        .maybeSingle();

                    if (profileData) {
                        setDiamonds(profileData.diamonds || 0);
                    }

                    // Fetch user's clubs (unlimited)
                    const memberships = await ClubsService.getUserMemberships();
                    const clubs = memberships?.map((m: any) => ({
                        ...m.club,
                        is_owner: m.role === 'owner',
                        member_count: m.club?.member_count || 0,
                        active_tables: m.club?.active_tables || 0,
                    })) || [];
                    setUserClubs(clubs);
                }
            } catch (err) {
                console.error('Error fetching user data:', err);
                toast.error('Failed to load user data');
            } finally {
                setIsLoading(false);
            }
        }
        fetchUserData();

        // Real-time subscription: user's club membership changes
        const setupRealtimeSubscription = async () => {
            const { data: { user: authUser } } = await supabase.auth.getUser();
            if (!authUser?.id) return;

            const channel = supabase
                .channel(`user-clubs-${authUser.id}`)
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'club_members',
                        filter: `user_id=eq.${authUser.id}`,
                    },
                    () => {
                        // Refresh user's clubs when membership changes
                        fetchUserData();
                    }
                )
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        };

        setupRealtimeSubscription();
    }, []);

    // Fetch Shark Club stats — ALL data from live Supabase queries
    useEffect(() => {
        async function fetchSharkClubStats() {
            try {
                // Find Shark Club by club_id = 25450
                const { data: club } = await supabase
                    .from('clubs')
                    .select('id')
                    .eq('club_id', 25450)
                    .maybeSingle();

                if (!club) return;
                setSharkClubId(club.id);

                // 1. Real member count from club_members table
                const { count: memberCount } = await supabase
                    .from('club_members')
                    .select('*', { count: 'exact', head: true })
                    .eq('club_id', club.id);

                // 2. Real active players: count occupied seats across ALL tables (platform-wide)
                let activePlayers = 0;
                const { count: seatCount } = await supabase
                    .from('table_seats')
                    .select('*', { count: 'exact', head: true })
                    .is('left_at', null);
                activePlayers = seatCount || 0;

                // 3. Club level — no column exists yet, default to 1
                const clubLevel = 1;

                setSharkClubStats({
                    totalMembers: memberCount || 0,
                    clubLevel,
                    activePlayers,
                });
            } catch (err) {
                console.error('Failed to fetch Shark Club stats:', err);
            }
        }
        fetchSharkClubStats();

        // Real-time clubs table updates for Shark Club stats
        const channel = supabase
            .channel('clubs-live-stats')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'clubs',
                    filter: 'club_id=eq.25450',
                },
                () => {
                    // Refresh Shark Club stats when club data changes
                    fetchSharkClubStats();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // ═══════════════════════════════════════════════════════════════════════════════
    // JOIN A CLUB LOGIC
    // ═══════════════════════════════════════════════════════════════════════════════
    const handleJoinClubSubmit = async () => {
        if (!clubCode.trim()) {
            toast.error('Please enter a club code');
            return;
        }

        // Validate that it's a 5-digit number
        const numericCode = parseInt(clubCode.trim(), 10);
        if (isNaN(numericCode) || numericCode < 10000 || numericCode > 99999) {
            toast.error('Club code must be a 5-digit number');
            return;
        }

        setIsValidatingCode(true);
        try {
            // Validate club code exists by club_id (5-digit integer)
            const { data: club, error } = await supabase
                .from('clubs')
                .select('id, name, club_id')
                .eq('club_id', numericCode)
                .maybeSingle();

            if (error || !club) {
                toast.error('Invalid club code. Please check and try again.');
                setIsValidatingCode(false);
                return;
            }

            // Valid club found - show referral prompt
            setValidClubId(club.id);
            setShowReferralPrompt(true);
        } catch (err) {
            console.error('Error validating club code:', err);
            toast.error('Failed to validate club code');
        } finally {
            setIsValidatingCode(false);
        }
    };

    const handleJoinWithReferral = async () => {
        if (!validClubId) return;

        try {
            // Store referral code for future tracking/attribution
            if (referralCode) {
                localStorage.setItem(`referral_${validClubId}`, referralCode);
            }
            await ClubsService.join(validClubId);
            toast.success('Successfully joined the club!');
            setShowJoinModal(false);
            setShowReferralPrompt(false);
            setClubCode('');
            setReferralCode('');
            setValidClubId(null);
            // Refresh clubs
            window.location.reload();
        } catch (err: any) {
            toast.error(err.message || 'Failed to join club');
        }
    };

    const handleJoinWithoutReferral = async () => {
        if (!validClubId) return;

        try {
            await ClubsService.join(validClubId);
            toast.success('Successfully joined the club!');
            setShowJoinModal(false);
            setShowReferralPrompt(false);
            setClubCode('');
            setValidClubId(null);
            // Refresh clubs
            window.location.reload();
        } catch (err: any) {
            toast.error(err.message || 'Failed to join club');
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════════
    // USER'S CLUBS — excluding the featured Shark Club (25450) to avoid duplicate
    // in the showcase row. These appear as side cards flanking the featured card.
    // ═══════════════════════════════════════════════════════════════════════════════
    const sideClubs = userClubs.filter(
        (club) => club.id !== sharkClubId
    );

    // Split side clubs into left and right groups for the World Hub layout
    const leftClubs = sideClubs.filter((_: any, i: number) => i % 2 === 0);
    const rightClubs = sideClubs.filter((_: any, i: number) => i % 2 === 1);

    return (
        <div className={styles.container}>
            {/* Background with circuit pattern */}
            <div className={styles.backgroundLayer}>
                <div className={styles.circuitPattern}></div>
                <div className={styles.glowOrb1}></div>
                <div className={styles.glowOrb2}></div>
                <div className={styles.glowOrb3}></div>
            </div>

            {/* GLOBAL HEADER - Hub-style, hide when embedded in iframe */}
            {!isInIframe && <GlobalHeader />}

            {/* ═══════════════════════════════════════════════════════════════════════
                MAIN CONTENT — Scrollable card layout
            ═══════════════════════════════════════════════════════════════════════ */}
            <div className={styles.mainContent}>

                {/* ═══════════════════════════════════════════════════════════════════════
                    HORIZONTAL ACTION BAR - Below Header (with clickable zones)
                ═══════════════════════════════════════════════════════════════════════ */}
                <div className={styles.actionBarRow}>
                    <div className={styles.actionBarWrapper}>
                        <img src={ACTION_BAR_HORIZONTAL} alt="Action Bar" className={styles.actionBarImage} />
                        {/* Clickable zones positioned over the image */}
                        <button
                            className={styles.actionZoneLeft}
                            onClick={() => setShowCreateClubModal(true)}
                            aria-label="Create a Club"
                        />
                        <button
                            className={styles.actionZoneCenter}
                            onClick={() => { haptic.medium(); setShowFindPlayerModal(true); }}
                            aria-label="Find a Player"
                        />
                        <button
                            className={styles.actionZoneRight}
                            onClick={() => {
                                setShowJoinModal(true);
                                setTimeout(() => joinInputRef.current?.focus(), 100);
                            }}
                            aria-label="Join a Club"
                        />
                    </div>
                </div>

                {/* ═══════════════════════════════════════════════════════════════════════
                    CARD SHOWCASE — World Hub Style Layout
                    Center: Shark Club (Featured, larger, raised)
                    Sides: User's clubs (smaller, angled perspective)
                ═══════════════════════════════════════════════════════════════════════ */}
                <div className={styles.showcaseContainer}>
                    {/* LEFT SIDE CLUBS */}
                    <div className={styles.sideColumn}>
                        {leftClubs.map((club: any, idx: number) => (
                            <div
                                key={club.id}
                                className={`${styles.sideCard} ${styles.sideCardLeft}`}
                                onClick={() => {
                                    haptic.medium();
                                    localStorage.setItem(LAST_VISITED_KEY, club.id);
                                    localStorage.setItem(LAST_CLUB_KEY, club.id);
                                    navigate(`/clubs/${club.id}`);
                                }}
                            >
                                <img src={getFrameImage(idx)} alt="" className={styles.sideCardFrame} />
                                <div className={styles.sideCardInner}>
                                    <h3 className={styles.sideCardTitle}>
                                        {club.name?.toUpperCase() || 'MY CLUB'}
                                    </h3>
                                    <span className={styles.sideCardRole}>
                                        {club.is_owner ? 'OWNER' : 'MEMBER'}
                                    </span>
                                    <div className={styles.sideCardCenter}>
                                        {club.logo_url ? (
                                            <img src={club.logo_url} alt="" className={styles.sideCardLogo} />
                                        ) : (
                                            <div className={styles.sideCardIcon}>♣</div>
                                        )}
                                    </div>
                                    <div className={styles.sideCardStats}>
                                        <span>{club.member_count || 0} Members</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* CENTER — FEATURED SHARK CLUB */}
                    <div className={styles.centerColumn}>
                        <div
                            className={styles.featuredCard}
                            onClick={() => {
                                haptic.success();
                                if (sharkClubId) {
                                    localStorage.setItem(LAST_VISITED_KEY, sharkClubId);
                                    localStorage.setItem(LAST_CLUB_KEY, sharkClubId);
                                    navigate(`/clubs/${sharkClubId}`);
                                } else {
                                    toast.info('Shark Club not found. Join or create a club!');
                                }
                            }}
                        >
                            <Suspense fallback={<div className={styles.cardSkeleton}>Loading...</div>}>
                                <ClubStatsPanel
                                    totalMembers={sharkClubStats.totalMembers}
                                    clubLevel={sharkClubStats.clubLevel}
                                    activePlayers={sharkClubStats.activePlayers}
                                />
                            </Suspense>
                        </div>
                    </div>

                    {/* RIGHT SIDE CLUBS */}
                    <div className={styles.sideColumn}>
                        {rightClubs.map((club: any, idx: number) => (
                            <div
                                key={club.id}
                                className={`${styles.sideCard} ${styles.sideCardRight}`}
                                onClick={() => {
                                    haptic.medium();
                                    localStorage.setItem(LAST_VISITED_KEY, club.id);
                                    localStorage.setItem(LAST_CLUB_KEY, club.id);
                                    navigate(`/clubs/${club.id}`);
                                }}
                            >
                                <img src={getFrameImage(idx + 2)} alt="" className={styles.sideCardFrame} />
                                <div className={styles.sideCardInner}>
                                    <h3 className={styles.sideCardTitle}>
                                        {club.name?.toUpperCase() || 'MY CLUB'}
                                    </h3>
                                    <span className={styles.sideCardRole}>
                                        {club.is_owner ? 'OWNER' : 'MEMBER'}
                                    </span>
                                    <div className={styles.sideCardCenter}>
                                        {club.logo_url ? (
                                            <img src={club.logo_url} alt="" className={styles.sideCardLogo} />
                                        ) : (
                                            <div className={styles.sideCardIcon}>♣</div>
                                        )}
                                    </div>
                                    <div className={styles.sideCardStats}>
                                        <span>{club.member_count || 0} Members</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* No Clubs Message */}
                {!isLoading && userClubs.length === 0 && (
                    <div className={styles.noClubsMessage}>
                        <p>Welcome to Club Arena</p>
                        <p>Create or join a club to get started!</p>
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════════════════════════
                    DAILY CHALLENGES — 3 rotating daily objectives
                ═══════════════════════════════════════════════════════════════════════ */}
                <div style={{ padding: '0 16px', marginBottom: 16 }}>
                    <h3 style={{
                        fontSize: '0.85rem', fontWeight: 800, color: '#e0b340',
                        margin: '0 0 10px', letterSpacing: '0.5px',
                    }}>DAILY CHALLENGES</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {(() => {
                            const today = new Date();
                            const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
                            const CHALLENGES = [
                                { title: 'Win 3 Hands', icon: '🏆', reward: 50, target: 3 },
                                { title: 'Play 20 Hands', icon: '🃏', reward: 30, target: 20 },
                                { title: 'Win a Pot > 100 BB', icon: '💰', reward: 75, target: 1 },
                                { title: 'Play 2 Different Tables', icon: '🎯', reward: 40, target: 2 },
                                { title: 'Win 5 Hands Pre-Flop', icon: '⚡', reward: 60, target: 5 },
                                { title: 'Play for 30 Minutes', icon: '⏱️', reward: 45, target: 30 },
                                { title: 'Win 2 All-In Pots', icon: '🔥', reward: 80, target: 2 },
                                { title: 'See 10 Flops', icon: '👁️', reward: 25, target: 10 },
                                { title: 'Win a Hand with a Flush', icon: '♠️', reward: 100, target: 1 },
                            ];
                            // Pick 3 unique deterministic challenges for today
                            const picked: typeof CHALLENGES[0][] = [];
                            const usedIndices = new Set<number>();
                            for (let i = 0; i < 3; i++) {
                                let idx = ((seed * (i + 7) * 7919) % CHALLENGES.length);
                                while (usedIndices.has(idx)) idx = (idx + 1) % CHALLENGES.length;
                                usedIndices.add(idx);
                                picked.push(CHALLENGES[idx]);
                            }
                            const dayKey = `challenges_${seed}`;
                            let stored: Record<string, number> = {};
                            try { stored = JSON.parse(localStorage.getItem(dayKey) || '{}'); }
                            catch { localStorage.removeItem(dayKey); }

                            return picked.map((ch, i) => {
                                const progress = stored[i] || 0;
                                const pct = Math.min(100, (progress / ch.target) * 100);
                                return (
                                    <div key={i} style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '10px 12px', borderRadius: 10,
                                        background: pct >= 100 ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.03)',
                                        border: `1px solid ${pct >= 100 ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.06)'}`,
                                    }}>
                                        <span style={{ fontSize: '1.3rem' }}>{ch.icon}</span>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#e0e8f0' }}>{ch.title}</span>
                                                <span style={{ fontSize: '0.65rem', color: '#e0b340', fontWeight: 700 }}>+{ch.reward} 💎</span>
                                            </div>
                                            <div style={{
                                                height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)',
                                                overflow: 'hidden',
                                            }}>
                                                <div style={{
                                                    height: '100%', borderRadius: 2, width: `${pct}%`,
                                                    background: pct >= 100 ? '#22c55e' : 'linear-gradient(90deg, #e0b340, #f0d060)',
                                                    transition: 'width 0.3s ease',
                                                }} />
                                            </div>
                                        </div>
                                    </div>
                                );
                            });
                        })()}
                    </div>
                </div>

                {/* ═══════════════════════════════════════════════════════════════════════
                    BOTTOM ROW — 5 Quick Link Tile Cards
                ═══════════════════════════════════════════════════════════════════════ */}
                <div className={styles.bottomRow}>
                    <button className={styles.tileCard} onClick={() => navigate('/profile')}>
                        <img src={TILE_PLAYER_STATS} alt="Player Stats" className={styles.tileImage} />
                    </button>
                    <button className={styles.tileCard} onClick={() => navigate('/leaderboard')}>
                        <img src={TILE_LEADERBOARDS} alt="Leaderboards" className={styles.tileImage} />
                    </button>
                    <button className={styles.tileCard} onClick={() => {
                        // Route to last club's cashier, or first club if no last club
                        const lastClub = localStorage.getItem(LAST_CLUB_KEY);
                        if (lastClub) {
                            navigate(`/clubs/${lastClub}/cashier`);
                        } else if (userClubs.length > 0) {
                            navigate(`/clubs/${userClubs[0].id}/cashier`);
                        } else {
                            toast.info('Join a club first to access the cashier');
                        }
                    }}>
                        <img src={TILE_CASHIER} alt="Cashier" className={styles.tileImage} />
                    </button>
                    <button className={styles.tileCard} onClick={() => {
                        // Navigate to Hub Marketplace (parent World Hub)
                        if (window.parent !== window) {
                            // In iframe - use postMessage to navigate parent
                            window.parent.postMessage({ type: 'NAVIGATE', path: '/hub/marketplace' }, window.location.origin);
                        } else {
                            // Standalone - redirect to Hub
                            window.location.href = 'https://smarter.poker/hub/marketplace';
                        }
                    }}>
                        <img src={TILE_MARKETPLACE} alt="Marketplace" className={styles.tileImage} />
                    </button>
                    <button className={styles.tileCard} onClick={() => navigate('/hands')}>
                        <img src={TILE_HAND_HISTORIES} alt="Hand Histories" className={styles.tileImage} />
                    </button>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════════════
                JOIN A CLUB MODAL
            ═══════════════════════════════════════════════════════════════════════ */}
            {showJoinModal && (
                <div className={styles.modalOverlay} onClick={() => {
                    setShowJoinModal(false);
                    setShowReferralPrompt(false);
                    setClubCode('');
                    setReferralCode('');
                    setValidClubId(null);
                }}>
                    <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                        {!showReferralPrompt ? (
                            <>
                                <h2 className={styles.modalTitle}>Join a Club</h2>
                                <div className={styles.inputGroup}>
                                    <input
                                        ref={joinInputRef}
                                        type="tel"
                                        inputMode="numeric"
                                        pattern="[0-9]{5}"
                                        maxLength={5}
                                        className={styles.clubCodeInput}
                                        placeholder="Enter 5-Digit Club Code"
                                        value={clubCode}
                                        onChange={(e) => setClubCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                                        onKeyDown={(e) => e.key === 'Enter' && handleJoinClubSubmit()}
                                    />
                                </div>
                                <div className={styles.modalButtons}>
                                    <button
                                        className={styles.modalButtonPrimary}
                                        onClick={handleJoinClubSubmit}
                                        disabled={isValidatingCode}
                                    >
                                        {isValidatingCode ? 'Validating...' : 'Continue'}
                                    </button>
                                    <button
                                        className={styles.modalButtonSecondary}
                                        onClick={() => setShowJoinModal(false)}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <h2 className={styles.modalTitle}>Referral Code</h2>
                                <p className={styles.modalSubtitle}>
                                    Enter a referral code or join without one
                                </p>
                                <div className={styles.inputGroup}>
                                    <input
                                        type="text"
                                        className={styles.clubCodeInput}
                                        placeholder="Referral Code (Optional)"
                                        value={referralCode}
                                        onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                                    />
                                </div>
                                <div className={styles.modalButtons}>
                                    <button
                                        className={styles.modalButtonPrimary}
                                        onClick={handleJoinWithReferral}
                                    >
                                        Join with Referral
                                    </button>
                                    <button
                                        className={styles.modalButtonSecondary}
                                        onClick={handleJoinWithoutReferral}
                                    >
                                        Join Without Referral
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* CREATE A CLUB MODAL */}
            <Suspense fallback={null}>
                <CreateClubModal
                    isOpen={showCreateClubModal}
                    onClose={() => setShowCreateClubModal(false)}
                    onSuccess={(clubId) => {
                        setShowCreateClubModal(false);
                        navigate(`/clubs/${clubId}`);
                    }}
                />
            </Suspense>

            {/* FIND A PLAYER MODAL */}
            <Suspense fallback={null}>
                <FindPlayerModal
                    isOpen={showFindPlayerModal}
                    onClose={() => setShowFindPlayerModal(false)}
                />
            </Suspense>

            {/* Loading indicator */}
            {isLoading && (
                <div className={styles.loadingOverlay}>
                    <div className={styles.spinner}></div>
                </div>
            )}
        </div>
    );
}

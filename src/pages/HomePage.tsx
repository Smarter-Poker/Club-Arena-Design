/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CLUB ARENA — Home Page (World Hub Cinematic Design)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Layout Structure:
 * - GlobalHeader (hub-style, hidden in iframe)
 * - Dark cinematic background (grid floor + volumetric light + vignette)
 * - Action Bar: CREATE A CLUB | FIND A PLAYER | JOIN A CLUB
 * - Featured Club: Shark Club (holographic center card)
 * - My Clubs: Holographic card row
 * - Daily Challenges: Glass-morphism panel
 * - Bottom tiles: Holographic standing cards
 */

import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
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

// Action button images
const ACTION_BAR_HORIZONTAL = `${import.meta.env.BASE_URL}images/icons/action-bar-horizontal.png`;

// Bottom Row Tile Images (baked cards)
const TILE_PLAYER_STATS = `${import.meta.env.BASE_URL}images/tiles/player-stats.jpg`;
const TILE_LEADERBOARDS = `${import.meta.env.BASE_URL}images/tiles/leaderboards.jpg`;
const TILE_CASHIER = `${import.meta.env.BASE_URL}images/tiles/cashier.jpg`;
const TILE_MARKETPLACE = `${import.meta.env.BASE_URL}images/tiles/marketplace.jpg`;
const TILE_HAND_HISTORIES = `${import.meta.env.BASE_URL}images/tiles/hand-histories.jpg`;

// Holographic edge glow colors (World Hub palette) — used for nth-child CSS
const HOLO_COLORS = [
    { main: 'rgba(0, 212, 255, 0.15)', border: 'rgba(0, 212, 255, 0.2)' },
    { main: 'rgba(0, 255, 136, 0.12)', border: 'rgba(0, 255, 136, 0.18)' },
    { main: 'rgba(0, 191, 255, 0.12)', border: 'rgba(0, 191, 255, 0.18)' },
    { main: 'rgba(77, 210, 255, 0.12)', border: 'rgba(77, 210, 255, 0.18)' },
    { main: 'rgba(0, 255, 159, 0.12)', border: 'rgba(0, 255, 159, 0.18)' },
    { main: 'rgba(200, 255, 255, 0.1)', border: 'rgba(200, 255, 255, 0.15)' },
];

// Enhancement #9: Unique gradient CSS classes for logo-less club cards
const GRADIENT_CLASSES = [
    styles.clubCardGradient1,
    styles.clubCardGradient2,
    styles.clubCardGradient3,
    styles.clubCardGradient4,
    styles.clubCardGradient5,
] as const;

export default function HomePage() {
    const navigate = useNavigate();
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
        let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

        async function fetchUserData() {
            setIsLoading(true);
            try {
                const { data: { user: authUser } } = await supabase.auth.getUser();
                if (authUser) {
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

            realtimeChannel = supabase
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
        };

        setupRealtimeSubscription();

        return () => {
            if (realtimeChannel) {
                supabase.removeChannel(realtimeChannel);
            }
        };
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
    // ═══════════════════════════════════════════════════════════════════════════════
    const displayClubs = userClubs.filter(
        (club) => club.id !== sharkClubId
    );

    return (
        <div className={styles.container}>
            {/* ═══════════════════════════════════════════════════════════════════════
                CINEMATIC BACKGROUND LAYERS — World Hub Aesthetic
            ═══════════════════════════════════════════════════════════════════════ */}
            <div className={styles.gridFloor}></div>
            <div className={styles.volumetricLight}></div>
            <div className={styles.vignette}></div>
            {/* Enhancement #6: Circuit brain background overlay */}
            <div className={styles.circuitOverlay}></div>
            {/* Enhancement #1: Neuron lights — traveling cyan pulses */}
            <div className={styles.neuronLights}></div>

            {/* GLOBAL HEADER - Hub-style, hide when embedded in iframe */}
            {!isInIframe && <GlobalHeader />}

            {/* ═══════════════════════════════════════════════════════════════════════
                MAIN CONTENT — Scrollable card layout
            ═══════════════════════════════════════════════════════════════════════ */}
            <div className={styles.mainContent}>

                {/* ═══════════════════════════════════════════════════════════════════════
                    HORIZONTAL ACTION BAR
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
                    FEATURED SHARK CLUB — Center Holographic Card
                ═══════════════════════════════════════════════════════════════════════ */}
                <div
                    className={styles.featuredCardContainer}
                >
                    <div className={styles.featuredPedestal}></div>
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

                {/* ═══════════════════════════════════════════════════════════════════════
                    MY CLUBS — Holographic Card Row
                ═══════════════════════════════════════════════════════════════════════ */}
                {displayClubs.length > 0 && (
                    <div className={styles.clubCardsRow}>
                        {displayClubs.map((club: any, idx: number) => {
                            return (
                                <div
                                    key={club.id}
                                    className={styles.clubCard}
                                    onClick={() => {
                                        haptic.medium();
                                        localStorage.setItem(LAST_VISITED_KEY, club.id);
                                        localStorage.setItem(LAST_CLUB_KEY, club.id);
                                        navigate(`/clubs/${club.id}`);
                                    }}
                                >
                                    <div className={styles.clubCardPedestal}></div>
                                    <div className={styles.clubCardFace}>
                                        <h3 className={styles.clubCardTitle}>
                                            {club.name?.toUpperCase() || 'MY CLUB'}
                                        </h3>
                                        <span className={styles.clubCardRole}>
                                            {club.is_owner ? 'OWNER' : 'MEMBER'}
                                        </span>
                                        {/* Enhancement #9: Unique gradient or logo */}
                                        <div className={styles.clubCardCenter}>
                                            {club.logo_url ? (
                                                <img src={club.logo_url} alt="" className={styles.clubCardLogo} />
                                            ) : (
                                                <div className={`${styles.clubCardIcon} ${GRADIENT_CLASSES[idx % GRADIENT_CLASSES.length]}`}>♣</div>
                                            )}
                                        </div>
                                        <div className={styles.clubCardStats}>
                                            <span>{club.member_count || 0} Members</span>
                                        </div>
                                    </div>
                                    <div className={styles.clubCardEdge}></div>
                                    <div className={styles.clubCardLabel}>
                                        {club.name || 'My Club'}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Enhancement #5: Skeleton loading while clubs data is loading */}
                {isLoading && (
                    <div className={styles.clubCardsSkeleton}>
                        <div className={styles.clubCardSkeletonItem}></div>
                        <div className={styles.clubCardSkeletonItem}></div>
                        <div className={styles.clubCardSkeletonItem}></div>
                    </div>
                )}

                {/* No Clubs Message */}
                {!isLoading && userClubs.length === 0 && (
                    <div className={styles.noClubsMessage}>
                        <p>Welcome to Club Arena</p>
                        <p>Create or join a club to get started!</p>
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════════════════════════
                    DAILY CHALLENGES — Glass-morphism Panel
                ═══════════════════════════════════════════════════════════════════════ */}
                <div className={styles.challengesSection}>
                    <h3 className={styles.challengesTitle}>DAILY CHALLENGES</h3>
                    <div className={styles.challengesList}>
                        {(() => {
                            const today = new Date();
                            const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
                            const CHALLENGES = [
                                { title: 'Win 3 Hands', reward: 50, target: 3 },
                                { title: 'Play 20 Hands', reward: 30, target: 20 },
                                { title: 'Win a Pot > 100 BB', reward: 75, target: 1 },
                                { title: 'Play 2 Different Tables', reward: 40, target: 2 },
                                { title: 'Win 5 Hands Pre-Flop', reward: 60, target: 5 },
                                { title: 'Play for 30 Minutes', reward: 45, target: 30 },
                                { title: 'Win 2 All-In Pots', reward: 80, target: 2 },
                                { title: 'See 10 Flops', reward: 25, target: 10 },
                                { title: 'Win a Hand with a Flush', reward: 100, target: 1 },
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
                                const isComplete = pct >= 100;
                                return (
                                    <div key={i} className={isComplete ? styles.challengeItemComplete : styles.challengeItem}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(224, 232, 240, 0.9)' }}>{ch.title}</span>
                                                <span style={{
                                                    fontSize: '0.65rem',
                                                    fontWeight: 700,
                                                    color: isComplete ? 'rgba(0, 255, 136, 0.9)' : 'rgba(0, 212, 255, 0.8)',
                                                }}>+{ch.reward} Diamonds</span>
                                            </div>
                                            <div style={{
                                                height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)',
                                                overflow: 'hidden',
                                            }}>
                                                <div style={{
                                                    height: '100%', borderRadius: 2, width: `${pct}%`,
                                                    background: isComplete
                                                        ? 'linear-gradient(90deg, #00ff88, #00d4ff)'
                                                        : 'linear-gradient(90deg, #00d4ff, #0088ff)',
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
                    BOTTOM ROW — 5 Holographic Standing Cards
                ═══════════════════════════════════════════════════════════════════════ */}
                <div className={styles.bottomRow}>
                    {[
                        { img: TILE_PLAYER_STATS, alt: 'Player Stats', action: () => { haptic.light(); navigate('/profile'); } },
                        { img: TILE_LEADERBOARDS, alt: 'Leaderboards', action: () => { haptic.light(); navigate('/leaderboard'); } },
                        {
                            img: TILE_CASHIER, alt: 'Cashier', action: () => {
                                haptic.light();
                                const lastClub = localStorage.getItem(LAST_CLUB_KEY);
                                if (lastClub) {
                                    navigate(`/clubs/${lastClub}/cashier`);
                                } else if (userClubs.length > 0) {
                                    navigate(`/clubs/${userClubs[0].id}/cashier`);
                                } else {
                                    toast.info('Join a club first to access the cashier');
                                }
                            }
                        },
                        {
                            img: TILE_MARKETPLACE, alt: 'Marketplace', action: () => {
                                haptic.light();
                                // Enhancement #7: Marketplace deep-link timeout fallback
                                if (window.parent !== window) {
                                    window.parent.postMessage({ type: 'NAVIGATE', path: '/hub/marketplace' }, '*');
                                    // Fallback if parent doesn't handle the message within 1s
                                    const fallbackTimer = setTimeout(() => {
                                        window.location.href = 'https://smarter.poker/hub/marketplace';
                                    }, 1000);
                                    // Listen for acknowledgment from parent
                                    const handleAck = (event: MessageEvent) => {
                                        if (event.data?.type === 'NAVIGATE_ACK') {
                                            clearTimeout(fallbackTimer);
                                            window.removeEventListener('message', handleAck);
                                        }
                                    };
                                    window.addEventListener('message', handleAck);
                                    // Cleanup listener after timeout period
                                    setTimeout(() => window.removeEventListener('message', handleAck), 1200);
                                } else {
                                    window.location.href = 'https://smarter.poker/hub/marketplace';
                                }
                            }
                        },
                        { img: TILE_HAND_HISTORIES, alt: 'Hand Histories', action: () => { haptic.light(); navigate('/hands'); } },
                    ].map((tile, idx) => (
                        <button
                            key={tile.alt}
                            className={styles.tileCard}
                            onClick={tile.action}
                        >
                            <div className={styles.tilePedestal}></div>
                            <div className={styles.tileImageWrapper}>
                                <img src={tile.img} alt={tile.alt} className={styles.tileImage} />
                            </div>
                            <div className={styles.tileEdge}></div>
                        </button>
                    ))}
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

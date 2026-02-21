/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ♠ CLUB ARENA — Home Page (Carousel Layout v2)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Layout Structure:
 * - Top Row: CREATE A CLUB (left) | FEATURED CLUB (center) | JOIN A CLUB (right)
 * - Carousel: User's clubs (unlimited clubs supported)
 * - Bottom 5 tiles: Player Stats, Leaderboards, Cashier, Diamond Store, Hand History
 * - Shark Club = Featured Club (always first)
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

interface ClubCard {
    id: string;
    title: string;
    subtitle: string;
    description: string;
    icon: string;
    color: string;
    logoUrl?: string;
    frameImage: string;
    fullCardImage?: string;
    isFeatured?: boolean;
    action: () => void;
}

const LAST_VISITED_KEY = 'club_arena_last_visited';
const LAST_CLUB_KEY = 'club_arena_last_club'; // For Cashier routing

// Custom frame images for cards
const getFrameImage = (index: number) => `${import.meta.env.BASE_URL}images/frames/frame-${(index % 5) + 1}.jpg`;

// Action button images
const ACTION_BAR_HORIZONTAL = `${import.meta.env.BASE_URL}images/icons/action-bar-horizontal.png`;

// Shark Club Card Image (baked-in full card)
const SHARK_CLUB_CARD = `${import.meta.env.BASE_URL}images/shark-club-card.jpg`;

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
    const [currentIndex, setCurrentIndex] = useState(0);

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

    // FIXED CANVAS SCALING - Lock at 600px, scale uniformly on smaller viewports
    const canvasRef = useRef<HTMLDivElement>(null);
    const [canvasScale, setCanvasScale] = useState(1);

    useEffect(() => {
        const calculateScale = () => {
            const CANVAS_WIDTH = 600;
            const viewportWidth = window.innerWidth;
            // Only scale down if viewport is smaller than canvas
            const scale = viewportWidth < CANVAS_WIDTH ? viewportWidth / CANVAS_WIDTH : 1;
            setCanvasScale(scale);
        };

        calculateScale();
        window.addEventListener('resize', calculateScale);
        return () => window.removeEventListener('resize', calculateScale);
    }, []);

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

                    // Restore last visited position
                    const lastVisited = localStorage.getItem(LAST_VISITED_KEY);
                    if (lastVisited && clubs && clubs.length > 0) {
                        const idx = clubs.findIndex((c: any) => c.id === lastVisited);
                        if (idx !== -1) {
                            setCurrentIndex(idx);
                        }
                    }
                }
            } catch (err) {
                console.error('Error fetching user data:', err);
                toast.error('Failed to load user data');
            } finally {
                setIsLoading(false);
            }
        }
        fetchUserData();
    }, []);

    // Fetch Shark Club stats
    useEffect(() => {
        async function fetchSharkClubStats() {
            try {
                // Find Shark Club by club_id = 25450
                const { data: club } = await supabase
                    .from('clubs')
                    .select('id, member_count')
                    .eq('club_id', 25450)
                    .maybeSingle();

                if (club) {
                    setSharkClubId(club.id);
                    // Hardcode stats to show 1 member and 1 active player
                    setSharkClubStats({
                        totalMembers: 1,
                        clubLevel: 1, // Hardcoded as requested
                        activePlayers: 1,
                    });
                }
            } catch (err) {
                console.error('Failed to fetch Shark Club stats:', err);
            }
        }
        fetchSharkClubStats();
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
    // BUILD CAROUSEL CARDS - Exclude Shark Club (already shown as featured card)
    // ═══════════════════════════════════════════════════════════════════════════════
    const buildCarouselCards = (): ClubCard[] => {
        const cards: ClubCard[] = [];

        // Add user clubs to carousel, EXCLUDING Shark Club (it's shown as featured card)
        userClubs
            .filter((club) => club.id !== sharkClubId) // Don't duplicate Shark Club
            .forEach((club, idx) => {
                cards.push({
                    id: club.id,
                    title: club.name?.toUpperCase() || 'MY CLUB',
                    subtitle: club.is_owner ? 'CLUB OWNER' : 'MEMBER',
                    description: `${club.member_count || 0} MEMBERS\n${club.active_tables || 0} ACTIVE TABLES`,
                    icon: club.logo_url ? '' : '♣',
                    logoUrl: club.logo_url,
                    color: '#00d4ff',
                    frameImage: getFrameImage(idx),
                    isFeatured: false,
                    action: () => {
                        localStorage.setItem(LAST_VISITED_KEY, club.id);
                        localStorage.setItem(LAST_CLUB_KEY, club.id);
                        navigate(`/clubs/${club.id}`);
                    },
                });
            });

        return cards;
    };

    const carouselCards = buildCarouselCards();
    const hasClubs = userClubs.length > 0;

    // Navigation functions
    const canNavigate = carouselCards.length >= 3;
    const nextCard = () => {
        if (canNavigate) {
            setCurrentIndex((prev) => (prev + 1) % carouselCards.length);
        }
    };
    const prevCard = () => {
        if (canNavigate) {
            setCurrentIndex((prev) => (prev - 1 + carouselCards.length) % carouselCards.length);
        }
    };

    // Get visible cards
    const getVisibleCards = () => {
        if (carouselCards.length === 0) return [];
        if (carouselCards.length <= 2) return carouselCards;

        const prev = (currentIndex - 1 + carouselCards.length) % carouselCards.length;
        const next = (currentIndex + 1) % carouselCards.length;
        return [carouselCards[prev], carouselCards[currentIndex], carouselCards[next]];
    };

    const visibleCards = getVisibleCards();

    // ═══════════════════════════════════════════════════════════════════════════════
    // BOTTOM 5 QUICK LINKS (New Order)
    // ═══════════════════════════════════════════════════════════════════════════════
    const quickLinks = [
        {
            id: 'player-stats',
            title: 'PLAYER STATS',
            icon: '',
            subtitle: 'Your Profile',
            action: () => navigate('/profile'),
        },
        {
            id: 'leaderboard',
            title: 'LEADERBOARDS',
            icon: '',
            subtitle: 'Rankings',
            action: () => navigate('/leaderboard'),
        },
        {
            id: 'cashier',
            title: 'CASHIER',
            icon: '',
            subtitle: 'Chips & Cash',
            action: () => {
                // Route to last club's cashier if multi-club, else first club
                const lastClub = localStorage.getItem(LAST_CLUB_KEY);
                if (lastClub) {
                    navigate(`/clubs/${lastClub}/cashier`);
                } else if (userClubs.length > 0) {
                    navigate(`/clubs/${userClubs[0].id}/cashier`);
                } else {
                    toast.info('Join a club first to access the cashier');
                }
            },
        },
        {
            id: 'diamond-store',
            title: 'DIAMOND STORE',
            icon: '',
            subtitle: 'Purchase',
            action: () => navigate('/store'),
        },
        {
            id: 'hand-history',
            title: 'HAND HISTORY',
            icon: '',
            subtitle: 'Review hands',
            action: () => navigate('/hand-history'),
        },
    ];

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
                FIXED CANVAS - All content scales uniformly (locked at 600px)
            ═══════════════════════════════════════════════════════════════════════ */}
            <div
                ref={canvasRef}
                className={styles.fixedCanvas}
                style={{ transform: `scale(${canvasScale})` }}
            >

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
                    SHARK CLUB CARD - Using VectorMagic SVG with dynamic text elements
                ═══════════════════════════════════════════════════════════════════════ */}
                <div className={styles.centerCardRow}>
                    <div
                        className={styles.sharkClubCard}
                        onClick={() => {
                            haptic.success();
                            if (sharkClubId) {
                                navigate(`/clubs/${sharkClubId}`);
                            } else {
                                toast.info('Shark Club not found. Join or create a club!');
                            }
                        }}
                    >
                        {/* Full VectorMagic SVG - ClubStatsPanel handles dynamic text updates */}
                        <Suspense fallback={<div className={styles.cardSkeleton}>Loading...</div>}>
                            <ClubStatsPanel
                                totalMembers={sharkClubStats.totalMembers}
                                clubLevel={sharkClubStats.clubLevel}
                                activePlayers={sharkClubStats.activePlayers}
                            />
                        </Suspense>
                    </div>
                </div>

                {/* Club Cards Carousel - Hidden for now, replaced by Shark Club card */}
                {hasClubs && carouselCards.length > 1 && (
                    <div className={styles.carouselContainer}>
                        <div className={styles.cardsRow}>
                            {canNavigate && (
                                <button className={styles.navArrow} onClick={prevCard}>
                                    <svg viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                                    </svg>
                                </button>
                            )}

                            {visibleCards.map((card, index) => {
                                if (!card) return <div key={`empty-${index}`} className={styles.emptyCard}></div>;

                                const isCenter = carouselCards.length >= 3 && index === 1;

                                return (
                                    <div
                                        key={card.id}
                                        className={`${styles.floatingCard} ${isCenter ? styles.centerCard : styles.flatCard}`}
                                        onClick={card.action}
                                    >
                                        <img src={card.frameImage} alt="" className={styles.cardFrame} />
                                        <div className={styles.cardInner}>
                                            <div className={styles.cardHeader}>
                                                <h2 className={styles.cardTitle}>{card.title}</h2>
                                                <span className={styles.cardSubtitle}>{card.subtitle}</span>
                                            </div>
                                            <div className={styles.holoArea}>
                                                <div className={styles.holoCircle}>
                                                    {card.logoUrl ? (
                                                        <img src={card.logoUrl} alt="" className={styles.clubLogo} />
                                                    ) : (
                                                        <span className={styles.holoIcon}>{card.icon}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className={styles.cardFooter}>
                                                <p className={styles.cardDescription}>
                                                    {card.description.split('\n').map((line, i) => (
                                                        <span key={i}>{line}<br /></span>
                                                    ))}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            {canNavigate && (
                                <button className={styles.navArrow} onClick={nextCard}>
                                    <svg viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Bottom Row - 5 Baked Tile Cards */}
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
                            window.parent.postMessage({ type: 'NAVIGATE', path: '/hub/marketplace' }, '*');
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
            {
                showJoinModal && (
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
                )
            }

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
            {
                isLoading && (
                    <div className={styles.loadingOverlay}>
                        <div className={styles.spinner}></div>
                    </div>
                )
            }
        </div >
    );
}
// Deploy trigger 1769659300

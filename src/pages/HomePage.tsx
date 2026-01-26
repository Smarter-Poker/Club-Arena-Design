/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ♠ CLUB ARENA — Home Page (Dynamic Card Layout)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Layout Structure:
 * - Main Card (Center): "EXPLORE CLUB ARENA" - Create/Join clubs, explore Midway
 * - Club Cards (Left/Right): User's clubs - only shown if user has clubs
 * - Social & Training: Only shown if user has clubs
 * - Bottom 5 Cards: Quick links to features INSIDE clubs
 * - Default opened card: Last club/place user left (stored in localStorage)
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useUserStore } from '../stores/useUserStore';
import { ClubsService } from '../services/ClubsService';
import { useToast } from '../components/common/Toast';
import styles from './HomePage.module.css';

interface ClubCard {
    id: string;
    title: string;
    subtitle: string;
    description: string;
    icon: string;
    color: string;
    logoUrl?: string;
    action: () => void;
}

const LAST_VISITED_KEY = 'club_arena_last_visited';

export default function HomePage() {
    const navigate = useNavigate();
    const { user } = useUserStore();

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
    const [xp, setXp] = useState(0);
    const [level, setLevel] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [userClubs, setUserClubs] = useState<any[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const toast = useToast();

    // Fetch user stats and clubs from Supabase
    useEffect(() => {
        async function fetchUserData() {
            setIsLoading(true);
            try {
                const { data: { user: authUser } } = await supabase.auth.getUser();
                if (authUser) {
                    // Fetch diamonds
                    const { data: walletData } = await supabase
                        .from('diamond_wallets')
                        .select('balance')
                        .eq('user_id', authUser.id)
                        .maybeSingle();

                    if (walletData) {
                        setDiamonds(walletData.balance || 0);
                    }

                    // Fetch XP from profile
                    const { data: profileData } = await supabase
                        .from('profiles')
                        .select('xp, level')
                        .eq('id', authUser.id)
                        .maybeSingle();

                    if (profileData) {
                        setXp(profileData.xp || 0);
                        setLevel(profileData.level || 1);
                    }

                    // Fetch user's clubs
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
                            // +1 because index 0 is the Explore card
                            setCurrentIndex(idx + 1);
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

    // Build the dynamic card array
    const buildCarouselCards = (): ClubCard[] => {
        const cards: ClubCard[] = [];

        // ═══════════════════════════════════════════════════════════════════════
        // MAIN CARD: Explore Club Arena (always first/center)
        // ═══════════════════════════════════════════════════════════════════════
        cards.push({
            id: 'explore',
            title: 'EXPLORE CLUB ARENA',
            subtitle: 'JOIN OR CREATE A CLUB',
            description: 'CREATE A CLUB • JOIN A CLUB\nEXPLORE MIDWAY • OPEN CLUBS',
            icon: '♠',
            color: '#1877F2',
            action: () => navigate('/clubs'),
        });

        // ═══════════════════════════════════════════════════════════════════════
        // USER'S CLUB CARDS (only if they have clubs)
        // ═══════════════════════════════════════════════════════════════════════
        if (userClubs.length > 0) {
            userClubs.forEach((club) => {
                cards.push({
                    id: club.id,
                    title: club.name?.toUpperCase() || 'MY CLUB',
                    subtitle: club.is_owner ? 'CLUB OWNER' : 'MEMBER',
                    description: `${club.member_count || 0} MEMBERS\n${club.active_tables || 0} ACTIVE TABLES`,
                    icon: club.logo_url ? '' : '♣',
                    logoUrl: club.logo_url,
                    color: '#00d4ff',
                    action: () => {
                        localStorage.setItem(LAST_VISITED_KEY, club.id);
                        navigate(`/clubs/${club.id}`);
                    },
                });
            });

            // ═══════════════════════════════════════════════════════════════════
            // SOCIAL MEDIA (only if user has clubs)
            // ═══════════════════════════════════════════════════════════════════
            cards.push({
                id: 'social',
                title: 'SOCIAL MEDIA',
                subtitle: 'CONNECT WITH FRIENDS',
                description: 'SHARE WHAT MATTERS\nSTAY CONNECTED',
                icon: '📱',
                color: '#00d4ff',
                action: () => navigate('/social'),
            });

            // ═══════════════════════════════════════════════════════════════════
            // TRAINING GAMES (only if user has clubs)
            // ═══════════════════════════════════════════════════════════════════
            cards.push({
                id: 'training',
                title: 'TRAINING GAMES',
                subtitle: 'SHARPEN YOUR SKILLS',
                description: 'MASTER THE GAME\nPRACTICE OFFLINE',
                icon: '🧠',
                color: '#00d4ff',
                action: () => navigate('/training'),
            });
        }

        return cards;
    };

    const carouselCards = buildCarouselCards();
    const hasClubs = userClubs.length > 0;

    // Navigation functions
    const nextCard = () => setCurrentIndex((prev) => (prev + 1) % carouselCards.length);
    const prevCard = () => setCurrentIndex((prev) => (prev - 1 + carouselCards.length) % carouselCards.length);

    // Get visible cards (3 at a time centered on currentIndex)
    const getVisibleCards = () => {
        if (carouselCards.length === 0) return [];
        if (carouselCards.length === 1) return [null, carouselCards[0], null];

        const prev = (currentIndex - 1 + carouselCards.length) % carouselCards.length;
        const next = (currentIndex + 1) % carouselCards.length;
        return [carouselCards[prev], carouselCards[currentIndex], carouselCards[next]];
    };

    const visibleCards = getVisibleCards();

    // ═══════════════════════════════════════════════════════════════════════════
    // BOTTOM 5 QUICK LINKS - Direct links to club features
    // ═══════════════════════════════════════════════════════════════════════════
    const quickLinks = [
        {
            id: 'create-table',
            title: 'CREATE TABLE',
            icon: '🎲',
            subtitle: 'Start a game',
            action: () => {
                if (userClubs.length > 0) {
                    navigate(`/clubs/${userClubs[0].id}/create-table`);
                } else {
                    toast.info('Join a club first to create tables');
                }
            },
        },
        {
            id: 'active-tables',
            title: 'ACTIVE TABLES',
            icon: '♠',
            subtitle: 'Jump in',
            action: () => navigate('/tables'),
        },
        {
            id: 'leaderboard',
            title: 'LEADERBOARD',
            icon: '🏆',
            subtitle: 'Rankings',
            action: () => navigate('/leaderboard'),
        },
        {
            id: 'hand-history',
            title: 'HAND HISTORY',
            icon: '📜',
            subtitle: 'Review hands',
            action: () => navigate('/hand-history'),
        },
        {
            id: 'wallet',
            title: 'WALLET',
            icon: '💰',
            subtitle: 'Chip balance',
            action: () => navigate('/wallet'),
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

            {/* TOP FLOATING ICON BAR - Hide when embedded in iframe */}
            {!isInIframe && (
                <div className={styles.topBar}>
                    {/* Left: Logo */}
                    <div className={styles.logoSection}>
                        <span className={styles.logoIcon}>♠</span>
                        <span className={styles.logoText}>SMARTER POKER</span>
                    </div>

                    {/* Center: Stats */}
                    <div className={styles.statsSection}>
                        <div className={styles.statBadge}>
                            <span className={styles.statIcon}></span>
                            <span className={styles.statValue}>{diamonds}</span>
                            <button className={styles.addButton}>+</button>
                        </div>
                        <div className={styles.statBadge}>
                            <span className={styles.statLabel}>XP</span>
                            <span className={styles.statValue}>{xp}</span>
                            <span className={styles.levelBadge}>LV {level}</span>
                        </div>
                    </div>

                    {/* Right: Icons */}
                    <div className={styles.iconsSection}>
                        <button className={styles.iconButton} onClick={() => navigate('/messages')}>
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" /></svg>
                        </button>
                        <button className={styles.iconButton} onClick={() => navigate('/notifications')}>
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" /></svg>
                        </button>
                        <button className={styles.profileButton} onClick={() => navigate('/profile')}>
                            {user?.avatar_url ? (
                                <img src={user.avatar_url} alt="Profile" className={styles.profileAvatar} />
                            ) : (
                                <span></span>
                            )}
                        </button>
                        <button className={styles.iconButton} onClick={() => navigate('/search')}>
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" /></svg>
                        </button>
                        <button className={styles.helpButton} onClick={() => navigate('/help')}>
                            HELP
                        </button>
                    </div>
                </div>
            )}

            {/* Welcome Message */}
            <div className={styles.welcomeMessage}>
                Welcome Back, {user?.username || 'Player'}
            </div>

            {/* Main 3D Carousel - Dynamic Cards */}
            <div className={styles.carouselContainer}>
                {/* Left Arrow */}
                {carouselCards.length > 1 && (
                    <button className={styles.navArrow} onClick={prevCard}>
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                        </svg>
                    </button>
                )}

                {/* 3 Floating Cards */}
                <div className={styles.cardsRow}>
                    {visibleCards.map((card, index) => {
                        if (!card) return <div key={`empty-${index}`} className={styles.emptyCard}></div>;

                        return (
                            <div
                                key={card.id}
                                className={`${styles.floatingCard} ${index === 1 ? styles.centerCard : styles.sideCard
                                    } ${index === 0 ? styles.leftCard : ''} ${index === 2 ? styles.rightCard : ''}`}
                                onClick={card.action}
                            >
                                {/* Neon border glow */}
                                <div className={styles.cardBorderGlow}></div>

                                {/* Card inner content */}
                                <div className={styles.cardInner}>
                                    {/* Title area */}
                                    <div className={styles.cardHeader}>
                                        <h2 className={styles.cardTitle}>{card.title}</h2>
                                        <span className={styles.cardSubtitle}>{card.subtitle}</span>
                                    </div>

                                    {/* Holographic icon area */}
                                    <div className={styles.holoArea}>
                                        <div className={styles.holoCircle}>
                                            {card.logoUrl ? (
                                                <img src={card.logoUrl} alt="" className={styles.clubLogo} />
                                            ) : (
                                                <span className={styles.holoIcon}>{card.icon}</span>
                                            )}
                                        </div>
                                        <div className={styles.techLines}></div>
                                    </div>

                                    {/* Footer description */}
                                    <div className={styles.cardFooter}>
                                        <p className={styles.cardDescription}>
                                            {card.description.split('\n').map((line, i) => (
                                                <span key={i}>{line}<br /></span>
                                            ))}
                                        </p>
                                    </div>
                                </div>

                                {/* Reflection */}
                                <div className={styles.cardReflection}></div>
                            </div>
                        );
                    })}
                </div>

                {/* Right Arrow */}
                {carouselCards.length > 1 && (
                    <button className={styles.navArrow} onClick={nextCard}>
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z" />
                        </svg>
                    </button>
                )}
            </div>

            {/* Bottom Row - 5 Quick Link Tiles */}
            <div className={styles.bottomRow}>
                {quickLinks.map((link) => (
                    <button
                        key={link.id}
                        className={styles.tileCard}
                        onClick={link.action}
                    >
                        <div className={styles.tileBorder}></div>
                        <div className={styles.tileContent}>
                            <span className={styles.tileIcon}>{link.icon}</span>
                            <span className={styles.tileTitle}>{link.title}</span>
                            <span className={styles.tileSubtitle}>{link.subtitle}</span>
                        </div>
                    </button>
                ))}
            </div>

            {/* Loading indicator */}
            {isLoading && (
                <div className={styles.loadingOverlay}>
                    <div className={styles.spinner}></div>
                </div>
            )}
        </div>
    );
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CLUB CAROUSEL PAGE — PokerBros-Style Club Selection
 * ═══════════════════════════════════════════════════════════════════════════════
 * Shows user's clubs in a swipeable carousel format:
 * - Header with player info, VIP, gold/diamond balances
 * - Create club button
 * - Search button
 * - Club cards carousel (swipe or arrow navigation)
 * - Each card: Club avatar, ID, name, level, member count
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useUserStore } from '../stores/useUserStore';
import IntroVideo from '../components/IntroVideo';
import './ClubCarouselPage.css';

interface UserClub {
    id: string;
    club_id: number;
    name: string;
    avatar_url: string | null;
    level: number;
    member_count: number;
    role: string;
}

interface UserWallet {
    gold: number;
    diamonds: number;
}

interface UserProfile {
    id: string;
    display_name: string;
    avatar_url: string | null;
    player_number: number;
    vip_level: string;
}

// Session key for intro video
const INTRO_SHOWN_KEY = 'club_arena_intro_shown';

export default function ClubCarouselPage() {
    const navigate = useNavigate();
    const { user } = useUserStore();

    const [clubs, setClubs] = useState<UserClub[]>([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [wallet, setWallet] = useState<UserWallet>({ gold: 0, diamonds: 0 });

    // Intro video state - only show once per session
    const [showIntro, setShowIntro] = useState(() => {
        const shown = sessionStorage.getItem(INTRO_SHOWN_KEY);
        return !shown; // Show intro if not shown yet
    });

    // Handle intro completion
    const handleIntroComplete = () => {
        sessionStorage.setItem(INTRO_SHOWN_KEY, 'true');
        setShowIntro(false);
    };

    useEffect(() => {
        loadUserData();
    }, []);

    const loadUserData = async () => {
        setLoading(true);
        try {
            const { data: { user: authUser } } = await supabase.auth.getUser();
            if (!authUser) {
                navigate('/auth');
                return;
            }

            // Load user profile
            const { data: profileData } = await supabase
                .from('profiles')
                .select('id, display_name, avatar_url, player_number, vip_level')
                .eq('id', authUser.id)
                .single();

            if (profileData) {
                setUserProfile(profileData as UserProfile);
            }

            // Load user's clubs (where they are a member)
            const { data: memberData } = await supabase
                .from('club_members')
                .select(`
                    club_id,
                    role,
                    chip_balance,
                    clubs (
                        id,
                        club_id,
                        name,
                        avatar_url,
                        member_count
                    )
                `)
                .eq('user_id', authUser.id);

            if (memberData) {
                const userClubs: UserClub[] = memberData
                    .filter((m: any) => m.clubs)
                    .map((m: any) => ({
                        id: m.clubs.id,
                        club_id: m.clubs.club_id,
                        name: m.clubs.name,
                        avatar_url: m.clubs.avatar_url,
                        level: 0, // Club level from settings
                        member_count: m.clubs.member_count || 0,
                        role: m.role,
                    }));
                setClubs(userClubs);

                // Calculate total gold from all clubs
                const totalGold = memberData.reduce((sum: number, m: any) => sum + (m.chip_balance || 0), 0);
                setWallet(prev => ({ ...prev, gold: totalGold }));
            }

            // Load universal diamond balance
            const { data: walletData } = await supabase
                .from('user_wallets')
                .select('diamonds')
                .eq('user_id', authUser.id)
                .single();

            if (walletData) {
                setWallet(prev => ({ ...prev, diamonds: walletData.diamonds || 0 }));
            }

        } catch (error) {
            console.error('Error loading user data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handlePrev = () => {
        setActiveIndex(prev => (prev > 0 ? prev - 1 : clubs.length - 1));
    };

    const handleNext = () => {
        setActiveIndex(prev => (prev < clubs.length - 1 ? prev + 1 : 0));
    };

    const handleClubClick = (club: UserClub) => {
        navigate(`/clubs/${club.id}`);
    };

    const handleCreateClub = () => {
        navigate('/clubs/create');
    };

    const handleSearch = () => {
        navigate('/clubs'); // Go to full clubs list for search/join
    };

    const formatNumber = (num: number) => {
        return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    if (loading) {
        return (
            <div className="club-carousel loading">
                <div className="loader">Loading...</div>
            </div>
        );
    }

    return (
        <>
            {/* Intro Video - plays on first entry while content loads in background */}
            {showIntro && (
                <IntroVideo
                    videoSrc="/videos/club-arena-intro.mp4"
                    minDuration={3000}
                    onComplete={handleIntroComplete}
                />
            )}

            <div className="club-carousel">
                {/* ═══════════════════════════════════════════════════════════════════
                    HEADER - Player Info + Wallet
                ═══════════════════════════════════════════════════════════════════ */}
                <header className="club-carousel__header">
                    <div className="header__user">
                        <div className="user-avatar">
                            {userProfile?.avatar_url ? (
                                <img src={userProfile.avatar_url} alt="avatar" />
                            ) : (
                                <span className="avatar-placeholder">🐟</span>
                            )}
                        </div>
                        <div className="user-info">
                            <span className="user-name">-{userProfile?.display_name || 'Player'}-</span>
                            <span className="user-id">ID:{userProfile?.player_number?.toString().padStart(7, '0') || '0000000'}</span>
                        </div>
                    </div>
                    <button className="header__menu">≡</button>
                </header>

                {/* Wallet Row */}
                <div className="club-carousel__wallet">
                    <div className="vip-badge">🔒 VIP</div>
                    <div className="wallet-balances">
                        <div className="balance gold">
                            <span className="balance-icon">♠</span>
                            <span className="balance-amount">{formatNumber(wallet.gold)}</span>
                            <button className="balance-add">+</button>
                        </div>
                        <div className="balance diamond">
                            <span className="balance-icon">◆</span>
                            <span className="balance-amount">{wallet.diamonds.toLocaleString()}</span>
                            <button className="balance-add">+</button>
                        </div>
                    </div>
                </div>

                {/* ═══════════════════════════════════════════════════════════════════
                ACTION BUTTONS - Create Club + Search
            ═══════════════════════════════════════════════════════════════════ */}
                <div className="club-carousel__actions">
                    <button className="action-btn create" onClick={handleCreateClub}>
                        <span className="action-icon">🏠+</span>
                    </button>
                    <button className="action-btn search" onClick={handleSearch}>
                        <span className="action-icon">🔍</span>
                    </button>
                </div>

                {/* ═══════════════════════════════════════════════════════════════════
                CLUB CAROUSEL
            ═══════════════════════════════════════════════════════════════════ */}
                <div className="club-carousel__cards">
                    {clubs.length === 0 ? (
                        <div className="no-clubs">
                            <p>You haven't joined any clubs yet</p>
                            <button className="join-btn" onClick={handleSearch}>Find Clubs</button>
                        </div>
                    ) : (
                        <>
                            {/* Left Arrow */}
                            {clubs.length > 1 && (
                                <button className="carousel-arrow left" onClick={handlePrev}>
                                    ‹
                                </button>
                            )}

                            {/* Club Cards */}
                            <div className="cards-container">
                                {clubs.map((club, index) => {
                                    const offset = index - activeIndex;
                                    const isActive = index === activeIndex;

                                    return (
                                        <div
                                            key={club.id}
                                            className={`club-card ${isActive ? 'active' : ''}`}
                                            style={{
                                                transform: `translateX(${offset * 120}%) scale(${isActive ? 1 : 0.8})`,
                                                opacity: Math.abs(offset) > 1 ? 0 : (isActive ? 1 : 0.6),
                                                zIndex: isActive ? 10 : 5 - Math.abs(offset),
                                            }}
                                            onClick={() => isActive && handleClubClick(club)}
                                        >
                                            <div className="club-card__id">ID:{club.club_id}</div>
                                            <div className="club-card__graphic">
                                                {club.avatar_url ? (
                                                    <img src={club.avatar_url} alt={club.name} />
                                                ) : (
                                                    <div className="club-card__placeholder">
                                                        <span className="chip-icon">♠</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="club-card__footer">
                                                <div className="club-avatar">
                                                    {club.avatar_url ? (
                                                        <img src={club.avatar_url} alt="" />
                                                    ) : (
                                                        <span>♠</span>
                                                    )}
                                                </div>
                                                <div className="club-info">
                                                    <span className="club-name">{club.name}</span>
                                                    <span className="club-meta">
                                                        LVL: {club.level}
                                                        <span className="member-count">👁 {club.member_count}</span>
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Right Arrow */}
                            {clubs.length > 1 && (
                                <button className="carousel-arrow right" onClick={handleNext}>
                                    ›
                                </button>
                            )}
                        </>
                    )}
                </div>

                {/* Background */}
                <div className="club-carousel__background"></div>
            </div>
        </>
    );
}

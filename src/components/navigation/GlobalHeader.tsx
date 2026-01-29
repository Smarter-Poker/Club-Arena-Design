/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * GLOBAL HEADER — Hub-Style Dark Theme
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * CRITICAL: This is the GLOBAL STANDARD header for Club Arena.
 * Ported from Hub's UniversalHeader for consistency.
 * 
 * Features:
 * - Dark background with neon blue accents
 * - "Smarter.Poker" in white text 
 * - Diamond wallet with + (REAL balance from user_diamond_balance)
 * - XP display with level (REAL data from profiles.xp_total)
 * - Profile picture (REAL avatar from profiles.avatar_url)
 * - Neon orb icons for profile, messages, notifications, settings
 * - Return to Hub button
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../stores/useUserStore';
import { useWalletStore } from '../../stores/useWalletStore';
import HamburgerMenu from './HamburgerMenu';
import styles from './GlobalHeader.module.css';

// Format numbers compactly: 1.1k, 10.1k, 100.1k, 1.1M
const formatCompact = (num: number): string => {
    if (num < 1000) return num.toString();
    if (num < 10000) return (num / 1000).toFixed(1) + 'k';   // 1.1k - 9.9k
    if (num < 100000) return (num / 1000).toFixed(1) + 'k'; // 10.1k - 99.9k
    if (num < 1000000) return (num / 1000).toFixed(0) + 'k'; // 100k - 999k
    return (num / 1000000).toFixed(1) + 'M'; // 1.1M+
};

interface GlobalHeaderProps {
    pageDepth?: number;  // 1 = major page (show Hub button), 2+ = nested (show Back)
    showSearch?: boolean;
    onSearchClick?: () => void;
}

export default function GlobalHeader({
    pageDepth = 1,
    showSearch = false,
    onSearchClick = undefined
}: GlobalHeaderProps) {
    const navigate = useNavigate();
    const { user } = useUserStore();
    const { loadBalances, loadDiamonds, isLoadingWallet, diamonds, isLoadingDiamonds } = useWalletStore();

    const [stats, setStats] = useState({ xp: 0, diamonds: 0, level: 1 });
    const [isLoading, setIsLoading] = useState(true);
    const [notificationCount, setNotificationCount] = useState(0);
    const [unreadMessages, setUnreadMessages] = useState(0);
    const [showFullDiamonds, setShowFullDiamonds] = useState(false);
    const [showFullXP, setShowFullXP] = useState(false);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);

    useEffect(() => {
        let mounted = true;

        const loadUserData = async () => {
            try {
                // Get authenticated user directly from Supabase Auth (like HomePage.tsx)
                const { data: { user: authUser } } = await supabase.auth.getUser();

                if (!authUser?.id) {
                    setIsLoading(false);
                    return;
                }

                // Load wallet data
                loadBalances(authUser.id);
                loadDiamonds(authUser.id);

                // Fetch profile data - using xp_total (not 'xp' which doesn't exist)
                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('avatar_url, xp_total')
                    .eq('id', authUser.id)
                    .maybeSingle();

                if (profileError) {
                    console.error('[GlobalHeader] Profile query error:', profileError);
                }

                if (profile && mounted) {
                    setAvatarUrl(profile.avatar_url);
                    const totalXp = profile.xp_total || 0;
                    // Calculate level from XP: level = floor(sqrt(xp / 100)) + 1
                    const calculatedLevel = Math.max(1, Math.floor(Math.sqrt(totalXp / 100)) + 1);
                    setStats({
                        xp: totalXp,
                        diamonds: 0, // Loaded from wallet store
                        level: calculatedLevel
                    });
                }

                // Fetch notification count
                const { count: notifCount } = await supabase
                    .from('notifications')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', authUser.id)
                    .eq('read', false);
                if (mounted) setNotificationCount(notifCount || 0);

                // Fetch unread messages count
                const { count: msgCount } = await supabase
                    .from('messages')
                    .select('*', { count: 'exact', head: true })
                    .eq('recipient_id', authUser.id)
                    .eq('read', false);
                if (mounted) setUnreadMessages(msgCount || 0);

            } catch (e) {
                console.error('[GlobalHeader] Error loading user data:', e);
            } finally {
                if (mounted) setIsLoading(false);
            }
        };

        loadUserData();
        return () => { mounted = false; };
    }, [loadBalances, loadDiamonds]);

    const handleBack = () => {
        if (window.history.length > 1) {
            navigate(-1);
        } else {
            // Return to Hub
            window.location.href = 'https://smarter.poker/hub';
        }
    };

    const handleHubClick = () => {
        window.location.href = 'https://smarter.poker/hub';
    };

    return (
        <>
            <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />

            <header className={styles.header}>
                {/* LEFT: Hamburger + Hub Button + Brand */}
                <div className={styles.headerLeft}>
                    <button
                        className={styles.hamburger}
                        aria-label="Menu"
                        onClick={() => setMenuOpen(true)}
                    >
                        ☰
                    </button>
                    <button
                        onClick={pageDepth > 1 ? handleBack : handleHubClick}
                        className={styles.navBtn}
                    >
                        <span>←</span>
                        <span>{pageDepth > 1 ? 'Back' : 'Hub'}</span>
                    </button>
                    <span className={styles.brandText}>Smarter.Poker</span>
                </div>

                {/* CENTER: Diamond Wallet + XP */}
                <div className={styles.headerCenter}>
                    {/* Diamond Wallet */}
                    <a
                        href="https://smarter.poker/hub/diamond-store"
                        className={styles.diamondWallet}
                        onClick={(e) => {
                            if (diamonds >= 1000) {
                                e.preventDefault();
                                setShowFullDiamonds(!showFullDiamonds);
                            }
                        }}
                    >
                        <span>💎</span>
                        <span className={styles.statValue} title={diamonds.toLocaleString() + ' diamonds'}>
                            {isLoadingDiamonds ? '...' : showFullDiamonds ? diamonds.toLocaleString() : formatCompact(diamonds)}
                        </span>
                        <span className={styles.addBtn}>+</span>
                    </a>

                    {/* XP + Level */}
                    <div
                        className={styles.xpDisplay}
                        onClick={() => stats.xp >= 1000 && setShowFullXP(!showFullXP)}
                        style={{ cursor: stats.xp >= 1000 ? 'pointer' : 'default' }}
                    >
                        <div className={styles.xpRow}>
                            <span>XP</span>
                            <span title={stats.xp.toLocaleString() + ' XP'}>
                                {showFullXP ? stats.xp.toLocaleString() : formatCompact(stats.xp)}
                            </span>
                        </div>
                        <div className={styles.xpRow}>
                            <span>LV</span>
                            <span>{stats.level}</span>
                        </div>
                    </div>
                </div>

                {/* RIGHT: Orb Icons */}
                <div className={styles.headerRight}>
                    {/* Avatar/Profile */}
                    <a href="https://smarter.poker/hub/profile" className={styles.profileOrb}>
                        {avatarUrl ? (
                            <img src={avatarUrl} alt="" className={styles.profileImg} />
                        ) : (
                            <span>👤</span>
                        )}
                    </a>

                    {/* Messages */}
                    <a href="https://smarter.poker/hub/messenger" className={styles.orbBtn}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                            <path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.13.26.35.27.57l.05 1.78c.04.57.61.94 1.13.71l1.98-.87c.17-.07.36-.09.53-.05.86.23 1.81.36 2.9.36 5.64 0 10-4.13 10-9.7C22 6.13 17.64 2 12 2z" />
                        </svg>
                        {unreadMessages > 0 && (
                            <span className={styles.badge}>{unreadMessages > 99 ? '99+' : unreadMessages}</span>
                        )}
                    </a>

                    {/* Notifications */}
                    <a href="https://smarter.poker/hub/notifications" className={styles.orbBtn}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                            <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
                        </svg>
                        {notificationCount > 0 && (
                            <span className={styles.badge}>{notificationCount > 99 ? '99+' : notificationCount}</span>
                        )}
                    </a>

                    {/* Settings */}
                    <a href="https://smarter.poker/hub/settings" className={styles.orbBtn}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                            <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                        </svg>
                    </a>
                </div>
            </header>
        </>
    );
}

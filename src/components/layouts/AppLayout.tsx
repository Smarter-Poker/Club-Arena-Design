/**
 *  CLUB ENGINE — App Layout
 * Main shell layout with navigation
 * ═══════════════════════════════════════════════════════════════════════════════
 * GLOBAL COMPONENTS WIRED:
 * - QuickActionsBar: FAB menu for quick navigation
 * - NotificationDropdown: Real-time notification center in header
 * - ClubAnnouncementBanner: Important announcements at top of content
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { Outlet, NavLink } from 'react-router-dom';
import { useState } from 'react';
import styles from './AppLayout.module.css';
import ClubArenaWelcomeModal, { useClubArenaWelcome } from '../modals/ClubArenaWelcomeModal';
import QuickActionsBar from '../navigation/QuickActionsBar';
import NotificationDropdown from '../navigation/NotificationDropdown';
import ClubAnnouncementBanner from '../club/ClubAnnouncementBanner';
import { useUserStore } from '../../stores/useUserStore';
import { useWalletStore, useTotalBalance } from '../../stores/useWalletStore';
import { useEffect } from 'react';

export default function AppLayout() {
    // Detect if running inside iframe (World Hub embedding)
    // Use state to ensure correct value after client-side hydration
    const [isInIframe, setIsInIframe] = useState(false);

    useEffect(() => {
        const inIframe = window.parent !== window;
        console.log('[AppLayout] useEffect - Setting isInIframe:', inIframe);
        setIsInIframe(inIframe);

        // Also add class to body so CSS can hide header immediately
        if (inIframe) {
            document.body.classList.add('embedded-in-iframe');
        }
        return () => {
            document.body.classList.remove('embedded-in-iframe');
        };
    }, []);

    // Auto-load wallet balances when user is available
    const { user } = useUserStore();
    const totalBalance = useTotalBalance();
    const { loadBalances, loadDiamonds, isLoadingWallet } = useWalletStore();

    useEffect(() => {
        if (user?.id) {
            loadBalances(user.id);
            loadDiamonds(user.id);
        }
    }, [user?.id, loadBalances, loadDiamonds]);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const { showWelcome, isReady, acceptWelcome } = useClubArenaWelcome();

    return (
        <div className={`${styles.layout} ${isInIframe ? styles.embedded : ''}`}>
            {/* First-time Welcome Modal - Always show regardless of iframe */}
            {isReady && !isInIframe && (
                <ClubArenaWelcomeModal
                    isOpen={showWelcome}
                    onAccept={acceptWelcome}
                />
            )}

            {/* Header - Hide when in iframe */}
            {!isInIframe && (
                <header className={styles.header}>
                    <div className={styles.headerContent}>
                        {/* Logo */}
                        <NavLink to="/" className={styles.logo}>
                            <span className={styles.logoIcon}>♠</span>
                            <span className={styles.logoText}>ClubEngine</span>
                        </NavLink>

                        {/* Desktop Navigation */}
                        <nav className={styles.nav}>
                            <NavLink
                                to="/"
                                className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
                            >
                                Lobby
                            </NavLink>
                            <NavLink
                                to="/clubs"
                                className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
                            >
                                Clubs
                            </NavLink>
                            <NavLink
                                to="/profile"
                                className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
                            >
                                Profile
                            </NavLink>
                        </nav>

                        {/* User Actions */}
                        <div className={styles.userActions}>
                            {/* Notification Bell with Dropdown */}
                            {user && <NotificationDropdown />}

                            <div className={styles.chipBalance}>
                                <span className={styles.chipIcon}></span>
                                <span className={styles.chipAmount}>
                                    {isLoadingWallet ? '...' : totalBalance.toLocaleString()}
                                </span>
                            </div>

                            <NavLink to="/settings" className={styles.settingsButton}>

                            </NavLink>
                        </div>

                        {/* Mobile Menu Toggle */}
                        <button
                            className={styles.mobileMenuToggle}
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        >
                            {isMobileMenuOpen ? '✕' : '☰'}
                        </button>
                    </div>

                    {/* Mobile Navigation */}
                    {isMobileMenuOpen && (
                        <nav className={styles.mobileNav}>
                            <NavLink
                                to="/"
                                className={styles.mobileNavLink}
                                onClick={() => setIsMobileMenuOpen(false)}
                            >
                                Lobby
                            </NavLink>
                            <NavLink
                                to="/clubs"
                                className={styles.mobileNavLink}
                                onClick={() => setIsMobileMenuOpen(false)}
                            >
                                Clubs
                            </NavLink>
                            <NavLink
                                to="/profile"
                                className={styles.mobileNavLink}
                                onClick={() => setIsMobileMenuOpen(false)}
                            >
                                Profile
                            </NavLink>
                            <NavLink
                                to="/settings"
                                className={styles.mobileNavLink}
                                onClick={() => setIsMobileMenuOpen(false)}
                            >
                                Settings
                            </NavLink>
                        </nav>
                    )}
                </header>
            )}

            {/* Global Announcement Banner (shows club announcements when in a club context) */}
            <ClubAnnouncementBanner />

            {/* Main Content */}
            <main className={styles.main}>
                <Outlet />
            </main>

            {/* Quick Actions FAB - Global floating action button */}
            {user && !isInIframe && <QuickActionsBar />}

            {/* Footer - Hide when in iframe */}
            {!isInIframe && (
                <footer className={styles.footer}>
                    <p>Club Engine 2026 - Smarter.Poker</p>
                </footer>
            )}
        </div>
    );
}


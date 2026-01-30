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

import { Outlet, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import styles from './AppLayout.module.css';
import ClubArenaWelcomeModal, { useClubArenaWelcome } from '../modals/ClubArenaWelcomeModal';
import QuickActionsBar from '../navigation/QuickActionsBar';
import ClubAnnouncementBanner from '../club/ClubAnnouncementBanner';
import GlobalHeader from '../navigation/GlobalHeader';
import { useUserStore } from '../../stores/useUserStore';

export default function AppLayout() {
    const location = useLocation();

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

    // User store for FAB conditional rendering
    const { user } = useUserStore();
    const { showWelcome, isReady, acceptWelcome } = useClubArenaWelcome();

    // Hide QuickActionsBar on club pages (they have ClubBottomNav instead)
    const isOnClubPage = location.pathname.includes('/clubs/');

    return (
        <div className={`${styles.layout} ${isInIframe ? styles.embedded : ''}`}>
            {/* First-time Welcome Modal - Always show regardless of iframe */}
            {isReady && !isInIframe && (
                <ClubArenaWelcomeModal
                    isOpen={showWelcome}
                    onAccept={acceptWelcome}
                />
            )}

            {/* Global Header - Hide when in iframe */}
            {!isInIframe && <GlobalHeader pageDepth={2} />}

            {/* Global Announcement Banner (shows club announcements when in a club context) */}
            <ClubAnnouncementBanner />

            {/* Main Content */}
            <main className={styles.main}>
                <Outlet />
            </main>

            {/* Quick Actions FAB - Global floating action button (hidden on club pages) */}
            {user && !isInIframe && !isOnClubPage && <QuickActionsBar />}

            {/* Footer - Hide when in iframe */}
            {!isInIframe && (
                <footer className={styles.footer}>
                    <p>Club Engine 2026 - Smarter.Poker</p>
                </footer>
            )}
        </div>
    );
}


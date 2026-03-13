/**
 *  CLUB ENGINE — App Layout
 * Main shell layout with navigation
 * ═══════════════════════════════════════════════════════════════════════════════
 * GLOBAL COMPONENTS WIRED:
 * - GlobalHeader: Contains hamburger menu for quick navigation
 * - NotificationDropdown: Real-time notification center in header
 * - ClubAnnouncementBanner: Important announcements at top of content
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { Outlet, useLocation } from 'react-router-dom';
import RouteErrorBoundary from '../common/RouteErrorBoundary';
import { useState, useEffect } from 'react';
import styles from './AppLayout.module.css';
import ClubArenaWelcomeModal, { useClubArenaWelcome } from '../modals/ClubArenaWelcomeModal';
import ClubAnnouncementBanner from '../club/ClubAnnouncementBanner';
import GlobalHeader from '../navigation/GlobalHeader';
import { useAuthUser } from '../../hooks/useAuthUser';

export default function AppLayout() {
  const location = useLocation();

  // Detect if running inside iframe (World Hub embedding)
  // Use state to ensure correct value after client-side hydration
  const [isInIframe, setIsInIframe] = useState(false);

  useEffect(() => {
    const inIframe = window.parent !== window;
    setIsInIframe(inIframe);

    // Also add class to body so CSS can hide header immediately
    if (inIframe) {
      document.body.classList.add('embedded-in-iframe');
    }
    return () => {
      document.body.classList.remove('embedded-in-iframe');
    };
  }, []);

  // User store for conditional rendering
  const { user } = useAuthUser();
  const { showWelcome, isReady, acceptWelcome } = useClubArenaWelcome();

  return (
    <div className={`${styles.layout} ${isInIframe ? styles.embedded : ''}`}>
      {/* First-time Welcome Modal - Always show regardless of iframe */}
      {isReady && !isInIframe && (
        <ClubArenaWelcomeModal isOpen={showWelcome} onAccept={acceptWelcome} />
      )}

      {/* Global Header - Hide when in iframe */}
      {!isInIframe && <GlobalHeader pageDepth={2} />}

      {/* Global Announcement Banner (shows club announcements when in a club context) */}
      <ClubAnnouncementBanner />

      {/* Main Content */}
      <main id="main-content" className={styles.main}>
        <RouteErrorBoundary>
          <Outlet />
        </RouteErrorBoundary>
      </main>

      {/* Footer - Hide when in iframe */}
      {!isInIframe && (
        <footer className={styles.footer}>
          <p>Club Engine 2026 - Smarter.Poker</p>
        </footer>
      )}
    </div>
  );
}

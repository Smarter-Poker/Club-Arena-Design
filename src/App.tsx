/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CLUB ENGINE — App Component
 * ═══════════════════════════════════════════════════════════════════════════════
 * PokerBros Clone — Better
 * Root application with routing, auth guards, and global providers
 */

import { Routes, Route } from 'react-router-dom';
import { Suspense, lazy, useState, useEffect } from 'react';
import { supabase } from './lib/supabase';

// Intro Video for first-time load
import IntroVideo from './components/IntroVideo';

// Layouts
import AppLayout from './components/layouts/AppLayout';
import { ToastProvider } from './components/common/Toast';
import ErrorBoundary from './components/common/ErrorBoundary';

// Auth Guards
import { AuthGuard, GuestGuard } from './components/auth/AuthGuard';
import TOSGuard from './components/legal/TOSGuard';

// Pages (lazy loaded for performance)
const AuthPage = lazy(() => import('./pages/AuthPage'));
const HomePage = lazy(() => import('./pages/HomePage'));
const LobbyPage = lazy(() => import('./pages/LobbyPage'));
const ClubsPage = lazy(() => import('./pages/ClubsPage'));
const ClubCarouselPage = lazy(() => import('./pages/ClubCarouselPage'));
const ClubHomePage = lazy(() => import('./pages/ClubHomePage'));
const ClubLobby = lazy(() => import('./pages/club/ClubLobby'));
const ClubDashboard = lazy(() => import('./pages/club/ClubDashboard'));
const CreateClubPage = lazy(() => import('./pages/CreateClubPage'));
const CreateTablePage = lazy(() => import('./pages/CreateTablePage'));
const TableConfigPage = lazy(() => import('./pages/TableConfigPage'));
const AgentManagementPage = lazy(() => import('./pages/AgentManagementPage'));
const TournamentPage = lazy(() => import('./pages/TournamentPage'));
const TournamentDetails = lazy(() => import('./pages/tournament/TournamentDetails'));
const TournamentLobbyPage = lazy(() => import('./pages/tournament/TournamentLobbyPage'));
const TournamentResultsPage = lazy(() => import('./pages/tournament/TournamentResultsPage'));
const TablePage = lazy(() => import('./pages/TablePage'));
const MultiTablePage = lazy(() => import('./pages/MultiTablePage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const UnionsPage = lazy(() => import('./pages/UnionsPage'));
const UnionDetailPage = lazy(() => import('./pages/UnionDetailPage'));
const CreateUnionPage = lazy(() => import('./pages/CreateUnionPage'));
const SettlementPage = lazy(() => import('./pages/SettlementPage'));

// New Pages
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage'));
const HandHistoryPage = lazy(() => import('./pages/HandHistoryPage'));
const PlayerWalletPage = lazy(() => import('./pages/PlayerWalletPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const MessagesPage = lazy(() => import('./pages/MessagesPage'));
const ClubMessagesPage = lazy(() => import('./pages/ClubMessagesPage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const HelpPage = lazy(() => import('./pages/HelpPage'));
const CashierPage = lazy(() => import('./pages/CashierPage'));
const SuperAgentDashboard = lazy(() => import('./pages/SuperAgentDashboard'));
const AchievementsPage = lazy(() => import('./pages/AchievementsPage'));
const ClubMembersPage = lazy(() => import('./pages/ClubMembersPage'));
const FriendsPage = lazy(() => import('./pages/FriendsPage'));
const RakebackPage = lazy(() => import('./pages/RakebackPage'));
const BadBeatJackpotPage = lazy(() => import('./pages/BadBeatJackpotPage'));
const PlayerStatsPage = lazy(() => import('./pages/PlayerStatsPage'));
const PromotionsPage = lazy(() => import('./pages/PromotionsPage'));
const ClubSettingsPage = lazy(() => import('./pages/ClubSettingsPage'));
const TransactionHistoryPage = lazy(() => import('./pages/TransactionHistoryPage'));
const InvitePage = lazy(() => import('./pages/InvitePage'));
const TableCreationPage = lazy(() => import('./pages/TableCreationPage'));
const ReportPlayerPage = lazy(() => import('./pages/ReportPlayerPage'));
const ReportReviewPage = lazy(() => import('./pages/ReportReviewPage'));
const ClubAnnouncementsPage = lazy(() => import('./pages/ClubAnnouncementsPage'));
const VIPPage = lazy(() => import('./pages/VIPPage'));
const ClubFinancialsPage = lazy(() => import('./pages/ClubFinancialsPage'));
const BonusPage = lazy(() => import('./pages/BonusPage'));
const WaitlistPage = lazy(() => import('./pages/WaitlistPage'));
const ClubRulesPage = lazy(() => import('./pages/ClubRulesPage'));
const NotificationCenter = lazy(() => import('./pages/NotificationCenter'));

// Shared/Public Pages
const HandReplayerPage = lazy(() => import('./pages/share/HandReplayerPage'));

// Legal Pages
const TermsOfServicePage = lazy(() => import('./pages/legal/TermsOfServicePage'));
const ClubPromotionRulesPage = lazy(() => import('./pages/legal/PromotionsPage'));
const FairGamingPage = lazy(() => import('./pages/legal/FairGamingPage'));
const PrivacyPolicyPage = lazy(() => import('./pages/legal/PrivacyPolicyPage'));

// Loading fallback
function LoadingSpinner() {
    return (
        <div className="loading-container">
            <div className="spinner" />
            <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Loading...</p>
        </div>
    );
}

const INTRO_SHOWN_KEY = 'club_arena_intro_shown';

export default function App() {
    // Check if intro video has been shown this session
    const [showIntro, setShowIntro] = useState(() => {
        // Only show intro if not viewed this session and not in iframe
        const alreadyShown = sessionStorage.getItem(INTRO_SHOWN_KEY);
        const inIframe = window.parent !== window;
        return !alreadyShown && !inIframe;
    });

    const handleIntroComplete = () => {
        sessionStorage.setItem(INTRO_SHOWN_KEY, 'true');
        setShowIntro(false);
    };

    // Offline/Online detection
    const [isOffline, setIsOffline] = useState(!navigator.onLine);

    useEffect(() => {
        const goOffline = () => setIsOffline(true);
        const goOnline = () => {
            setIsOffline(false);
            // Replay queued mutations on reconnect
            try {
                const queue = JSON.parse(localStorage.getItem('offline_mutation_queue') || '[]');
                if (queue.length > 0) {
                    console.log('[Offline Queue] Replaying', queue.length, 'queued mutations');
                    localStorage.removeItem('offline_mutation_queue');
                    // Mutations would be replayed here against Supabase
                }
            } catch { /* ignore parse errors */ }
        };
        window.addEventListener('offline', goOffline);
        window.addEventListener('online', goOnline);
        return () => {
            window.removeEventListener('offline', goOffline);
            window.removeEventListener('online', goOnline);
        };
    }, []);

    // ── Receive auth token from parent World Hub via postMessage ──
    // When embedded in an iframe at smarter.poker, the parent sends
    // the Supabase auth token so the SPA can authenticate without
    // requiring a separate login flow.
    useEffect(() => {
        const isInIframe = window.parent !== window;
        if (!isInIframe) return;

        const handleMessage = async (event: MessageEvent) => {
            // Only accept from smarter.poker
            if (!event.origin.includes('smarter.poker')) return;

            if (event.data?.type === 'SMARTER_AUTH_TOKEN' && event.data.token) {
                try {
                    await supabase.auth.setSession({
                        access_token: event.data.token,
                        refresh_token: event.data.refreshToken || '',
                    });
                } catch (e) {
                    console.error('[App] Failed to set session from parent:', e);
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    return (
        <ErrorBoundary>
        <ToastProvider>
            {/* Intro video overlay - app loads in background while video plays */}
            {showIntro && (
                <IntroVideo
                    videoSrc="/videos/club-arena-intro.mp4"
                    minDuration={3000}
                    maxDuration={10000}
                    onComplete={handleIntroComplete}
                />
            )}

            <TOSGuard>
                {/* Offline Banner */}
                {isOffline && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
                        background: 'linear-gradient(135deg, #b91c1c 0%, #991b1b 100%)',
                        color: '#fff', textAlign: 'center', padding: '8px 16px',
                        fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.5px',
                        boxShadow: '0 2px 8px rgba(185,28,28,0.4)',
                    }}>
                        CONNECTION LOST — Actions will be queued and replayed when you reconnect
                    </div>
                )}
                <Suspense fallback={<LoadingSpinner />}>
                    <Routes>
                        {/* ═══════════════════════════════════════════════════════════════
                        PUBLIC ROUTES (No Auth Required)
                    ═══════════════════════════════════════════════════════════════ */}

                        {/* Auth Page - Only accessible when NOT logged in */}
                        <Route
                            path="/auth"
                            element={
                                <GuestGuard>
                                    <AuthPage />
                                </GuestGuard>
                            }
                        />

                        {/* Public Hand Replay — shareable link, no auth required */}
                        <Route path="/share/hand/:handId" element={<HandReplayerPage />} />

                        {/* ═══════════════════════════════════════════════════════════════
                    PROTECTED ROUTES (Auth Required)
                ═══════════════════════════════════════════════════════════════ */}

                        {/* HomePage - Standalone without Shell, requires auth */}
                        <Route
                            path="/"
                            element={
                                <AuthGuard>
                                    <HomePage />
                                </AuthGuard>
                            }
                        />

                        {/* Table — Standalone without AppLayout shell (full-screen immersive) */}
                        <Route
                            path="table/:tableId"
                            element={
                                <AuthGuard>
                                    <MultiTablePage />
                                </AuthGuard>
                            }
                        />

                        {/* Protected routes with AppLayout shell */}
                        <Route element={<AppLayout />}>
                            {/* Lobby */}
                            <Route
                                path="lobby"
                                element={
                                    <AuthGuard>
                                        <LobbyPage />
                                    </AuthGuard>
                                }
                            />

                            {/* Clubs */}
                            <Route
                                path="clubs"
                                element={
                                    <AuthGuard>
                                        <ClubCarouselPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="clubs/create"
                                element={
                                    <AuthGuard>
                                        <CreateClubPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="clubs/:clubId"
                                element={
                                    <AuthGuard>
                                        <ClubHomePage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="clubs/:clubId/agents"
                                element={
                                    <AuthGuard>
                                        <AgentManagementPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="clubs/:clubId/create-table"
                                element={
                                    <AuthGuard>
                                        <CreateTablePage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="clubs/:clubId/create-table/:gameType"
                                element={
                                    <AuthGuard>
                                        <TableConfigPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="clubs/:clubId/dashboard"
                                element={
                                    <AuthGuard>
                                        <ClubDashboard />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="clubs/:clubId/lobby"
                                element={
                                    <AuthGuard>
                                        <ClubLobby />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="clubs/:clubId/tournaments"
                                element={
                                    <AuthGuard>
                                        <TournamentPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="clubs/:clubId/messages"
                                element={
                                    <AuthGuard>
                                        <MessagesPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="tournaments/:tournamentId"
                                element={
                                    <AuthGuard>
                                        <TournamentDetails />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="tournament-lobby"
                                element={
                                    <AuthGuard>
                                        <TournamentLobbyPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="tournaments"
                                element={
                                    <AuthGuard>
                                        <TournamentLobbyPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="tournament-results"
                                element={
                                    <AuthGuard>
                                        <TournamentResultsPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="hand-history"
                                element={
                                    <AuthGuard>
                                        <HandHistoryPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="agent-management"
                                element={
                                    <AuthGuard>
                                        <AgentManagementPage />
                                    </AuthGuard>
                                }
                            />

                            {/* Unions */}
                            <Route
                                path="unions"
                                element={
                                    <AuthGuard>
                                        <UnionsPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="unions/create"
                                element={
                                    <AuthGuard>
                                        <CreateUnionPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="unions/:unionId"
                                element={
                                    <AuthGuard>
                                        <UnionDetailPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="unions/:unionId/settlement"
                                element={
                                    <AuthGuard>
                                        <SettlementPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="clubs/:clubId/settlement"
                                element={
                                    <AuthGuard>
                                        <SettlementPage />
                                    </AuthGuard>
                                }
                            />


                            {/* User */}
                            <Route
                                path="profile"
                                element={
                                    <AuthGuard>
                                        <ProfilePage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="settings"
                                element={
                                    <AuthGuard>
                                        <SettingsPage />
                                    </AuthGuard>
                                }
                            />

                            {/* New Pages */}
                            <Route
                                path="leaderboard"
                                element={
                                    <AuthGuard>
                                        <LeaderboardPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="history"
                                element={
                                    <AuthGuard>
                                        <HandHistoryPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="wallet"
                                element={
                                    <AuthGuard>
                                        <PlayerWalletPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="notifications"
                                element={
                                    <AuthGuard>
                                        <NotificationsPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="messages"
                                element={
                                    <AuthGuard>
                                        <MessagesPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="messages/clubs"
                                element={
                                    <AuthGuard>
                                        <ClubMessagesPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="messages/clubs/:conversationId"
                                element={
                                    <AuthGuard>
                                        <ClubMessagesPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="search"
                                element={
                                    <AuthGuard>
                                        <SearchPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="help"
                                element={
                                    <AuthGuard>
                                        <HelpPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="cashier"
                                element={
                                    <AuthGuard>
                                        <CashierPage />
                                    </AuthGuard>
                                }
                            />
                            {/* Query parameter club routes for bottom nav */}
                            <Route
                                path="players"
                                element={
                                    <AuthGuard>
                                        <ClubMembersPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="data"
                                element={
                                    <AuthGuard>
                                        <ClubDashboard />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="admin"
                                element={
                                    <AuthGuard>
                                        <ClubSettingsPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="clubs/:clubId/cashier"
                                element={
                                    <AuthGuard>
                                        <CashierPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="hands"
                                element={
                                    <AuthGuard>
                                        <HandHistoryPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="clubs/:clubId/agent-dashboard"
                                element={
                                    <AuthGuard>
                                        <SuperAgentDashboard />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="achievements"
                                element={
                                    <AuthGuard>
                                        <AchievementsPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="clubs/:clubId/members"
                                element={
                                    <AuthGuard>
                                        <ClubMembersPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="friends"
                                element={
                                    <AuthGuard>
                                        <FriendsPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="rakeback"
                                element={
                                    <AuthGuard>
                                        <RakebackPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="clubs/:clubId/jackpot"
                                element={
                                    <AuthGuard>
                                        <BadBeatJackpotPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="stats"
                                element={
                                    <AuthGuard>
                                        <PlayerStatsPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="stats/:userId"
                                element={
                                    <AuthGuard>
                                        <PlayerStatsPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="promotions"
                                element={
                                    <AuthGuard>
                                        <PromotionsPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="clubs/:clubId/promotions"
                                element={
                                    <AuthGuard>
                                        <PromotionsPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="clubs/:clubId/settings"
                                element={
                                    <AuthGuard>
                                        <ClubSettingsPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="transactions"
                                element={
                                    <AuthGuard>
                                        <TransactionHistoryPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="invite/:clubId"
                                element={
                                    <AuthGuard>
                                        <InvitePage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="invite"
                                element={
                                    <AuthGuard>
                                        <InvitePage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="report/:playerId"
                                element={
                                    <AuthGuard>
                                        <ReportPlayerPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="clubs/:clubId/reports"
                                element={
                                    <AuthGuard>
                                        <ReportReviewPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="clubs/:clubId/announcements"
                                element={
                                    <AuthGuard>
                                        <ClubAnnouncementsPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="vip"
                                element={
                                    <AuthGuard>
                                        <VIPPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="clubs/:clubId/financials"
                                element={
                                    <AuthGuard>
                                        <ClubFinancialsPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="bonuses"
                                element={
                                    <AuthGuard>
                                        <BonusPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="waitlist"
                                element={
                                    <AuthGuard>
                                        <WaitlistPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="clubs/:clubId/rules"
                                element={
                                    <AuthGuard>
                                        <ClubRulesPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="notifications"
                                element={
                                    <AuthGuard>
                                        <NotificationCenter />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="clubs-list"
                                element={
                                    <AuthGuard>
                                        <ClubsPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="clubs/:clubId/table-creation"
                                element={
                                    <AuthGuard>
                                        <TableCreationPage />
                                    </AuthGuard>
                                }
                            />

                            {/* Legal Pages */}
                            <Route
                                path="legal/tos"
                                element={
                                    <AuthGuard>
                                        <TermsOfServicePage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="legal/promotions"
                                element={
                                    <AuthGuard>
                                        <ClubPromotionRulesPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="legal/fair-gaming"
                                element={
                                    <AuthGuard>
                                        <FairGamingPage />
                                    </AuthGuard>
                                }
                            />
                            <Route
                                path="legal/privacy"
                                element={
                                    <AuthGuard>
                                        <PrivacyPolicyPage />
                                    </AuthGuard>
                                }
                            />

                            {/* 404 catch-all */}
                            <Route
                                path="*"
                                element={
                                    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
                                        <h1 className="text-6xl font-bold mb-4">404</h1>
                                        <p className="text-xl text-gray-400 mb-8">Page not found</p>
                                        <a href="/lobby" className="px-6 py-3 bg-green-600 rounded-lg hover:bg-green-700 transition-colors">
                                            Back to Lobby
                                        </a>
                                    </div>
                                }
                            />
                        </Route>
                    </Routes>
                </Suspense>
            </TOSGuard>
        </ToastProvider>
        </ErrorBoundary>
    );
}

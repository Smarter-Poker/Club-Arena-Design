/**
 * ♠ CLUB ARENA — Shell Layout
 * Main app shell with header and navigation
 */

import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useUserStore } from '../stores/useUserStore';
import { useWalletStore } from '../stores/useWalletStore';
import { notificationService } from '../services/NotificationService';
import { supabase } from '../lib/supabase';
import { VIPProvider, useVIPStatus } from '../hooks/useVIP';
import './Shell.css';

// VIP Badge Component
function VIPBadge() {
    const { isVIP, isLoading } = useVIPStatus();
    const navigate = useNavigate();

    if (isLoading) return null;

    return (
        <button
            className={`shell-vip-badge ${isVIP ? 'vip-active' : ''}`}
            onClick={() => navigate('/diamond-store/vip')}
            title={isVIP ? 'VIP Gold Active' : 'Get VIP Benefits'}
        >
            {isVIP ? ' VIP' : ''}
        </button>
    );
}

function ShellContent() {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();

    // Detect if running inside iframe (World Hub embedding)
    const isInIframe = typeof window !== 'undefined' && window.parent !== window;

    // Store
    const { theme } = useSettingsStore();
    const { user, totalChips } = useUserStore();
    const { diamonds } = useWalletStore();
    const [unreadCount, setUnreadCount] = useState(0);

    // Sync Theme
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    // Real-time notifications
    useEffect(() => {
        const setupNotifications = async () => {
            const { data: { user: authUser } } = await supabase.auth.getUser();
            if (!authUser) return;

            // Get initial count
            const count = await notificationService.getUnreadCount(authUser.id);
            setUnreadCount(count);

            // Subscribe to real-time updates
            await notificationService.subscribe(authUser.id, {
                onNew: () => setUnreadCount(prev => prev + 1),
                onUpdate: async () => {
                    const newCount = await notificationService.getUnreadCount(authUser.id);
                    setUnreadCount(newCount);
                }
            });
        };

        setupNotifications();

        return () => {
            notificationService.unsubscribe();
        };
    }, []);

    // Detect if we're inside a specific club (Club Arena context)
    // Club Arena is its own business - no global header needed
    // Routes: /hub/club-arena/clubs/[clubId]/*
    const isInClubArena = location.pathname.includes('/club-arena/clubs/');

    return (
        <div className={`shell ${isInIframe ? 'shell--embedded' : ''}`}>
            {/* Header - Hidden when inside Club Arena */}
            {!isInClubArena && (
                <header className="shell-header">
                    <div className="shell-header-content">
                        {/* Logo */}
                        <NavLink to="/" className="shell-logo">
                            <span className="shell-logo-icon">♠</span>
                            <span className="shell-logo-text">Club Arena</span>
                        </NavLink>

                        {/* Desktop Nav */}
                        <nav className="shell-nav">
                            <NavLink
                                to="/"
                                className={({ isActive }) => `shell-nav-link ${isActive ? 'active' : ''}`}
                                end
                            >
                                Home
                            </NavLink>
                            <NavLink
                                to="/play"
                                className={({ isActive }) => `shell-nav-link ${isActive ? 'active' : ''}`}
                            >
                                Play
                            </NavLink>
                            <NavLink
                                to="/clubs"
                                className={({ isActive }) => `shell-nav-link ${isActive || location.pathname.startsWith('/clubs') ? 'active' : ''}`}
                            >
                                Clubs
                            </NavLink>
                            <NavLink
                                to="/unions"
                                className={({ isActive }) => `shell-nav-link ${isActive ? 'active' : ''}`}
                            >
                                Unions
                            </NavLink>
                            <NavLink
                                to="/profile"
                                className={({ isActive }) => `shell-nav-link ${isActive ? 'active' : ''}`}
                            >
                                Profile
                            </NavLink>
                        </nav>

                        {/* User Info */}
                        <div className="shell-user">
                            {user && (
                                <div className="shell-player-id" title="Player ID">
                                    ID: {parseInt(user.id, 10) || user.id}
                                </div>
                            )}
                            <VIPBadge />
                            <button
                                className="shell-notifications"
                                onClick={() => navigate('/notifications')}
                                title="Notifications"
                            >

                                {unreadCount > 0 && (
                                    <span className="notification-badge">
                                        {unreadCount > 99 ? '99+' : unreadCount}
                                    </span>
                                )}
                            </button>
                            <div className="shell-diamonds" onClick={() => navigate('/diamond-store')} style={{ cursor: 'pointer' }}>
                                <span className="diamond-icon"></span>
                                <span className="diamond-amount">{diamonds.toLocaleString()}</span>
                            </div>
                            <div className="shell-chips">
                                <span className="chip-icon"></span>
                                <span className="chip-amount">{user ? totalChips.toLocaleString() : '0'}</span>
                            </div>
                            <button className="shell-avatar" onClick={() => navigate('/profile')}>
                                {user?.avatar_url || ''}
                            </button>
                        </div>

                        {/* Mobile Toggle */}
                        <button
                            className="shell-mobile-toggle"
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        >
                            {mobileMenuOpen ? '✕' : '☰'}
                        </button>
                    </div>

                    {/* Mobile Nav */}
                    {mobileMenuOpen && (
                        <nav className="shell-mobile-nav">
                            <NavLink to="/" onClick={() => setMobileMenuOpen(false)}> Home</NavLink>
                            <NavLink to="/play" onClick={() => setMobileMenuOpen(false)}> Play</NavLink>
                            <NavLink to="/clubs" onClick={() => setMobileMenuOpen(false)}> Clubs</NavLink>
                            <NavLink to="/unions" onClick={() => setMobileMenuOpen(false)}>Unions</NavLink>
                            <NavLink to="/profile" onClick={() => setMobileMenuOpen(false)}> Profile</NavLink>
                        </nav>
                    )}
                </header>
            )}

            {/* Main Content */}
            <main className="shell-main">
                <Outlet />
            </main>

            {/* Footer */}
            <footer className="shell-footer">
                <p>Club Engine 2026 - Smarter.Poker</p>
            </footer>
        </div>
    );
}

// Export with VIPProvider wrapper
export default function Shell() {
    return (
        <VIPProvider>
            <ShellContent />
        </VIPProvider>
    );
}


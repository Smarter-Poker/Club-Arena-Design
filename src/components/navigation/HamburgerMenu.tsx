/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * HAMBURGER MENU — Facebook Dark Theme
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Clean, classy navigation with complete page coverage
 * No emojis - professional Facebook-style design
 */

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../stores/useUserStore';
import { useToast } from '../common/Toast';
import styles from './HamburgerMenu.module.css';

interface HamburgerMenuProps {
    isOpen: boolean;
    onClose: () => void;
}

// Facebook Dark Theme Colors (matching globals.css CSS variables)
const colors = {
    bg: 'var(--near-black)',           // #18191A
    bgSecondary: 'var(--dark-surface)', // #242526
    bgHover: 'var(--card-surface)',     // #3A3B3C
    text: 'var(--off-white)',           // #E4E6EB
    textSecondary: 'var(--soft-white)', // #B0B3B8
    divider: 'var(--border-subtle)',    // rgba(255,255,255,0.1)
    accent: 'var(--royal-blue)',        // #1877F2
    accentHover: 'var(--royal-blue-dark)', // #0D5DC7
    success: 'var(--success)',          // #31A24C
    danger: 'var(--danger)'             // #F02849
};

export default function HamburgerMenu({ isOpen, onClose }: HamburgerMenuProps) {
    const navigate = useNavigate();
    const { user } = useUserStore();
    const toast = useToast();
    const touchStartRef = useRef<number | null>(null);

    const [soundsEnabled, setSoundsEnabled] = useState(true);
    const [vibrationsEnabled, setVibrationsEnabled] = useState(true);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [userName, setUserName] = useState<string>('');

    // Close on ESC key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    // Prevent body scroll when menu is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    // Load user data and settings
    useEffect(() => {
        const sounds = localStorage.getItem('soundsEnabled');
        const vibrations = localStorage.getItem('vibrationsEnabled');
        if (sounds !== null) setSoundsEnabled(sounds === 'true');
        if (vibrations !== null) setVibrationsEnabled(vibrations === 'true');

        if (user?.id) {
            supabase
                .from('profiles')
                .select('avatar_url, username, sounds_enabled, vibrations_enabled')
                .eq('id', user.id)
                .single()
                .then(({ data }) => {
                    if (data) {
                        setAvatarUrl(data.avatar_url);
                        setUserName(data.username || 'Player');
                        if (data.sounds_enabled !== null) {
                            setSoundsEnabled(data.sounds_enabled);
                            localStorage.setItem('soundsEnabled', String(data.sounds_enabled));
                        }
                        if (data.vibrations_enabled !== null) {
                            setVibrationsEnabled(data.vibrations_enabled);
                            localStorage.setItem('vibrationsEnabled', String(data.vibrations_enabled));
                        }
                    }
                });
        }
    }, [user?.id]);

    // Swipe-to-close gesture
    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartRef.current = e.touches[0].clientX;
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (touchStartRef.current === null) return;
        const touchEnd = e.changedTouches[0].clientX;
        const diff = touchStartRef.current - touchEnd;
        if (diff > 50) onClose();
        touchStartRef.current = null;
    };

    // Navigate and close
    const handleNavigate = (path: string) => {
        navigate(path);
        onClose();
    };

    // Settings update
    const updateSetting = async (localKey: string, dbKey: string, value: boolean) => {
        localStorage.setItem(localKey, String(value));
        if (user?.id) {
            try {
                await supabase
                    .from('profiles')
                    .update({ [dbKey]: value })
                    .eq('id', user.id);
            } catch (error) {
                console.error('Error updating setting:', error);
            }
        }
    };

    const handleSoundsToggle = () => {
        const newValue = !soundsEnabled;
        setSoundsEnabled(newValue);
        updateSetting('soundsEnabled', 'sounds_enabled', newValue);
    };

    const handleVibrationsToggle = () => {
        const newValue = !vibrationsEnabled;
        setVibrationsEnabled(newValue);
        updateSetting('vibrationsEnabled', 'vibrations_enabled', newValue);
    };

    const handleResetTutorial = async () => {
        localStorage.removeItem('club_arena_intro_shown');
        localStorage.removeItem('tutorial_completed');
        if (user?.id) {
            try {
                await supabase
                    .from('profiles')
                    .update({ tutorial_completed: false })
                    .eq('id', user.id);
            } catch (error) {
                console.error('Error resetting tutorial:', error);
            }
        }
        toast.info('Tutorial reset! Refresh the page to see the intro again.');
        onClose();
    };

    const handleLogOut = async () => {
        try {
            await supabase.auth.signOut();
            navigate('/auth');
            onClose();
        } catch (error) {
            console.error('Error logging out:', error);
        }
    };

    // Shared styles
    const sectionHeaderStyle: React.CSSProperties = {
        fontSize: 12,
        fontWeight: 600,
        color: colors.textSecondary,
        margin: 0,
        padding: '16px 16px 8px',
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
    };

    const menuItemStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        cursor: 'pointer',
        borderRadius: 8,
        margin: '0 8px',
        transition: 'background-color 0.15s ease'
    };

    const dividerStyle: React.CSSProperties = {
        height: 1,
        background: colors.divider,
        margin: '8px 16px'
    };

    return (
        <>
            {/* Backdrop */}
            {isOpen && (
                <div
                    onClick={onClose}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0, 0, 0, 0.7)',
                        zIndex: 999
                    }}
                />
            )}

            {/* Drawer */}
            <div
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    bottom: 0,
                    width: '100%',
                    maxWidth: 320,
                    background: colors.bg,
                    boxShadow: '4px 0 20px rgba(0, 0, 0, 0.5)',
                    zIndex: 1000,
                    transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
                    transition: 'transform 0.3s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    overflowY: 'auto',
                    paddingBottom: 80
                }}
            >
                {/* Close button */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 12px 8px' }}>
                    <button
                        onClick={onClose}
                        style={{
                            background: colors.bgHover,
                            border: 'none',
                            padding: '8px 16px',
                            borderRadius: 8,
                            cursor: 'pointer',
                            fontSize: 14,
                            fontWeight: 600,
                            color: colors.text,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        Close
                    </button>
                </div>


                {/* User Profile Card */}
                <div
                    onClick={() => handleNavigate('/profile')}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 16px',
                        margin: '0 12px 12px',
                        background: colors.bgSecondary,
                        borderRadius: 12,
                        cursor: 'pointer'
                    }}
                >
                    <img
                        src={avatarUrl || '/default-avatar.png'}
                        alt=""
                        style={{
                            width: 48,
                            height: 48,
                            borderRadius: '50%',
                            objectFit: 'cover',
                            border: `2px solid ${colors.divider}`
                        }}
                    />
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 16, color: colors.text }}>
                            {userName || 'Player'}
                        </div>
                        <div style={{ fontSize: 13, color: colors.textSecondary }}>
                            View Profile
                        </div>
                    </div>
                    <span style={{ color: colors.textSecondary, fontSize: 18 }}>›</span>
                </div>

                <div style={dividerStyle} />

                {/* ═══════════════════════════════════════════════════════════════
                    GAME MODES
                ═══════════════════════════════════════════════════════════════ */}
                <div style={sectionHeaderStyle}>Game Modes</div>
                {[
                    { label: 'Lobby', path: '/lobby' },
                    { label: 'Tournaments', path: '/tournaments' },
                    { label: 'Tournament Lobby', path: '/tournament-lobby' },
                    { label: 'Hand History', path: '/hand-history' },
                    { label: 'Session History', path: '/history' },
                    { label: 'Hands', path: '/hands' },
                    { label: 'Leaderboard', path: '/leaderboard' },
                ].map((item, i) => (
                    <div
                        key={`games-${i}`}
                        onClick={() => handleNavigate(item.path)}
                        style={menuItemStyle}
                        onMouseEnter={(e) => e.currentTarget.style.background = colors.bgHover}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                        <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: colors.text }}>{item.label}</span>
                        <span style={{ color: colors.textSecondary }}>›</span>
                    </div>
                ))}

                <div style={dividerStyle} />

                {/* ═══════════════════════════════════════════════════════════════
                    CLUBS
                ═══════════════════════════════════════════════════════════════ */}
                <div style={sectionHeaderStyle}>Clubs</div>
                {[
                    { label: 'My Clubs', path: '/clubs' },
                    { label: 'Create Club', path: '/clubs/create' },
                    { label: 'Messages', path: '/messages' },
                    { label: 'Club Messages', path: '/messages/clubs' },
                    { label: 'Players', path: '/players' },
                    { label: 'Cashier', path: '/cashier' },
                    { label: 'Search', path: '/search' },
                ].map((item, i) => (
                    <div
                        key={`clubs-${i}`}
                        onClick={() => handleNavigate(item.path)}
                        style={menuItemStyle}
                        onMouseEnter={(e) => e.currentTarget.style.background = colors.bgHover}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                        <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: colors.text }}>{item.label}</span>
                        <span style={{ color: colors.textSecondary }}>›</span>
                    </div>
                ))}

                <div style={dividerStyle} />

                {/* ═══════════════════════════════════════════════════════════════
                    UNIONS
                ═══════════════════════════════════════════════════════════════ */}
                <div style={sectionHeaderStyle}>Unions</div>
                {[
                    { label: 'Browse Unions', path: '/unions' },
                    { label: 'Create Union', path: '/unions/create' },
                ].map((item, i) => (
                    <div
                        key={`unions-${i}`}
                        onClick={() => handleNavigate(item.path)}
                        style={menuItemStyle}
                        onMouseEnter={(e) => e.currentTarget.style.background = colors.bgHover}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                        <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: colors.text }}>{item.label}</span>
                        <span style={{ color: colors.textSecondary }}>›</span>
                    </div>
                ))}

                <div style={dividerStyle} />

                {/* ═══════════════════════════════════════════════════════════════
                    PLAYER
                ═══════════════════════════════════════════════════════════════ */}
                <div style={sectionHeaderStyle}>Player</div>
                {[
                    { label: 'My Profile', path: '/profile' },
                    { label: 'My Wallet', path: '/wallet' },
                    { label: 'Achievements', path: '/achievements' },
                    { label: 'Player Stats', path: '/stats' },
                    { label: 'VIP Status', path: '/vip' },
                    { label: 'Rakeback', path: '/rakeback' },
                    { label: 'Promotions', path: '/promotions' },
                    { label: 'Bonuses', path: '/bonuses' },
                    { label: 'Transactions', path: '/transactions' },
                    { label: 'Friends', path: '/friends' },
                    { label: 'Waitlist', path: '/waitlist' },
                    { label: 'Invite Players', path: '/invite' },
                ].map((item, i) => (
                    <div
                        key={`player-${i}`}
                        onClick={() => handleNavigate(item.path)}
                        style={menuItemStyle}
                        onMouseEnter={(e) => e.currentTarget.style.background = colors.bgHover}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                        <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: colors.text }}>{item.label}</span>
                        <span style={{ color: colors.textSecondary }}>›</span>
                    </div>
                ))}

                <div style={dividerStyle} />

                {/* ═══════════════════════════════════════════════════════════════
                    AGENT & ADMIN
                ═══════════════════════════════════════════════════════════════ */}
                <div style={sectionHeaderStyle}>Agent & Admin</div>
                {[
                    { label: 'Agent Management', path: '/agent-management' },
                    { label: 'Club Dashboard', path: '/data' },
                    { label: 'Club Settings', path: '/admin' },
                ].map((item, i) => (
                    <div
                        key={`admin-${i}`}
                        onClick={() => handleNavigate(item.path)}
                        style={menuItemStyle}
                        onMouseEnter={(e) => e.currentTarget.style.background = colors.bgHover}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                        <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: colors.text }}>{item.label}</span>
                        <span style={{ color: colors.textSecondary }}>›</span>
                    </div>
                ))}

                <div style={dividerStyle} />

                {/* ═══════════════════════════════════════════════════════════════
                    SETTINGS
                ═══════════════════════════════════════════════════════════════ */}
                <div style={sectionHeaderStyle}>Settings</div>

                {/* Sounds Toggle */}
                <div style={{ ...menuItemStyle, justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 15, fontWeight: 500, color: colors.text }}>Sounds</span>
                    <button
                        onClick={handleSoundsToggle}
                        style={{
                            width: 48,
                            height: 28,
                            borderRadius: 14,
                            border: 'none',
                            padding: 2,
                            cursor: 'pointer',
                            backgroundColor: soundsEnabled ? colors.success : colors.bgHover,
                            transition: 'background-color 0.2s ease',
                            display: 'flex',
                            alignItems: 'center'
                        }}
                    >
                        <span style={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            backgroundColor: 'white',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                            transform: soundsEnabled ? 'translateX(20px)' : 'translateX(0)',
                            transition: 'transform 0.2s ease'
                        }} />
                    </button>
                </div>

                {/* Vibrations Toggle */}
                <div style={{ ...menuItemStyle, justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 15, fontWeight: 500, color: colors.text }}>Vibrations</span>
                    <button
                        onClick={handleVibrationsToggle}
                        style={{
                            width: 48,
                            height: 28,
                            borderRadius: 14,
                            border: 'none',
                            padding: 2,
                            cursor: 'pointer',
                            backgroundColor: vibrationsEnabled ? colors.success : colors.bgHover,
                            transition: 'background-color 0.2s ease',
                            display: 'flex',
                            alignItems: 'center'
                        }}
                    >
                        <span style={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            backgroundColor: 'white',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                            transform: vibrationsEnabled ? 'translateX(20px)' : 'translateX(0)',
                            transition: 'transform 0.2s ease'
                        }} />
                    </button>
                </div>

                {[
                    { label: 'App Settings', path: '/settings' },
                    { label: 'Notifications', path: '/notifications' },
                ].map((item, i) => (
                    <div
                        key={`settings-${i}`}
                        onClick={() => handleNavigate(item.path)}
                        style={menuItemStyle}
                        onMouseEnter={(e) => e.currentTarget.style.background = colors.bgHover}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                        <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: colors.text }}>{item.label}</span>
                        <span style={{ color: colors.textSecondary }}>›</span>
                    </div>
                ))}

                <div style={dividerStyle} />

                {/* ═══════════════════════════════════════════════════════════════
                    SUPPORT & LEGAL
                ═══════════════════════════════════════════════════════════════ */}
                <div style={sectionHeaderStyle}>Support & Legal</div>
                {[
                    { label: 'Help & FAQ', path: '/help' },
                    { label: 'Terms of Service', path: '/legal/tos' },
                    { label: 'Privacy Policy', path: '/legal/privacy' },
                    { label: 'Fair Gaming', path: '/legal/fair-gaming' },
                    { label: 'Promotion Rules', path: '/legal/promotions' },
                ].map((item, i) => (
                    <div
                        key={`support-${i}`}
                        onClick={() => handleNavigate(item.path)}
                        style={menuItemStyle}
                        onMouseEnter={(e) => e.currentTarget.style.background = colors.bgHover}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                        <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: colors.text }}>{item.label}</span>
                        <span style={{ color: colors.textSecondary }}>›</span>
                    </div>
                ))}

                {/* Reset Tutorial */}
                <div
                    onClick={handleResetTutorial}
                    style={menuItemStyle}
                    onMouseEnter={(e) => e.currentTarget.style.background = colors.bgHover}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                    <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: colors.text }}>Reset Tutorial</span>
                    <span style={{ color: colors.textSecondary }}>›</span>
                </div>

                <div style={dividerStyle} />

                {/* Log Out */}
                <div
                    onClick={handleLogOut}
                    style={{ ...menuItemStyle, marginBottom: 16 }}
                    onMouseEnter={(e) => e.currentTarget.style.background = colors.bgHover}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                    <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: colors.danger }}>Log Out</span>
                </div>

                {/* Version Footer */}
                <div style={{
                    padding: '16px',
                    textAlign: 'center',
                    color: colors.textSecondary,
                    fontSize: 12
                }}>
                    Club Arena v1.12
                </div>
            </div>
        </>
    );
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * HAMBURGER MENU — World Hub Style (Ported from Global Header)
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Features:
 * - Slide-out drawer (left side)
 * - Swipe-to-close gesture
 * - ESC key to close
 * - User profile card with avatar
 * - Dark theme (matching Club Arena)
 * - All original menu items preserved
 */

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../stores/useUserStore';
import styles from './HamburgerMenu.module.css';

interface HamburgerMenuProps {
    isOpen: boolean;
    onClose: () => void;
}

// Color palette (matching Club Arena dark theme)
const colors = {
    bg: 'linear-gradient(180deg, #0a0a1a 0%, #1a1a3a 100%)',
    bgSolid: '#0f0f24',
    text: '#FFFFFF',
    textSec: '#94a3b8',
    border: 'rgba(59, 130, 246, 0.2)',
    blue: '#3b82f6',
    blueHover: '#2563eb',
    cardBg: 'rgba(30, 58, 95, 0.5)',
    hoverBg: 'rgba(59, 130, 246, 0.1)',
    toggleOn: '#10b981',
    toggleOff: '#64748b'
};

export default function HamburgerMenu({ isOpen, onClose }: HamburgerMenuProps) {
    const navigate = useNavigate();
    const { user } = useUserStore();
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
        // Swipe left to close (menu is on left side)
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
        alert('Tutorial reset! Refresh the page to see the intro again.');
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

    return (
        <>
            {/* Backdrop */}
            {isOpen && (
                <div
                    onClick={onClose}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0, 0, 0, 0.6)',
                        zIndex: 999,
                        animation: 'fadeIn 0.2s ease'
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
                    background: colors.bgSolid,
                    backgroundImage: colors.bg,
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
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 12, paddingTop: 20 }}>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255, 255, 255, 0.1)',
                            border: 'none',
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            cursor: 'pointer',
                            fontSize: 16,
                            color: colors.text,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        ✕
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
                        margin: '0 12px 16px',
                        background: colors.cardBg,
                        borderRadius: 12,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                        cursor: 'pointer',
                        border: `1px solid ${colors.border}`
                    }}
                >
                    <img
                        src={avatarUrl || '/default-avatar.png'}
                        alt=""
                        style={{
                            width: 48,
                            height: 48,
                            borderRadius: '50%',
                            objectFit: 'cover'
                        }}
                    />
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 17, color: colors.text }}>
                            {userName || 'Player'}
                        </div>
                        <div style={{ fontSize: 13, color: colors.textSec }}>
                            View your profile
                        </div>
                    </div>
                </div>

                {/* Menu Items */}
                <div style={{ flex: 1, padding: '0 8px' }}>

                    {/* UNIONS Section */}
                    <div style={{ padding: '16px 8px 8px' }}>
                        <h4 style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: colors.textSec,
                            margin: 0,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                        }}>
                            Unions
                        </h4>
                    </div>
                    {[
                        { icon: '🌐', label: 'Browse Unions', path: '/unions' },
                        { icon: '➕', label: 'Create Union', path: '/unions/create' },
                    ].map((item, index) => (
                        <div
                            key={`unions-${index}`}
                            onClick={() => handleNavigate(item.path)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '12px 16px',
                                cursor: 'pointer',
                                borderRadius: 8
                            }}
                        >
                            <span style={{ fontSize: 20 }}>{item.icon}</span>
                            <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: colors.text }}>{item.label}</span>
                            <span style={{ color: colors.textSec }}>›</span>
                        </div>
                    ))}

                    {/* Divider */}
                    <div style={{ height: 1, background: colors.border, margin: '12px 16px' }} />

                    {/* MY CLUBS Section */}
                    <div style={{ padding: '16px 8px 8px' }}>
                        <h4 style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: colors.textSec,
                            margin: 0,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                        }}>
                            My Clubs
                        </h4>
                    </div>
                    {[
                        { icon: '♠️', label: 'My Clubs', path: '/clubs' },
                        { icon: '🔍', label: 'Find Clubs', path: '/clubs' },
                        { icon: '➕', label: 'Create Club', path: '/clubs/create' },
                    ].map((item, index) => (
                        <div
                            key={`clubs-${index}`}
                            onClick={() => handleNavigate(item.path)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '12px 16px',
                                cursor: 'pointer',
                                borderRadius: 8
                            }}
                        >
                            <span style={{ fontSize: 20 }}>{item.icon}</span>
                            <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: colors.text }}>{item.label}</span>
                            <span style={{ color: colors.textSec }}>›</span>
                        </div>
                    ))}

                    {/* Divider */}
                    <div style={{ height: 1, background: colors.border, margin: '12px 16px' }} />

                    {/* GAME MODES Section */}
                    <div style={{ padding: '16px 8px 8px' }}>
                        <h4 style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: colors.textSec,
                            margin: 0,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                        }}>
                            Game Modes
                        </h4>
                    </div>
                    {[
                        { icon: '🎰', label: 'Cash Games', path: '/lobby' },
                        { icon: '🏆', label: 'Tournaments', path: '/tournaments' },
                        { icon: '⚡', label: 'Sit & Go', path: '/lobby?type=sng' },
                        { icon: '🎯', label: 'Spin-It', path: '/lobby?type=spin' },
                    ].map((item, index) => (
                        <div
                            key={`games-${index}`}
                            onClick={() => handleNavigate(item.path)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '12px 16px',
                                cursor: 'pointer',
                                borderRadius: 8
                            }}
                        >
                            <span style={{ fontSize: 20 }}>{item.icon}</span>
                            <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: colors.text }}>{item.label}</span>
                            <span style={{ color: colors.textSec }}>›</span>
                        </div>
                    ))}

                    {/* Divider */}
                    <div style={{ height: 1, background: colors.border, margin: '12px 16px' }} />

                    {/* CLUB FEATURES Section */}
                    <div style={{ padding: '16px 8px 8px' }}>
                        <h4 style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: colors.textSec,
                            margin: 0,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                        }}>
                            Club Features
                        </h4>
                    </div>
                    {[
                        { icon: '💬', label: 'Messages', path: '/messages' },
                        { icon: '👥', label: 'Players', path: '/players' },
                        { icon: '💵', label: 'Cashier', path: '/cashier' },
                        { icon: '📊', label: 'Leaderboard', path: '/leaderboard' },
                        { icon: '📜', label: 'Hand Histories', path: '/hand-history' },
                        { icon: '📈', label: 'Player Stats', path: '/stats' },
                    ].map((item, index) => (
                        <div
                            key={`features-${index}`}
                            onClick={() => handleNavigate(item.path)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '12px 16px',
                                cursor: 'pointer',
                                borderRadius: 8
                            }}
                        >
                            <span style={{ fontSize: 20 }}>{item.icon}</span>
                            <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: colors.text }}>{item.label}</span>
                            <span style={{ color: colors.textSec }}>›</span>
                        </div>
                    ))}

                    {/* Divider */}
                    <div style={{ height: 1, background: colors.border, margin: '12px 16px' }} />

                    {/* PLAYER Section */}
                    <div style={{ padding: '16px 8px 8px' }}>
                        <h4 style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: colors.textSec,
                            margin: 0,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                        }}>
                            Player
                        </h4>
                    </div>
                    {[
                        { icon: '💼', label: 'My Wallet', path: '/wallet' },
                        { icon: '🏅', label: 'Achievements', path: '/achievements' },
                        { icon: '👑', label: 'VIP Status', path: '/vip' },
                        { icon: '💎', label: 'Rakeback', path: '/rakeback' },
                        { icon: '🎁', label: 'Promotions', path: '/promotions' },
                        { icon: '🎰', label: 'Bonuses', path: '/bonuses' },
                        { icon: '📋', label: 'Transactions', path: '/transactions' },
                        { icon: '👫', label: 'Friends', path: '/friends' },
                    ].map((item, index) => (
                        <div
                            key={`player-${index}`}
                            onClick={() => handleNavigate(item.path)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '12px 16px',
                                cursor: 'pointer',
                                borderRadius: 8
                            }}
                        >
                            <span style={{ fontSize: 20 }}>{item.icon}</span>
                            <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: colors.text }}>{item.label}</span>
                            <span style={{ color: colors.textSec }}>›</span>
                        </div>
                    ))}

                    {/* Divider */}
                    <div style={{ height: 1, background: colors.border, margin: '12px 16px' }} />

                    {/* AGENT & ADMIN Section */}
                    <div style={{ padding: '16px 8px 8px' }}>
                        <h4 style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: colors.textSec,
                            margin: 0,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                        }}>
                            Agent & Admin
                        </h4>
                    </div>
                    {[
                        { icon: '👔', label: 'Agent Management', path: '/agent-management' },
                        { icon: '💰', label: 'Club Financials', path: '/data' },
                        { icon: '⚙️', label: 'Club Settings', path: '/admin' },
                        { icon: '📊', label: 'Club Dashboard', path: '/data' },
                        { icon: '🎫', label: 'Waitlist', path: '/waitlist' },
                        { icon: '📢', label: 'Invite Players', path: '/invite' },
                    ].map((item, index) => (
                        <div
                            key={`admin-${index}`}
                            onClick={() => handleNavigate(item.path)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '12px 16px',
                                cursor: 'pointer',
                                borderRadius: 8
                            }}
                        >
                            <span style={{ fontSize: 20 }}>{item.icon}</span>
                            <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: colors.text }}>{item.label}</span>
                            <span style={{ color: colors.textSec }}>›</span>
                        </div>
                    ))}

                    {/* Divider */}
                    <div style={{ height: 1, background: colors.border, margin: '12px 16px' }} />

                    {/* Settings Section */}
                    <div style={{ padding: '16px 8px 8px' }}>
                        <h4 style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: colors.textSec,
                            margin: 0,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                        }}>
                            Settings
                        </h4>
                    </div>

                    {/* Sounds Toggle */}
                    <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{ fontSize: 20 }}>🔊</span>
                            <span style={{ fontSize: 15, fontWeight: 500, color: colors.text }}>Sounds</span>
                        </div>
                        <button
                            onClick={handleSoundsToggle}
                            style={{
                                width: 52,
                                height: 28,
                                borderRadius: 14,
                                border: 'none',
                                padding: 2,
                                cursor: 'pointer',
                                backgroundColor: soundsEnabled ? colors.toggleOn : colors.toggleOff,
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
                                transform: soundsEnabled ? 'translateX(24px)' : 'translateX(0)',
                                transition: 'transform 0.2s ease'
                            }} />
                        </button>
                    </div>

                    {/* Vibrations Toggle */}
                    <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{ fontSize: 20 }}>📳</span>
                            <span style={{ fontSize: 15, fontWeight: 500, color: colors.text }}>Vibrations</span>
                        </div>
                        <button
                            onClick={handleVibrationsToggle}
                            style={{
                                width: 52,
                                height: 28,
                                borderRadius: 14,
                                border: 'none',
                                padding: 2,
                                cursor: 'pointer',
                                backgroundColor: vibrationsEnabled ? colors.toggleOn : colors.toggleOff,
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
                                transform: vibrationsEnabled ? 'translateX(24px)' : 'translateX(0)',
                                transition: 'transform 0.2s ease'
                            }} />
                        </button>
                    </div>

                    {/* Divider */}
                    <div style={{ height: 1, background: colors.border, margin: '12px 16px' }} />

                    {/* Navigation Items */}
                    {[
                        { icon: '🔒', label: 'Change Password', path: '/settings?tab=security' },
                        { icon: '📧', label: 'Bind Email', path: '/settings?tab=account' },
                        { icon: '🎨', label: 'Theme Setting', path: '/settings?tab=appearance' },
                        { icon: '🌐', label: 'Language', path: '/settings?tab=language' },
                    ].map((item, index) => (
                        <div
                            key={index}
                            onClick={() => handleNavigate(item.path)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '12px 16px',
                                cursor: 'pointer',
                                borderRadius: 8
                            }}
                        >
                            <span style={{ fontSize: 20 }}>{item.icon}</span>
                            <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: colors.text }}>{item.label}</span>
                            <span style={{ color: colors.textSec }}>›</span>
                        </div>
                    ))}

                    {/* Divider */}
                    <div style={{ height: 1, background: colors.border, margin: '12px 16px' }} />

                    {/* Support Section */}
                    <div style={{ padding: '16px 8px 8px' }}>
                        <h4 style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: colors.textSec,
                            margin: 0,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                        }}>
                            Support
                        </h4>
                    </div>

                    {[
                        { icon: '❓', label: 'Reset Tutorial', action: handleResetTutorial },
                        { icon: '📧', label: 'FAQ / Support', path: '/help' },
                        { icon: '📋', label: 'Terms of Service', path: '/legal/tos' },
                        { icon: '📋', label: 'Club Promotion Rules', path: '/legal/promotions' },
                        { icon: '⚖️', label: 'Fair Gaming', path: '/legal/fair-gaming' },
                        { icon: '🛡️', label: 'Privacy Policy', path: '/legal/privacy' },
                        { icon: '🔔', label: 'Notifications', path: '/notifications' },
                        { icon: '📢', label: 'First to know', external: 'https://smarter.poker/updates' },
                    ].map((item, index) => (
                        <div
                            key={index}
                            onClick={() => {
                                if (item.action) item.action();
                                else if (item.external) window.open(item.external, '_blank');
                                else if (item.path) handleNavigate(item.path);
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '12px 16px',
                                cursor: 'pointer',
                                borderRadius: 8
                            }}
                        >
                            <span style={{ fontSize: 20 }}>{item.icon}</span>
                            <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: colors.text }}>{item.label}</span>
                            <span style={{ color: colors.textSec }}>›</span>
                        </div>
                    ))}

                    {/* Divider */}
                    <div style={{ height: 1, background: colors.border, margin: '12px 16px' }} />

                    {/* Log Out */}
                    <div
                        onClick={handleLogOut}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '12px 16px',
                            cursor: 'pointer',
                            borderRadius: 8
                        }}
                    >
                        <span style={{ fontSize: 20 }}>↩️</span>
                        <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: '#ef4444' }}>Log Out</span>
                    </div>
                </div>

                {/* Version Footer */}
                <div style={{
                    padding: '16px',
                    textAlign: 'center',
                    color: colors.textSec,
                    fontSize: 12
                }}>
                    Version: 1.11039 build (123)
                </div>
            </div>

            {/* CSS Animation */}
            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `}</style>
        </>
    );
}

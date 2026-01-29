/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * HAMBURGER MENU — Slide-in Navigation Menu
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../stores/useUserStore';
import styles from './HamburgerMenu.module.css';

interface HamburgerMenuProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function HamburgerMenu({ isOpen, onClose }: HamburgerMenuProps) {
    const navigate = useNavigate();
    const { user } = useUserStore();
    const [soundsEnabled, setSoundsEnabled] = useState(true);
    const [vibrationsEnabled, setVibrationsEnabled] = useState(true);

    // Load settings from localStorage on mount, then sync from Supabase
    useEffect(() => {
        const sounds = localStorage.getItem('soundsEnabled');
        const vibrations = localStorage.getItem('vibrationsEnabled');
        if (sounds !== null) setSoundsEnabled(sounds === 'true');
        if (vibrations !== null) setVibrationsEnabled(vibrations === 'true');

        // Sync from Supabase if user is logged in
        if (user?.id) {
            supabase
                .from('profiles')
                .select('sounds_enabled, vibrations_enabled')
                .eq('id', user.id)
                .single()
                .then(({ data }) => {
                    if (data) {
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

    // Save settings to localStorage and Supabase (using snake_case for DB)
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

    const handleNavigate = (path: string) => {
        navigate(path);
        onClose();
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

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div className={styles.backdrop} onClick={onClose} />

            {/* Menu Panel */}
            <div className={styles.menu}>
                {/* Menu Items */}
                <div className={styles.menuItems}>
                    {/* Sounds Toggle */}
                    <div className={styles.menuItem}>
                        <div className={styles.itemLeft}>
                            <span className={styles.icon}>🔊</span>
                            <span className={styles.label}>Sounds</span>
                            <span className={styles.newBadge}>NEW</span>
                        </div>
                        <button
                            className={`${styles.toggle} ${soundsEnabled ? styles.toggleOn : styles.toggleOff}`}
                            onClick={handleSoundsToggle}
                        >
                            <span className={styles.toggleSlider} />
                        </button>
                    </div>

                    {/* Vibrations Toggle */}
                    <div className={styles.menuItem}>
                        <div className={styles.itemLeft}>
                            <span className={styles.icon}>📳</span>
                            <span className={styles.label}>Vibrations</span>
                        </div>
                        <button
                            className={`${styles.toggle} ${vibrationsEnabled ? styles.toggleOn : styles.toggleOff}`}
                            onClick={handleVibrationsToggle}
                        >
                            <span className={styles.toggleSlider} />
                            <span className={styles.toggleLabel}>
                                {vibrationsEnabled ? 'ON' : 'OFF'}
                            </span>
                        </button>
                    </div>

                    {/* Change Password */}
                    <button
                        className={styles.menuItem}
                        onClick={() => handleNavigate('/settings?tab=security')}
                    >
                        <div className={styles.itemLeft}>
                            <span className={styles.icon}>🔒</span>
                            <span className={styles.label}>Change Password</span>
                        </div>
                        <span className={styles.arrow}>›</span>
                    </button>

                    {/* Bind Email */}
                    <button
                        className={styles.menuItem}
                        onClick={() => handleNavigate('/settings?tab=account')}
                    >
                        <div className={styles.itemLeft}>
                            <span className={styles.icon}>📧</span>
                            <span className={styles.label}>Bind Email</span>
                        </div>
                        <span className={styles.arrow}>›</span>
                    </button>

                    {/* Theme Setting */}
                    <button
                        className={styles.menuItem}
                        onClick={() => handleNavigate('/settings?tab=appearance')}
                    >
                        <div className={styles.itemLeft}>
                            <span className={styles.icon}>🎨</span>
                            <span className={styles.label}>Theme Setting</span>
                        </div>
                        <span className={styles.arrow}>›</span>
                    </button>

                    {/* Language */}
                    <button
                        className={styles.menuItem}
                        onClick={() => handleNavigate('/settings?tab=language')}
                    >
                        <div className={styles.itemLeft}>
                            <span className={styles.icon}>🌐</span>
                            <span className={styles.label}>Language</span>
                        </div>
                        <span className={styles.arrow}>›</span>
                    </button>

                    {/* Reset Tutorial */}
                    <button
                        className={styles.menuItem}
                        onClick={handleResetTutorial}
                    >
                        <div className={styles.itemLeft}>
                            <span className={styles.icon}>❓</span>
                            <span className={styles.label}>Reset Tutorial</span>
                        </div>
                        <span className={styles.arrow}>›</span>
                    </button>

                    {/* FAQ / Support */}
                    <button
                        className={styles.menuItem}
                        onClick={() => handleNavigate('/help')}
                    >
                        <div className={styles.itemLeft}>
                            <span className={styles.icon}>📧</span>
                            <span className={styles.label}>FAQ / Support</span>
                            <span className={styles.newBadge}>NEW</span>
                        </div>
                        <span className={styles.arrow}>›</span>
                    </button>

                    {/* Terms of Service */}
                    <button
                        className={styles.menuItem}
                        onClick={() => handleNavigate('/legal/tos')}
                    >
                        <div className={styles.itemLeft}>
                            <span className={styles.icon}>📋</span>
                            <span className={styles.label}>Terms of Service</span>
                        </div>
                        <span className={styles.arrow}>›</span>
                    </button>

                    {/* Club Promotion Rules */}
                    <button
                        className={styles.menuItem}
                        onClick={() => handleNavigate('/legal/promotions')}
                    >
                        <div className={styles.itemLeft}>
                            <span className={styles.icon}>📋</span>
                            <span className={styles.label}>Club Promotion Rules</span>
                        </div>
                        <span className={styles.arrow}>›</span>
                    </button>

                    {/* Fair Gaming */}
                    <button
                        className={styles.menuItem}
                        onClick={() => handleNavigate('/legal/fair-gaming')}
                    >
                        <div className={styles.itemLeft}>
                            <span className={styles.icon}>⚖️</span>
                            <span className={styles.label}>Fair Gaming</span>
                        </div>
                        <span className={styles.arrow}>›</span>
                    </button>

                    {/* Privacy Policy */}
                    <button
                        className={styles.menuItem}
                        onClick={() => handleNavigate('/legal/privacy')}
                    >
                        <div className={styles.itemLeft}>
                            <span className={styles.icon}>🛡️</span>
                            <span className={styles.label}>Privacy Policy</span>
                        </div>
                        <span className={styles.arrow}>›</span>
                    </button>

                    {/* Notifications */}
                    <button
                        className={styles.menuItem}
                        onClick={() => handleNavigate('/notifications')}
                    >
                        <div className={styles.itemLeft}>
                            <span className={styles.icon}>🔔</span>
                            <span className={styles.label}>Notifications</span>
                        </div>
                        <span className={styles.arrow}>›</span>
                    </button>

                    {/* First to know */}
                    <button
                        className={styles.menuItem}
                        onClick={() => window.open('https://smarter.poker/updates', '_blank')}
                    >
                        <div className={styles.itemLeft}>
                            <span className={styles.icon}>📢</span>
                            <span className={styles.label}>First to know</span>
                        </div>
                        <span className={styles.arrow}>›</span>
                    </button>

                    {/* Log Out */}
                    <button
                        className={styles.menuItem}
                        onClick={handleLogOut}
                    >
                        <div className={styles.itemLeft}>
                            <span className={styles.icon}>↩️</span>
                            <span className={styles.label}>Log Out</span>
                        </div>
                        <span className={styles.arrow}>›</span>
                    </button>
                </div>

                {/* Version */}
                <div className={styles.version}>
                    Version: 1.11039 build (123)
                </div>
            </div>
        </>
    );
}

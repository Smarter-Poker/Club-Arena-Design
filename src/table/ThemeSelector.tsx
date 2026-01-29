/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  THEME SELECTOR — VIP-Gated Table Themes
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import { vipService, VIP_GOLD_LIMITS, FEATURE_PRICING } from '../../services/VIPService';
import { useUserStore } from '../../stores/useUserStore';
import { useToast } from '../common/Toast';
import './ThemeSelector.css';

interface ThemeSelectorProps {
    isOpen: boolean;
    onClose: () => void;
    currentTheme: string;
    onThemeChange: (theme: string) => void;
}

interface TableTheme {
    id: string;
    name: string;
    preview: string;
    feltColor: string;
    railColor: string;
    isVIP: boolean;
    isPremium: boolean;
}

const THEMES: TableTheme[] = [
    { id: 'classic', name: 'Classic Green', preview: '', feltColor: '#1a5f2a', railColor: '#8b4513', isVIP: false, isPremium: false },
    { id: 'midnight', name: 'Midnight Blue', preview: '🔵', feltColor: '#1a365d', railColor: '#2d3748', isVIP: false, isPremium: false },
    { id: 'crimson', name: 'Crimson Red', preview: '', feltColor: '#7c1d1d', railColor: '#1a1a1a', isVIP: true, isPremium: false },
    { id: 'royal', name: 'Royal Purple', preview: '🟣', feltColor: '#4c1d95', railColor: '#ffd700', isVIP: true, isPremium: false },
    { id: 'gold', name: 'Gold Elite', preview: '🟡', feltColor: '#1a1a1a', railColor: '#ffd700', isVIP: true, isPremium: true },
    { id: 'nebula', name: 'Cosmic Nebula', preview: '🌌', feltColor: '#0f0f23', railColor: '#9333ea', isVIP: true, isPremium: true },
];

export function ThemeSelector({ isOpen, onClose, currentTheme, onThemeChange }: ThemeSelectorProps) {
    const { user } = useUserStore();
    const toast = useToast();

    const [isVIP, setIsVIP] = useState(false);
    const [unlockedThemes, setUnlockedThemes] = useState<string[]>(['classic', 'midnight']);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkAccess = async () => {
            if (!user?.id) {
                setLoading(false);
                return;
            }

            // Check VIP status
            const vipStatus = await vipService.checkVIPStatus(user.id);
            setIsVIP(vipStatus.isVIP);

            // If VIP, unlock VIP themes based on tier limits
            if (vipStatus.isVIP) {
                const vipThemes = THEMES.filter(t => t.isVIP && !t.isPremium).slice(0, VIP_GOLD_LIMITS.themes);
                setUnlockedThemes(['classic', 'midnight', ...vipThemes.map(t => t.id)]);
            }

            setLoading(false);
        };

        if (isOpen) {
            checkAccess();
        }
    }, [isOpen, user?.id]);

    const handleSelectTheme = async (theme: TableTheme) => {
        if (!user?.id) return;

        // Check if theme is unlocked
        if (unlockedThemes.includes(theme.id)) {
            onThemeChange(theme.id);
            toast.success(`Theme changed to ${theme.name}`);
            onClose();
            return;
        }

        // Need to purchase
        const cost = FEATURE_PRICING.theme_unlock.cost;
        const result = await vipService.purchaseFeature(user.id, 'theme_unlock');

        if (!result.success) {
            toast.error(result.error || 'Insufficient diamonds');
            return;
        }

        toast.info(` ${result.charged} diamonds charged - ${theme.name} unlocked!`);
        setUnlockedThemes(prev => [...prev, theme.id]);
        onThemeChange(theme.id);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="theme-selector-overlay" onClick={onClose}>
            <div className="theme-selector" onClick={e => e.stopPropagation()}>
                <div className="theme-selector__header">
                    <h3> Table Themes</h3>
                    <button className="theme-selector__close" onClick={onClose}>×</button>
                </div>

                <div className="theme-selector__grid">
                    {loading ? (
                        <div className="theme-selector__loading">Loading...</div>
                    ) : (
                        THEMES.map(theme => {
                            const isUnlocked = unlockedThemes.includes(theme.id);
                            const isCurrent = currentTheme === theme.id;

                            return (
                                <div
                                    key={theme.id}
                                    className={`theme-card ${isCurrent ? 'current' : ''} ${isUnlocked ? 'unlocked' : 'locked'}`}
                                    onClick={() => handleSelectTheme(theme)}
                                    style={{
                                        '--felt-color': theme.feltColor,
                                        '--rail-color': theme.railColor
                                    } as React.CSSProperties}
                                >
                                    <div className="theme-card__preview">
                                        <span>{theme.preview}</span>
                                    </div>
                                    <span className="theme-card__name">{theme.name}</span>
                                    {!isUnlocked && (
                                        <span className="theme-card__price">
                                            {theme.isVIP && isVIP ? '' : `${FEATURE_PRICING.theme_unlock.cost}`}
                                        </span>
                                    )}
                                    {isCurrent && <span className="theme-card__badge">Active</span>}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}

export default ThemeSelector;

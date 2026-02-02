/**
 * 🍔 UNIVERSAL HAMBURGER MENU
 * Ported from World Hub Global Header
 * 
 * Features:
 * - Slide-out menu (left or right)
 * - Navigation links, toggle switches, action buttons
 * - Light and dark themes
 * - Swipe-to-close gesture
 * - ESC key to close
 */

import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface User {
    id?: string;
    name?: string;
    avatar?: string;
}

interface MenuItem {
    type: 'navigation' | 'toggle' | 'action' | 'divider' | 'section' | 'grid';
    label?: string;
    icon?: React.ReactNode;
    href?: string;
    badge?: number;
    checked?: boolean;
    primary?: boolean;
    closeOnClick?: boolean;
    columns?: number;
    items?: GridItem[];
    onClick?: () => void;
    onChange?: (checked: boolean) => void;
}

interface GridItem {
    label: string;
    icon?: React.ReactNode;
    href: string;
    onClick?: () => void;
}

interface BottomLink {
    label: string;
    href: string;
    icon?: React.ReactNode;
}

interface HamburgerMenuProps {
    isOpen: boolean;
    onClose: () => void;
    direction?: 'left' | 'right';
    theme?: 'light' | 'dark';
    user?: User | null;
    menuItems?: MenuItem[];
    showProfile?: boolean;
    profileExtras?: React.ReactNode;
    bottomLinks?: BottomLink[];
    width?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function HamburgerMenu({
    isOpen,
    onClose,
    direction = 'left',
    theme = 'light',
    user = null,
    menuItems = [],
    showProfile = true,
    profileExtras = null,
    bottomLinks = [],
    width = 320
}: HamburgerMenuProps) {
    const navigate = useNavigate();
    const touchStartRef = useRef<number | null>(null);

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

    // Swipe-to-close gesture
    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartRef.current = e.touches[0].clientX;
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (touchStartRef.current === null) return;
        const touchEnd = e.changedTouches[0].clientX;
        const diff = touchStartRef.current - touchEnd;
        if (direction === 'left' && diff > 50) onClose();
        if (direction === 'right' && diff < -50) onClose();
        touchStartRef.current = null;
    };

    const colors = theme === 'light' ? {
        bg: '#FFFFFF',
        text: '#050505',
        textSec: '#65676B',
        border: '#DADDE1',
        blue: '#1877F2',
        blueHover: '#166FE5',
        cardBg: '#F0F2F5',
        hoverBg: '#F2F3F5'
    } : {
        bg: 'linear-gradient(180deg, #0a0a1a 0%, #1a1a3a 100%)',
        text: '#FFFFFF',
        textSec: '#94a3b8',
        border: 'rgba(59, 130, 246, 0.2)',
        blue: '#3b82f6',
        blueHover: '#2563eb',
        cardBg: 'rgba(30, 58, 95, 0.5)',
        hoverBg: 'rgba(59, 130, 246, 0.1)'
    };

    const handleNavigate = (href: string) => {
        navigate(href);
        onClose();
    };

    const renderMenuItem = (item: MenuItem, index: number) => {
        switch (item.type) {
            case 'navigation':
                return (
                    <div
                        key={index}
                        onClick={() => {
                            item.onClick?.();
                            if (item.href) handleNavigate(item.href);
                        }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '12px 16px',
                            textDecoration: 'none',
                            color: colors.text,
                            borderRadius: 8,
                            cursor: 'pointer'
                        }}
                    >
                        {item.icon && <div style={{ width: 24, height: 24 }}>{item.icon}</div>}
                        <span style={{ flex: 1, fontSize: 15, fontWeight: 500 }}>{item.label}</span>
                        {item.badge && (
                            <span style={{
                                background: colors.blue,
                                color: 'white',
                                borderRadius: '50%',
                                width: 20,
                                height: 20,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 11,
                                fontWeight: 600
                            }}>
                                {item.badge}
                            </span>
                        )}
                        <span style={{ color: colors.textSec }}>›</span>
                    </div>
                );

            case 'toggle':
                return (
                    <div key={index} style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <label style={{ fontSize: 15, fontWeight: 500, color: colors.text }}>
                                {item.label}
                            </label>
                            <button
                                onClick={() => item.onChange?.(!item.checked)}
                                style={{
                                    width: 52,
                                    height: 28,
                                    borderRadius: 14,
                                    border: 'none',
                                    padding: 2,
                                    cursor: 'pointer',
                                    backgroundColor: item.checked ? '#10b981' : '#64748b',
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
                                    transform: item.checked ? 'translateX(24px)' : 'translateX(0)',
                                    transition: 'transform 0.2s ease'
                                }} />
                            </button>
                        </div>
                    </div>
                );

            case 'action':
                return (
                    <button
                        key={index}
                        onClick={() => {
                            item.onClick?.();
                            if (item.closeOnClick !== false) onClose();
                        }}
                        style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '12px 16px',
                            background: item.primary ? colors.blue : 'transparent',
                            border: item.primary ? 'none' : `1px solid ${colors.border}`,
                            borderRadius: 8,
                            color: item.primary ? 'white' : colors.text,
                            fontSize: 15,
                            fontWeight: 500,
                            cursor: 'pointer'
                        }}
                    >
                        {item.icon && <div style={{ width: 24, height: 24 }}>{item.icon}</div>}
                        <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
                    </button>
                );

            case 'divider':
                return (
                    <div
                        key={index}
                        style={{
                            height: 1,
                            background: colors.border,
                            margin: '12px 0'
                        }}
                    />
                );

            case 'section':
                return (
                    <div key={index} style={{ padding: '16px 16px 8px', marginTop: index > 0 ? 12 : 0 }}>
                        <h4 style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: colors.textSec,
                            margin: 0,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                        }}>
                            {item.label}
                        </h4>
                    </div>
                );

            case 'grid':
                return (
                    <div key={index} style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${item.columns || 2}, 1fr)`,
                        gap: 8,
                        padding: '0 16px',
                        marginBottom: 16
                    }}>
                        {item.items?.map((gridItem, gridIndex) => (
                            <div
                                key={gridIndex}
                                onClick={() => {
                                    gridItem.onClick?.();
                                    if (gridItem.href) handleNavigate(gridItem.href);
                                }}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'flex-start',
                                    padding: '14px 12px',
                                    background: theme === 'light' ? '#fff' : colors.cardBg,
                                    borderRadius: 8,
                                    textDecoration: 'none',
                                    border: `1px solid ${colors.border}`,
                                    cursor: 'pointer'
                                }}
                            >
                                {gridItem.icon && (
                                    <div style={{ width: 36, height: 36, marginBottom: 8 }}>
                                        {gridItem.icon}
                                    </div>
                                )}
                                <span style={{ fontSize: 15, fontWeight: 500, color: colors.text }}>
                                    {gridItem.label}
                                </span>
                            </div>
                        ))}
                    </div>
                );

            default:
                return null;
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
                        background: 'rgba(0, 0, 0, 0.5)',
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
                    [direction]: 0,
                    bottom: 0,
                    width: '100%',
                    maxWidth: width,
                    background: theme === 'light' ? colors.bg : colors.bg,
                    boxShadow: direction === 'left' ? '2px 0 10px rgba(0,0,0,0.2)' : '-4px 0 20px rgba(0, 0, 0, 0.5)',
                    zIndex: 1000,
                    transform: isOpen
                        ? 'translateX(0)'
                        : direction === 'left' ? 'translateX(-100%)' : 'translateX(100%)',
                    transition: 'transform 0.3s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    overflowY: 'auto',
                    paddingBottom: 80
                }}
            >
                {/* Close button */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 12 }}>
                    <button
                        onClick={onClose}
                        style={{
                            background: theme === 'light' ? '#f0f0f0' : 'rgba(255, 255, 255, 0.1)',
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
                {showProfile && user && (
                    <div
                        onClick={() => handleNavigate('/profile')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '12px 16px',
                            margin: '0 12px 16px',
                            background: theme === 'light' ? colors.bg : colors.cardBg,
                            borderRadius: 12,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                            cursor: 'pointer',
                            border: `1px solid ${colors.border}`
                        }}
                    >
                        <img
                            src={user.avatar || '/default-avatar.png'}
                            alt={user.name || ''}
                            style={{
                                width: 48,
                                height: 48,
                                borderRadius: '50%',
                                objectFit: 'cover'
                            }}
                        />
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 17, color: colors.text }}>
                                {user.name}
                            </div>
                            <div style={{ fontSize: 13, color: colors.textSec }}>
                                View your profile
                            </div>
                        </div>
                    </div>
                )}

                {/* Profile Extras */}
                {profileExtras}

                {/* Menu Items */}
                <div style={{ flex: 1 }}>
                    {menuItems.map((item, index) => renderMenuItem(item, index))}
                </div>

                {/* Bottom Links */}
                {bottomLinks.length > 0 && (
                    <div style={{ padding: '0 16px', borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
                        {bottomLinks.map((link, index) => (
                            <div
                                key={index}
                                onClick={() => handleNavigate(link.href)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    padding: '12px 0',
                                    color: colors.text,
                                    cursor: 'pointer',
                                    borderTop: index > 0 ? `1px solid ${colors.border}` : 'none'
                                }}
                            >
                                {link.icon && <div style={{ width: 24, height: 24 }}>{link.icon}</div>}
                                <span style={{ flex: 1, fontSize: 15 }}>{link.label}</span>
                                <span style={{ color: colors.textSec }}>›</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}

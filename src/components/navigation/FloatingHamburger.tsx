/**
 * FLOATING HAMBURGER BUTTON — Bottom-right navigation toggle
 * Replaces the yellow ball (QuickActionsBar) with a hamburger menu button
 * Appears on all pages except poker tables
 */

import { useState } from 'react';
import styles from './FloatingHamburger.module.css';
import HamburgerMenu from './HamburgerMenu';

export default function FloatingHamburger() {
    const [menuOpen, setMenuOpen] = useState(false);

    return (
        <>
            {/* Floating Hamburger Button */}
            <button
                className={styles.floatingButton}
                onClick={() => setMenuOpen(true)}
                aria-label="Open menu"
            >
                <svg
                    className={styles.icon}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <line x1="3" y1="12" x2="21" y2="12"></line>
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
            </button>

            {/* Hamburger Menu */}
            <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
        </>
    );
}

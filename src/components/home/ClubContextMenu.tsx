/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CLUB CONTEXT MENU — Extracted Reusable Component
 * ═══════════════════════════════════════════════════════════════════════════════
 * Long-press / right-click context menu for club cards.
 * Actions: Go to Lobby, Cashier, Share Code, Pin/Unpin, Leave Club (non-owners).
 *
 * BUG FIX #2: onLeave now delegates to parent for confirmation modal —
 * this component does NOT call ClubsService.leave() directly.
 * BUG FIX #3: Added onPin/isPinned props for pin-to-top functionality.
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../components/common/Toast';
import styles from '../../pages/HomePage.module.css';

interface ClubContextMenuProps {
    club: any;
    x: number;
    y: number;
    onClose: () => void;
    onLeave: () => void; // Delegates to parent — parent handles confirmation + actual leave
    onPin: (clubId: string) => void;
    isPinned: boolean;
}

export default function ClubContextMenu({ club, x, y, onClose, onLeave, onPin, isPinned }: ClubContextMenuProps) {
    const navigate = useNavigate();
    const toast = useToast();

    const handleGoToLobby = useCallback(() => {
        onClose();
        navigate(`/clubs/${club.id}`);
    }, [club.id, navigate, onClose]);

    const handleCashier = useCallback(() => {
        onClose();
        navigate(`/clubs/${club.id}/cashier`);
    }, [club.id, navigate, onClose]);

    const handleShareCode = useCallback(() => {
        onClose();
        const code = club.club_id || '';
        navigator.clipboard?.writeText(String(code));
        toast.success(`Club code ${code} copied!`);
    }, [club.club_id, onClose, toast]);

    // BUG FIX #2: Only delegate to parent — do NOT call ClubsService.leave() here
    const handleLeave = useCallback(() => {
        onLeave(); // Parent (HomePage) will show confirmation modal
    }, [onLeave]);

    const handlePin = useCallback(() => {
        onClose();
        onPin(club.id);
    }, [club.id, onClose, onPin]);

    return (
        <>
            <div className={styles.contextMenuOverlay} onClick={onClose} />
            <div
                className={styles.contextMenu}
                style={{ top: y, left: Math.min(x, window.innerWidth - 200) }}
                role="menu"
                aria-label="Club actions"
            >
                <button className={styles.contextMenuItem} onClick={handleGoToLobby} role="menuitem">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8, flexShrink: 0 }}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                    Go to Lobby
                </button>
                <button className={styles.contextMenuItem} onClick={handleCashier} role="menuitem">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8, flexShrink: 0 }}><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                    View Cashier
                </button>
                <button className={styles.contextMenuItem} onClick={handleShareCode} role="menuitem">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8, flexShrink: 0 }}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                    Share Invite Code
                </button>
                <button className={styles.contextMenuItem} onClick={handlePin} role="menuitem">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8, flexShrink: 0 }}><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24z"/></svg>
                    {isPinned ? 'Unpin from Top' : 'Pin to Top'}
                </button>
                <div className={styles.contextMenuDivider} />
                {!club.is_owner && (
                    <button
                        className={`${styles.contextMenuItem} ${styles.contextMenuDanger}`}
                        onClick={handleLeave}
                        role="menuitem"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8, flexShrink: 0 }}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                        Leave Club
                    </button>
                )}
            </div>
        </>
    );
}

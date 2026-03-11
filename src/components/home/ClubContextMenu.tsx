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
                    Go to Lobby
                </button>
                <button className={styles.contextMenuItem} onClick={handleCashier} role="menuitem">
                    View Cashier
                </button>
                <button className={styles.contextMenuItem} onClick={handleShareCode} role="menuitem">
                    Share Invite Code
                </button>
                <button className={styles.contextMenuItem} onClick={handlePin} role="menuitem">
                    {isPinned ? 'Unpin from Top' : 'Pin to Top'}
                </button>
                <div className={styles.contextMenuDivider} />
                {!club.is_owner && (
                    <button
                        className={`${styles.contextMenuItem} ${styles.contextMenuDanger}`}
                        onClick={handleLeave}
                        role="menuitem"
                    >
                        Leave Club
                    </button>
                )}
            </div>
        </>
    );
}

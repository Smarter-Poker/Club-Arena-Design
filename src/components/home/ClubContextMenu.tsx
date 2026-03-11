/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CLUB CONTEXT MENU — Extracted Reusable Component
 * ═══════════════════════════════════════════════════════════════════════════════
 * Long-press / right-click context menu for club cards.
 * Actions: Go to Lobby, Cashier, Share Code, Leave Club (non-owners).
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClubsService } from '../../services/ClubsService';
import { masterBus } from '../../core/MasterBus';
import { useToast } from '../../components/common/Toast';
import styles from '../HomePage.module.css';

interface ClubContextMenuProps {
    club: any;
    x: number;
    y: number;
    onClose: () => void;
    onLeave: () => void;
}

export default function ClubContextMenu({ club, x, y, onClose, onLeave }: ClubContextMenuProps) {
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

    const handleLeave = useCallback(async () => {
        onClose();
        try {
            await ClubsService.leave(club.id);
            toast.success('Left the club');
            masterBus.emit('CLUB_LEFT', { clubId: club.id });
            onLeave();
        } catch (err: any) {
            toast.error(err.message || 'Failed to leave club');
        }
    }, [club.id, onClose, onLeave, toast]);

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
                    🏠 Go to Lobby
                </button>
                <button className={styles.contextMenuItem} onClick={handleCashier} role="menuitem">
                    💰 View Cashier
                </button>
                <button className={styles.contextMenuItem} onClick={handleShareCode} role="menuitem">
                    🔗 Share Invite Code
                </button>
                <div className={styles.contextMenuDivider} />
                {!club.is_owner && (
                    <button
                        className={`${styles.contextMenuItem} ${styles.contextMenuDanger}`}
                        onClick={handleLeave}
                        role="menuitem"
                    >
                        🚪 Leave Club
                    </button>
                )}
            </div>
        </>
    );
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🪑 SEAT SLOT — Individual Player Seat Component
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Renders a single seat at the poker table with:
 * - Player avatar and name
 * - Stack size display
 * - Hole cards (when visible)
 * - Action timer bar
 * - Status indicators (dealer, BB, SB, active)
 * - Action badges (fold, check, call, raise amount)
 */

import React, { useMemo } from 'react';
import './SeatSlot.css';
import { CardImage, CardBack } from './CardImage';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface Card {
    rank: '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
    suit: 'h' | 'd' | 'c' | 's';
}

export type PlayerStatus = 'active' | 'away' | 'sitting_out' | 'folded' | 'all_in';
export type PositionBadge = 'D' | 'SB' | 'BB' | null;
export type LastAction = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in' | null;

export interface SeatPlayer {
    id: string;
    name: string;
    avatar?: string;
    stack: number;
    status: PlayerStatus;
    holeCards?: Card[];
    showCards: boolean;
    isHero: boolean;
}

export interface SeatSlotProps {
    seatNumber: number;
    player: SeatPlayer | null;
    position: PositionBadge;
    isActive: boolean;
    lastAction: LastAction;
    lastBetAmount?: number;
    timerProgress?: number; // 0-100
    bigBlind?: number; // For BB display
    isTournament?: boolean; // Tournament mode — show chips not BB, hide SIT buttons
    onSit?: () => void;
    onAction?: () => void;
    onAvatarClick?: () => void; // For throwables targeting
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

const SUIT_SYMBOLS: Record<string, { symbol: string; color: string }> = {
    h: { symbol: '♥', color: '#DC143C' },
    d: { symbol: '♦', color: '#DC143C' },
    c: { symbol: '♣', color: '#1C1C1C' },
    s: { symbol: '♠', color: '#1C1C1C' },
};

const RANK_DISPLAY: Record<string, string> = {
    T: '10',
    J: 'J',
    Q: 'Q',
    K: 'K',
    A: 'A',
};

// EXACT precision — no abbreviations, no rounding
function formatStack(amount: number): string {
    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// EXACT precision — no rounding in BB calculation
function formatStackAsBB(stack: number, bigBlind: number): string {
    if (bigBlind <= 0) return '0.00 BB';
    const bb = stack / bigBlind;
    return `${bb.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} BB`;
}

function getActionLabel(action: LastAction, amount?: number): string {
    switch (action) {
        case 'fold': return 'FOLD';
        case 'check': return 'CHECK';
        case 'call': return amount ? `CALL ${formatStack(amount)}` : 'CALL';
        case 'bet': return amount ? `BET ${formatStack(amount)}` : 'BET';
        case 'raise': return amount ? `RAISE ${formatStack(amount)}` : 'RAISE';
        case 'all_in': return 'ALL IN';
        default: return '';
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

interface HoleCardProps {
    card?: Card;
    hidden?: boolean;
    index: number;
}

function HoleCard({ card, hidden = false, index }: HoleCardProps) {
    if (hidden || !card) {
        return (
            <div
                className="seat-slot__card seat-slot__card--hidden"
                style={{ transform: `rotate(${index === 0 ? -8 : 8}deg)` }}
            >
                <CardBack size="sm" style="classic_blue" />
            </div>
        );
    }
    return (
        <div
            className="seat-slot__card seat-slot__card--face"
            style={{ transform: `rotate(${index === 0 ? -8 : 8}deg)` }}
        >
            <CardImage card={card} deckStyle="4color" size="sm" />
        </div>
    );
}

interface PositionChipProps {
    position: PositionBadge;
}

function PositionChip({ position }: PositionChipProps) {
    if (!position) return null;

    const colorMap: Record<string, string> = {
        D: '#FFFFFF',
        SB: '#4169E1',
        BB: '#FFD700',
    };

    return (
        <div
            className="seat-slot__position-chip"
            style={{ backgroundColor: colorMap[position] || '#FFFFFF' }}
        >
            {position}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function SeatSlot({
    seatNumber,
    player,
    position,
    isActive,
    lastAction,
    lastBetAmount,
    timerProgress,
    bigBlind = 2,
    isTournament = false,
    onSit,
    onAction,
    onAvatarClick,
}: SeatSlotProps) {

    // Memoize classes
    const containerClasses = useMemo(() => {
        const classes = ['seat-slot'];

        if (!player) {
            classes.push('seat-slot--empty');
        } else {
            classes.push(`seat-slot--${player.status}`);
            if (player.isHero) classes.push('seat-slot--hero');
            if (isActive) classes.push('seat-slot--active');
        }

        if (lastAction === 'fold') {
            classes.push('seat-slot--folded');
        }

        return classes.join(' ');
    }, [player, isActive, lastAction]);

    // ─────────────────────────────────────────────────────────────────────────────
    // EMPTY SEAT
    // ─────────────────────────────────────────────────────────────────────────────

    if (!player) {
        // In tournaments, don't show SIT buttons on empty seats
        if (isTournament) {
            return (
                <div className={containerClasses}>
                    <div className="seat-slot__empty-marker">
                        <span className="seat-slot__seat-number">Seat {seatNumber}</span>
                    </div>
                </div>
            );
        }
        return (
            <div className={containerClasses} onClick={onSit}>
                <div className="seat-slot__empty-marker">
                    <span className="seat-slot__seat-number">Seat {seatNumber}</span>
                    <button className="seat-slot__sit-button">SIT</button>
                </div>
            </div>
        );
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // OCCUPIED SEAT
    // ─────────────────────────────────────────────────────────────────────────────

    return (
        <div className={containerClasses} onClick={onAction}>
            {/* Timer Bar */}
            {isActive && timerProgress !== undefined && (
                <div className="seat-slot__timer-bar">
                    <div
                        className="seat-slot__timer-fill"
                        style={{ width: `${timerProgress}%` }}
                    />
                </div>
            )}

            {/* Active Glow */}
            {isActive && <div className="seat-slot__active-glow" />}

            {/* Main Content */}
            <div className="seat-slot__content">
                {/* Avatar */}
                <div
                    className="seat-slot__avatar-container"
                    onClick={(e) => {
                        if (onAvatarClick && !player.isHero) {
                            e.stopPropagation();
                            onAvatarClick();
                        }
                    }}
                    style={{ cursor: onAvatarClick && !player.isHero ? 'pointer' : undefined }}
                >
                    {player.avatar ? (
                        <img
                            src={player.avatar}
                            alt={player.name}
                            className="seat-slot__avatar"
                        />
                    ) : (
                        <div className="seat-slot__avatar seat-slot__avatar--default">
                            {player.name.charAt(0).toUpperCase()}
                        </div>
                    )}

                    {/* Status Indicator */}
                    {player.status !== 'active' && player.status !== 'folded' && (
                        <div className={`seat-slot__status-dot seat-slot__status-dot--${player.status}`} />
                    )}
                </div>

                {/* Player Info */}
                <div className="seat-slot__info">
                    <span className="seat-slot__name">{player.name}</span>
                    <span className="seat-slot__stack">{isTournament ? formatStack(player.stack) : formatStackAsBB(player.stack, bigBlind)}</span>
                </div>

                {/* Position Chip */}
                <PositionChip position={position} />
            </div>

            {/* Hole Cards */}
            {player.holeCards && player.holeCards.length > 0 && (
                <div className="seat-slot__cards">
                    {player.holeCards.map((card, i) => (
                        <HoleCard
                            key={i}
                            card={card}
                            hidden={!player.showCards && !player.isHero}
                            index={i}
                        />
                    ))}
                </div>
            )}

            {/* Last Action Badge */}
            {lastAction && (
                <div className={`seat-slot__action-badge seat-slot__action-badge--${lastAction}`}>
                    {getActionLabel(lastAction, lastBetAmount)}
                </div>
            )}

            {/* All-In Indicator */}
            {player.status === 'all_in' && (
                <div className="seat-slot__all-in-badge">ALL IN</div>
            )}
        </div>
    );
}

// Memoize to prevent unnecessary re-renders when parent TablePage state changes
// Only re-render when seat-relevant props actually change
export default React.memo(SeatSlot, (prev, next) => {
    // Return true if props are equal (skip re-render)
    return (
        prev.seatNumber === next.seatNumber &&
        prev.isActive === next.isActive &&
        prev.lastAction === next.lastAction &&
        prev.lastBetAmount === next.lastBetAmount &&
        prev.timerProgress === next.timerProgress &&
        prev.position === next.position &&
        prev.isTournament === next.isTournament &&
        prev.bigBlind === next.bigBlind &&
        prev.player?.id === next.player?.id &&
        prev.player?.stack === next.player?.stack &&
        prev.player?.status === next.player?.status &&
        prev.player?.showCards === next.player?.showCards &&
        prev.player?.isHero === next.player?.isHero &&
        prev.player?.holeCards?.length === next.player?.holeCards?.length &&
        prev.player?.holeCards?.[0]?.rank === next.player?.holeCards?.[0]?.rank &&
        prev.player?.holeCards?.[1]?.rank === next.player?.holeCards?.[1]?.rank
    );
});

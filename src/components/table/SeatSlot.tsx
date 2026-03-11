/**
 * ♠ CLUB ARENA — Seat Slot Component
 * ═══════════════════════════════════════════════════════════════════════════════
 * EXACT PokerBros seat layout:
 *
 *   [Fold badge above]
 *        ┌──────┐
 *        │Avatar│  ← 56px circle with custom image
 *        └──────┘
 *      ┌──────────┐
 *      │  ~Name~  │  ← Dark rounded box, neon yellow border when active
 *      │  7,744   │  ← Green chip count
 *      └──────────┘
 *         (D)       ← Position chip near avatar
 *
 * Active player: neon yellow glowing border around the info box
 * that DISAPPEARS as the clock counts down (CSS conic-gradient mask).
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
    timerProgress?: number; // 0-100 (100 = full time, 0 = out of time)
    bigBlind?: number;
    isTournament?: boolean;
    bountyValue?: number;
    isWinner?: boolean;
    winningHandName?: string; // e.g. "Straight", "Full House"
    onSit?: () => void;
    onAction?: () => void;
    onAvatarClick?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

function formatStack(amount: number): string {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 100000) return `${(amount / 1000).toFixed(0)}K`;
    if (amount >= 10000) return `${(amount / 1000).toFixed(1)}K`;
    if (amount === Math.floor(amount)) return amount.toLocaleString();
    return amount.toFixed(2);
}

function formatStackAsBB(stack: number, bigBlind: number): string {
    if (bigBlind <= 0) return '0 BB';
    const bb = stack / bigBlind;
    if (bb >= 1000) return `${(bb / 1000).toFixed(1)}K BB`;
    if (bb >= 100) return `${Math.round(bb)} BB`;
    return `${bb.toFixed(1)} BB`;
}

function getActionLabel(action: LastAction, amount?: number): string {
    switch (action) {
        case 'fold': return 'Fold';
        case 'check': return 'Check';
        case 'call': return amount ? `Call ${formatStack(amount)}` : 'Call';
        case 'bet': return amount ? `Bet ${formatStack(amount)}` : 'Bet';
        case 'raise': return amount ? `Raise ${formatStack(amount)}` : 'Raise';
        case 'all_in': return 'ALL IN';
        default: return '';
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOLE CARDS
// ═══════════════════════════════════════════════════════════════════════════════

function HoleCard({ card, hidden = false, index, isHero = false, isWinner = false }: {
    card?: Card; hidden?: boolean; index: number; isHero?: boolean; isWinner?: boolean;
}) {
    // PokerBros-style: hero cards have wider fan tilt, opponents tighter
    const rotation = isHero
        ? (index === 0 ? -12 : 12)
        : (index === 0 ? -8 : 8);
    const size = isHero ? 'md' : 'sm';

    if (hidden || !card) {
        return (
            <div
                className="seat__card seat__card--back"
                style={{ transform: `rotate(${rotation}deg)` }}
            >
                <CardBack size={size} style="classic_blue" />
            </div>
        );
    }
    return (
        <div
            className={`seat__card seat__card--face${isWinner ? ' seat__card--winner' : ''}`}
            style={{ transform: `rotate(${rotation}deg)` }}
        >
            <CardImage card={card} deckStyle="4color" size={size} isHighlighted={isWinner} />
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// POSITION CHIP — D / SB / BB badge
// ═══════════════════════════════════════════════════════════════════════════════

function PositionChip({ position }: { position: PositionBadge }) {
    if (!position) return null;

    const config: Record<string, { bg: string; color: string }> = {
        D: { bg: '#FFFFFF', color: '#111' },
        SB: { bg: '#3B82F6', color: '#FFF' },
        BB: { bg: '#EAB308', color: '#111' },
    };

    const { bg, color } = config[position] || config.D;

    return (
        <div className="seat__position-chip" style={{ backgroundColor: bg, color }}>
            {position}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEON TIMER BORDER — PokerBros-style disappearing border
// ═══════════════════════════════════════════════════════════════════════════════
//
// The info box border glows neon yellow and the border progressively disappears
// as the clock counts down. We achieve this with a conic-gradient mask on a
// pseudo-element, driven by a CSS custom property --timer-progress.

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
    bountyValue,
    isWinner = false,
    winningHandName,
    onSit,
    onAction,
    onAvatarClick,
}: SeatSlotProps) {

    const containerClasses = useMemo(() => {
        const cls = ['seat'];
        if (!player) {
            cls.push('seat--empty');
        } else {
            cls.push(`seat--${player.status}`);
            if (player.isHero) cls.push('seat--hero');
            if (isActive) cls.push('seat--active');
            if (isWinner) cls.push('seat--winner');
            if (lastAction === 'fold') cls.push('seat--folded');
        }
        return cls.join(' ');
    }, [player, isActive, lastAction, isWinner]);

    // ─── EMPTY SEAT ────────────────────────────────────────────────────────
    if (!player) {
        if (isTournament) {
            return <div className={containerClasses} />;
        }
        return (
            <div className={containerClasses} onClick={onSit}>
                <span className="seat__empty-label">EMPTY</span>
            </div>
        );
    }

    // ─── OCCUPIED SEAT ─────────────────────────────────────────────────────
    // Use custom avatar library default — NOT generic DiceBear icons
    const avatarUrl = player.avatar || '/avatars/default-player.png';

    // Timer progress as CSS custom prop for conic-gradient border
    const timerStyle = isActive && timerProgress !== undefined
        ? { '--timer-progress': `${timerProgress}%` } as React.CSSProperties
        : undefined;

    return (
        <div className={containerClasses} onClick={onAction}>

            {/* Last Action Badge — floats ABOVE the seat like PokerBros */}
            {lastAction && (
                <div className={`seat__action seat__action--${lastAction}`}>
                    {getActionLabel(lastAction, lastBetAmount)}
                </div>
            )}

            {/* Hole Cards — opponents: beside avatar at showdown */}
            {player.holeCards && player.holeCards.length > 0 && !player.isHero && (
                <div className={`seat__cards seat__cards--opponent${player.showCards ? ' seat__cards--revealed' : ''}`}>
                    {player.holeCards.map((card, i) => (
                        <HoleCard
                            key={i}
                            card={card}
                            hidden={!player.showCards}
                            index={i}
                            isWinner={isWinner}
                        />
                    ))}
                </div>
            )}

            {/* Avatar Circle — large, sits on top of info box */}
            <div className="seat__avatar-wrap">
                <div
                    className="seat__avatar"
                    onClick={(e) => {
                        if (onAvatarClick && !player.isHero) {
                            e.stopPropagation();
                            onAvatarClick();
                        }
                    }}
                    style={{ cursor: onAvatarClick && !player.isHero ? 'pointer' : undefined }}
                >
                    {player.avatar || !player.isHero ? (
                        <img
                            src={avatarUrl}
                            alt={player.name}
                            className="seat__avatar-img"
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                                const fb = (e.target as HTMLImageElement).parentElement?.querySelector('.seat__avatar-fallback');
                                if (fb) (fb as HTMLElement).style.display = 'flex';
                            }}
                        />
                    ) : null}
                    {player.isHero && !player.avatar ? (
                        <span className="seat__avatar-initial">{player.name.charAt(0).toUpperCase()}</span>
                    ) : null}
                    <span className="seat__avatar-fallback seat__avatar-initial" style={{ display: 'none' }}>
                        {player.name.charAt(0).toUpperCase()}
                    </span>

                    {/* Folded overlay */}
                    {lastAction === 'fold' && (
                        <div className="seat__avatar-fold-overlay" />
                    )}
                </div>

                {/* Status dot (away/sitting out) */}
                {player.status !== 'active' && player.status !== 'folded' && player.status !== 'all_in' && (
                    <span className={`seat__status-dot seat__status-dot--${player.status}`} />
                )}

                {/* Position Chip — bottom-right of avatar */}
                <PositionChip position={position} />
            </div>

            {/* Info Box — name + stack, with neon timer border when active */}
            <div className="seat__info" style={timerStyle}>
                {/* Neon border overlay (rendered via CSS ::before when --active) */}
                <span className="seat__name">{player.name}</span>
                <span className="seat__stack">
                    {isTournament ? formatStack(player.stack) : formatStackAsBB(player.stack, bigBlind)}
                </span>
            </div>

            {/* Hero Hole Cards — large, PokerBros style beside avatar */}
            {player.holeCards && player.holeCards.length > 0 && player.isHero && (
                <div className="seat__cards seat__cards--hero">
                    {player.holeCards.map((card, i) => (
                        <HoleCard
                            key={i}
                            card={card}
                            hidden={false}
                            index={i}
                            isHero={true}
                            isWinner={isWinner}
                        />
                    ))}
                </div>
            )}

            {/* Winning Hand Name — floats below cards like PokerBros "Straight" label */}
            {isWinner && winningHandName && (
                <div className="seat__hand-name">{winningHandName}</div>
            )}

            {/* All-In Badge */}
            {player.status === 'all_in' && !isWinner && (
                <div className="seat__allin-badge">ALL IN</div>
            )}

            {/* Bounty Badge */}
            {bountyValue != null && bountyValue > 0 && (
                <div className="seat__bounty">
                    <span className="seat__bounty-target">🎯</span>
                    <span className="seat__bounty-val">
                        {(Math.trunc(bountyValue * 100) / 100).toLocaleString('en-US', {
                            minimumFractionDigits: 2, maximumFractionDigits: 2,
                        })}
                    </span>
                </div>
            )}
        </div>
    );
}

// Memoize — only re-render when seat-relevant props change
export default React.memo(SeatSlot, (prev, next) => {
    return (
        prev.seatNumber === next.seatNumber &&
        prev.isActive === next.isActive &&
        prev.lastAction === next.lastAction &&
        prev.lastBetAmount === next.lastBetAmount &&
        prev.timerProgress === next.timerProgress &&
        prev.position === next.position &&
        prev.isTournament === next.isTournament &&
        prev.bigBlind === next.bigBlind &&
        prev.bountyValue === next.bountyValue &&
        prev.isWinner === next.isWinner &&
        prev.winningHandName === next.winningHandName &&
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

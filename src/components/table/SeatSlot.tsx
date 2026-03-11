/**
 * ♠ CLUB ARENA — Seat Slot Component
 * ═══════════════════════════════════════════════════════════════════════════════
 * PokerBros/ClubGG-style compact circular player seats
 *
 * Layout: Circular Avatar → Name Pill → Stack
 * Empty: Subtle "+" circle
 * Active: SVG arc timer ring + glow
 * Folded: Greyed out + dimmed
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
    bigBlind?: number;
    isTournament?: boolean;
    bountyValue?: number;
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
// SVG TIMER ARC — Circular progress ring around avatar
// ═══════════════════════════════════════════════════════════════════════════════

function TimerArc({ progress, size = 52 }: { progress: number; size?: number }) {
    const strokeWidth = 3;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - progress / 100);

    // Color transitions: green → yellow → red
    const getColor = (p: number) => {
        if (p > 60) return '#22C55E';
        if (p > 30) return '#F59E0B';
        return '#EF4444';
    };

    return (
        <svg
            className="seat__timer-arc"
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
        >
            {/* Background track */}
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={strokeWidth}
            />
            {/* Progress arc */}
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={getColor(progress)}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                style={{ transition: 'stroke-dashoffset 0.3s linear, stroke 0.5s ease' }}
            />
            {/* Glow filter */}
            {progress <= 30 && (
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={getColor(progress)}
                    strokeWidth={strokeWidth + 2}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    opacity={0.3}
                    style={{ transition: 'stroke-dashoffset 0.3s linear' }}
                />
            )}
        </svg>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOLE CARDS — Compact card display
// ═══════════════════════════════════════════════════════════════════════════════

function HoleCard({ card, hidden = false, index }: { card?: Card; hidden?: boolean; index: number }) {
    if (hidden || !card) {
        return (
            <div
                className="seat__card seat__card--back"
                style={{ transform: `rotate(${index === 0 ? -6 : 6}deg) translateX(${index === 0 ? -2 : 2}px)` }}
            >
                <CardBack size="sm" style="classic_blue" />
            </div>
        );
    }
    return (
        <div
            className="seat__card seat__card--face"
            style={{ transform: `rotate(${index === 0 ? -6 : 6}deg) translateX(${index === 0 ? -2 : 2}px)` }}
        >
            <CardImage card={card} deckStyle="4color" size="sm" />
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
            if (lastAction === 'fold') cls.push('seat--folded');
        }
        return cls.join(' ');
    }, [player, isActive, lastAction]);

    // ─── EMPTY SEAT ────────────────────────────────────────────────────────
    if (!player) {
        if (isTournament) {
            return <div className={containerClasses} />;
        }
        return (
            <div className={containerClasses} onClick={onSit}>
                <button className="seat__join-btn" aria-label={`Sit at seat ${seatNumber}`}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                </button>
            </div>
        );
    }

    // ─── OCCUPIED SEAT ─────────────────────────────────────────────────────
    const avatarUrl = player.avatar ||
        `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(player.name)}&backgroundColor=b6e3f4`;

    return (
        <div className={containerClasses} onClick={onAction}>
            {/* Avatar Ring — Contains avatar + timer arc */}
            <div className="seat__avatar-ring">
                {/* SVG Timer Arc (when active) */}
                {isActive && timerProgress !== undefined && (
                    <TimerArc progress={timerProgress} size={52} />
                )}

                {/* Avatar Circle */}
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
                </div>

                {/* Status dot (away/sitting out) */}
                {player.status !== 'active' && player.status !== 'folded' && player.status !== 'all_in' && (
                    <span className={`seat__status-dot seat__status-dot--${player.status}`} />
                )}

                {/* Position Chip */}
                <PositionChip position={position} />
            </div>

            {/* Info Pill — Name + Stack */}
            <div className="seat__info">
                <span className="seat__name">{player.name}</span>
                <span className="seat__stack">
                    {isTournament ? formatStack(player.stack) : formatStackAsBB(player.stack, bigBlind)}
                </span>
            </div>

            {/* Hole Cards */}
            {player.holeCards && player.holeCards.length > 0 && (
                <div className={`seat__cards ${player.isHero ? 'seat__cards--hero' : ''}`}>
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
                <div className={`seat__action seat__action--${lastAction}`}>
                    {getActionLabel(lastAction, lastBetAmount)}
                </div>
            )}

            {/* All-In Badge */}
            {player.status === 'all_in' && (
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

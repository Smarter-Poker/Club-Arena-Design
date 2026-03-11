/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CLUB ARENA — All-In Equity Display
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Shows equity percentage bars next to each player during all-in situations.
 * Bar shifts as community cards are dealt.
 *
 * Also supports legacy single-equity display for backward compatibility.
 */

import React, { memo } from 'react';
import './EquityDisplay.css';

// Legacy single equity display
interface LegacyEquityDisplayProps {
    equity: number; // 0-100
    showBar?: boolean;
    size?: 'small' | 'medium' | 'large';
    outs?: number;
}

function LegacyEquityDisplay({ equity, showBar = true, size = 'medium', outs }: LegacyEquityDisplayProps) {
    const getColor = () => {
        if (equity >= 60) return '#4ade80';
        if (equity >= 40) return '#fbbf24';
        return '#f87171';
    };

    return (
        <div className={`equity-display ${size}`}>
            <span className="equity-value" style={{ color: getColor() }}>
                {equity.toFixed(1)}%
            </span>

            {showBar && (
                <div className="equity-bar">
                    <div
                        className="equity-fill"
                        style={{ width: `${equity}%`, backgroundColor: getColor() }}
                    />
                </div>
            )}

            {outs !== undefined && (
                <span className="outs">{outs} outs</span>
            )}
        </div>
    );
}

// Multi-player equity bars for all-in situations
export interface EquityBarProps {
    equity: number;          // 0-100
    isHero: boolean;
    playerName: string;
    isLeading: boolean;
}

export const EquityBar = memo(function EquityBar({ equity, isHero, playerName, isLeading }: EquityBarProps) {
    const barColor = isLeading ? '#22c55e' : '#ef4444';
    const bgColor = isLeading ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)';

    return (
        <div className={`equity-bar ${isHero ? 'equity-bar--hero' : ''}`}>
            <div className="equity-bar__track" style={{ background: bgColor }}>
                <div
                    className="equity-bar__fill"
                    style={{
                        width: `${Math.min(100, Math.max(0, equity))}%`,
                        background: barColor,
                        boxShadow: `0 0 8px ${barColor}60`
                    }}
                />
            </div>
            <span className="equity-bar__pct" style={{ color: barColor }}>
                {Math.round(equity)}%
            </span>
        </div>
    );
});

export interface MultiPlayerEquityDisplayProps {
    players: Array<{
        id: string;
        name: string;
        equity: number;
        isHero: boolean;
    }>;
    isVisible: boolean;
}

export const MultiPlayerEquityDisplay = memo(function MultiPlayerEquityDisplay({ players, isVisible }: MultiPlayerEquityDisplayProps) {
    if (!isVisible || players.length === 0) return null;

    const maxEquity = Math.max(...players.map(p => p.equity));

    return (
        <div className="equity-display equity-display--multi">
            {players.map(player => (
                <EquityBar
                    key={player.id}
                    equity={player.equity}
                    isHero={player.isHero}
                    playerName={player.name}
                    isLeading={player.equity === maxEquity}
                />
            ))}
        </div>
    );
});

// Alias for backward compatibility
export type EquityDisplayProps = LegacyEquityDisplayProps;

export function EquityDisplay(props: LegacyEquityDisplayProps) {
    return <LegacyEquityDisplay {...props} />;
}

export default EquityDisplay;

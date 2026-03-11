/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CLUB ARENA — Smart Mini-HUD
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ClubGG-style opponent statistics overlay showing VPIP, PFR, and heat index.
 * Renders as a small badge below each opponent's seat info box.
 */

import { memo, useMemo } from 'react';
import './MiniHUD.css';

export interface MiniHUDStats {
    handsPlayed: number;
    vpipCount: number;      // Voluntarily Put In Pot
    pfrCount: number;       // Pre-Flop Raise
    threeBetCount: number;  // 3-bet frequency
    cBetCount: number;      // Continuation bet
    wtsdCount: number;      // Went To ShowDown
    wonCount: number;       // Hands won
    totalBuyIn: number;     // Total bought in
    totalCashOut: number;   // Total cashed out
}

export interface MiniHUDProps {
    stats: MiniHUDStats | null;
    isVisible: boolean;
    compact?: boolean;       // Ultra-compact mode for small screens
}

/** Heat index: 0-3 (ice, cool, warm, hot) based on VPIP */
function getHeatLevel(vpip: number): 0 | 1 | 2 | 3 {
    if (vpip < 18) return 0;   // Tight/ice
    if (vpip < 28) return 1;   // Normal/cool
    if (vpip < 40) return 2;   // Loose/warm
    return 3;                   // Very loose/hot
}

function getHeatColor(level: 0 | 1 | 2 | 3): string {
    switch (level) {
        case 0: return '#3b82f6'; // Blue - tight
        case 1: return '#22c55e'; // Green - normal
        case 2: return '#f59e0b'; // Amber - loose
        case 3: return '#ef4444'; // Red - very loose
    }
}

function getHeatLabel(level: 0 | 1 | 2 | 3): string {
    switch (level) {
        case 0: return 'Tight';
        case 1: return 'Normal';
        case 2: return 'Loose';
        case 3: return 'Whale';
    }
}

const MiniHUD = memo(function MiniHUD({ stats, isVisible, compact = false }: MiniHUDProps) {
    const computed = useMemo(() => {
        if (!stats || stats.handsPlayed < 5) return null;

        const vpip = Math.round((stats.vpipCount / stats.handsPlayed) * 100);
        const pfr = Math.round((stats.pfrCount / stats.handsPlayed) * 100);
        const heat = getHeatLevel(vpip);

        return { vpip, pfr, heat, hands: stats.handsPlayed };
    }, [stats]);

    if (!isVisible || !computed) return null;

    const heatColor = getHeatColor(computed.heat);
    const heatLabel = getHeatLabel(computed.heat);

    return (
        <div className={`mini-hud ${compact ? 'mini-hud--compact' : ''}`}>
            {/* Heat indicator dot */}
            <span
                className="mini-hud__heat"
                style={{ backgroundColor: heatColor, boxShadow: `0 0 6px ${heatColor}` }}
                title={`${heatLabel} (${computed.hands} hands)`}
            />

            {/* VPIP / PFR */}
            <span className="mini-hud__stat">
                <span className="mini-hud__value">{computed.vpip}</span>
                <span className="mini-hud__slash">/</span>
                <span className="mini-hud__value">{computed.pfr}</span>
            </span>

            {!compact && (
                <span className="mini-hud__hands" title="Hands observed">
                    {computed.hands < 100 ? computed.hands : '99+'}
                </span>
            )}
        </div>
    );
}, (prev, next) => {
    if (prev.isVisible !== next.isVisible) return false;
    if (prev.compact !== next.compact) return false;
    if (!prev.stats && !next.stats) return true;
    if (!prev.stats || !next.stats) return false;
    return prev.stats.handsPlayed === next.stats.handsPlayed
        && prev.stats.vpipCount === next.stats.vpipCount
        && prev.stats.pfrCount === next.stats.pfrCount;
});

export default MiniHUD;

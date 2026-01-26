/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  XP PROGRESS BAR — Player Level Progression
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React from 'react';
import './XPProgressBar.css';

interface XPProgressBarProps {
    currentXP: number;
    levelXP: number;
    nextLevelXP: number;
    level: number;
    showLabel?: boolean;
    compact?: boolean;
}

export function XPProgressBar({
    currentXP,
    levelXP,
    nextLevelXP,
    level,
    showLabel = true,
    compact = false
}: XPProgressBarProps) {
    const xpInLevel = currentXP - levelXP;
    const xpNeeded = nextLevelXP - levelXP;
    const percentage = Math.min(100, (xpInLevel / xpNeeded) * 100);

    return (
        <div className={`xp-progress ${compact ? 'compact' : ''}`}>
            {showLabel && (
                <div className="xp-progress__header">
                    <span className="level">Level {level}</span>
                    <span className="xp">{xpInLevel.toLocaleString()} / {xpNeeded.toLocaleString()} XP</span>
                </div>
            )}

            <div className="xp-progress__bar">
                <div
                    className="xp-progress__fill"
                    style={{ width: `${percentage}%` }}
                />
                {!compact && (
                    <span className="xp-progress__percent">{percentage.toFixed(0)}%</span>
                )}
            </div>

            {!compact && (
                <div className="xp-progress__next">
                    <span>Level {level + 1}</span>
                    <span>{(nextLevelXP - currentXP).toLocaleString()} XP to go</span>
                </div>
            )}
        </div>
    );
}

export default XPProgressBar;

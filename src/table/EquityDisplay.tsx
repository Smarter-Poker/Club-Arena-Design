/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  EQUITY DISPLAY — Show Hand Equity in Real-Time
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React from 'react';
import './EquityDisplay.css';

interface EquityDisplayProps {
    equity: number; // 0-100
    showBar?: boolean;
    size?: 'small' | 'medium' | 'large';
    outs?: number;
}

export function EquityDisplay({ equity, showBar = true, size = 'medium', outs }: EquityDisplayProps) {
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

export default EquityDisplay;

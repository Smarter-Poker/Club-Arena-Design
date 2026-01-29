/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🪑 SIT OUT TOGGLE — Quick Sit Out Control
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React from 'react';
import './SitOutToggle.css';

interface SitOutToggleProps {
    isSittingOut: boolean;
    onToggle: (sittingOut: boolean) => void;
    awaySeconds?: number;
    autoFoldAt?: number;
}

export function SitOutToggle({
    isSittingOut,
    onToggle,
    awaySeconds = 0,
    autoFoldAt = 300 // 5 mins
}: SitOutToggleProps) {
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className={`sit-out-toggle ${isSittingOut ? 'sitting-out' : ''}`}>
            <button onClick={() => onToggle(!isSittingOut)}>
                <span className="icon">{isSittingOut ? '🪑' : ''}</span>
                <span className="label">{isSittingOut ? 'I\'m Back' : 'Sit Out'}</span>
            </button>

            {isSittingOut && awaySeconds > 0 && (
                <div className="away-timer">
                    <span className="time">{formatTime(awaySeconds)}</span>
                    {autoFoldAt > 0 && (
                        <span className="warning">
                            Auto-remove in {formatTime(autoFoldAt - awaySeconds)}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

export default SitOutToggle;

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  SPECTATOR LIST — Show Table Watchers
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React from 'react';
import './SpectatorList.css';

interface SpectatorListProps {
    spectators: Spectator[];
    maxVisible?: number;
}

interface Spectator {
    id: string;
    username: string;
    avatarUrl: string;
    isVIP?: boolean;
}

export function SpectatorList({ spectators, maxVisible = 5 }: SpectatorListProps) {
    const visible = spectators.slice(0, maxVisible);
    const remaining = spectators.length - maxVisible;

    if (spectators.length === 0) {
        return null;
    }

    return (
        <div className="spectator-list">
            <span className="icon"></span>
            <span className="count">{spectators.length}</span>

            <div className="spectators">
                {visible.map(spec => (
                    <span
                        key={spec.id}
                        className={`spectator ${spec.isVIP ? 'vip' : ''}`}
                        title={spec.username}
                    >
                        {spec.avatarUrl}
                    </span>
                ))}
                {remaining > 0 && (
                    <span className="more">+{remaining}</span>
                )}
            </div>
        </div>
    );
}

export default SpectatorList;

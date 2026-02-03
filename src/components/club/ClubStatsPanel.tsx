/**
 * ClubStatsPanel - Optimized version with image + CSS overlays
 * 
 * Performance optimization:
 * - Uses SVG as background image (browser caches it)
 * - Dynamic numbers rendered as CSS positioned text
 * - Reduces bundle size by not inlining SVG
 */

import React from 'react';
import './ClubStatsPanel.css';

interface ClubStatsPanelProps {
    totalMembers: number;
    clubLevel: number;
    activePlayers: number;
}

export const ClubStatsPanel: React.FC<ClubStatsPanelProps> = ({
    totalMembers,
    clubLevel,
    activePlayers
}) => {
    return (
        <div className="club-stats-panel">
            {/* Background SVG loaded as image (browser caches) */}
            <img
                src="/hub/club-arena/images/club-stats-panel.svg"
                alt="Club Stats"
                className="club-stats-bg"
                loading="lazy"
            />

            {/* Dynamic text overlays positioned with CSS */}
            <div className="stats-overlay">
                <span className="stat-value total-members">
                    {totalMembers.toLocaleString()}
                </span>
                <span className="stat-value club-level">
                    {clubLevel}
                </span>
                <span className="stat-value active-players">
                    {activePlayers.toLocaleString()}
                </span>
            </div>
        </div>
    );
};

export default ClubStatsPanel;

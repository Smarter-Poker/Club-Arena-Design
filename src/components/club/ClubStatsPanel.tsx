/**
 * ClubStatsPanel - Displays Shark Club card with dynamic stat numbers
 * 
 * Uses shark-club-card.jpg as the base image and overlays stat numbers
 * using CSS positioning. NO blue label bar overlay allowed.
 */

import React from 'react';

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
        <div
            className="club-stats-panel-container"
            style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                display: 'block'
            }}
        >
            {/* Base Shark Club card image */}
            <img
                src={`${import.meta.env.BASE_URL}images/shark-club-card.jpg`}
                alt="Shark Club"
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'block',
                    objectFit: 'contain'
                }}
            />

            {/* Stat number overlays - positioned absolutely */}
            <div
                className="stat-numbers-overlay"
                style={{
                    position: 'absolute',
                    inset: 0,
                    pointerEvents: 'none'
                }}
            >
                {/* Total Members - left box */}
                <div
                    style={{
                        position: 'absolute',
                        left: '13.5%',
                        bottom: '7.5%',
                        width: '20%',
                        textAlign: 'center',
                        fontFamily: "'Arial Black', 'Helvetica Neue', Impact, sans-serif",
                        fontWeight: 'bold',
                        fontSize: '3.2vw',
                        color: '#FFFFFF',
                        textShadow: '0 0 10px rgba(0, 200, 255, 0.6)'
                    }}
                >
                    {totalMembers.toLocaleString()}
                </div>

                {/* Club Level - center box */}
                <div
                    style={{
                        position: 'absolute',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        bottom: '7.5%',
                        width: '20%',
                        textAlign: 'center',
                        fontFamily: "'Arial Black', 'Helvetica Neue', Impact, sans-serif",
                        fontWeight: 'bold',
                        fontSize: '3.2vw',
                        color: '#FFFFFF',
                        textShadow: '0 0 10px rgba(0, 200, 255, 0.6)'
                    }}
                >
                    {clubLevel}
                </div>

                {/* Active Players - right box */}
                <div
                    style={{
                        position: 'absolute',
                        right: '13.5%',
                        bottom: '7.5%',
                        width: '20%',
                        textAlign: 'center',
                        fontFamily: "'Arial Black', 'Helvetica Neue', Impact, sans-serif",
                        fontWeight: 'bold',
                        fontSize: '3.2vw',
                        color: '#FFFFFF',
                        textShadow: '0 0 10px rgba(0, 200, 255, 0.6)'
                    }}
                >
                    {activePlayers.toLocaleString()}
                </div>
            </div>
        </div>
    );
};

export default ClubStatsPanel;

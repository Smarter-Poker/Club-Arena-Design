/**
 * ClubStatsPanel - Inline SVG with dynamic text elements
 * 
 * This component renders an inline SVG stats panel with an opaque background
 * that covers the original card's baked-in stats. The text elements are
 * dynamically updated via React props.
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
        <svg
            width="100%"
            viewBox="0 0 340 120"
            xmlns="http://www.w3.org/2000/svg"
            style={{ maxWidth: '100%', display: 'block' }}
        >
            <defs>
                <filter id="stat-glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                    <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
                <linearGradient id="stats-bg" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style={{ stopColor: '#1a2530', stopOpacity: 1 }} />
                    <stop offset="50%" style={{ stopColor: '#0c1218', stopOpacity: 1 }} />
                    <stop offset="100%" style={{ stopColor: '#1a2530', stopOpacity: 1 }} />
                </linearGradient>
            </defs>

            {/* OPAQUE background to cover the original card's baked-in stats */}
            <rect x="0" y="0" width="340" height="120" fill="url(#stats-bg)" />

            {/* Outer frame border */}
            <rect x="2" y="2" width="336" height="116" fill="none" stroke="#2c3d4f" strokeWidth="2" rx="4" />
            <rect x="5" y="5" width="330" height="110" fill="none" stroke="#1e2933" strokeWidth="1" rx="3" />

            {/* Total Members - Left Column */}
            <rect x="15" y="15" width="95" height="90" rx="3" fill="#0a0f14" stroke="#00d4ff" strokeWidth="1" opacity="0.7" />
            <text x="62" y="38" textAnchor="middle" fill="#7cb3c0" fontSize="10" fontFamily="Arial, sans-serif" fontWeight="bold">
                TOTAL MEMBERS
            </text>
            <text
                x="62"
                y="72"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="24"
                fontFamily="Arial Black, sans-serif"
                fontWeight="bold"
                filter="url(#stat-glow)"
            >
                {totalMembers.toLocaleString()}
            </text>

            {/* Club Level - Center Column (prominent) */}
            <rect x="120" y="15" width="100" height="90" rx="3" fill="#0a0f14" stroke="#00d4ff" strokeWidth="1.5" opacity="0.8" />
            <text x="170" y="38" textAnchor="middle" fill="#7cb3c0" fontSize="10" fontFamily="Arial, sans-serif" fontWeight="bold">
                CLUB LEVEL
            </text>
            <text
                x="170"
                y="78"
                textAnchor="middle"
                fill="#00d4ff"
                fontSize="36"
                fontFamily="Arial Black, sans-serif"
                fontWeight="bold"
                filter="url(#stat-glow)"
            >
                {clubLevel}
            </text>

            {/* Active Players - Right Column */}
            <rect x="230" y="15" width="95" height="90" rx="3" fill="#0a0f14" stroke="#00d4ff" strokeWidth="1" opacity="0.7" />
            <text x="277" y="38" textAnchor="middle" fill="#7cb3c0" fontSize="10" fontFamily="Arial, sans-serif" fontWeight="bold">
                ACTIVE PLAYERS
            </text>
            <text
                x="277"
                y="72"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="24"
                fontFamily="Arial Black, sans-serif"
                fontWeight="bold"
                filter="url(#stat-glow)"
            >
                {activePlayers.toLocaleString()}
            </text>
        </svg>
    );
};

export default ClubStatsPanel;

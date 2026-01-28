/**
 * ClubStatsPanel - SVG-based stats display with dynamic values
 * 
 * This component uses the user's exact SVG design with text elements
 * that can be dynamically updated with real club data.
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
            height="auto"
            viewBox="0 0 600 180"
            xmlns="http://www.w3.org/2000/svg"
            style={{ maxWidth: '600px' }}
        >
            <defs>
                <filter id="blue-glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                    <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
                <linearGradient id="metal-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style={{ stopColor: '#2a3b4c', stopOpacity: 1 }} />
                    <stop offset="50%" style={{ stopColor: '#111820', stopOpacity: 1 }} />
                    <stop offset="100%" style={{ stopColor: '#2a3b4c', stopOpacity: 1 }} />
                </linearGradient>
            </defs>

            {/* Metal frame background */}
            <path
                d="M 20 20 L 580 20 L 590 30 L 590 150 L 580 160 L 20 160 L 10 150 L 10 30 Z"
                fill="url(#metal-gradient)"
                stroke="#3a4b5c"
                strokeWidth="3"
            />

            {/* Corner bolts */}
            <circle cx="20" cy="30" r="4" fill="#1a1a1a" stroke="#555" strokeWidth="2" />
            <circle cx="580" cy="30" r="4" fill="#1a1a1a" stroke="#555" strokeWidth="2" />
            <circle cx="20" cy="150" r="4" fill="#1a1a1a" stroke="#555" strokeWidth="2" />
            <circle cx="580" cy="150" r="4" fill="#1a1a1a" stroke="#555" strokeWidth="2" />

            {/* Total Members Box */}
            <rect x="50" y="80" width="140" height="50" rx="2" fill="#0d1116" stroke="#00d4ff" strokeWidth="1" opacity="0.6" />
            <text x="120" y="65" fontFamily="Roboto, sans-serif" fontSize="12" fill="#00d4ff" textAnchor="middle" fontWeight="bold" letterSpacing="1">
                TOTAL MEMBERS
            </text>
            <text x="120" y="118" fontFamily="Roboto, sans-serif" fontSize="28" fill="#ffffff" textAnchor="middle" fontWeight="bold" filter="url(#blue-glow)">
                {totalMembers.toLocaleString()}
            </text>

            {/* Club Level Box */}
            <rect x="230" y="75" width="140" height="60" rx="2" fill="#0d1116" stroke="#00d4ff" strokeWidth="1" opacity="0.6" />
            <text x="300" y="65" fontFamily="Roboto, sans-serif" fontSize="14" fill="#00d4ff" textAnchor="middle" fontWeight="bold" letterSpacing="1">
                CLUB LEVEL
            </text>
            <text x="300" y="122" fontFamily="Roboto, sans-serif" fontSize="54" fill="#e0ffff" textAnchor="middle" fontWeight="bold" filter="url(#blue-glow)">
                {clubLevel}
            </text>

            {/* Active Players Box */}
            <rect x="410" y="80" width="140" height="50" rx="2" fill="#0d1116" stroke="#00d4ff" strokeWidth="1" opacity="0.6" />
            <text x="480" y="65" fontFamily="Roboto, sans-serif" fontSize="12" fill="#00d4ff" textAnchor="middle" fontWeight="bold" letterSpacing="1">
                ACTIVE PLAYERS
            </text>
            <text x="480" y="118" fontFamily="Roboto, sans-serif" fontSize="28" fill="#ffffff" textAnchor="middle" fontWeight="bold" filter="url(#blue-glow)">
                {activePlayers.toLocaleString()}
            </text>
        </svg>
    );
};

export default ClubStatsPanel;

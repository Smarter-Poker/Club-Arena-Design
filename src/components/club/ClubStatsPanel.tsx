/**
 * ClubStatsPanel - Uses dangerouslySetInnerHTML for exact SVG template
 * 
 * This approach:
 * 1. Imports the VectorMagic SVG as raw text (Vite's ?raw suffix)
 * 2. Injects it directly into the DOM via dangerouslySetInnerHTML
 * 3. Updates the text elements by ID after render
 * 
 * Benefits:
 * - 100% exact look forever (no AI regeneration)
 * - Numbers update instantly from Supabase
 * - Scales perfectly on mobile/desktop
 * - Small file size, fast loading
 */

import React, { useRef, useEffect } from 'react';
// Import the SVG as raw text content
import clubStatsPanelSvgRaw from '../../assets/club-stats-panel.svg?raw';

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
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        // Find the SVG element inside the container
        const svg = containerRef.current.querySelector('svg');
        if (!svg) return;

        // Update total members
        const totalMembersEl = svg.getElementById('total-members');
        if (totalMembersEl) {
            totalMembersEl.textContent = totalMembers.toLocaleString();
        }

        // Update club level
        const clubLevelEl = svg.getElementById('club-level');
        if (clubLevelEl) {
            clubLevelEl.textContent = clubLevel.toString();
        }

        // Update active players
        const activePlayersEl = svg.getElementById('active-players');
        if (activePlayersEl) {
            activePlayersEl.textContent = activePlayers.toLocaleString();
        }
    }, [totalMembers, clubLevel, activePlayers]);

    return (
        <div
            ref={containerRef}
            style={{
                width: '100%',
                display: 'block',
                pointerEvents: 'none',
                position: 'relative'
            }}
        >
            {/* Inject the full VectorMagic SVG */}
            <div
                dangerouslySetInnerHTML={{ __html: clubStatsPanelSvgRaw }}
                style={{ display: 'block', width: '100%' }}
            />
            {/* Opaque background container to cover old baked-in static numbers */}
            <div
                style={{
                    position: 'absolute',
                    bottom: '2.5%',
                    left: '3%',
                    right: '3%',
                    height: '16%',
                    backgroundColor: '#0f151c',
                    border: '1px solid #3a4b5c',
                    borderRadius: '8px',
                    display: 'flex',
                    justifyContent: 'space-around',
                    alignItems: 'center',
                    padding: '8px 16px',
                    boxSizing: 'border-box',
                    zIndex: 10
                }}
            >
                {/* Total Members */}
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        color: '#FFFFFF',
                        fontSize: '24px',
                        fontWeight: 700,
                        fontFamily: 'Roboto, sans-serif',
                        textShadow: '0 0 8px rgba(0, 212, 255, 0.6)'
                    }}>
                        {totalMembers.toLocaleString()}
                    </div>
                    <div style={{
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontSize: '10px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '1px',
                        marginTop: '2px'
                    }}>
                        Total Members
                    </div>
                </div>
                {/* Club Level - Center focal point */}
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        color: '#E0FFFF',
                        fontSize: '42px',
                        fontWeight: 700,
                        fontFamily: 'Roboto, sans-serif',
                        textShadow: '0 0 15px rgba(0, 255, 170, 0.5)'
                    }}>
                        {clubLevel}
                    </div>
                    <div style={{
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontSize: '10px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '1px',
                        marginTop: '2px'
                    }}>
                        Club Level
                    </div>
                </div>
                {/* Active Players */}
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        color: '#FFFFFF',
                        fontSize: '24px',
                        fontWeight: 700,
                        fontFamily: 'Roboto, sans-serif',
                        textShadow: '0 0 8px rgba(0, 212, 255, 0.6)'
                    }}>
                        {activePlayers.toLocaleString()}
                    </div>
                    <div style={{
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontSize: '10px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '1px',
                        marginTop: '2px'
                    }}>
                        Active Players
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ClubStatsPanel;

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
// Import the SVG as raw text content - v2 cache bust
import clubStatsPanelSvgRaw from '../../assets/club-stats-panel.svg?raw&v=2';

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
            className="club-stats-panel-container"
            style={{
                width: '100%',
                height: '100%',
                display: 'block',
                pointerEvents: 'none',
                position: 'relative'
            }}
        >
            {/* Inject the full VectorMagic SVG - text elements updated dynamically via useEffect */}
            <div
                dangerouslySetInnerHTML={{ __html: clubStatsPanelSvgRaw }}
                style={{
                    display: 'block',
                    width: '100%',
                    height: '100%'
                }}
            />
            <style>{`
                .club-stats-panel-container svg {
                    width: 100% !important;
                    height: 100% !important;
                    display: block;
                    overflow: hidden;
                }
            `}</style>
        </div>
    );
};

export default ClubStatsPanel;

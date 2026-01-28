/**
 * ClubStatsPanel - Uses the VectorMagic SVG with <object> embedding
 * 
 * This component embeds the user's exact SVG design using the <object> tag
 * and updates the text elements (with IDs) via JavaScript after the SVG loads.
 * 
 * The SVG file must have these text elements with IDs:
 * - total-members
 * - club-level
 * - active-players
 */

import React, { useRef, useEffect } from 'react';

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
    const objectRef = useRef<HTMLObjectElement>(null);

    useEffect(() => {
        const updateSvgText = () => {
            if (!objectRef.current) return;

            try {
                const svgDoc = objectRef.current.getSVGDocument?.();
                if (!svgDoc) return;

                // Update total members
                const totalMembersEl = svgDoc.getElementById('total-members');
                if (totalMembersEl) {
                    totalMembersEl.textContent = totalMembers.toLocaleString();
                }

                // Update club level
                const clubLevelEl = svgDoc.getElementById('club-level');
                if (clubLevelEl) {
                    clubLevelEl.textContent = clubLevel.toString();
                }

                // Update active players
                const activePlayersEl = svgDoc.getElementById('active-players');
                if (activePlayersEl) {
                    activePlayersEl.textContent = activePlayers.toLocaleString();
                }
            } catch (error) {
                console.warn('Could not update SVG text elements:', error);
            }
        };

        // Add load event listener
        const objectEl = objectRef.current;
        if (objectEl) {
            objectEl.addEventListener('load', updateSvgText);
            // Also try to update immediately in case it's already loaded
            updateSvgText();
        }

        return () => {
            if (objectEl) {
                objectEl.removeEventListener('load', updateSvgText);
            }
        };
    }, [totalMembers, clubLevel, activePlayers]);

    return (
        <object
            ref={objectRef}
            type="image/svg+xml"
            data="/shark-card.svg"
            style={{
                width: '100%',
                height: 'auto',
                display: 'block',
                pointerEvents: 'none'
            }}
            aria-label="Club Stats Panel"
        >
            {/* Fallback if SVG doesn't load */}
            <div style={{ padding: '10px', textAlign: 'center', color: '#fff' }}>
                <p>Members: {totalMembers.toLocaleString()}</p>
                <p>Level: {clubLevel}</p>
                <p>Active: {activePlayers.toLocaleString()}</p>
            </div>
        </object>
    );
};

export default ClubStatsPanel;

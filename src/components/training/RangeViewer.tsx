import React, { useState } from 'react';
import './RangeViewer.css';

interface RangeViewerProps {
    range: Record<string, number>;
    title?: string;
    onCellClick?: (hand: string) => void;
}

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

export const RangeViewer: React.FC<RangeViewerProps> = ({
    range,
    title = 'Range',
    onCellClick
}) => {
    const [hoveredHand, setHoveredHand] = useState<string | null>(null);

    const getHand = (row: number, col: number): string => {
        if (row === col) {
            return `${RANKS[row]}${RANKS[col]}`;
        } else if (row < col) {
            return `${RANKS[row]}${RANKS[col]}s`;
        } else {
            return `${RANKS[col]}${RANKS[row]}o`;
        }
    };

    const getIntensity = (freq: number): number => {
        if (freq === 0) return 0;
        if (freq <= 25) return 1;
        if (freq <= 50) return 2;
        if (freq <= 75) return 3;
        return 4;
    };

    const renderCell = (row: number, col: number) => {
        const hand = getHand(row, col);
        const freq = range[hand] || 0;
        const intensity = getIntensity(freq);
        const isPocket = row === col;
        const isSuited = row < col;

        return (
            <div
                key={hand}
                className={`range-cell intensity-${intensity} ${isPocket ? 'pocket' : ''} ${isSuited ? 'suited' : 'offsuit'}`}
                onMouseEnter={() => setHoveredHand(hand)}
                onMouseLeave={() => setHoveredHand(null)}
                onClick={() => onCellClick?.(hand)}
            >
                <span className="hand-label">{hand}</span>
                {hoveredHand === hand && freq > 0 && (
                    <span className="freq-tooltip">{freq}%</span>
                )}
            </div>
        );
    };

    return (
        <div className="range-viewer">
            {title && <h3 className="range-title">{title}</h3>}

            <div className="range-grid">
                {RANKS.map((_, row) => (
                    <div key={row} className="range-row">
                        {RANKS.map((_, col) => renderCell(row, col))}
                    </div>
                ))}
            </div>

            <div className="range-legend">
                <span>0%</span>
                <div className="legend-gradient"></div>
                <span>100%</span>
            </div>
        </div>
    );
};

export default RangeViewer;

import React from 'react';
import './ChipChange.css';

interface ChipChangeProps {
    change: number;
    showIcon?: boolean;
}

export const ChipChange: React.FC<ChipChangeProps> = ({
    change,
    showIcon = true
}) => {
    const isPositive = change > 0;
    const formatted = isPositive ? `+${change.toLocaleString()}` : change.toLocaleString();

    return (
        <span className={`chip-change ${isPositive ? 'positive' : 'negative'}`}>
            {showIcon && <span className="change-icon">{isPositive ? '▲' : '▼'}</span>}
            {formatted}
        </span>
    );
};

export default ChipChange;

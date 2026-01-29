import React from 'react';
import './ChipStack.css';

interface ChipStackProps {
    amount: number;
    size?: 'small' | 'medium' | 'large';
    animated?: boolean;
}

const formatChips = (amount: number): string => {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
    return amount.toLocaleString();
};

export const ChipStack: React.FC<ChipStackProps> = ({
    amount,
    size = 'medium',
    animated = false
}) => {
    return (
        <div className={`chip-stack size-${size} ${animated ? 'animated' : ''}`}>
            <span className="chip-icon"></span>
            <span className="chip-amount">{formatChips(amount)}</span>
        </div>
    );
};

export default ChipStack;

import React from 'react';
import './ChipStack.css';

interface ChipStackProps {
  amount: number;
  size?: 'small' | 'medium' | 'large';
  animated?: boolean;
}

const formatChips = (amount: number): string => {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const ChipStack: React.FC<ChipStackProps> = ({
  amount,
  size = 'medium',
  animated = false,
}) => {
  return (
    <div className={`chip-stack size-${size} ${animated ? 'animated' : ''}`}>
      <span className="chip-icon">◉</span>
      <span className="chip-amount">{formatChips(amount)}</span>
    </div>
  );
};

export default ChipStack;

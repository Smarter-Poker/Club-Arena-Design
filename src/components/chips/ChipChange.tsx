import React from 'react';
import './ChipChange.css';

interface ChipChangeProps {
  change: number;
  showIcon?: boolean;
}

export const ChipChange: React.FC<ChipChangeProps> = ({ change, showIcon = true }) => {
  const isPositive = change > 0;
  const fmt = (v: number) =>
    v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatted = isPositive ? `+${fmt(change)}` : fmt(change);

  return (
    <span className={`chip-change ${isPositive ? 'positive' : 'negative'}`}>
      {showIcon && <span className="change-icon">{isPositive ? '▲' : '▼'}</span>}
      {formatted}
    </span>
  );
};

export default ChipChange;

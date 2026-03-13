import React from 'react';
import './ChipDenominations.css';

interface Denomination {
  value: number;
  color: string;
  count: number;
}

interface ChipDenominationsProps {
  denominations: Denomination[];
  totalValue: number;
  onDenominationClick?: (value: number) => void;
}

export const ChipDenominations: React.FC<ChipDenominationsProps> = ({
  denominations,
  totalValue,
  onDenominationClick,
}) => {
  return (
    <div className="chip-denominations">
      <div className="denom-header">
        <h4>Chip Stack</h4>
        <span className="total-value">{totalValue.toLocaleString()}</span>
      </div>

      <div className="denom-grid">
        {denominations.map((denom) => (
          <div
            key={denom.value}
            className="denom-item"
            onClick={() => onDenominationClick?.(denom.value)}
          >
            <div className="chip-icon" style={{ backgroundColor: denom.color }}>
              <span className="chip-value">
                {denom.value.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
            <span className="chip-count">×{denom.count}</span>
            <span className="chip-subtotal">{(denom.value * denom.count).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ChipDenominations;

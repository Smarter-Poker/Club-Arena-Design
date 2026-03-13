/**
 * ♠ CLUB ARENA — Chip Animation Effects
 * Animated chip pile and bet animations
 */

import React, { useState, useEffect, useRef } from 'react';
import './ChipAnimation.css';

interface ChipAnimationProps {
  amount: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  onComplete?: () => void;
  type: 'bet' | 'win' | 'push';
}

export const ChipAnimation: React.FC<ChipAnimationProps> = ({
  amount,
  from,
  to,
  onComplete,
  type,
}) => {
  const [isAnimating, setIsAnimating] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setIsAnimating(false);
      onComplete?.();
    }, 800);
    return () => clearTimeout(timeout);
  }, [onComplete]);

  if (!isAnimating) return null;

  const chipCount = Math.min(Math.ceil(amount / 100), 5);
  const chips = Array.from({ length: chipCount }, (_, i) => i);

  return (
    <div
      className={`chip-animation ${type}`}
      style={
        {
          '--from-x': `${from.x}px`,
          '--from-y': `${from.y}px`,
          '--to-x': `${to.x}px`,
          '--to-y': `${to.y}px`,
        } as React.CSSProperties
      }
    >
      {chips.map((_, i) => (
        <div
          key={i}
          className="animated-chip"
          style={
            {
              animationDelay: `${i * 50}ms`,
              '--offset': `${(i - chipCount / 2) * 4}px`,
            } as React.CSSProperties
          }
        >
          <div className="chip-face">
            <span className="chip-value">{getChipValue(amount, i)}</span>
          </div>
        </div>
      ))}
      <span className="amount-label">{formatAmount(amount)}</span>
    </div>
  );
};

const getChipValue = (amount: number, index: number): string => {
  const values = ['1', '5', '25', '100', '500'];
  return values[Math.min(index, values.length - 1)];
};

const formatAmount = (amount: number): string => {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Chip Pile Component (static)
interface ChipPileProps {
  amount: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export const ChipPile: React.FC<ChipPileProps> = ({ amount, size = 'md', showLabel = true }) => {
  const chipCount = Math.min(Math.ceil(amount / 50), 8);
  const chips = Array.from({ length: chipCount }, (_, i) => i);

  const getChipColor = (index: number): string => {
    const colors = ['#e74c3c', '#2ecc71', '#3498db', '#f1c40f', '#9b59b6'];
    return colors[index % colors.length];
  };

  return (
    <div className={`chip-pile ${size}`}>
      <div className="pile-stack">
        {chips.map((_, i) => (
          <div
            key={i}
            className="pile-chip"
            style={{
              backgroundColor: getChipColor(i),
              transform: `translateY(${-i * 3}px)`,
              zIndex: i,
            }}
          />
        ))}
      </div>
      {showLabel && <span className="pile-amount">{formatAmount(amount)}</span>}
    </div>
  );
};

// Pot Animation for collecting
interface PotAnimationProps {
  chips: { amount: number; from: { x: number; y: number } }[];
  potCenter: { x: number; y: number };
  onComplete?: () => void;
}

export const PotAnimation: React.FC<PotAnimationProps> = ({ chips, potCenter, onComplete }) => {
  useEffect(() => {
    const maxDelay = chips.length * 100 + 600;
    const timeout = setTimeout(() => onComplete?.(), maxDelay);
    return () => clearTimeout(timeout);
  }, [chips, onComplete]);

  return (
    <>
      {chips.map((chip, i) => (
        <ChipAnimation key={i} amount={chip.amount} from={chip.from} to={potCenter} type="bet" />
      ))}
    </>
  );
};

export default ChipAnimation;

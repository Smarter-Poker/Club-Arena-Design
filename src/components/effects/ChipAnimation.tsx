import React from 'react';
import './ChipAnimation.css';

interface ChipAnimationProps {
  chips: number;
  fromPosition: { x: number; y: number };
  toPosition: { x: number; y: number };
  onComplete?: () => void;
}

export const ChipAnimation: React.FC<ChipAnimationProps> = ({
  chips,
  fromPosition,
  toPosition,
  onComplete,
}) => {
  const chipCount = Math.min(Math.ceil(chips / 500), 8);

  const chipElements = Array.from({ length: chipCount }, (_, i) => ({
    id: i,
    delay: i * 0.05,
    offset: { x: (Math.random() - 0.5) * 20, y: (Math.random() - 0.5) * 10 },
  }));

  React.useEffect(() => {
    const timer = setTimeout(() => {
      onComplete?.();
    }, 800);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="chip-animation">
      {chipElements.map((chip) => (
        <div
          key={chip.id}
          className="flying-chip"
          style={
            {
              '--from-x': `${fromPosition.x + chip.offset.x}px`,
              '--from-y': `${fromPosition.y + chip.offset.y}px`,
              '--to-x': `${toPosition.x}px`,
              '--to-y': `${toPosition.y}px`,
              animationDelay: `${chip.delay}s`,
            } as React.CSSProperties
          }
        >
          <div className="chip-stack">
            <div className="chip chip-red"></div>
            <div className="chip chip-green"></div>
            <div className="chip chip-black"></div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ChipAnimation;

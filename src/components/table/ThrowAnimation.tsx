/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  THROW ANIMATION — Animated Throwable Display
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Renders throwable animation from sender → target seat:
 * - Arc trajectory for throws
 * - Float animation for reactions
 * - Impact effect at target
 * - Custom SVG graphics (no emojis!)
 */

import React, { useEffect, useState, useCallback } from 'react';
import { ThrowEvent } from '../../services/ThrowableService';
import { THROWABLE_ICONS } from './ThrowableIcons';
import './ThrowAnimation.css';

interface ThrowAnimationProps {
  event: ThrowEvent;
  seatPositions: Map<number, { x: number; y: number }>;
  onComplete: () => void;
}

export function ThrowAnimation({ event, seatPositions, onComplete }: ThrowAnimationProps) {
  const [phase, setPhase] = useState<'throw' | 'impact' | 'done'>('throw');

  const fromPos = seatPositions.get(event.fromSeat);
  const toPos = seatPositions.get(event.toSeat);

  useEffect(() => {
    // Throw phase: 600ms
    const throwTimer = setTimeout(() => {
      setPhase('impact');
    }, 600);

    // Impact phase: 800ms
    const impactTimer = setTimeout(() => {
      setPhase('done');
      onComplete();
    }, 1400);

    return () => {
      clearTimeout(throwTimer);
      clearTimeout(impactTimer);
    };
  }, [onComplete]);

  if (!fromPos || !toPos || phase === 'done') {
    return null;
  }

  const isReaction = event.throwable.category === 'reactions';

  // Get SVG icon component
  const IconComponent = THROWABLE_ICONS[event.throwable.id];
  const renderIcon = (size: number) => {
    if (IconComponent) {
      return <IconComponent size={size} />;
    }
    return <span className="throw-animation__fallback">?</span>;
  };

  return (
    <div className="throw-animation">
      {/* Throwing Object */}
      {phase === 'throw' && (
        <div
          className={`throw-animation__projectile ${isReaction ? 'throw-animation__projectile--float' : 'throw-animation__projectile--arc'}`}
          style={
            {
              '--from-x': `${fromPos.x}px`,
              '--from-y': `${fromPos.y}px`,
              '--to-x': `${toPos.x}px`,
              '--to-y': `${toPos.y}px`,
            } as React.CSSProperties
          }
        >
          <div className="throw-animation__icon">{renderIcon(48)}</div>
        </div>
      )}

      {/* Impact Effect */}
      {phase === 'impact' && (
        <div
          className="throw-animation__impact"
          style={{
            left: toPos.x,
            top: toPos.y,
          }}
        >
          <div className="throw-animation__impact-icon">{renderIcon(64)}</div>
          <div className="throw-animation__burst" />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTAINER — Manages Multiple Active Throws
// ═══════════════════════════════════════════════════════════════════════════════

interface ThrowAnimationContainerProps {
  events: ThrowEvent[];
  seatPositions: Map<number, { x: number; y: number }>;
  onEventComplete: (eventId: string) => void;
}

export function ThrowAnimationContainer({
  events,
  seatPositions,
  onEventComplete,
}: ThrowAnimationContainerProps) {
  const handleComplete = useCallback(
    (eventId: string) => {
      onEventComplete(eventId);
    },
    [onEventComplete]
  );

  return (
    <div className="throw-animation-container">
      {events.map((event) => (
        <ThrowAnimation
          key={event.id}
          event={event}
          seatPositions={seatPositions}
          onComplete={() => handleComplete(event.id)}
        />
      ))}
    </div>
  );
}

export default ThrowAnimation;

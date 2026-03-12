import React, { useState, useEffect, useRef } from 'react';
import './MiniTable.css';

interface PlayerPosition {
  seat: number;
  name: string;
  stack: number;
  isHero?: boolean;
  isActive?: boolean;
}

interface MiniTableProps {
  tableId: string;
  tableName: string;
  pot: number;
  communityCards?: string[];
  heroCards?: string[];
  players: PlayerPosition[];
  isYourTurn?: boolean;
  timeRemaining?: number;
  totalTime?: number;
  stakes?: string;
  onClick?: () => void;
}

// Animated counter for pot display
function useAnimatedValue(target: number): number {
  const [val, setVal] = useState(target);
  const rafRef = useRef<number>(0);
  const startRef = useRef(target);

  useEffect(() => {
    const start = startRef.current;
    const diff = target - start;
    if (diff === 0) return;
    const startTime = performance.now();
    const duration = 300;

    const tick = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(start + diff * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else startRef.current = target;
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target]);

  return val;
}

export const MiniTable: React.FC<MiniTableProps> = ({
  tableId,
  tableName,
  pot,
  communityCards = [],
  heroCards = [],
  players,
  isYourTurn,
  timeRemaining,
  totalTime = 30,
  stakes,
  onClick,
}) => {
  const animatedPot = useAnimatedValue(pot);

  // Timer arc progress
  const timerProgress =
    isYourTurn && timeRemaining != null && totalTime > 0 ? (timeRemaining / totalTime) * 100 : 0;

  // Simplified seat positions for mini view
  const getSeatStyle = (seat: number): React.CSSProperties => {
    const positions: Record<number, { top: string; left: string }> = {
      0: { top: '75%', left: '50%' },
      1: { top: '65%', left: '15%' },
      2: { top: '35%', left: '5%' },
      3: { top: '10%', left: '20%' },
      4: { top: '5%', left: '50%' },
      5: { top: '10%', left: '80%' },
      6: { top: '35%', left: '95%' },
      7: { top: '65%', left: '85%' },
      8: { top: '85%', left: '70%' },
    };
    return {
      top: positions[seat]?.top || '50%',
      left: positions[seat]?.left || '50%',
      transform: 'translate(-50%, -50%)',
    };
  };

  return (
    <div
      className={`mini-table ${isYourTurn ? 'your-turn' : ''}`}
      onClick={onClick}
      style={{ '--timer-progress': `${timerProgress}%` } as React.CSSProperties}
    >
      <div className="mini-table-felt">
        {/* Players */}
        {players.map((player) => (
          <div
            key={player.seat}
            className={`mini-player ${player.isHero ? 'hero' : ''} ${player.isActive ? 'active' : ''}`}
            style={getSeatStyle(player.seat)}
          >
            <div className="mini-avatar">{player.name[0]}</div>
          </div>
        ))}

        {/* Community cards */}
        {communityCards.length > 0 && (
          <div className="mini-board">
            {communityCards.map((card, i) => (
              <div key={i} className="mini-card">
                {card}
              </div>
            ))}
          </div>
        )}

        {/* Hero hole cards */}
        {heroCards.length > 0 && (
          <div className="mini-hero-cards">
            {heroCards.map((card, i) => (
              <div key={i} className="mini-hero-card">
                {card}
              </div>
            ))}
          </div>
        )}

        {/* Pot */}
        <div className="mini-pot">{animatedPot.toLocaleString()}</div>
      </div>

      <div className="mini-table-footer">
        <span className="mini-table-name">{tableName}</span>
        {stakes && <span className="mini-table-stakes">{stakes}</span>}
      </div>

      {isYourTurn && <div className="mini-turn-badge">!</div>}
    </div>
  );
};

export default MiniTable;

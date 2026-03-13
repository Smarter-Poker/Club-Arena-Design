/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  LEVEL BADGE — Circular level indicator with tier-colored border
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useMemo } from 'react';
import { xpService } from '../../services/XPService';
import './LevelBadge.css';

interface LevelBadgeProps {
  xp: number;
  size?: 'sm' | 'md' | 'lg';
  animate?: boolean;
}

export default function LevelBadge({ xp, size = 'md', animate = false }: LevelBadgeProps) {
  const level = useMemo(() => xpService.getLevel(xp), [xp]);
  const tier = useMemo(() => xpService.getLevelTier(level), [level]);

  return (
    <div
      className={`lvl-badge lvl-${size} ${animate ? 'lvl-animate' : ''}`}
      style={
        {
          '--tier-color': tier.color,
          '--tier-glow': tier.glow,
        } as React.CSSProperties
      }
      title={`Level ${level} (${tier.name})`}
    >
      <span className="lvl-number">{level}</span>
    </div>
  );
}

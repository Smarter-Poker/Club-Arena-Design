/**
 * PositionWinRates — Visual breakdown of player performance by table position
 * Shows VPIP, PFR, and win rate for each position
 */

import React, { useState, useEffect } from 'react';
import './PositionWinRates.css';

interface PositionStats {
  position: string;
  positionLabel: string;
  handsPlayed: number;
  vpip: number;
  pfr: number;
  winRate: number; // bb/100
  totalProfit: number;
}

const POSITION_STATS: PositionStats[] = [
  {
    position: 'UTG',
    positionLabel: 'Under The Gun',
    handsPlayed: 245,
    vpip: 12.5,
    pfr: 9.8,
    winRate: 2.4,
    totalProfit: 580,
  },
  {
    position: 'UTG+1',
    positionLabel: 'UTG+1',
    handsPlayed: 238,
    vpip: 13.2,
    pfr: 10.5,
    winRate: 2.8,
    totalProfit: 640,
  },
  {
    position: 'MP',
    positionLabel: 'Middle Position',
    handsPlayed: 312,
    vpip: 18.5,
    pfr: 14.2,
    winRate: 3.2,
    totalProfit: 980,
  },
  {
    position: 'CO',
    positionLabel: 'Cutoff',
    handsPlayed: 418,
    vpip: 24.8,
    pfr: 19.5,
    winRate: 4.1,
    totalProfit: 1720,
  },
  {
    position: 'BTN',
    positionLabel: 'Button',
    handsPlayed: 465,
    vpip: 32.5,
    pfr: 26.8,
    winRate: 5.2,
    totalProfit: 2420,
  },
  {
    position: 'SB',
    positionLabel: 'Small Blind',
    handsPlayed: 388,
    vpip: 28.2,
    pfr: 21.3,
    winRate: 1.8,
    totalProfit: 700,
  },
  {
    position: 'BB',
    positionLabel: 'Big Blind',
    handsPlayed: 412,
    vpip: 25.5,
    pfr: 8.5,
    winRate: 0.9,
    totalProfit: 370,
  },
];

const PositionWinRates: React.FC = () => {
  const [visiblePositions, setVisiblePositions] = useState<Set<number>>(new Set());
  const [hoveredPosition, setHoveredPosition] = useState<number | null>(null);

  useEffect(() => {
    POSITION_STATS.forEach((_, i) => {
      setTimeout(() => {
        setVisiblePositions(prev => new Set([...prev, i]));
      }, i * 80);
    });
  }, []);

  // Find best and worst positions
  const bestPosition = POSITION_STATS.reduce((best, current) =>
    current.winRate > best.winRate ? current : best
  );
  const worstPosition = POSITION_STATS.reduce((worst, current) =>
    current.winRate < worst.winRate ? current : worst
  );

  const getTrendArrow = (value: number) => {
    if (value > 3) return '↑ Exceptional';
    if (value > 1.5) return '↑ Strong';
    if (value > 0) return '→ Neutral';
    return '↓ Leak';
  };

  const getPositionColor = (winRate: number) => {
    if (winRate > 4) return 'var(--accent-green)';
    if (winRate > 2) return 'var(--accent-cyan)';
    if (winRate > 0) return 'var(--accent-orange)';
    return 'var(--accent-red)';
  };

  return (
    <div className="position-win-rates">
      <div className="position-header">
        <h3>Win Rate by Position</h3>
        <p className="position-subtitle">
          Position profitability at {POSITION_STATS.reduce((sum, p) => sum + p.handsPlayed, 0).toLocaleString()} hands
        </p>
      </div>

      {/* Circular table diagram */}
      <div className="position-table-diagram">
        <svg width="100%" height="350" viewBox="0 0 400 350" className="position-svg">
          {/* Table ellipse */}
          <ellipse cx="200" cy="160" rx="120" ry="100" fill="none" stroke="rgba(0, 212, 255, 0.15)" strokeWidth="2" />

          {/* Position markers on circle - arranged like poker table */}
          {POSITION_STATS.map((pos, i) => {
            const angleStep = (2 * Math.PI) / POSITION_STATS.length;
            const angle = i * angleStep - Math.PI / 2; // Start from top
            const radius = 130;
            const x = 200 + radius * Math.cos(angle);
            const y = 160 + radius * Math.sin(angle);

            const isVisible = visiblePositions.has(i);
            const isHovered = hoveredPosition === i;

            return (
              <g key={i}>
                {/* Position circle background */}
                <circle
                  cx={x}
                  cy={y}
                  r="45"
                  fill={getPositionColor(pos.winRate)}
                  fillOpacity={isHovered ? 0.25 : 0.1}
                  stroke={getPositionColor(pos.winRate)}
                  strokeWidth={isHovered ? 2 : 1}
                  className="position-circle"
                  style={{
                    opacity: isVisible ? 1 : 0,
                    transform: isVisible ? 'scale(1)' : 'scale(0.8)',
                    transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                  }}
                  onMouseEnter={() => setHoveredPosition(i)}
                  onMouseLeave={() => setHoveredPosition(null)}
                />

                {/* Position label */}
                <text
                  x={x}
                  y={y - 12}
                  textAnchor="middle"
                  className="position-label"
                  fill={getPositionColor(pos.winRate)}
                  style={{
                    opacity: isVisible ? 1 : 0,
                    transition: 'opacity 0.3s ease-out',
                    fontSize: isHovered ? '15px' : '13px',
                    fontWeight: isHovered ? 700 : 600,
                  }}
                >
                  {pos.position}
                </text>

                {/* Win rate value */}
                <text
                  x={x}
                  y={y + 8}
                  textAnchor="middle"
                  className="position-winrate"
                  fill={getPositionColor(pos.winRate)}
                  style={{
                    opacity: isVisible ? 1 : 0,
                    transition: 'opacity 0.3s ease-out',
                    fontSize: '14px',
                    fontWeight: 700,
                  }}
                >
                  {pos.winRate.toFixed(2)}
                </text>

                {/* Hover tooltip background */}
                {isHovered && (
                  <g>
                    <rect
                      x={x - 55}
                      y={y - 75}
                      width="110"
                      height="120"
                      rx="8"
                      fill="rgba(10, 10, 20, 0.95)"
                      stroke={getPositionColor(pos.winRate)}
                      strokeWidth="1.5"
                    />
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {/* Tooltip overlay */}
        {hoveredPosition !== null && (
          <div className="position-tooltip" style={{ display: 'block' }}>
            <div className="tooltip-content">
              <h4>{POSITION_STATS[hoveredPosition].positionLabel}</h4>
              <div className="tooltip-stat">
                <span>Hands:</span>
                <span>{POSITION_STATS[hoveredPosition].handsPlayed}</span>
              </div>
              <div className="tooltip-stat">
                <span>VPIP:</span>
                <span>{POSITION_STATS[hoveredPosition].vpip.toFixed(1)}%</span>
              </div>
              <div className="tooltip-stat">
                <span>PFR:</span>
                <span>{POSITION_STATS[hoveredPosition].pfr.toFixed(1)}%</span>
              </div>
              <div className="tooltip-stat">
                <span>Win Rate:</span>
                <span style={{ color: getPositionColor(POSITION_STATS[hoveredPosition].winRate) }}>
                  {POSITION_STATS[hoveredPosition].winRate.toFixed(2)} bb/100
                </span>
              </div>
              <div className="tooltip-stat total">
                <span>Total Profit:</span>
                <span style={{ color: getPositionColor(POSITION_STATS[hoveredPosition].winRate) }}>
                  {POSITION_STATS[hoveredPosition].totalProfit > 0 ? '+' : ''}
                  {POSITION_STATS[hoveredPosition].totalProfit}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Position callouts */}
      <div className="position-callouts">
        <div className="callout strongest">
          <span className="callout-icon">▲</span>
          <div className="callout-text">
            <span className="callout-label">Strongest Position</span>
            <span className="callout-value">{bestPosition.position}</span>
            <span className="callout-detail">{bestPosition.winRate.toFixed(2)} bb/100</span>
          </div>
        </div>
        <div className="callout weakest">
          <span className="callout-icon">▼</span>
          <div className="callout-text">
            <span className="callout-label">Weakest Position</span>
            <span className="callout-value">{worstPosition.position}</span>
            <span className="callout-detail">{worstPosition.winRate.toFixed(2)} bb/100</span>
          </div>
        </div>
      </div>

      {/* Detailed stats grid */}
      <div className="position-stats-grid">
        {POSITION_STATS.map((pos, i) => {
          const isVisible = visiblePositions.has(i);
          return (
            <div
              key={i}
              className="position-stat-card"
              style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateY(0)' : 'translateY(8px)',
                transition: `all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) ${i * 30}ms`,
              }}
            >
              <div className="card-header">
                <span className="position-name">{pos.position}</span>
                <span className="win-rate-badge" style={{ color: getPositionColor(pos.winRate) }}>
                  {pos.winRate > 0 ? '+' : ''}{pos.winRate.toFixed(2)}
                </span>
              </div>
              <div className="card-stats">
                <div className="stat">
                  <span className="stat-key">Hands</span>
                  <span className="stat-val">{pos.handsPlayed}</span>
                </div>
                <div className="stat">
                  <span className="stat-key">VPIP</span>
                  <span className="stat-val">{pos.vpip.toFixed(1)}%</span>
                </div>
                <div className="stat">
                  <span className="stat-key">PFR</span>
                  <span className="stat-val">{pos.pfr.toFixed(1)}%</span>
                </div>
              </div>
              <div className="card-progress">
                <div className="progress-bar" style={{
                  width: `${(pos.winRate / 5.5) * 100}%`,
                  backgroundColor: getPositionColor(pos.winRate),
                }} />
              </div>
              <div className="card-trend">
                <span>{getTrendArrow(pos.winRate)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PositionWinRates;

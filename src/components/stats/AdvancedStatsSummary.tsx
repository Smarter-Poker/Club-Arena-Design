/**
 * AdvancedStatsSummary — Dashboard of advanced poker statistics
 * Shows hourly rate, total hands, showdown win %, and other advanced metrics
 */

import React, { useState, useEffect } from 'react';
import './AdvancedStatsSummary.css';

interface AdvancedStat {
  id: string;
  label: string;
  value: number;
  format: (val: number) => string;
  trend: number; // percentage change vs previous period
  unit?: string;
  description: string;
}

const ADVANCED_STATS: AdvancedStat[] = [
  {
    id: 'hourly',
    label: 'Hourly Rate',
    value: 38.5,
    format: (val) => `$${val.toFixed(2)}`,
    trend: 12.3,
    unit: '/hr',
    description: 'Profit per hour played',
  },
  {
    id: 'totalHands',
    label: 'Total Hands',
    value: 2847,
    format: (val) => val.toLocaleString(),
    trend: 5.8,
    description: 'Total hands played across all sessions',
  },
  {
    id: 'showdownWin',
    label: 'Showdown Win %',
    value: 56.8,
    format: (val) => `${val.toFixed(1)}%`,
    trend: 3.2,
    description: 'Win percentage when reaching showdown',
  },
  {
    id: 'aggression',
    label: 'Aggression Factor',
    value: 2.85,
    format: (val) => val.toFixed(2),
    trend: 1.1,
    description: 'Ratio of aggressive actions to passive actions',
  },
  {
    id: 'threeBet',
    label: '3-Bet %',
    value: 7.2,
    format: (val) => `${val.toFixed(1)}%`,
    trend: -2.4,
    description: 'Percentage of re-raises preflop',
  },
  {
    id: 'foldTo3Bet',
    label: 'Fold to 3-Bet %',
    value: 68.3,
    format: (val) => `${val.toFixed(1)}%`,
    trend: -5.1,
    description: 'How often you fold to 3-bet raises',
  },
  {
    id: 'cbetFreq',
    label: 'C-Bet Frequency',
    value: 64.5,
    format: (val) => `${val.toFixed(1)}%`,
    trend: 2.8,
    description: 'How often you continuation bet on the flop',
  },
  {
    id: 'wtsd',
    label: 'WTSD %',
    value: 28.4,
    format: (val) => `${val.toFixed(1)}%`,
    trend: 0.6,
    description: 'Percentage of hands reaching showdown',
  },
];

interface AnimatedNumberProps {
  target: number;
  format: (val: number) => string;
  duration?: number;
}

const AnimatedNumber: React.FC<AnimatedNumberProps> = ({ target, format, duration = 600 }) => {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let startTime: number;
    const animate = (now: number) => {
      if (!startTime) startTime = now;
      const progress = Math.min((now - startTime) / duration, 1);
      setDisplay(target * progress);
      if (progress < 1) requestAnimationFrame(animate);
      else setDisplay(target);
    };
    requestAnimationFrame(animate);
  }, [target, duration]);

  return <>{format(display)}</>;
};

const AdvancedStatsSummary: React.FC = () => {
  const [visibleStats, setVisibleStats] = useState<Set<number>>(new Set());
  const [selectedStat, setSelectedStat] = useState<string | null>(null);

  useEffect(() => {
    ADVANCED_STATS.forEach((_, i) => {
      setTimeout(() => {
        setVisibleStats(prev => new Set([...prev, i]));
      }, i * 60);
    });
  }, []);

  const getTrendArrow = (trend: number) => {
    if (trend > 0) return '↑';
    if (trend < 0) return '↓';
    return '→';
  };

  const getTrendColor = (trend: number) => {
    if (trend > 0) return '#10b981';
    if (trend < 0) return '#ef4444';
    return '#8a9aaa';
  };

  const generateSparkline = (statId: string) => {
    // Simple sparkline-like visualization
    const values: number[] = [];
    const seed = statId.charCodeAt(0);

    for (let i = 0; i < 10; i++) {
      values.push(Math.sin((i + seed) / 3) * 10 + 50);
    }

    return values;
  };

  return (
    <div className="advanced-stats-summary">
      <div className="stats-header">
        <h3>Advanced Statistics</h3>
        <p className="stats-subtitle">Detailed metrics and performance indicators</p>
      </div>

      {/* Stats grid */}
      <div className="advanced-stats-grid">
        {ADVANCED_STATS.map((stat, i) => {
          const isVisible = visibleStats.has(i);
          const isSelected = selectedStat === stat.id;
          const sparkline = generateSparkline(stat.id);

          return (
            <div
              key={stat.id}
              className={`advanced-stat-card ${isSelected ? 'selected' : ''}`}
              style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateY(0)' : 'translateY(8px)',
                transition: `all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) ${i * 40}ms`,
              }}
              onClick={() => setSelectedStat(isSelected ? null : stat.id)}
            >
              {/* Card header */}
              <div className="card-top">
                <span className="stat-title">{stat.label}</span>
                <div className="card-actions">
                  <span
                    className="trend-badge"
                    style={{ color: getTrendColor(stat.trend) }}
                  >
                    {getTrendArrow(stat.trend)} {Math.abs(stat.trend).toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Main value */}
              <div className="card-value">
                <span className="value-main">
                  <AnimatedNumber target={stat.value} format={stat.format} />
                </span>
                {stat.unit && <span className="value-unit">{stat.unit}</span>}
              </div>

              {/* Mini sparkline */}
              <div className="card-sparkline">
                <svg width="100%" height="40" viewBox="0 0 100 40" preserveAspectRatio="none">
                  <polyline
                    points={sparkline
                      .map((val, idx) => `${(idx / (sparkline.length - 1)) * 100},${100 - val}`)
                      .join(' ')}
                    fill="none"
                    stroke="rgba(0, 212, 255, 0.4)"
                    strokeWidth="1.5"
                  />
                </svg>
              </div>

              {/* Description (shown on select) */}
              {isSelected && (
                <div className="card-description" style={{
                  animation: 'slideDown 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                }}>
                  <p>{stat.description}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Quick insights */}
      <div className="stats-insights">
        <h4 className="insights-heading">Performance Summary</h4>
        <div className="insights-grid">
          <div className="insight-box">
            <span className="insight-icon">📈</span>
            <div className="insight-details">
              <span className="insight-title">Strong Hourly Rate</span>
              <p className="insight-description">Your hourly earnings of $38.50 indicates consistent profitability across sessions.</p>
            </div>
          </div>

          <div className="insight-box">
            <span className="insight-icon">🎯</span>
            <div className="insight-details">
              <span className="insight-title">Above-Average Showdown Win %</span>
              <p className="insight-description">Your 56.8% showdown win rate is well above the population average of 50%.</p>
            </div>
          </div>

          <div className="insight-box">
            <span className="insight-icon">⚡</span>
            <div className="insight-details">
              <span className="insight-title">Healthy Aggression</span>
              <p className="insight-description">An AF of 2.85 shows balanced aggression — not too tight, not too loose.</p>
            </div>
          </div>

          <div className="insight-box">
            <span className="insight-icon">🔍</span>
            <div className="insight-details">
              <span className="insight-title">Leak Opportunity</span>
              <p className="insight-description">Your 3-bet % of 7.2% is slightly below optimal (8-12%). Consider widening your 3-bet range.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats legend */}
      <div className="stats-legend">
        <div className="legend-item">
          <span className="legend-label">WTSD</span>
          <p>Went To ShowDown — % of hands that went to showdown</p>
        </div>
        <div className="legend-item">
          <span className="legend-label">C-Bet</span>
          <p>Continuation Bet — betting on the flop after raising preflop</p>
        </div>
        <div className="legend-item">
          <span className="legend-label">AF</span>
          <p>Aggression Factor — ratio of aggressive (raise/bet) to passive actions</p>
        </div>
        <div className="legend-item">
          <span className="legend-label">3-Bet %</span>
          <p>Percentage of preflop openings that you 3-bet against</p>
        </div>
      </div>
    </div>
  );
};

export default AdvancedStatsSummary;

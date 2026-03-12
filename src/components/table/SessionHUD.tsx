/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  SESSION HUD — Minimizable floating stats display at table
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback } from 'react';
import { sessionStatsService, type SessionStats } from '../../services/SessionStatsService';
import { masterBus } from '../../core/MasterBus';
import './SessionHUD.css';

interface SessionHUDProps {
  tableId: string;
  userId: string;
  initialStack: number;
  bigBlind: number;
}

export const SessionHUD: React.FC<SessionHUDProps> = ({
  tableId,
  userId,
  initialStack,
  bigBlind,
}) => {
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ── Initialize session tracking ──
  useEffect(() => {
    sessionStatsService.startSession(tableId, userId, initialStack, bigBlind);
    setStats(sessionStatsService.getStats(tableId));

    return () => {
      sessionStatsService.endSession(tableId);
    };
  }, [tableId, userId, initialStack, bigBlind]);

  // ── Listen for stats updates ──
  useEffect(() => {
    const unsub = masterBus.subscribe('SESSION_STATS_UPDATE', (event: any) => {
      if (event?.payload?.tableId === tableId) {
        setStats(event.payload.stats);
      }
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [tableId]);

  const formatPL = (value: number): string => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toLocaleString()}`;
  };

  // ── Mini sparkline (CSS-only, using trajectory points) ──
  const renderSparkline = useCallback(() => {
    if (!stats || stats.trajectory.length < 3) return null;

    const values = stats.trajectory.map((t) => t[1]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    // Generate SVG polyline points
    const width = 120;
    const height = 32;
    const points = values
      .map((v, i) => {
        const x = (i / (values.length - 1)) * width;
        const y = height - ((v - min) / range) * (height - 4) - 2;
        return `${x},${y}`;
      })
      .join(' ');

    const isPositive = values[values.length - 1] >= values[0];
    const strokeColor = isPositive ? '#22c55e' : '#ef4444';

    return (
      <svg className="sh-sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <polyline
          points={points}
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }, [stats]);

  if (!stats) return null;

  const plClass = stats.profitLoss >= 0 ? 'sh-positive' : 'sh-negative';

  if (minimized) {
    return (
      <div className="session-hud sh-minimized" onClick={() => setMinimized(false)}>
        <span className={`sh-mini-pl ${plClass}`}>{formatPL(stats.profitLoss)}</span>
        <span className="sh-mini-hands">{stats.handsPlayed}h</span>
      </div>
    );
  }

  return (
    <div className="session-hud">
      {/* ── Header ── */}
      <div className="sh-header">
        <span className="sh-title">Session Stats</span>
        <div className="sh-controls">
          <button
            className="sh-toggle"
            onClick={() => setShowAdvanced(!showAdvanced)}
            title={showAdvanced ? 'Hide details' : 'Show details'}
          >
            {showAdvanced ? '▾' : '▸'}
          </button>
          <button className="sh-minimize" onClick={() => setMinimized(true)} title="Minimize">
            —
          </button>
        </div>
      </div>

      {/* ── P&L Display ── */}
      <div className="sh-pl-section">
        <span className={`sh-pl-value ${plClass}`}>{formatPL(stats.profitLoss)}</span>
        <span className="sh-pl-bb">({formatPL(stats.bigBlindsWon)} BB)</span>
      </div>

      {/* ── Sparkline ── */}
      <div className="sh-sparkline-wrapper">{renderSparkline()}</div>

      {/* ── Quick Stats ── */}
      <div className="sh-quick-stats">
        <div className="sh-qstat">
          <span className="sh-qstat-value">{stats.handsPlayed}</span>
          <span className="sh-qstat-label">Hands</span>
        </div>
        <div className="sh-qstat">
          <span className="sh-qstat-value">{stats.handsPerHour}</span>
          <span className="sh-qstat-label">H/Hr</span>
        </div>
        <div className="sh-qstat">
          <span className="sh-qstat-value">{stats.handsWon}</span>
          <span className="sh-qstat-label">Won</span>
        </div>
      </div>

      {/* ── Advanced Stats (togglable) ── */}
      {showAdvanced && (
        <div className="sh-advanced">
          <div className="sh-adv-row">
            <span className="sh-adv-label">VPIP</span>
            <div className="sh-adv-bar">
              <div
                className="sh-adv-fill sh-vpip-fill"
                style={{ width: `${Math.min(stats.vpipPercent, 100)}%` }}
              />
            </div>
            <span className="sh-adv-value">{stats.vpipPercent}%</span>
          </div>
          <div className="sh-adv-row">
            <span className="sh-adv-label">PFR</span>
            <div className="sh-adv-bar">
              <div
                className="sh-adv-fill sh-pfr-fill"
                style={{ width: `${Math.min(stats.pfrPercent, 100)}%` }}
              />
            </div>
            <span className="sh-adv-value">{stats.pfrPercent}%</span>
          </div>
          <div className="sh-adv-row">
            <span className="sh-adv-label">Buy-In</span>
            <span className="sh-adv-value">{stats.buyInTotal.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SessionHUD;

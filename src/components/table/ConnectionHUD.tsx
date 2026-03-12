/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CONNECTION HUD — Latency indicator and disconnect warning
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import {
  disconnectProtectionService,
  type ConnectionState,
} from '../../services/DisconnectProtectionService';
import { masterBus } from '../../core/MasterBus';
import './ConnectionHUD.css';

interface ConnectionHUDProps {
  tableId: string;
  userId: string;
}

const QUALITY_ICONS: Record<string, string> = {
  excellent: '🟢',
  good: '🟡',
  fair: '🟠',
  poor: '🔴',
  disconnected: '⚫',
};

const QUALITY_LABELS: Record<string, string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
  disconnected: 'Disconnected',
};

export const ConnectionHUD: React.FC<ConnectionHUDProps> = ({ tableId, userId }) => {
  const [conn, setConn] = useState<ConnectionState | null>(null);
  const [graceCountdown, setGraceCountdown] = useState<number | null>(null);
  const [showDisconnectWarning, setShowDisconnectWarning] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [isReconnecting, setIsReconnecting] = useState(false);

  // ── Poll connection state ──
  useEffect(() => {
    const interval = setInterval(() => {
      const state = disconnectProtectionService.getConnectionState(tableId, userId);
      setConn(state);

      // Update grace countdown
      if (state && !state.isConnected && state.graceExpiresAt) {
        const remaining = Math.max(0, Math.ceil((state.graceExpiresAt - Date.now()) / 1000));
        setGraceCountdown(remaining);
      } else {
        setGraceCountdown(null);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [tableId, userId]);

  // ── Listen for disconnect events ──
  useEffect(() => {
    const unsubDC = masterBus.subscribe('PLAYER_DISCONNECTED', (event: any) => {
      const data = event?.payload;
      if (data?.userId === userId && data?.tableId === tableId) {
        setShowDisconnectWarning(true);
      }
    });
    const unsubRC = masterBus.subscribe('PLAYER_RECONNECTED', (event: any) => {
      const data = event?.payload;
      if (data?.userId === userId && data?.tableId === tableId) {
        setShowDisconnectWarning(false);
      }
    });

    return () => {
      if (typeof unsubDC === 'function') unsubDC();
      if (typeof unsubRC === 'function') unsubRC();
    };
  }, [tableId, userId]);

  // ── Auto-reconnect with exponential backoff ──
  useEffect(() => {
    if (!showDisconnectWarning) {
      setReconnectAttempts(0);
      setIsReconnecting(false);
      return;
    }

    let timeout: ReturnType<typeof setTimeout>;
    const attemptReconnect = async (attempt: number) => {
      setIsReconnecting(true);
      setReconnectAttempts(attempt);
      try {
        // Attempt reconnection via the disconnect protection service
        const svc = disconnectProtectionService as any;
        if (typeof svc.attemptReconnect === 'function') {
          await svc.attemptReconnect(tableId, userId);
        } else {
          // Fallback: check if connection re-established via polling
          const state = disconnectProtectionService.getConnectionState(tableId, userId);
          if (state?.isConnected) return; // Successfully reconnected
          throw new Error('Still disconnected');
        }
      } catch {
        // Exponential backoff: 1s, 2s, 4s, 8s, max 16s
        const delay = Math.min(1000 * Math.pow(2, attempt), 16_000);
        timeout = setTimeout(() => attemptReconnect(attempt + 1), delay);
      }
    };

    // Start first reconnect attempt after 1s
    timeout = setTimeout(() => attemptReconnect(0), 1000);
    return () => clearTimeout(timeout);
  }, [showDisconnectWarning, tableId, userId]);

  if (!conn) return null;

  return (
    <>
      {/* ── Latency Indicator (always visible) ── */}
      <div className={`conn-hud conn-${conn.quality}`}>
        <span className="conn-icon">{QUALITY_ICONS[conn.quality]}</span>
        <span className="conn-latency">{conn.latencyMs}ms</span>
        <span className="conn-label">{QUALITY_LABELS[conn.quality]}</span>
      </div>

      {/* ── Disconnect Warning Overlay ── */}
      {showDisconnectWarning && (
        <div className="conn-dc-warning">
          <div className="conn-dc-container">
            <span className="conn-dc-icon">📡</span>
            <span className="conn-dc-text">Connection Lost</span>
            {graceCountdown !== null && graceCountdown > 0 && (
              <div className="conn-dc-grace">
                <span className="conn-dc-timer">{graceCountdown}s</span>
                <span className="conn-dc-label">reconnecting...</span>
                <div className="conn-dc-bar">
                  <div
                    className="conn-dc-fill"
                    style={{
                      width: `${(graceCountdown / 30) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}
            {graceCountdown === 0 && (
              <span className="conn-dc-timeout">Auto-action applied: check/fold</span>
            )}
            {isReconnecting && reconnectAttempts > 0 && (
              <span className="conn-dc-retry">Retry attempt {reconnectAttempts}...</span>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default ConnectionHUD;

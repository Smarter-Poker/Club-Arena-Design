/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CONNECTION STATUS BAR — Global WebSocket connection indicator
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Thin bar at top of viewport that shows connection state.
 * Auto-hides 3s after reconnection succeeds.
 */

import { useEffect, useState, useRef } from 'react';
import { masterBus } from '../core/MasterBus';

type ConnStatus = 'connected' | 'reconnecting' | 'disconnected' | 'failed' | 'idle';

const STATUS_COLORS: Record<ConnStatus, string> = {
  connected: '#2ecc71',
  reconnecting: '#f39c12',
  disconnected: '#e74c3c',
  failed: '#c0392b',
  idle: 'transparent',
};

const STATUS_LABELS: Record<ConnStatus, string> = {
  connected: '✓ Connected',
  reconnecting: '⟳ Reconnecting…',
  disconnected: '✗ Disconnected',
  failed: '✗ Connection Failed',
  idle: '',
};

export function ConnectionStatusBar() {
  const [status, setStatus] = useState<ConnStatus>('idle');
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub1 = masterBus.subscribe('WS_CONNECTED', () => {
      setStatus('connected');
      // Auto-hide after 3s
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setStatus('idle'), 3000);
    });
    const unsub2 = masterBus.subscribe('WS_RECONNECTING', () => {
      setStatus('reconnecting');
      if (hideTimer.current) clearTimeout(hideTimer.current);
    });
    const unsub3 = masterBus.subscribe('WS_DISCONNECTED', () => {
      setStatus('disconnected');
      if (hideTimer.current) clearTimeout(hideTimer.current);
    });
    const unsub4 = masterBus.subscribe('WS_CONNECTION_FAILED', () => {
      setStatus('failed');
      if (hideTimer.current) clearTimeout(hideTimer.current);
    });

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  if (status === 'idle') return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '3px',
        backgroundColor: STATUS_COLORS[status],
        zIndex: 99999,
        transition: 'background-color 0.3s ease, opacity 0.3s ease',
      }}
      role="status"
      aria-live="polite"
      aria-label={STATUS_LABELS[status]}
    >
      {(status === 'reconnecting' || status === 'disconnected' || status === 'failed') && (
        <div
          style={{
            position: 'absolute',
            right: 12,
            top: 6,
            fontSize: 11,
            color: STATUS_COLORS[status],
            fontWeight: 600,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            userSelect: 'none',
            textShadow: '0 1px 2px rgba(0,0,0,0.7)',
          }}
        >
          {STATUS_LABELS[status]}
        </div>
      )}
    </div>
  );
}

export default ConnectionStatusBar;

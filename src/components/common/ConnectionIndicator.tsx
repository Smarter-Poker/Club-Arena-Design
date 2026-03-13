/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CONNECTION INDICATOR — Realtime connection health dot
 * ═══════════════════════════════════════════════════════════════════════════════
 * Shows a small colored dot reflecting Supabase realtime connection health.
 * Auto-hides when connected for 5+ seconds to avoid visual clutter.
 * Stays visible when disconnected to alert the user.
 */

import { useState, useEffect, useRef } from 'react';
import { masterBus } from '../../core/MasterBus';
import './ConnectionIndicator.css';

type ConnectionState = 'connected' | 'disconnected' | 'reconnecting';

export default function ConnectionIndicator() {
  const [connState, setConnState] = useState<ConnectionState>('connected');
  const [visible, setVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubConnected = masterBus.subscribe('REALTIME_CONNECTED', () => {
      setConnState('connected');
      // Auto-hide after 5 seconds when healthy
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setVisible(false), 5000);
    });

    const unsubDisconnected = masterBus.subscribe('REALTIME_DISCONNECTED', () => {
      setConnState('disconnected');
      setVisible(true); // Always show when disconnected
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    });

    // Initial auto-hide after 5s
    hideTimerRef.current = setTimeout(() => setVisible(false), 5000);

    return () => {
      unsubConnected();
      unsubDisconnected();
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  if (!visible) return null;

  const labels: Record<ConnectionState, string> = {
    connected: 'Live connection active',
    disconnected: 'Connection lost — data may be stale',
    reconnecting: 'Reconnecting...',
  };

  return (
    <div
      className={`conn-indicator conn-indicator--${connState}`}
      title={labels[connState]}
      role="status"
      aria-label={labels[connState]}
    >
      <span className="conn-indicator__dot" />
      {connState === 'disconnected' && <span className="conn-indicator__label">Offline</span>}
    </div>
  );
}

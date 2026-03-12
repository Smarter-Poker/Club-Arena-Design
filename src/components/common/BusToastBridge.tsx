/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  BUS TOAST BRIDGE — Connects SHOW_TOAST bus events to the ToastProvider
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Must be rendered INSIDE ToastProvider to have access to useToast().
 * Subscribes to SHOW_TOAST bus events and routes them to the toast UI.
 */

import { useEffect } from 'react';
import { masterBus } from '../../core/MasterBus';
import { useToast, type ToastType } from './Toast';

const SEVERITY_TO_TYPE: Record<string, ToastType> = {
  critical: 'error',
  warning: 'warning',
  info: 'info',
};

export function BusToastBridge() {
  const { showToast } = useToast();

  useEffect(() => {
    const unsub = masterBus.subscribe('SHOW_TOAST', (event) => {
      const payload =
        (
          event as unknown as {
            payload: { severity: string; message: string; durationMs?: number };
          }
        ).payload ??
        (event as unknown as { severity: string; message: string; durationMs?: number });
      const type = SEVERITY_TO_TYPE[payload.severity] || 'info';
      showToast(payload.message, type, payload.durationMs || 5000);
    });
    return () => unsub();
  }, [showToast]);

  return null; // Invisible bridge component
}

export default BusToastBridge;

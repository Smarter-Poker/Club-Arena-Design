/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  SERVICE BOOTSTRAP — Centralized service initialization orchestrator
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Ensures all engine services start in the correct order with error isolation.
 * Call bootServices() once in App.tsx useEffect.
 */

import { masterBus } from '../core/MasterBus';
import { OfflineQueueService } from './OfflineQueueService';
import { SettlementCronService } from './SettlementCronService';

export interface BootResult {
  offlineQueue: boolean;
  settlementCron: boolean;
  timestamp: string;
}

let booted = false;

/**
 * Initialize all engine services in the correct order.
 * Idempotent — safe to call multiple times (only runs once).
 */
export async function bootServices(options?: {
  enableSettlementCron?: boolean;
}): Promise<BootResult> {
  if (booted) {
    console.debug('[ServiceBootstrap] Already booted — skipping');
    return { offlineQueue: true, settlementCron: true, timestamp: new Date().toISOString() };
  }

  const result: BootResult = {
    offlineQueue: false,
    settlementCron: false,
    timestamp: new Date().toISOString(),
  };

  // 1. Offline Queue — must init before any financial operations
  try {
    await OfflineQueueService.init();
    result.offlineQueue = true;
    console.debug('[ServiceBootstrap] ✓ OfflineQueueService initialized');
  } catch (err) {
    console.error('[ServiceBootstrap] ✗ OfflineQueueService failed:', err);
  }

  // 2. Settlement Cron — only for admin/owner roles
  if (options?.enableSettlementCron !== false) {
    try {
      SettlementCronService.start({ checkIntervalMs: 60 * 60 * 1000 });
      result.settlementCron = true;
      console.debug('[ServiceBootstrap] ✓ SettlementCronService started');
    } catch (err) {
      console.error('[ServiceBootstrap] ✗ SettlementCronService failed:', err);
    }
  }

  booted = true;

  // Emit ready event so UI can react
  masterBus.emit('SERVICES_READY', {
    services: {
      offlineQueue: result.offlineQueue,
      settlementCron: result.settlementCron,
    } as Record<string, boolean>,
    timestamp: result.timestamp,
  });

  console.debug('[ServiceBootstrap] All services booted:', result);
  return result;
}

/**
 * Tear down all services (for cleanup/testing).
 */
export function shutdownServices(): void {
  OfflineQueueService.dispose();
  SettlementCronService.stop();
  booted = false;
  console.debug('[ServiceBootstrap] Services shut down');
}

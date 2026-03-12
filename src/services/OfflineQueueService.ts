/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  OFFLINE QUEUE SERVICE — IndexedDB-backed mutation queue
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Queues financial mutations when offline and auto-replays on reconnection.
 * - IndexedDB persistence (survives page refresh)
 * - Deduplication by operation ID
 * - Max 50 queued mutations
 * - Auto-replay on navigator.onLine event
 */

import { masterBus } from '../core/MasterBus';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface QueuedMutation {
  id: string;
  operationId: string; // Dedup key
  action: 'ADD_CHIPS' | 'WITHDRAW_CHIPS' | 'CREDIT_COMMISSION' | 'CREDIT_RAKEBACK';
  payload: Record<string, unknown>;
  createdAt: number;
  retries: number;
}

const DB_NAME = 'club_arena_offline';
const STORE_NAME = 'mutations';
const MAX_QUEUE_SIZE = 50;

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export const OfflineQueueService = {
  db: null as IDBDatabase | null,
  _onlineHandler: null as (() => void) | null,

  /**
   * Initialize IndexedDB and set up online listener
   */
  async init(): Promise<void> {
    try {
      this.db = await this.openDB();
    } catch (err) {
      console.warn('[OfflineQueue] IndexedDB not available:', err);
    }

    // Remove previous listener if re-initializing (prevent stacking)
    if (this._onlineHandler && typeof window !== 'undefined') {
      window.removeEventListener('online', this._onlineHandler);
    }

    // Auto-replay when coming back online
    if (typeof window !== 'undefined') {
      this._onlineHandler = () => {
        console.log('[OfflineQueue] Back online — replaying queue');
        this.replayQueue();
      };
      window.addEventListener('online', this._onlineHandler);
    }
  },

  /**
   * Dispose — close DB and remove listeners
   */
  dispose(): void {
    if (this._onlineHandler && typeof window !== 'undefined') {
      window.removeEventListener('online', this._onlineHandler);
      this._onlineHandler = null;
    }
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  },

  /**
   * Queue a mutation for later execution
   */
  async enqueue(mutation: Omit<QueuedMutation, 'id' | 'createdAt' | 'retries'>): Promise<boolean> {
    if (!this.db) return false;

    // Check for duplicate operation
    const existing = await this.findByOperationId(mutation.operationId);
    if (existing) {
      console.warn(`[OfflineQueue] Duplicate operation ${mutation.operationId} — skipping`);
      return false;
    }

    // Enforce max queue size (drop oldest)
    const count = await this.getCount();
    if (count >= MAX_QUEUE_SIZE) {
      await this.dropOldest();
    }

    const entry: QueuedMutation = {
      ...mutation,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      retries: 0,
    };

    return new Promise((resolve) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.add(entry);
      req.onsuccess = () => {
        console.log(`[OfflineQueue] Queued: ${entry.action} (${entry.operationId})`);
        resolve(true);
      };
      req.onerror = () => {
        console.error('[OfflineQueue] Failed to queue mutation:', req.error);
        resolve(false);
      };
    });
  },

  /**
   * Replay all queued mutations
   */
  async replayQueue(): Promise<{ replayed: number; failed: number }> {
    if (!this.db) return { replayed: 0, failed: 0 };

    const mutations = await this.getAll();
    if (mutations.length === 0) return { replayed: 0, failed: 0 };

    console.log(`[OfflineQueue] Replaying ${mutations.length} queued mutations`);

    let replayed = 0;
    let failed = 0;

    for (const mutation of mutations) {
      try {
        const success = await this.executeMutation(mutation);
        if (success) {
          await this.remove(mutation.id);
          replayed++;
        } else {
          mutation.retries++;
          if (mutation.retries >= 3) {
            console.error(`[OfflineQueue] Mutation ${mutation.id} failed 3 times — dropping`);
            await this.remove(mutation.id);
            failed++;
          } else {
            await this.update(mutation);
            failed++;
          }
        }
      } catch (err) {
        console.error(`[OfflineQueue] Error replaying ${mutation.id}:`, err);
        failed++;
      }
    }

    if (replayed > 0) {
      masterBus.emit('OFFLINE_QUEUE_REPLAYED', { replayed, failed });
    }

    return { replayed, failed };
  },

  /**
   * Execute a single mutation against Supabase
   */
  async executeMutation(mutation: QueuedMutation): Promise<boolean> {
    // Lazy import to avoid circular dependency
    const { supabase } = await import('../lib/supabase');

    switch (mutation.action) {
      case 'ADD_CHIPS': {
        const { userId, amount, clubId, walletType } = mutation.payload as {
          userId: string;
          amount: number;
          clubId: string;
          walletType: string;
        };
        const { error } = await supabase.rpc('credit_player_wallet', {
          p_user_id: userId,
          p_amount: amount,
          p_club_id: clubId,
          p_wallet_type: walletType,
        });
        return !error;
      }
      case 'WITHDRAW_CHIPS': {
        const { userId, amount, clubId } = mutation.payload as {
          userId: string;
          amount: number;
          clubId: string;
        };
        const { data } = await supabase.rpc('deduct_player_wallet', {
          p_user_id: userId,
          p_amount: amount,
          p_club_id: clubId,
        });
        return data !== false;
      }
      default:
        console.warn(`[OfflineQueue] Unknown action: ${mutation.action}`);
        return false;
    }
  },

  // ─── IndexedDB Helpers ────────────────────────────────────────────────

  openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('operationId', 'operationId', { unique: true });
          store.createIndex('createdAt', 'createdAt');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  getAll(): Promise<QueuedMutation[]> {
    return new Promise((resolve) => {
      if (!this.db) return resolve([]);
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.index('createdAt').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  },

  getCount(): Promise<number> {
    return new Promise((resolve) => {
      if (!this.db) return resolve(0);
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(0);
    });
  },

  findByOperationId(operationId: string): Promise<QueuedMutation | undefined> {
    return new Promise((resolve) => {
      if (!this.db) return resolve(undefined);
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const index = tx.objectStore(STORE_NAME).index('operationId');
      const req = index.get(operationId);
      req.onsuccess = () => resolve(req.result || undefined);
      req.onerror = () => resolve(undefined);
    });
  },

  remove(id: string): Promise<void> {
    return new Promise((resolve) => {
      if (!this.db) return resolve();
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  },

  update(mutation: QueuedMutation): Promise<void> {
    return new Promise((resolve) => {
      if (!this.db) return resolve();
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(mutation);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  },

  async dropOldest(): Promise<void> {
    const all = await this.getAll();
    if (all.length > 0) {
      await this.remove(all[0].id);
    }
  },
};

export default OfflineQueueService;

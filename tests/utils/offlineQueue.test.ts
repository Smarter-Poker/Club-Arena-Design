import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  addToOfflineQueue,
  getOfflineQueue,
  clearOfflineQueue,
  getOfflineQueueSize,
  getMaxQueueSize,
  type QueuedMutation,
} from '@/utils/offlineQueue';

describe('Offline Queue Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('addToOfflineQueue', () => {
    it('adds mutations to queue', () => {
      const mutation: QueuedMutation = {
        id: '1',
        timestamp: Date.now(),
        mutation: 'updatePlayerChips',
        variables: { chips: 1000 },
      };

      addToOfflineQueue(mutation);
      const queue = getOfflineQueue();

      expect(queue).toHaveLength(1);
      expect(queue[0]).toEqual(mutation);
    });

    it('adds multiple mutations in order', () => {
      const mutation1: QueuedMutation = {
        id: '1',
        timestamp: Date.now(),
        mutation: 'mutation1',
      };

      const mutation2: QueuedMutation = {
        id: '2',
        timestamp: Date.now() + 1,
        mutation: 'mutation2',
      };

      addToOfflineQueue(mutation1);
      addToOfflineQueue(mutation2);

      const queue = getOfflineQueue();

      expect(queue).toHaveLength(2);
      expect(queue[0].id).toBe('1');
      expect(queue[1].id).toBe('2');
    });

    it('respects max queue size', () => {
      const maxSize = getMaxQueueSize();

      for (let i = 0; i < maxSize + 10; i++) {
        const mutation: QueuedMutation = {
          id: String(i),
          timestamp: Date.now() + i,
          mutation: `mutation${i}`,
        };
        addToOfflineQueue(mutation);
      }

      const queue = getOfflineQueue();

      expect(queue).toHaveLength(maxSize);
      expect(queue[0].id).toBe(String(10));
      expect(queue[maxSize - 1].id).toBe(String(maxSize + 9));
    });

    it('drops oldest entries when queue exceeds max size', () => {
      const maxSize = getMaxQueueSize();
      const consoleWarnSpy = vi.spyOn(console, 'warn');

      for (let i = 0; i < maxSize + 5; i++) {
        const mutation: QueuedMutation = {
          id: String(i),
          timestamp: Date.now() + i,
          mutation: `mutation${i}`,
        };
        addToOfflineQueue(mutation);
      }

      expect(consoleWarnSpy).toHaveBeenCalled();
      const queue = getOfflineQueue();
      expect(queue).toHaveLength(maxSize);
    });

    it('persists mutations to localStorage', () => {
      const mutation: QueuedMutation = {
        id: '1',
        timestamp: Date.now(),
        mutation: 'testMutation',
      };

      addToOfflineQueue(mutation);

      const stored = localStorage.getItem('offline_mutation_queue');
      expect(stored).toBeTruthy();

      const parsed = JSON.parse(stored!);
      expect(parsed[0]).toEqual(mutation);
    });

    it('handles mutations with variables', () => {
      const mutation: QueuedMutation = {
        id: '1',
        timestamp: Date.now(),
        mutation: 'updatePlayer',
        variables: { playerId: '123', chips: 5000, name: 'Player One' },
      };

      addToOfflineQueue(mutation);
      const queue = getOfflineQueue();

      expect(queue[0].variables).toEqual({
        playerId: '123',
        chips: 5000,
        name: 'Player One',
      });
    });

    it('handles localStorage errors gracefully', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error');

      vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
        throw new Error('QuotaExceededError');
      });

      const mutation: QueuedMutation = {
        id: '1',
        timestamp: Date.now(),
        mutation: 'testMutation',
      };

      addToOfflineQueue(mutation);

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('logs queue size after adding', () => {
      const consoleLogSpy = vi.spyOn(console, 'log');

      const mutation: QueuedMutation = {
        id: '1',
        timestamp: Date.now(),
        mutation: 'testMutation',
      };

      addToOfflineQueue(mutation);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Offline Queue] Added mutation. Queue size:',
        1
      );
    });
  });

  describe('getOfflineQueue', () => {
    it('returns empty array when queue is empty', () => {
      const queue = getOfflineQueue();
      expect(queue).toEqual([]);
    });

    it('returns all queued mutations', () => {
      const mutations: QueuedMutation[] = [
        { id: '1', timestamp: Date.now(), mutation: 'mutation1' },
        { id: '2', timestamp: Date.now() + 1, mutation: 'mutation2' },
      ];

      mutations.forEach(addToOfflineQueue);

      const queue = getOfflineQueue();
      expect(queue).toEqual(mutations);
    });

    it('returns copy of queue from localStorage', () => {
      const mutation: QueuedMutation = {
        id: '1',
        timestamp: Date.now(),
        mutation: 'testMutation',
      };

      addToOfflineQueue(mutation);

      const queue1 = getOfflineQueue();
      const queue2 = getOfflineQueue();

      expect(queue1).toEqual(queue2);
      expect(queue1).not.toBe(queue2);
    });

    it('handles corrupted localStorage data gracefully', () => {
      localStorage.setItem('offline_mutation_queue', 'invalid json');

      const queue = getOfflineQueue();
      expect(queue).toEqual([]);
    });

    it('handles missing localStorage gracefully', () => {
      localStorage.removeItem('offline_mutation_queue');

      const queue = getOfflineQueue();
      expect(queue).toEqual([]);
    });
  });

  describe('clearOfflineQueue', () => {
    it('removes queue from localStorage', () => {
      const mutation: QueuedMutation = {
        id: '1',
        timestamp: Date.now(),
        mutation: 'testMutation',
      };

      addToOfflineQueue(mutation);
      expect(getOfflineQueue()).toHaveLength(1);

      clearOfflineQueue();
      expect(getOfflineQueue()).toHaveLength(0);
    });

    it('makes localStorage empty', () => {
      const mutation: QueuedMutation = {
        id: '1',
        timestamp: Date.now(),
        mutation: 'testMutation',
      };

      addToOfflineQueue(mutation);
      clearOfflineQueue();

      const stored = localStorage.getItem('offline_mutation_queue');
      expect(stored).toBeNull();
    });

    it('logs clear action', () => {
      const consoleLogSpy = vi.spyOn(console, 'log');

      const mutation: QueuedMutation = {
        id: '1',
        timestamp: Date.now(),
        mutation: 'testMutation',
      };

      addToOfflineQueue(mutation);
      clearOfflineQueue();

      expect(consoleLogSpy).toHaveBeenCalledWith('[Offline Queue] Cleared');
    });

    it('handles localStorage errors gracefully', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error');

      vi.spyOn(Storage.prototype, 'removeItem').mockImplementationOnce(() => {
        throw new Error('Storage error');
      });

      clearOfflineQueue();

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('can clear empty queue without error', () => {
      expect(() => clearOfflineQueue()).not.toThrow();
      expect(getOfflineQueue()).toEqual([]);
    });
  });

  describe('getOfflineQueueSize', () => {
    it('returns 0 for empty queue', () => {
      expect(getOfflineQueueSize()).toBe(0);
    });

    it('returns correct size after adding mutations', () => {
      const mutations: QueuedMutation[] = [
        { id: '1', timestamp: Date.now(), mutation: 'mutation1' },
        { id: '2', timestamp: Date.now() + 1, mutation: 'mutation2' },
        { id: '3', timestamp: Date.now() + 2, mutation: 'mutation3' },
      ];

      mutations.forEach(addToOfflineQueue);

      expect(getOfflineQueueSize()).toBe(3);
    });

    it('reflects size after clearing', () => {
      const mutation: QueuedMutation = {
        id: '1',
        timestamp: Date.now(),
        mutation: 'testMutation',
      };

      addToOfflineQueue(mutation);
      expect(getOfflineQueueSize()).toBe(1);

      clearOfflineQueue();
      expect(getOfflineQueueSize()).toBe(0);
    });

    it('returns size without modifying queue', () => {
      const mutation: QueuedMutation = {
        id: '1',
        timestamp: Date.now(),
        mutation: 'testMutation',
      };

      addToOfflineQueue(mutation);

      const size1 = getOfflineQueueSize();
      const size2 = getOfflineQueueSize();

      expect(size1).toBe(size2);
      expect(getOfflineQueue()).toHaveLength(1);
    });
  });

  describe('getMaxQueueSize', () => {
    it('returns a positive number', () => {
      const maxSize = getMaxQueueSize();
      expect(maxSize).toBeGreaterThan(0);
    });

    it('returns consistent value', () => {
      const size1 = getMaxQueueSize();
      const size2 = getMaxQueueSize();

      expect(size1).toBe(size2);
    });

    it('returns 50', () => {
      expect(getMaxQueueSize()).toBe(50);
    });
  });

  describe('Integration Tests', () => {
    it('replays mutations after reconnect simulation', () => {
      const mutations: QueuedMutation[] = [
        { id: '1', timestamp: Date.now(), mutation: 'bet', variables: { amount: 100 } },
        { id: '2', timestamp: Date.now() + 1, mutation: 'check', variables: {} },
        { id: '3', timestamp: Date.now() + 2, mutation: 'raise', variables: { amount: 200 } },
      ];

      mutations.forEach(addToOfflineQueue);

      expect(getOfflineQueueSize()).toBe(3);

      const queuedMutations = getOfflineQueue();
      expect(queuedMutations).toHaveLength(3);

      queuedMutations.forEach((mutation) => {
        expect(mutation.id).toBeTruthy();
        expect(mutation.mutation).toBeTruthy();
      });

      clearOfflineQueue();
      expect(getOfflineQueueSize()).toBe(0);
    });

    it('handles mixed operations correctly', () => {
      const mutation1: QueuedMutation = {
        id: '1',
        timestamp: Date.now(),
        mutation: 'action1',
      };

      addToOfflineQueue(mutation1);
      expect(getOfflineQueueSize()).toBe(1);

      let queue = getOfflineQueue();
      expect(queue).toHaveLength(1);

      const mutation2: QueuedMutation = {
        id: '2',
        timestamp: Date.now() + 1,
        mutation: 'action2',
      };

      addToOfflineQueue(mutation2);
      expect(getOfflineQueueSize()).toBe(2);

      queue = getOfflineQueue();
      expect(queue[0].id).toBe('1');
      expect(queue[1].id).toBe('2');

      clearOfflineQueue();
      expect(getOfflineQueueSize()).toBe(0);
    });
  });
});

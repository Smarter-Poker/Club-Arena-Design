/**
 * Offline Mutation Queue Utilities
 * Manages queuing and replaying mutations when offline
 */

const QUEUE_KEY = 'offline_mutation_queue';
const MAX_QUEUE_SIZE = 50;

export interface QueuedMutation {
    id: string;
    timestamp: number;
    mutation: string;
    variables?: Record<string, any>;
}

/**
 * Add a mutation to the offline queue
 * Automatically enforces size cap by dropping oldest entries
 */
export function addToOfflineQueue(mutation: QueuedMutation): void {
    try {
        let queue: QueuedMutation[] = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');

        // Add new mutation
        queue.push(mutation);

        // Enforce size cap: keep only the newest MAX_QUEUE_SIZE items
        if (queue.length > MAX_QUEUE_SIZE) {
            const droppedCount = queue.length - MAX_QUEUE_SIZE;
            queue = queue.slice(-MAX_QUEUE_SIZE);
            console.warn(`[Offline Queue] Queue size exceeded ${MAX_QUEUE_SIZE}. Dropped ${droppedCount} oldest entries.`);
        }

        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
        console.log('[Offline Queue] Added mutation. Queue size:', queue.length);
    } catch (error) {
        console.error('[Offline Queue] Failed to add mutation:', error);
    }
}

/**
 * Get all queued mutations
 */
export function getOfflineQueue(): QueuedMutation[] {
    try {
        return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    } catch {
        return [];
    }
}

/**
 * Clear the offline queue
 */
export function clearOfflineQueue(): void {
    try {
        localStorage.removeItem(QUEUE_KEY);
        console.log('[Offline Queue] Cleared');
    } catch (error) {
        console.error('[Offline Queue] Failed to clear:', error);
    }
}

/**
 * Get queue size
 */
export function getOfflineQueueSize(): number {
    return getOfflineQueue().length;
}

/**
 * Get max queue size constant
 */
export function getMaxQueueSize(): number {
    return MAX_QUEUE_SIZE;
}

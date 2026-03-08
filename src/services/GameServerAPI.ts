/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * GAME SERVER API — HTTP Client for Player Actions
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Sends player actions (fold/call/raise/check/all-in) to the game server.
 * The server is the AUTHORITATIVE source for game state — it validates
 * actions, updates the HandController, and broadcasts the new state
 * to all clients via Supabase Realtime.
 *
 * This replaces the old "broadcast-only" approach where actions were
 * sent via Realtime but never reached the server-side engine.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

// Server URL — localhost for development, Fly.io for production
const GAME_SERVER_URL = import.meta.env.VITE_GAME_SERVER_URL || 'http://localhost:8080';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ActionResult {
    success: boolean;
    error?: string;
}

export interface PlayerActions {
    canAct: boolean;
    actions: string[];
    toCall: number;
    minRaise: number;
    maxRaise: number;
    pot: number;
    error?: string;
}

export interface ServerStatus {
    running: boolean;
    uptime: number;
    activeTables: number;
    activeTournaments: number;
    totalHandsDealt: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// API FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Submit a player action to the game server.
 * This is the PRIMARY way real players interact with the game engine.
 *
 * @param tableId - The table UUID
 * @param userId - The player's user UUID
 * @param action - Action type: 'fold', 'check', 'call', 'raise', 'allin'
 * @param amount - Optional amount for raise/bet actions
 * @returns ActionResult with success status and optional error message
 */
export async function submitAction(
    tableId: string,
    userId: string,
    action: string,
    amount?: number
): Promise<ActionResult> {
    try {
        const response = await fetch(`${GAME_SERVER_URL}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tableId, userId, action, amount }),
        });

        const result = await response.json();
        return result as ActionResult;
    } catch (err) {
        console.error('[GameServerAPI] Failed to submit action:', err);
        return { success: false, error: 'Server unreachable' };
    }
}

/**
 * Get available actions for a player at a specific table.
 * Used to populate the ActionPanel with valid options.
 *
 * @param tableId - The table UUID
 * @param userId - The player's user UUID
 * @returns PlayerActions with available actions and betting limits
 */
export async function getAvailableActions(
    tableId: string,
    userId: string
): Promise<PlayerActions> {
    try {
        const response = await fetch(`${GAME_SERVER_URL}/actions/${tableId}/${userId}`);
        const result = await response.json();
        return result as PlayerActions;
    } catch (err) {
        console.error('[GameServerAPI] Failed to get actions:', err);
        return { canAct: false, actions: [], toCall: 0, minRaise: 0, maxRaise: 0, pot: 0, error: 'Server unreachable' };
    }
}

/**
 * Get game server health/status.
 */
export async function getServerStatus(): Promise<ServerStatus | null> {
    try {
        const response = await fetch(`${GAME_SERVER_URL}/health`);
        return await response.json() as ServerStatus;
    } catch {
        return null;
    }
}

export default {
    submitAction,
    getAvailableActions,
    getServerStatus,
};

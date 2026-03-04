/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  HORSE POKER BRAIN — Stub / Placeholder
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This is a stub file. Replace with the full HorsePokerBrain implementation
 * (397KB, 8148 lines) to activate the complete AI decision engine with:
 *   - 32 anti-exploit modules
 *   - PioSolver GTO integration
 *   - Personality archetypes & skill tiers
 *   - Tilt cascades, timing tells, opponent reads
 *
 * When this stub is in place, HorseBrainAdapter automatically falls back
 * to BotLogic for all decisions.
 *
 * To activate the full brain:
 * 1. Replace this file with the real HorsePokerBrain.js
 * 2. Add HorsePokerGTO.js to src/content-engine/services/
 * 3. Add HorsePokerPersonality.js to src/content-engine/services/
 * 4. Add HorsePokerAdvanced.js to src/content-engine/services/
 * 5. Add ChipBridge.js to src/lib/poker-engine/
 * 6. Add GameController.js to src/lib/poker-engine/
 */

// ── Stub flag: tells HorseBrainAdapter this is NOT the real brain ──
const STUB = true;

async function isHorse(_playerId) {
    return false; // Stub: defer to existing horse detection
}

async function loadHorseIds() {
    return new Set(); // Stub: no horse IDs loaded
}

async function getDecision(_horseId, _state, _legalActions, _config) {
    throw new Error('HorsePokerBrain stub — use BotLogic fallback');
}

async function processHandResult(_handData, _bb) {
    // Stub: no-op
}

async function evaluateSessions(_gameController, _tableManager) {
    // Stub: no-op
}

function recordSitDown(_tableId, _horseId, _buyIn) {
    // Stub: no-op
}

function recordRebuy(_tableId, _horseId, _amount) {
    // Stub: no-op
}

function clearTableSessions(_tableId) {
    // Stub: no-op
}

async function canSitAtTable(_horseId) {
    return true;
}

async function canRebuy(_tableId, _horseId, _minBuyIn, _clubId) {
    return true;
}

async function warmGTOCache() {
    // Stub: no-op
}

function getChatMessages() {
    return [];
}

export default {
    STUB,
    isHorse,
    loadHorseIds,
    getDecision,
    processHandResult,
    evaluateSessions,
    recordSitDown,
    recordRebuy,
    clearTableSessions,
    canSitAtTable,
    canRebuy,
    warmGTOCache,
    getChatMessages,
};

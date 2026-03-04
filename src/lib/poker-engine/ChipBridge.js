/**
 * ChipBridge — Physical chip economy (lock/unlock/rebuy)
 * STUB: Replace with full implementation
 *
 * GameController.fillTableWithHorses() already calls ChipBridge.lockChips() before seating.
 * evaluateSessions() calls ChipBridge.rebuyChips() for auto-rebuys.
 */

async function lockChips(_clubId, _userId, _tableId, _amount) {
    throw new Error('ChipBridge stub — use WalletService directly');
}

async function unlockChips(_clubId, _userId, _tableId, _cashoutAmount) {
    throw new Error('ChipBridge stub — use WalletService directly');
}

async function rebuyChips(_clubId, _userId, _tableId, _amount) {
    throw new Error('ChipBridge stub — use WalletService directly');
}

async function recordRake(_data) {
    // Stub: no-op
}

async function getChipBalance(_clubId, _userId) {
    return 0;
}

async function clearLocksForTable(_tableId) {
    // Stub: no-op
}

export default {
    lockChips,
    unlockChips,
    rebuyChips,
    recordRake,
    getChipBalance,
    clearLocksForTable,
};

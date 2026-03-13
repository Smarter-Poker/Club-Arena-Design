/**
 * GameController — Hand flow management & Horse wiring
 * STUB: Replace with full implementation (19 callsites for HorsePokerBrain)
 *
 * CAUTION: This file will have 19 callsites wiring HorsePokerBrain when complete:
 * - _wireHorseAI(tableId)
 * - _triggerHorseAction(tableId, playerId)
 * - fillTableWithHorses(tableId)
 * - autoRegisterHorses(tournamentId)
 *
 * Do NOT duplicate this wiring elsewhere.
 */

class GameController {
    constructor() {
        this.tables = new Map();
    }

    async _wireHorseAI(_tableId) {
        console.warn('[GameController] Stub — wiring deferred to HeadlessTableEngine');
    }

    async _triggerHorseAction(_tableId, _playerId) {
        console.warn('[GameController] Stub — actions handled by HeadlessTableEngine');
    }

    async fillTableWithHorses(_tableId) {
        console.warn('[GameController] Stub — horse filling handled by HydraService');
    }

    async autoRegisterHorses(_tournamentId) {
        console.warn('[GameController] Stub — tournament registration handled by TournamentService');
    }
}

export default GameController;

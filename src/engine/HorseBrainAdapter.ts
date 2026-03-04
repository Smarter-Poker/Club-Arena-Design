/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  HORSE BRAIN ADAPTER — Bridge between HeadlessTableEngine and Horse AI Brain
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This adapter provides a unified interface for horse decisions:
 * - Tries HorsePokerBrain (the full 8148-line AI brain) first
 * - Falls back to BotLogic (the simpler built-in brain) if Brain isn't loaded
 * - Handles format translation between engine state ↔ brain state
 * - Manages brain lifecycle (loading, warming caches, feeding results)
 *
 * The Brain expects specific state shapes (documented in the spec).
 * This adapter translates HeadlessTableEngine's internal state to match.
 */

import type { SeatPlayer, GameVariant } from '../types/database.types';
import { BotLogic, type HorseStyle, type BotDecision } from './BotLogic';

// ═══════════════════════════════════════════════════════════════════════════════
// BRAIN INTERFACES (matching HorsePokerBrain.js spec)
// ═══════════════════════════════════════════════════════════════════════════════

interface BrainPlayerState {
    id: string;
    holeCards: Array<{ rank: number; suit: number }>;
    stack: number;
    position: string; // btn|co|hj|mp|ep|sb|bb|utg
    folded: boolean;
    invested: number; // chips already in pot this street
}

interface BrainEngineState {
    tableId: string;
    players: BrainPlayerState[];
    communityCards: Array<{ rank: number; suit: number }>;
    phase: 'preflop' | 'flop' | 'turn' | 'river';
    potTotal: number;
    currentBet: number;
    variant: 'plo4' | 'plo5' | 'plo6' | 'omaha_hilo' | 'holdem';
    // Optional enrichment
    numLimpers?: number;
    numCallers?: number;
    isLimpedPot?: boolean;
    isSBvsBB?: boolean;
    wasPFRaiser?: boolean;
    allInPlayers?: string[];
    sessionMinutes?: number;
    gameType?: 'cash' | 'tournament';
    numPlayers?: number;
}

interface BrainLegalAction {
    type: 'fold' | 'check' | 'call' | 'bet' | 'raise';
    amount?: number;
    minAmount?: number;
    maxAmount?: number;
}

interface BrainDecision {
    action: string;
    delayMs: number;
    amount?: number;
}

interface BrainTableConfig {
    tableId: string;
    bigBlind: number;
    smallBlind: number;
    variant: string;
    gameType: 'cash' | 'tournament';
}

interface HandResultPlayer {
    id: string;
    chipDelta: number;
    showedCards: boolean;
    folded: boolean;
    lastAction: string;
    betAmount: number;
    actionTimeMs: number;
    hadInitiative: boolean;
    actedAfterCheck: boolean;
    invested: number;
}

interface HandResultData {
    tableId: string;
    bigBlind: number;
    street: string;
    potSize: number;
    numPlayers: number;
    players: HandResultPlayer[];
    result: {
        winners: Array<{ playerId: string }>;
        players: Array<{ id: string; showedCards: boolean; chipDelta: number; invested: number }>;
    };
    ritOffered?: boolean;
    actionCount?: number;
    prevBet?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BRAIN MODULE TYPE (dynamically loaded)
// ═══════════════════════════════════════════════════════════════════════════════

interface HorsePokerBrainModule {
    isHorse: (playerId: string) => Promise<boolean>;
    loadHorseIds: () => Promise<Set<string>>;
    getDecision: (horseId: string, state: BrainEngineState, legalActions: BrainLegalAction[], config: BrainTableConfig) => Promise<BrainDecision>;
    processHandResult: (handData: HandResultData, bb: number) => Promise<void>;
    evaluateSessions: (gameController: any, tableManager: any) => Promise<void>;
    recordSitDown: (tableId: string, horseId: string, buyIn: number) => void;
    recordRebuy: (tableId: string, horseId: string, amount: number) => void;
    clearTableSessions: (tableId: string) => void;
    canSitAtTable: (horseId: string) => Promise<boolean>;
    canRebuy: (tableId: string, horseId: string, minBuyIn: number, clubId: string) => Promise<boolean>;
    warmGTOCache: () => Promise<void>;
    getChatMessages: () => Array<{ horseId: string; message: string }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADAPTER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class HorseBrainAdapterClass {
    private brain: HorsePokerBrainModule | null = null;
    private brainLoadAttempted = false;
    private brainAvailable = false;
    private horseIds: Set<string> = new Set();

    /**
     * Initialize the adapter — try to load HorsePokerBrain.js
     * Falls back to BotLogic if brain isn't available
     */
    async initialize(): Promise<void> {
        if (this.brainLoadAttempted) return;
        this.brainLoadAttempted = true;

        try {
            // Dynamic import of the brain module
            // @ts-ignore — HorsePokerBrain.js may be stub or full implementation
            const brainModule = await import('../lib/poker-engine/HorsePokerBrain.js');
            const loadedBrain = brainModule.default || brainModule;

            // Check if this is the stub or the real brain
            if (loadedBrain.STUB) {
                console.log('[HorseBrainAdapter] HorsePokerBrain is a stub — using BotLogic fallback');
                this.brainAvailable = false;
                return;
            }

            this.brain = loadedBrain;
            this.brainAvailable = true;

            // Warm GTO cache on startup
            await this.brain!.warmGTOCache();

            // Load horse IDs
            this.horseIds = await this.brain!.loadHorseIds();

            console.log(`[HorseBrainAdapter] HorsePokerBrain loaded — ${this.horseIds.size} horses registered`);
        } catch (err) {
            console.log('[HorseBrainAdapter] HorsePokerBrain not available — using BotLogic fallback');
            this.brainAvailable = false;
        }
    }

    /**
     * Check if the full brain is loaded and available
     */
    isBrainAvailable(): boolean {
        return this.brainAvailable && this.brain !== null;
    }

    /**
     * Check if a player is a horse
     */
    async isHorse(playerId: string): Promise<boolean> {
        if (this.brain) {
            return this.brain.isHorse(playerId);
        }
        return this.horseIds.has(playerId);
    }

    /**
     * Get a decision for a horse player
     * Tries HorsePokerBrain first, falls back to BotLogic
     */
    async getDecision(
        horseId: string,
        enginePlayer: SeatPlayer,
        gameState: {
            players: SeatPlayer[];
            communityCards: any[];
            pot: number;
            currentBet: number;
            minRaise: number;
            stage: string;
            gameVariant: string;
            bigBlind: number;
        },
        tableId: string,
        horseStyle: HorseStyle,
        gameType: 'cash' | 'tournament' = 'cash'
    ): Promise<BotDecision> {
        // ── Try HorsePokerBrain first ──
        if (this.brain) {
            try {
                const brainState = this.translateToBrainState(tableId, enginePlayer, gameState, gameType);
                const legalActions = this.buildLegalActions(enginePlayer, gameState);
                const config: BrainTableConfig = {
                    tableId,
                    bigBlind: gameState.bigBlind,
                    smallBlind: gameState.bigBlind / 2,
                    variant: this.mapVariant(gameState.gameVariant),
                    gameType,
                };

                const brainDecision = await this.brain.getDecision(horseId, brainState, legalActions, config);

                return {
                    action: this.mapBrainAction(brainDecision.action) as any,
                    amount: brainDecision.amount,
                    thinkTime: brainDecision.delayMs || 500,
                };
            } catch (err) {
                console.error(`[HorseBrainAdapter] Brain decision failed for ${horseId}, falling back to BotLogic:`, err);
            }
        }

        // ── Fallback: use BotLogic ──
        return BotLogic.decide(enginePlayer, gameState as any, horseStyle);
    }

    /**
     * Feed hand result data to brain's 32 anti-exploit modules
     */
    async processHandResult(
        tableId: string,
        bigBlind: number,
        stage: string,
        potSize: number,
        players: Array<{
            user_id: string;
            chipDelta: number;
            showedCards: boolean;
            folded: boolean;
            invested: number;
        }>,
        winners: string[]
    ): Promise<void> {
        if (!this.brain) return;

        try {
            const handData: HandResultData = {
                tableId,
                bigBlind,
                street: stage,
                potSize,
                numPlayers: players.length,
                players: players.map(p => ({
                    id: p.user_id,
                    chipDelta: p.chipDelta,
                    showedCards: p.showedCards,
                    folded: p.folded,
                    lastAction: 'unknown',
                    betAmount: p.invested,
                    actionTimeMs: 1000,
                    hadInitiative: false,
                    actedAfterCheck: false,
                    invested: p.invested,
                })),
                result: {
                    winners: winners.map(id => ({ playerId: id })),
                    players: players.map(p => ({
                        id: p.user_id,
                        showedCards: p.showedCards,
                        chipDelta: p.chipDelta,
                        invested: p.invested,
                    })),
                },
            };

            await this.brain.processHandResult(handData, bigBlind);
        } catch (err) {
            // Non-blocking — never fail the hand pipeline
            console.error('[HorseBrainAdapter] processHandResult error:', err);
        }
    }

    /**
     * Evaluate sessions between hands (cashout/tilt/rebuy decisions)
     */
    async evaluateSessions(gameController: any, tableManager: any): Promise<void> {
        if (!this.brain) return;
        try {
            await this.brain.evaluateSessions(gameController, tableManager);
        } catch (err) {
            console.error('[HorseBrainAdapter] evaluateSessions error:', err);
        }
    }

    /**
     * Record when a horse sits down at a table
     */
    recordSitDown(tableId: string, horseId: string, buyIn: number): void {
        if (this.brain) {
            this.brain.recordSitDown(tableId, horseId, buyIn);
        }
    }

    /**
     * Record when a horse rebuys
     */
    recordRebuy(tableId: string, horseId: string, amount: number): void {
        if (this.brain) {
            this.brain.recordRebuy(tableId, horseId, amount);
        }
    }

    /**
     * Clean up when a table closes
     */
    clearTableSessions(tableId: string): void {
        if (this.brain) {
            this.brain.clearTableSessions(tableId);
        }
    }

    /**
     * Check if a horse can sit at another table (multi-table limit)
     */
    async canSitAtTable(horseId: string): Promise<boolean> {
        if (this.brain) {
            return this.brain.canSitAtTable(horseId);
        }
        return true; // No limit without brain
    }

    /**
     * Check if a horse can rebuy (bankroll + stop-loss)
     */
    async canRebuy(tableId: string, horseId: string, minBuyIn: number, clubId: string): Promise<boolean> {
        if (this.brain) {
            return this.brain.canRebuy(tableId, horseId, minBuyIn, clubId);
        }
        return true; // Always allow without brain
    }

    /**
     * Get pending chat messages from horses
     */
    getChatMessages(): Array<{ horseId: string; message: string }> {
        if (this.brain) {
            return this.brain.getChatMessages();
        }
        return [];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIVATE: State Translation
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Translate HeadlessTableEngine state → HorsePokerBrain engineState
     */
    private translateToBrainState(
        tableId: string,
        enginePlayer: SeatPlayer,
        gameState: any,
        gameType: 'cash' | 'tournament'
    ): BrainEngineState {
        const positionMap: Record<number, string> = {};
        const playerCount = gameState.players.filter((p: SeatPlayer) => !p.is_folded).length;

        // Map seat positions based on player count and dealer position
        const positions = this.getPositionLabels(playerCount);
        const activePlayers = gameState.players.filter((p: SeatPlayer) => !p.is_folded);
        activePlayers.forEach((p: SeatPlayer, i: number) => {
            positionMap[p.seat] = positions[i % positions.length];
        });

        return {
            tableId,
            players: gameState.players.map((p: SeatPlayer) => ({
                id: p.user_id,
                holeCards: (p.cards || []).map((c: any) => ({
                    rank: typeof c.rank === 'number' ? c.rank : this.parseRank(c.rank),
                    suit: typeof c.suit === 'number' ? c.suit : this.parseSuit(c.suit),
                })),
                stack: p.stack,
                position: positionMap[p.seat] || 'mp',
                folded: p.is_folded || false,
                invested: p.bet || 0,
            })),
            communityCards: (gameState.communityCards || []).map((c: any) => ({
                rank: typeof c.rank === 'number' ? c.rank : this.parseRank(c.rank),
                suit: typeof c.suit === 'number' ? c.suit : this.parseSuit(c.suit),
            })),
            phase: this.mapStage(gameState.stage),
            potTotal: gameState.pot,
            currentBet: gameState.currentBet,
            variant: this.mapVariant(gameState.gameVariant),
            gameType,
            numPlayers: playerCount,
        };
    }

    /**
     * Build legal actions array from current game state
     */
    private buildLegalActions(enginePlayer: SeatPlayer, gameState: any): BrainLegalAction[] {
        const toCall = Math.max(0, gameState.currentBet - (enginePlayer.bet || 0));
        const actions: BrainLegalAction[] = [];

        if (toCall > 0) {
            // Facing a bet
            actions.push({ type: 'fold' });
            actions.push({ type: 'call', amount: Math.min(toCall, enginePlayer.stack) });
            if (enginePlayer.stack > toCall) {
                actions.push({
                    type: 'raise',
                    minAmount: gameState.currentBet + gameState.minRaise,
                    maxAmount: enginePlayer.stack + (enginePlayer.bet || 0),
                });
            }
        } else {
            // No bet facing
            actions.push({ type: 'check' });
            actions.push({
                type: 'bet',
                minAmount: gameState.minRaise || gameState.bigBlind,
                maxAmount: enginePlayer.stack,
            });
        }

        return actions;
    }

    private getPositionLabels(playerCount: number): string[] {
        switch (playerCount) {
            case 2: return ['sb', 'bb'];
            case 3: return ['btn', 'sb', 'bb'];
            case 4: return ['btn', 'co', 'sb', 'bb'];
            case 5: return ['btn', 'co', 'hj', 'sb', 'bb'];
            case 6: return ['btn', 'co', 'hj', 'mp', 'sb', 'bb'];
            case 7: return ['btn', 'co', 'hj', 'mp', 'ep', 'sb', 'bb'];
            case 8: return ['btn', 'co', 'hj', 'mp', 'ep', 'utg', 'sb', 'bb'];
            case 9: return ['btn', 'co', 'hj', 'mp', 'ep', 'utg', 'utg', 'sb', 'bb'];
            default: return ['btn', 'co', 'hj', 'mp', 'ep', 'utg', 'sb', 'bb'];
        }
    }

    private mapStage(stage: string): 'preflop' | 'flop' | 'turn' | 'river' {
        const map: Record<string, 'preflop' | 'flop' | 'turn' | 'river'> = {
            'preflop': 'preflop', 'flop': 'flop', 'turn': 'turn', 'river': 'river',
            'pre_flop': 'preflop', 'PREFLOP': 'preflop', 'FLOP': 'flop', 'TURN': 'turn', 'RIVER': 'river',
        };
        return map[stage] || 'preflop';
    }

    private mapVariant(variant: string): 'plo4' | 'plo5' | 'plo6' | 'omaha_hilo' | 'holdem' {
        const map: Record<string, 'plo4' | 'plo5' | 'plo6' | 'omaha_hilo' | 'holdem'> = {
            'nlh': 'holdem', 'holdem': 'holdem', 'NLH': 'holdem',
            'plo4': 'plo4', 'plo': 'plo4', 'PLO4': 'plo4', 'omaha4': 'plo4',
            'plo5': 'plo5', 'PLO5': 'plo5', 'omaha5': 'plo5',
            'plo6': 'plo6', 'PLO6': 'plo6', 'omaha6': 'plo6',
            'omaha_hilo': 'omaha_hilo', 'plo8': 'omaha_hilo',
        };
        return map[variant] || 'holdem';
    }

    private mapBrainAction(action: string): string {
        // Brain returns standard actions — normalize to engine format
        const map: Record<string, string> = {
            'fold': 'fold', 'check': 'check', 'call': 'call',
            'bet': 'bet', 'raise': 'raise', 'allin': 'allin',
            'all_in': 'allin', 'all-in': 'allin',
        };
        return map[action?.toLowerCase()] || 'fold';
    }

    private parseRank(rank: string | number): number {
        if (typeof rank === 'number') return rank;
        const map: Record<string, number> = {
            '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
            '10': 10, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
        };
        return map[rank] || 0;
    }

    private parseSuit(suit: string | number): number {
        if (typeof suit === 'number') return suit;
        const map: Record<string, number> = {
            'spades': 0, 's': 0, '♠': 0,
            'hearts': 1, 'h': 1, '♥': 1,
            'diamonds': 2, 'd': 2, '♦': 2,
            'clubs': 3, 'c': 3, '♣': 3,
        };
        return map[suit?.toLowerCase()] || 0;
    }
}

// Singleton export
export const HorseBrainAdapter = new HorseBrainAdapterClass();

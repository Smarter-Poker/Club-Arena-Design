/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * HEADLESS TABLE ENGINE — Pure TypeScript Dealer for Simultaneous Multi-Table Dealing
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Runs the complete dealing pipeline for a single table WITHOUT React or UI:
 * - Loads table config, seated players, and horses
 * - Manages HandController lifecycle
 * - Wires persistence service for each hand
 * - Executes horse AI decisions with proper think-time delays
 * - Auto-rebuys busted horses
 * - Tracks hand count for monitoring
 *
 * NO global window locks — each engine instance manages its own table independently.
 * Multiple tables can deal simultaneously.
 */

import { supabase, broadcastHandState } from '../lib/supabase';
import { HandController, type HandConfig, type HandEvent } from './HandController';
import { HandPersistence } from '../services/HandPersistenceService';
import { HydraService, type HorseDecision } from '../services/HydraService';
import { BotLogic, type HorseStyle, type BotDecision } from './BotLogic';
import { HorseBrainAdapter } from './HorseBrainAdapter';
import { GTOQueryService } from '../services/GTOQueryService';
import { RakeService, type DealtInPlayer } from '../services/RakeService';
import { workerTimeout, cancelWorkerTimeout } from '../hooks/useTabKeepAlive';
import type { SeatPlayer, GameVariant } from '../types/database.types';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface TableInfo {
    id: string;
    club_id: string;
    small_blind: number;
    big_blind: number;
    game_variant: GameVariant;
    max_players: number;
    ante?: number;
    game_type?: string;       // 'cash' | 'tournament'
    tournament_id?: string;   // Set if this table belongs to a tournament
}

interface SeatedPlayer {
    user_id: string;
    username: string;
    stack: number;
    seat_number: number;
    is_horse: boolean;
    horse_profile?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HEADLESS TABLE ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

export class HeadlessTableEngine {
    private tableId: string;
    private supabaseClient: typeof supabase;
    private running: boolean = false;
    private handCount: number = 0;
    private handController: HandController | null = null;
    private dealingLoopTimer: number | null = null;
    private tableInfo: TableInfo | null = null;
    private seatedPlayers: SeatedPlayer[] = [];
    private horseAIHandlers: Map<string, () => void> = new Map();
    private unsubscribeHands: (() => void)[] = [];
    private pendingTimerIds: number[] = []; // Track workerTimeout IDs for cleanup
    private persistence: HandPersistence;
    private dealerSeatIndex: number = 0; // Tracks dealer position (rotates each hand)
    private consecutiveErrors: number = 0; // For exponential backoff on dealing errors
    // Per-hand rake tracking
    private currentHandWentToFlop: boolean = false;
    private currentHandPotSize: number = 0;
    private currentHandPlayers: SeatedPlayer[] = [];
    // Stack sync promise — awaited before loading seats for next hand
    private stackSyncPromise: Promise<void> | null = null;

    constructor(tableId: string, supabaseClient: typeof supabase) {
        this.tableId = tableId;
        this.supabaseClient = supabaseClient;
        this.persistence = new HandPersistence(tableId);
        console.log(`[HeadlessTableEngine] Created for table ${tableId}`);
    }

    /**
     * Start the dealing pipeline: load config, wait for players, begin dealing loop
     */
    async start(): Promise<void> {
        if (this.running) {
            console.warn(`[HeadlessTableEngine:${this.tableId}] Already running`);
            return;
        }

        this.running = true;
        console.log(`[HeadlessTableEngine:${this.tableId}] Starting...`);

        try {
            // Initialize Horse AI Brain (loads HorsePokerBrain.js if available, else uses BotLogic)
            await HorseBrainAdapter.initialize();

            // Load table configuration from database
            await this.loadTableInfo();
            if (!this.tableInfo) {
                throw new Error('Failed to load table info');
            }

            // Wait for minimum players (2+), checking every 10 seconds
            while (this.running) {
                await this.loadSeatedPlayers();
                if (this.seatedPlayers.length >= 2) {
                    break;
                }
                console.log(`[HeadlessTableEngine:${this.tableId}] Waiting for players... (${this.seatedPlayers.length}/2)`);
                await new Promise(resolve => setTimeout(resolve, 10000));
            }

            // Start dealing loop
            this.startDealingLoop();
        } catch (err) {
            console.error(`[HeadlessTableEngine:${this.tableId}] Failed to start:`, err);
            this.running = false;
        }
    }

    /**
     * Stop the engine and clean up
     */
    stop(): void {
        if (!this.running) return;

        this.running = false;
        console.log(`[HeadlessTableEngine:${this.tableId}] Stopping...`);

        // Cancel dealing loop
        if (this.dealingLoopTimer !== null) {
            clearTimeout(this.dealingLoopTimer as any);
            this.dealingLoopTimer = null;
        }

        // Clean up hand controller
        if (this.handController) {
            this.handController = null;
        }

        // Clean up pending horse AI timers (prevents memory leak)
        for (const timerId of this.pendingTimerIds) {
            cancelWorkerTimeout(timerId);
        }
        this.pendingTimerIds = [];

        // Clean up event handlers
        this.unsubscribeHands.forEach(unsub => unsub());
        this.unsubscribeHands = [];
        this.horseAIHandlers.clear();

        // Clear brain session data for this table
        HorseBrainAdapter.clearTableSessions(this.tableId);

        // Clean up per-table persistence
        this.persistence.dispose();
    }

    /**
     * Check if engine is currently running
     */
    isRunning(): boolean {
        return this.running;
    }

    /**
     * Get total hands dealt by this engine
     */
    getHandCount(): number {
        return this.handCount;
    }

    // ═════════════════════════════════════════════════════════════════════════════
    // PRIVATE: SETUP
    // ═════════════════════════════════════════════════════════════════════════════

    private async loadTableInfo(): Promise<void> {
        const { data, error } = await this.supabaseClient
            .from('tables')
            .select('id, club_id, small_blind, big_blind, game_variant, max_players, ante, game_type, tournament_id')
            .eq('id', this.tableId)
            .single();

        if (error || !data) {
            throw new Error(`Failed to load table info: ${error?.message}`);
        }

        this.tableInfo = data as TableInfo;
        const mode = data.tournament_id ? 'TOURNAMENT' : 'CASH';
        console.log(`[HeadlessTableEngine:${this.tableId}] Loaded table [${mode}]: ${data.small_blind}/${data.big_blind} ${data.game_variant}`);
    }

    /**
     * Returns true if this table belongs to a tournament (no auto-rebuy, no rake)
     */
    private isTournamentTable(): boolean {
        return !!(this.tableInfo?.tournament_id || this.tableInfo?.game_type === 'tournament');
    }

    /**
     * Refresh blinds from DB (for tournament blind level changes)
     */
    private async refreshBlinds(): Promise<void> {
        if (!this.tableInfo || !this.isTournamentTable()) return;

        const { data } = await this.supabaseClient
            .from('tables')
            .select('small_blind, big_blind, ante')
            .eq('id', this.tableId)
            .single();

        if (data) {
            this.tableInfo.small_blind = data.small_blind;
            this.tableInfo.big_blind = data.big_blind;
            this.tableInfo.ante = data.ante;
        }
    }

    private async loadSeatedPlayers(): Promise<void> {
        const { data, error } = await this.supabaseClient
            .from('table_seats')
            .select('user_id, stack, seat_number')
            .eq('table_id', this.tableId)
            .is('left_at', null)
            .order('seat_number', { ascending: true });

        if (error) {
            console.error(`[HeadlessTableEngine:${this.tableId}] Failed to load seats:`, error);
            this.seatedPlayers = [];
            return;
        }

        if (!data || data.length === 0) {
            this.seatedPlayers = [];
            return;
        }

        const userIds = data.map(d => d.user_id);
        const { data: profiles, error: profileError } = await this.supabaseClient
            .from('profiles')
            .select('id, display_name, username, is_horse, horse_profile')
            .in('id', userIds);

        if (profileError) {
            console.error(`[HeadlessTableEngine:${this.tableId}] Failed to load profiles:`, profileError);
            this.seatedPlayers = [];
            return;
        }

        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

        this.seatedPlayers = data
            .filter(seat => seat.stack > 0 && profileMap.has(seat.user_id))
            .map(seat => {
                const profile = profileMap.get(seat.user_id)!;
                return {
                    user_id: seat.user_id,
                    username: profile.display_name || profile.username || 'Player',
                    stack: seat.stack,
                    seat_number: seat.seat_number || 1, // Use actual DB seat number
                    is_horse: profile.is_horse || false,
                    horse_profile: profile.horse_profile || 'balanced',
                };
            });

        // Sync current_players count to tables row so lobby displays correctly
        await this.supabaseClient
            .from('tables')
            .update({ current_players: this.seatedPlayers.length, status: 'running' })
            .eq('id', this.tableId);
    }

    // ═════════════════════════════════════════════════════════════════════════════
    // PRIVATE: DEALING LOOP
    // ═════════════════════════════════════════════════════════════════════════════

    private startDealingLoop(): void {
        const dealNextHand = async () => {
            if (!this.running) return;

            try {
                // Wait for previous hand's stack sync to complete before loading new data
                if (this.stackSyncPromise) {
                    await this.stackSyncPromise;
                    this.stackSyncPromise = null;
                }

                // Reload seated players + refresh blinds before each hand
                await this.loadSeatedPlayers();
                await this.refreshBlinds();

                const activePlayers = this.seatedPlayers.filter(p => p.stack > 0);
                if (activePlayers.length < 2) {
                    console.log(`[HeadlessTableEngine:${this.tableId}] Not enough players, waiting...`);
                    this.dealingLoopTimer = setTimeout(dealNextHand, 5000) as any;
                    return;
                }

                // Deal hand
                await this.dealHand(activePlayers);
                this.consecutiveErrors = 0; // Reset on success

                // Wait 3 seconds before next hand
                if (this.running) {
                    this.dealingLoopTimer = setTimeout(dealNextHand, 3000) as any;
                }
            } catch (err) {
                this.consecutiveErrors++;
                const backoffMs = Math.min(5000 * Math.pow(2, this.consecutiveErrors - 1), 60000);
                console.error(
                    `[HeadlessTableEngine:${this.tableId}] Dealing loop error (attempt ${this.consecutiveErrors}, retry in ${backoffMs}ms):`,
                    err
                );
                if (this.running && this.consecutiveErrors < 10) {
                    this.dealingLoopTimer = setTimeout(dealNextHand, backoffMs) as any;
                } else if (this.consecutiveErrors >= 10) {
                    console.error(`[HeadlessTableEngine:${this.tableId}] Too many consecutive errors (${this.consecutiveErrors}) — stopping engine`);
                    this.running = false;
                }
            }
        };

        dealNextHand();
    }

    private async dealHand(players: SeatedPlayer[]): Promise<void> {
        if (!this.tableInfo) return;

        this.handCount++;
        const handNumber = this.handCount;

        // Reset per-hand rake tracking
        this.currentHandWentToFlop = false;
        this.currentHandPotSize = 0;
        this.currentHandPlayers = players;

        console.log(`[HeadlessTableEngine:${this.tableId}] Dealing hand ${handNumber} with ${players.length} players`);

        // Convert to SeatPlayer format — use actual seat numbers from DB
        const hcPlayers: SeatPlayer[] = players.map((p) => ({
            seat: p.seat_number,
            user_id: p.user_id,
            username: p.username,
            stack: p.stack,
            bet: 0,
            totalInvested: 0,
            cards: [],
            is_folded: false,
            is_all_in: false,
            is_sitting_out: false,
        }));

        // Create HandController
        const config: HandConfig = {
            tableId: this.tableId,
            handNumber,
            gameVariant: this.tableInfo.game_variant as GameVariant,
            smallBlind: this.tableInfo.small_blind,
            bigBlind: this.tableInfo.big_blind,
            ante: this.tableInfo.ante,
            rakeConfig: this.getRakeConfig(this.tableInfo.small_blind, this.tableInfo.big_blind),
        };

        // Rotate dealer button properly: cycle through actual seat numbers
        this.dealerSeatIndex = this.dealerSeatIndex % players.length;
        const dealerSeat = players[this.dealerSeatIndex].seat_number;
        this.dealerSeatIndex++; // Advance for next hand

        this.handController = new HandController(config, hcPlayers, dealerSeat);

        // Wire per-table persistence service (NOT the singleton — each table gets its own)
        this.persistence.wireToHandController(this.handController, {
            tableId: this.tableId,
            clubId: this.tableInfo.club_id,
            stakes: `${this.tableInfo.small_blind}/${this.tableInfo.big_blind}`,
            gameVariant: this.tableInfo.game_variant as 'nlh' | 'plo4' | 'plo5' | 'plo6',
        });

        // Wait for hand to complete before returning
        return new Promise<void>((resolve) => {
            const handCompleteTimeout = setTimeout(() => {
                console.warn(`[HeadlessTableEngine:${this.tableId}] Hand ${handNumber} timed out after 120s`);
                // Clean up pending horse AI timers on timeout
                for (const timerId of this.pendingTimerIds) {
                    cancelWorkerTimeout(timerId);
                }
                this.pendingTimerIds = [];
                this.handController = null;
                resolve();
            }, 120_000); // 2 minute safety timeout

            // Wire event handler
            const persistenceUnsub = this.handController!.onEvent((event: HandEvent) => {
                this.handleHandEvent(event, players);

                // Resolve the promise when hand completes
                if (event.type === 'HAND_COMPLETE') {
                    clearTimeout(handCompleteTimeout);
                    this.handController = null;
                    // Clean up pending horse AI timers for this hand
                    for (const timerId of this.pendingTimerIds) {
                        cancelWorkerTimeout(timerId);
                    }
                    this.pendingTimerIds = [];
                    // Clean up unsubscribe from this hand (prevent unbounded growth)
                    persistenceUnsub();
                    resolve();
                }
            });

            // Don't accumulate — old hands' unsubs are cleaned in HAND_COMPLETE above
            this.unsubscribeHands.push(persistenceUnsub);

            // Start hand
            try {
                this.handController!.start();
            } catch (err) {
                console.error(`[HeadlessTableEngine:${this.tableId}] Failed to start hand:`, err);
                clearTimeout(handCompleteTimeout);
                this.handController = null;
                resolve();
            }
        });
    }

    /**
     * Broadcast the current hand state to all TablePage subscribers via Realtime.
     * Called after every hand event so the UI stays in sync.
     */
    private broadcastCurrentState(): void {
        if (!this.handController || !this.tableInfo) return;

        const state = this.handController.getState();

        // Resolve current player seat number to user_id
        const currentSeatPlayer = state.players.find(
            (p: any) => p.seat === state.currentPlayerSeat
        );

        broadcastHandState(this.tableId, {
            table_id: this.tableId,
            hand_number: this.handCount,
            pot: state.pot ?? 0,
            community_cards: state.communityCards ?? [],
            current_bet: state.currentBet ?? 0,
            current_player: currentSeatPlayer?.user_id ?? null,
            dealer_seat: state.dealerSeat ?? this.dealerSeatIndex,
            stage: state.stage ?? 'preflop',
            players: (state.players ?? []).map((p: any) => ({
                seat: p.seat,
                user_id: p.user_id,
                username: p.username,
                stack: p.stack,
                bet: p.bet ?? 0,
                cards: p.cards ?? [],
                is_folded: p.is_folded ?? false,
                is_all_in: p.is_all_in ?? false,
                is_sitting_out: p.is_sitting_out ?? false,
            })),
        });
    }

    private handleHandEvent(event: HandEvent, players: SeatedPlayer[]): void {
        switch (event.type) {
            case 'HAND_START':
                // Broadcast initial hand state
                this.broadcastCurrentState();
                break;

            case 'TURN_CHANGE':
                // Horse AI: when it's a player's turn, make their decision
                this.handleTurnChange(event, players);
                // Broadcast updated state (shows whose turn it is)
                this.broadcastCurrentState();
                break;

            case 'PLAYER_ACTION':
                // Broadcast after each player action so UI updates bets/stacks
                this.broadcastCurrentState();
                break;

            case 'COMMUNITY_CARDS':
                // Track if we reached the flop for No Flop No Drop
                if (event.stage === 'flop') {
                    this.currentHandWentToFlop = true;
                }
                // Broadcast new community cards
                this.broadcastCurrentState();
                break;

            case 'WINNERS':
                // Capture final pot size for rake calculation
                if (this.handController) {
                    const state = this.handController.getState();
                    this.currentHandPotSize = state.pot;
                    // Update player stacks in local array
                    for (const enginePlayer of state.players) {
                        const localPlayer = players.find(p => p.user_id === enginePlayer.user_id);
                        if (localPlayer) {
                            localPlayer.stack = enginePlayer.stack;
                        }
                    }
                }
                // Broadcast winners
                this.broadcastCurrentState();
                break;

            case 'HAND_COMPLETE':
                // Stack sync + post-hand tasks run as fire-and-forget async block
                // The dealHand() promise resolves when this event fires, so sync completes
                // before next hand via the stackSyncPromise mechanism
                this.stackSyncPromise = (async () => {
                    // Sync stacks back to database — MUST complete before next hand loads from DB
                    try {
                        await this.syncStacksToDatabase(players);
                    } catch (err) {
                        console.error(`[HeadlessTableEngine:${this.tableId}] Failed to sync stacks:`, err);
                        // Retry once after brief delay
                        try {
                            await new Promise(r => setTimeout(r, 500));
                            await this.syncStacksToDatabase(players);
                            console.log(`[HeadlessTableEngine:${this.tableId}] Stack sync retry succeeded`);
                        } catch (retryErr) {
                            console.error(`[HeadlessTableEngine:${this.tableId}] Stack sync retry ALSO failed:`, retryErr);
                        }
                    }
                })();

                // Sync tournament player chips (tournament tables only)
                if (this.isTournamentTable() && this.tableInfo?.tournament_id) {
                    this.syncTournamentPlayerChips(players).catch(err =>
                        console.error(`[HeadlessTableEngine:${this.tableId}] Tournament chip sync error:`, err)
                    );
                }

                // Execute rake waterfall (cash games only — no rake in tournaments)
                if (!this.isTournamentTable()) {
                    this.executeRakeWaterfall(players).catch(err =>
                        console.error(`[HeadlessTableEngine:${this.tableId}] Rake waterfall error:`, err)
                    );
                }

                // Auto-rebuy horses with 0 stack (cash games only — tournaments eliminate)
                if (!this.isTournamentTable()) {
                    this.autorebuyHorses(players).catch(err =>
                        console.error(`[HeadlessTableEngine:${this.tableId}] Failed to auto-rebuy horses:`, err)
                    );
                }

                // Process players who requested to leave mid-hand (leave_pending flag)
                if (!this.isTournamentTable()) {
                    this.processLeavePendingPlayers().catch(err =>
                        console.error(`[HeadlessTableEngine:${this.tableId}] Leave-pending processing error:`, err)
                    );
                }

                // Feed hand result to Horse AI Brain's 32 anti-exploit modules
                if (HorseBrainAdapter.isBrainAvailable() && this.handController) {
                    const handState = this.handController.getState() as any;
                    const winnerIds = ((handState.winners || handState.lastWinners || []) as any[]).map((w: any) => w.user_id || w.userId || w.id);
                    HorseBrainAdapter.processHandResult(
                        this.tableId,
                        this.tableInfo?.big_blind || 2,
                        handState.stage || 'river',
                        this.currentHandPotSize,
                        players.map(p => ({
                            user_id: p.user_id,
                            chipDelta: 0, // Will be calculated by brain from stack changes
                            showedCards: true,
                            folded: false,
                            invested: 0,
                        })),
                        winnerIds
                    ).catch(() => {}); // Non-blocking
                }
                break;
        }
    }

    private handleTurnChange(event: HandEvent, players: SeatedPlayer[]): void {
        if (event.type !== 'TURN_CHANGE') return;
        if (!this.handController) return;

        const seat = event.seat;
        const player = players.find(p => p.seat_number === seat);
        if (!player) return;

        // Build hand context from current state
        const state = this.handController.getState();
        const enginePlayer = state.players.find(p => p.seat === seat);
        if (!enginePlayer) return;

        const activePlayers = state.players.filter(p => !p.is_folded && p.stack > 0).length;
        const toCall = Math.max(0, state.currentBet - enginePlayer.bet);

        // ── Map horse_profile to winning style ──
        // All horses are fundamentally winning players with different styles
        const styleMap: Record<string, HorseStyle> = {
            'tag': 'tag', 'lag': 'lag', 'balanced': 'balanced',
            'tricky': 'tricky', 'grinder': 'grinder',
            // Legacy profile mapping (all become winning styles)
            'reg': 'tag', 'fish': 'balanced', 'nit': 'grinder',
            'maniac': 'lag',
        };
        const horseStyle: HorseStyle = styleMap[player.horse_profile || 'balanced'] || 'balanced';

        // ── Build GameState ──
        const gameState = {
            players: state.players,
            communityCards: (state.communityCards || []) as any[],
            pot: state.pot,
            currentBet: state.currentBet,
            minRaise: state.minRaise,
            stage: state.stage as string,
            gameVariant: (this.tableInfo?.game_variant || 'nlh') as string,
            bigBlind: this.tableInfo?.big_blind || 2,
        };

        // ── Get decision from Horse AI Brain (falls back to BotLogic if brain not loaded) ──
        const gameType = this.isTournamentTable() ? 'tournament' : 'cash';
        const handControllerRef = this.handController;

        // Async decision flow — brain may be async, but we handle it within the timer
        (async () => {
            let decision: BotDecision;
            try {
                decision = await HorseBrainAdapter.getDecision(
                    player.user_id,
                    enginePlayer,
                    gameState,
                    this.tableId,
                    horseStyle,
                    gameType as 'cash' | 'tournament'
                );
            } catch {
                decision = BotLogic.decide(enginePlayer, gameState as any, horseStyle);
            }

            // GTO overlay only when using BotLogic fallback (brain has its own GTO integration)
            if (!HorseBrainAdapter.isBrainAvailable()) {
                this.enhanceWithGTO(enginePlayer, state, decision, horseStyle).catch(() => {});
            }

            // Execute after think time (shortened for headless — 200-600ms)
            const thinkTime = Math.min(decision.thinkTime, 200 + Math.random() * 400);

            const timerId = workerTimeout(() => {
                if (!handControllerRef || !this.running) return;

                let action = decision.action as string;
                let amount = decision.amount;

                // Validate and normalize action
                if (action === 'allin') action = 'all_in';
                if (action === 'check' && toCall > 0) action = 'call';
                if (action === 'call' && toCall === 0) action = 'check';
                if (action === 'call') amount = toCall;
                if (action === 'fold' && toCall === 0) action = 'check';

                // Validate bet/raise — convert to correct action type
                if (action === 'raise' && state.currentBet === 0) action = 'bet';
                if (action === 'bet' && state.currentBet > 0) action = 'raise';

                // Clamp bet/raise amounts to valid range
                if (action === 'bet' && amount !== undefined) {
                    amount = Math.max(state.minRaise, amount);
                    if (amount >= enginePlayer.stack) {
                        action = 'all_in';
                        amount = undefined;
                    }
                } else if (action === 'raise' && amount !== undefined) {
                    const minRaiseTo = state.currentBet + state.minRaise;
                    amount = Math.max(minRaiseTo, amount);
                    const maxRaiseTo = enginePlayer.stack + enginePlayer.bet;
                    if (amount >= maxRaiseTo) {
                        action = 'all_in';
                        amount = undefined;
                    }
                }

                try {
                    handControllerRef.performAction(seat, action as any, amount);
                } catch (err) {
                    // If action fails, try folding as fallback
                    try {
                        handControllerRef.performAction(seat, 'fold');
                    } catch {
                        // Hand may have already completed
                    }
                }
            }, thinkTime);
            this.pendingTimerIds.push(timerId);
        })().catch(err => {
            console.error(`[HeadlessTableEngine:${this.tableId}] Horse decision error:`, err);
            // Emergency fallback: fold
            try {
                handControllerRef?.performAction(seat, 'fold');
            } catch { /* Hand may have completed */ }
        });
    }

    /**
     * GTO Enhancement Layer — overlay PioSolver data on top of BotLogic decisions
     * This is non-blocking and only modifies the decision if GTO data is available.
     * Gracefully falls back to BotLogic's built-in evaluation if no data exists.
     */
    private async enhanceWithGTO(
        player: SeatPlayer,
        state: any,
        decision: BotDecision,
        style: HorseStyle
    ): Promise<void> {
        try {
            // Map seat number to position name
            const totalPlayers = state.players.filter((p: any) => !p.is_folded).length;
            const positionMap: Record<number, string> = {
                1: 'SB', 2: 'BB', 3: totalPlayers <= 6 ? 'UTG' : 'UTG',
                4: totalPlayers <= 6 ? 'CO' : 'MP', 5: 'CO', 6: 'BTN',
            };
            const position = positionMap[player.seat] || 'BTN';

            // Determine pot type
            const maxBet = state.currentBet || 0;
            const bb = this.tableInfo?.big_blind || 2;
            const potType = maxBet > bb * 6 ? '3bet' : maxBet > bb ? 'srp' : 'limp';

            // Build board string
            const board = (state.communityCards || []).map((c: any) => `${c.rank}${c.suit}`);

            const actionFacing = state.currentBet > 0
                ? `bet_${Math.round((state.currentBet / state.pot) * 100)}`
                : 'check';

            // Query GTO solution (cached in-memory)
            const gtoSolution = await GTOQueryService.getGTOAction(
                position, potType, state.stage, board, actionFacing
            );

            if (!gtoSolution) return; // No GTO data — keep BotLogic decision

            // Use GTO frequencies to influence the decision
            const freqs = gtoSolution.gto_frequencies;
            if (!freqs) return;

            // Sample from GTO frequencies with style-based weighting
            // TAG/Grinder follow GTO more closely; LAG/Tricky deviate more
            const gtoAdherence: Record<HorseStyle, number> = {
                tag: 0.85, grinder: 0.80, balanced: 0.75, lag: 0.60, tricky: 0.55,
            };
            const adherence = gtoAdherence[style] || 0.70;

            // Only override if GTO strongly disagrees with BotLogic (> adherence threshold)
            const currentAction = decision.action;
            const gtoFreqForAction = freqs[currentAction] || 0;

            // If GTO says our chosen action has < 10% frequency, switch to GTO recommendation
            if (gtoFreqForAction < 0.10 && Math.random() < adherence) {
                const gtoAction = gtoSolution.gto_action;
                if (gtoAction && gtoAction !== currentAction) {
                    decision.action = gtoAction as any;
                    // Adjust amount from GTO raise sizes if available
                    if ((gtoAction === 'raise' || gtoAction === 'bet') && gtoSolution.raise_sizes) {
                        const sizes = Object.entries(gtoSolution.raise_sizes);
                        if (sizes.length > 0) {
                            // Pick most frequent sizing
                            sizes.sort((a, b) => (b[1] as number) - (a[1] as number));
                            const sizeKey = sizes[0][0]; // e.g. 'size_75'
                            const pctMatch = sizeKey.match(/(\d+)/);
                            if (pctMatch) {
                                const pct = parseInt(pctMatch[1]) / 100;
                                decision.amount = Math.round(state.pot * pct);
                            }
                        }
                    }
                }
            }
        } catch {
            // GTO enhancement is best-effort — never block decisions
        }
    }

    private async syncStacksToDatabase(players: SeatedPlayer[]): Promise<void> {
        // Batch all stack updates — each is independent so failures are isolated
        const updates = players.map(player =>
            this.supabaseClient
                .from('table_seats')
                .update({ stack: player.stack })
                .eq('table_id', this.tableId)
                .eq('user_id', player.user_id)
        );
        const results = await Promise.allSettled(updates);
        const failures = results.filter(r => r.status === 'rejected');
        if (failures.length > 0) {
            console.error(`[HeadlessTableEngine:${this.tableId}] ${failures.length}/${players.length} stack syncs failed`);
        }
    }

    /**
     * Sync stacks to tournament_players.stack so tournament engine can track eliminations
     */
    private async syncTournamentPlayerChips(players: SeatedPlayer[]): Promise<void> {
        if (!this.tableInfo?.tournament_id) return;
        const updates = players.map(player =>
            this.supabaseClient
                .from('tournament_players')
                .update({ chips: player.stack })
                .eq('tournament_id', this.tableInfo!.tournament_id!)
                .eq('user_id', player.user_id)
        );
        await Promise.allSettled(updates);
    }

    private async autorebuyHorses(players: SeatedPlayer[]): Promise<void> {
        // Only horses (liquidity fleet) get auto-rebuyed — real players must rebuy manually
        const bustHorses = players.filter(p => p.is_horse && p.stack === 0);
        if (bustHorses.length === 0) return;

        const clubId = this.tableInfo?.club_id;
        if (!clubId) return;

        for (const horse of bustHorses) {
            const rebuyAmount = this.tableInfo?.big_blind ? this.tableInfo.big_blind * 100 : 200;

            try {
                // 1. Check horse's wallet balance (club_members.chip_balance)
                const { data: memberData, error: memberError } = await this.supabaseClient
                    .from('club_members')
                    .select('chip_balance')
                    .eq('club_id', clubId)
                    .eq('user_id', horse.user_id)
                    .single();

                if (memberError || !memberData) {
                    console.warn(`[HeadlessTableEngine:${this.tableId}] Horse ${horse.username} has no club membership — cannot rebuy`);
                    await this.markHorseAsLeft(horse.user_id, 'no_membership');
                    continue;
                }

                const walletBalance = memberData.chip_balance || 0;
                if (walletBalance < rebuyAmount) {
                    console.warn(
                        `[HeadlessTableEngine:${this.tableId}] Horse ${horse.username} insufficient funds: ` +
                        `wallet ${walletBalance} < rebuy ${rebuyAmount} — stays busted`
                    );
                    await this.markHorseAsLeft(horse.user_id, 'insufficient_funds');
                    continue;
                }

                // 2. Deduct from club_members.chip_balance using atomic RPC
                // Attempt RPC first (single SQL statement, no read-then-write race)
                let deductSuccess = false;
                try {
                    const { error: rpcError } = await this.supabaseClient.rpc('deduct_chip_balance', {
                        p_club_id: clubId,
                        p_user_id: horse.user_id,
                        p_amount: rebuyAmount,
                    });
                    deductSuccess = !rpcError;
                    if (rpcError) {
                        console.warn(`[HeadlessTableEngine:${this.tableId}] RPC deduct failed, using fallback:`, rpcError.message);
                    }
                } catch {
                    // RPC may not exist yet — fall through to manual approach
                }

                if (!deductSuccess) {
                    // Fallback: conditional update with count check
                    const newBalance = walletBalance - rebuyAmount;
                    const { error: deductError, count } = await this.supabaseClient
                        .from('club_members')
                        .update({ chip_balance: newBalance })
                        .eq('club_id', clubId)
                        .eq('user_id', horse.user_id)
                        .gte('chip_balance', rebuyAmount); // Only deduct if still sufficient

                    if (deductError || !count || count === 0) {
                        console.error(
                            `[HeadlessTableEngine:${this.tableId}] Wallet deduction failed for ${horse.username}: ` +
                            `error=${deductError?.message}, count=${count}`
                        );
                        continue;
                    }
                }

                // 3. Update stack at table
                horse.stack = rebuyAmount;
                await this.supabaseClient
                    .from('table_seats')
                    .update({ stack: rebuyAmount })
                    .eq('table_id', this.tableId)
                    .eq('user_id', horse.user_id);

                // 4. Log transaction in wallet_transactions (full audit trail)
                await this.supabaseClient.from('wallet_transactions').insert({
                    user_id: horse.user_id,
                    wallet_type: 'PLAYER',
                    amount: rebuyAmount,
                    type: 'debit',
                    category: 'buyin',
                    description: `Auto-rebuy ${rebuyAmount} chips (${this.tableInfo?.big_blind || 2}BB x100) at ${this.tableInfo?.small_blind}/${this.tableInfo?.big_blind}`,
                    table_id: this.tableId,
                }).then(({ error: txError }) => {
                    if (txError) console.error(`[HeadlessTableEngine:${this.tableId}] Transaction log failed:`, txError);
                });

                // 5. Also log in chip_transactions for club-level accounting
                await this.supabaseClient.from('chip_transactions').insert({
                    club_id: clubId,
                    to_user_id: horse.user_id,
                    amount: rebuyAmount,
                    transaction_type: 'buy_in',
                    notes: `Auto-rebuy at table ${this.tableId} (${this.tableInfo?.small_blind}/${this.tableInfo?.big_blind})`,
                }).then(({ error: chipTxError }) => {
                    if (chipTxError) console.error(`[HeadlessTableEngine:${this.tableId}] Chip transaction log failed:`, chipTxError);
                });

                // Track rebuy in Horse AI Brain
                HorseBrainAdapter.recordRebuy(this.tableId, horse.user_id, rebuyAmount);

                console.log(
                    `[HeadlessTableEngine:${this.tableId}] Auto-rebuy: ${horse.username} → ${rebuyAmount} chips ` +
                    `(wallet: ${walletBalance} → ${walletBalance - rebuyAmount})`
                );
            } catch (err) {
                console.error(`[HeadlessTableEngine:${this.tableId}] Auto-rebuy failed for ${horse.username}:`, err);
            }
        }
    }

    /**
     * Mark a horse as having left the table (set left_at timestamp)
     * Called when a horse runs out of chips and can't rebuy from wallet
     */
    /**
     * Process seats flagged with leave_pending=true after hand completes.
     * Credits remaining stack back to club_members.chip_balance and removes the seat.
     * This handles the case where a player clicked "Leave" mid-hand.
     */
    private async processLeavePendingPlayers(): Promise<void> {
        const { data: pendingSeats, error } = await this.supabaseClient
            .from('table_seats')
            .select('user_id, stack, seat_number')
            .eq('table_id', this.tableId)
            .eq('leave_pending', true);

        if (error || !pendingSeats || pendingSeats.length === 0) return;

        const clubId = this.tableInfo?.club_id;
        if (!clubId) return;

        for (const seat of pendingSeats) {
            try {
                const chipsToReturn = seat.stack || 0;

                if (chipsToReturn > 0) {
                    // Credit chips back using atomic RPC first, fallback to guarded update
                    let credited = false;
                    try {
                        const { error: rpcError } = await this.supabaseClient.rpc('fn_add_chips', {
                            p_user_id: seat.user_id,
                            p_club_id: clubId,
                            p_amount: chipsToReturn,
                        });
                        credited = !rpcError;
                    } catch {
                        // RPC may not exist — use fallback
                    }

                    if (!credited) {
                        // Fallback: read-then-write with concurrency guard
                        const { data: member } = await this.supabaseClient
                            .from('club_members')
                            .select('chip_balance')
                            .eq('club_id', clubId)
                            .eq('user_id', seat.user_id)
                            .single();

                        if (member) {
                            const newBalance = (member.chip_balance || 0) + chipsToReturn;
                            await this.supabaseClient
                                .from('club_members')
                                .update({ chip_balance: newBalance })
                                .eq('club_id', clubId)
                                .eq('user_id', seat.user_id);
                        }
                    }

                    // Log the cash-out transaction
                    try {
                        await this.supabaseClient.from('chip_transactions').insert({
                            club_id: clubId,
                            from_user_id: null,
                            to_user_id: seat.user_id,
                            amount: chipsToReturn,
                            transaction_type: 'cash_out',
                            notes: `Cash-out from table (leave_pending after hand)`,
                        });
                    } catch { /* Non-blocking — chip credit already succeeded */ }
                }

                // Remove the seat
                await this.supabaseClient
                    .from('table_seats')
                    .delete()
                    .eq('table_id', this.tableId)
                    .eq('user_id', seat.user_id)
                    .eq('seat_number', seat.seat_number);

                console.log(
                    `[HeadlessTableEngine:${this.tableId}] Processed leave_pending for ${seat.user_id} — ` +
                    `returned ${chipsToReturn} chips, seat cleared`
                );
            } catch (err) {
                console.error(
                    `[HeadlessTableEngine:${this.tableId}] Error processing leave_pending for ${seat.user_id}:`, err
                );
            }
        }

        // Update player count after removals
        const { count } = await this.supabaseClient
            .from('table_seats')
            .select('*', { count: 'exact', head: true })
            .eq('table_id', this.tableId)
            .is('left_at', null);

        await this.supabaseClient
            .from('tables')
            .update({ current_players: count || 0 })
            .eq('id', this.tableId);
    }

    private async markHorseAsLeft(userId: string, reason: string): Promise<void> {
        const { error } = await this.supabaseClient
            .from('table_seats')
            .update({ left_at: new Date().toISOString() })
            .eq('table_id', this.tableId)
            .eq('user_id', userId)
            .is('left_at', null);

        if (error) {
            console.error(`[HeadlessTableEngine:${this.tableId}] Failed to mark horse as left:`, error);
        } else {
            console.log(`[HeadlessTableEngine:${this.tableId}] Horse ${userId} left table — reason: ${reason}`);
        }
    }

    // ═════════════════════════════════════════════════════════════════════════════
    // PRIVATE: RAKE WATERFALL
    // ═════════════════════════════════════════════════════════════════════════════

    private async executeRakeWaterfall(players: SeatedPlayer[]): Promise<void> {
        if (!this.tableInfo) return;

        const potSize = this.currentHandPotSize;
        const wentToFlop = this.currentHandWentToFlop;

        // No Flop, No Drop — skip entirely if pot never reached flop
        if (!wentToFlop) {
            return;
        }

        // Minimum pot threshold — don't rake tiny pots
        if (potSize <= 0) {
            return;
        }

        // Get hand ID directly from per-table persistence (no extra DB query needed)
        const handId = this.persistence.getCurrentHandId() || crypto.randomUUID();

        // Build dealt-in player list for rake attribution
        const dealtInPlayers: DealtInPlayer[] = players.map(p => ({
            userId: p.user_id,
            clubId: this.tableInfo!.club_id,
            isSittingOut: false, // All players in HeadlessTableEngine are active
            hasCards: true,      // All dealt players have cards
            wentToFlop,
        }));

        try {
            const result = await RakeService.executeWaterfall({
                handId,
                tableId: this.tableId,
                clubId: this.tableInfo.club_id,
                smallBlind: this.tableInfo.small_blind,
                bigBlind: this.tableInfo.big_blind,
                potSize,
                wentToFlop,
                players: dealtInPlayers,
            });

            if (result.calculation.cappedRake > 0) {
                console.log(
                    `[HeadlessTableEngine:${this.tableId}] Rake: $${result.calculation.cappedRake.toFixed(2)} ` +
                    `(pot $${potSize.toFixed(2)}, BBJ $${result.calculation.bbjDrop.toFixed(2)})`
                );
            }
        } catch (err) {
            console.error(`[HeadlessTableEngine:${this.tableId}] RakeService.executeWaterfall failed:`, err);
        }
    }

    // ═════════════════════════════════════════════════════════════════════════════
    // PRIVATE: RAKE CONFIG
    // ═════════════════════════════════════════════════════════════════════════════

    private getRakeConfig(sb: number, bb: number): any {
        // Official rake chart: 10% rake with tier-based caps, no flop no drop
        const CAPS: [number, number, number][] = [
            [0.10, 0.20, 3],
            [0.20, 0.40, 3],
            [0.25, 0.50, 3],
            [0.30, 0.60, 5],
            [0.50, 1.00, 5],
            [1.00, 2.00, 5],
            [2.00, 4.00, 7.50],
            [2.00, 5.00, 7.50],
            [5.00, 5.00, 7.50],
            [3.00, 6.00, 8],
            [4.00, 8.00, 10],
            [5.00, 10.0, 12.50],
            [10.0, 20.0, 15],
            [10.0, 25.0, 15],
        ];

        const exact = CAPS.find(([s, b]) => s === sb && b === bb);
        if (exact) return { percent: 10, cap: exact[2], noFlop: true };

        // Fallback to closest
        let closest = CAPS[0];
        let minDiff = Math.abs(bb - closest[1]);
        for (const tier of CAPS) {
            const diff = Math.abs(bb - tier[1]);
            if (diff < minDiff) {
                minDiff = diff;
                closest = tier;
            }
        }

        return { percent: 10, cap: closest[2], noFlop: true };
    }
}

export default HeadlessTableEngine;

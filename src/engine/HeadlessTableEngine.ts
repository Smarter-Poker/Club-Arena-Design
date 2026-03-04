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

import { supabase } from '../lib/supabase';
import { HandController, type HandConfig, type HandEvent } from './HandController';
import { HandPersistence } from '../services/HandPersistenceService';
import { HydraService, type HorseDecision } from '../services/HydraService';
import { BotLogic, type HorseStyle, type BotDecision } from './BotLogic';
import { GTOQueryService } from '../services/GTOQueryService';
import { RakeService, type DealtInPlayer } from '../services/RakeService';
import { workerTimeout } from '../hooks/useTabKeepAlive';
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
    private persistence: HandPersistence;
    private dealerSeatIndex: number = 0; // Tracks dealer position (rotates each hand)
    // Per-hand rake tracking
    private currentHandWentToFlop: boolean = false;
    private currentHandPotSize: number = 0;
    private currentHandPlayers: SeatedPlayer[] = [];

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

        // Clean up event handlers
        this.unsubscribeHands.forEach(unsub => unsub());
        this.unsubscribeHands = [];
        this.horseAIHandlers.clear();

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
            .select('id, club_id, small_blind, big_blind, game_variant, max_players, ante')
            .eq('id', this.tableId)
            .single();

        if (error || !data) {
            throw new Error(`Failed to load table info: ${error?.message}`);
        }

        this.tableInfo = data as TableInfo;
        console.log(`[HeadlessTableEngine:${this.tableId}] Loaded table: ${data.small_blind}/${data.big_blind} ${data.game_variant}`);
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
                // Reload seated players before each hand
                await this.loadSeatedPlayers();

                const activePlayers = this.seatedPlayers.filter(p => p.stack > 0);
                if (activePlayers.length < 2) {
                    console.log(`[HeadlessTableEngine:${this.tableId}] Not enough players, waiting...`);
                    this.dealingLoopTimer = setTimeout(dealNextHand, 5000) as any;
                    return;
                }

                // Deal hand
                await this.dealHand(activePlayers);

                // Wait 3 seconds before next hand
                if (this.running) {
                    this.dealingLoopTimer = setTimeout(dealNextHand, 3000) as any;
                }
            } catch (err) {
                console.error(`[HeadlessTableEngine:${this.tableId}] Dealing loop error:`, err);
                if (this.running) {
                    this.dealingLoopTimer = setTimeout(dealNextHand, 5000) as any;
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
                    resolve();
                }
            });

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

    private handleHandEvent(event: HandEvent, players: SeatedPlayer[]): void {
        switch (event.type) {
            case 'HAND_START':
                break;

            case 'TURN_CHANGE':
                // Horse AI: when it's a player's turn, make their decision
                this.handleTurnChange(event, players);
                break;

            case 'COMMUNITY_CARDS':
                // Track if we reached the flop for No Flop No Drop
                if (event.stage === 'flop') {
                    this.currentHandWentToFlop = true;
                }
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
                break;

            case 'HAND_COMPLETE':
                // Sync stacks back to database
                this.syncStacksToDatabase(players).catch(err =>
                    console.error(`[HeadlessTableEngine:${this.tableId}] Failed to sync stacks:`, err)
                );

                // Execute rake waterfall (fire-and-forget, non-blocking)
                this.executeRakeWaterfall(players).catch(err =>
                    console.error(`[HeadlessTableEngine:${this.tableId}] Rake waterfall error:`, err)
                );

                // Auto-rebuy horses with 0 stack
                this.autoreburyHorses(players).catch(err =>
                    console.error(`[HeadlessTableEngine:${this.tableId}] Failed to auto-rebuy horses:`, err)
                );
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

        // ── Build GameState for BotLogic (upgraded brain) ──
        const gameState = {
            players: state.players,
            communityCards: state.communityCards || [],
            pot: state.pot,
            currentBet: state.currentBet,
            minRaise: state.minRaise,
            stage: state.stage,
            gameVariant: (this.tableInfo?.game_variant || 'nlh') as 'nlh' | 'plo4' | 'plo5' | 'plo6',
            bigBlind: this.tableInfo?.big_blind || 2,
        };

        // ── Get decision from upgraded BotLogic brain ──
        const decision = BotLogic.decide(enginePlayer, gameState, horseStyle);

        // ── Optional: GTO overlay — enhance decision with PioSolver data if available ──
        // Fire-and-forget GTO lookup (non-blocking, won't delay action)
        this.enhanceWithGTO(enginePlayer, state, decision, horseStyle).catch(() => {});

        // Execute after think time (shortened for headless — 200-600ms)
        const thinkTime = Math.min(decision.thinkTime, 200 + Math.random() * 400);
        const handControllerRef = this.handController;

        workerTimeout(() => {
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
            // HandController.performAction expects:
            //   bet: amount >= minRaise (absolute bet size)
            //   raise: amount >= currentBet + minRaise (raise-TO total)
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
        for (const player of players) {
            await this.supabaseClient
                .from('table_seats')
                .update({ stack: player.stack })
                .eq('table_id', this.tableId)
                .eq('user_id', player.user_id);
        }
    }

    private async autoreburyHorses(players: SeatedPlayer[]): Promise<void> {
        const bustHorses = players.filter(p => p.is_horse && p.stack === 0);

        for (const horse of bustHorses) {
            // Rebuy to 100BB
            const rebuyin = this.tableInfo?.big_blind ? this.tableInfo.big_blind * 100 : 200;
            horse.stack = rebuyin;

            await this.supabaseClient
                .from('table_seats')
                .update({ stack: rebuyin })
                .eq('table_id', this.tableId)
                .eq('user_id', horse.user_id);

            console.log(`[HeadlessTableEngine:${this.tableId}] Rebuyed horse ${horse.username} for ${rebuyin}`);
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

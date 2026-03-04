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
import { handPersistenceService } from '../services/HandPersistenceService';
import { HydraService, type HorseDecision } from '../services/HydraService';
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
    // Per-hand rake tracking
    private currentHandWentToFlop: boolean = false;
    private currentHandPotSize: number = 0;
    private currentHandPlayers: SeatedPlayer[] = [];

    constructor(tableId: string, supabaseClient: typeof supabase) {
        this.tableId = tableId;
        this.supabaseClient = supabaseClient;
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
            .select('user_id, stack')
            .eq('table_id', this.tableId)
            .is('left_at', null);

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
                    seat_number: 0, // Will be reassigned in hand setup
                    is_horse: profile.is_horse || false,
                    horse_profile: profile.horse_profile || 'reg',
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

        // Convert to SeatPlayer format
        const hcPlayers: SeatPlayer[] = players.map((p, idx) => ({
            seat: idx + 1,
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

        const dealerSeat = (handNumber - 1) % players.length + 1;

        this.handController = new HandController(config, hcPlayers, dealerSeat);

        // Wire persistence service
        handPersistenceService.wireToHandController(this.handController, {
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
        const player = players.find((p, idx) => idx + 1 === seat);
        if (!player) return;

        // All players in HeadlessTableEngine are horses — make AI decision for every seat
        const horseProfile = player.horse_profile || 'reg';

        // Build hand context from current state
        const state = this.handController.getState();
        const enginePlayer = state.players.find(p => p.seat === seat);
        if (!enginePlayer) return;

        const activePlayers = state.players.filter(p => !p.is_folded && p.stack > 0).length;
        const maxBet = Math.max(...state.players.map(p => p.bet), 0);
        const toCall = Math.max(0, maxBet - enginePlayer.bet);

        const context = {
            pot: state.pot,
            toCall,
            minRaise: state.minRaise,
            maxRaise: enginePlayer.stack,
            position: seat <= 3 ? 'early' as const : seat <= 5 ? 'middle' as const : 'late' as const,
            street: state.stage as 'preflop' | 'flop' | 'turn' | 'river',
            playersInHand: activePlayers,
            stackToPotRatio: state.pot > 0 ? enginePlayer.stack / state.pot : 100,
            isHeadsUp: activePlayers === 2,
        };

        // Get horse decision
        const decision = HydraService.getDecision(
            {
                id: player.user_id,
                name: player.username,
                playerNumber: 0,
                avatar: '',
                profile: horseProfile as any,
                stack: enginePlayer.stack,
                seatNumber: seat,
                status: 'seated',
                tableId: this.tableId,
                joinedAt: new Date().toISOString(),
                leavingAfterOrbit: false,
                handsPlayed: 0,
                orbitsPlayed: 0,
            },
            context
        );

        // Execute after think time (shortened for headless — 200-800ms instead of full think time)
        const thinkTime = Math.min(decision.thinkTime, 300 + Math.random() * 500);
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

            // Validate bet/raise
            if (action === 'raise' && state.currentBet === 0) action = 'bet';
            if (action === 'bet' && state.currentBet > 0) action = 'raise';

            // Clamp raise amount
            if ((action === 'raise' || action === 'bet') && amount !== undefined) {
                const maxRaise = enginePlayer.stack + maxBet;
                if (amount > maxRaise) {
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

        // Look up the most recent hand for this table to get the DB hand ID
        const { data: latestHand, error: handError } = await this.supabaseClient
            .from('hands')
            .select('id')
            .eq('table_id', this.tableId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        const handId = latestHand?.id || crypto.randomUUID();
        if (handError) {
            console.warn(`[HeadlessTableEngine:${this.tableId}] Could not fetch hand ID for rake, using generated UUID`);
        }

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

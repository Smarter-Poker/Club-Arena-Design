/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * HORSE FLEET MANAGER — Server-Side Cash Table Seeding
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Manages the fleet of horses across ALL cash game tables:
 * - Creates cash tables from predefined configs if they don't exist
 * - Seats available horses at tables to maintain target occupancy
 * - Manages horse departures/arrivals to simulate real traffic
 * - Tracks fleet health (available, seated, stuck)
 * - Runs as part of the server — ZERO browser dependency
 *
 * NOTE: "Horses" — NEVER call them anything else.
 */

import { supabase } from './supabase.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface TableConfig {
    name: string;
    smallBlind: number;
    bigBlind: number;
    maxPlayers: number;
    horsesPerTable: number;
    gameVariant: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CASH GAME TABLE CONFIGS — Every Stake Level × Every Game Type
// ═══════════════════════════════════════════════════════════════════════════════

const SHARK_CLUB_ID = 'a41434bb-8d0c-400a-8f0d-e8b3d65afed4';
const JAQK_CLUB_ID = 'a0000000-0000-0000-0000-000000000001';

const DEFAULT_TABLES: TableConfig[] = [
    // ─── NO LIMIT HOLD'EM (NLH) — Full Stake Ladder ─────────────────────────
    { name: 'NLH Micro 0.10/0.20',       smallBlind: 0.10, bigBlind: 0.20,  maxPlayers: 9, horsesPerTable: 8, gameVariant: 'nlh' },
    { name: 'NLH 0.25/0.50',             smallBlind: 0.25, bigBlind: 0.50,  maxPlayers: 9, horsesPerTable: 8, gameVariant: 'nlh' },
    { name: 'NLH 0.50/1.00',             smallBlind: 0.50, bigBlind: 1.00,  maxPlayers: 9, horsesPerTable: 8, gameVariant: 'nlh' },
    { name: 'NLH 1.00/2.00',             smallBlind: 1.00, bigBlind: 2.00,  maxPlayers: 9, horsesPerTable: 8, gameVariant: 'nlh' },
    { name: 'NLH 2.00/4.00',             smallBlind: 2.00, bigBlind: 4.00,  maxPlayers: 9, horsesPerTable: 8, gameVariant: 'nlh' },
    { name: 'NLH 2.00/5.00',             smallBlind: 2.00, bigBlind: 5.00,  maxPlayers: 9, horsesPerTable: 8, gameVariant: 'nlh' },
    { name: 'NLH 3.00/6.00',             smallBlind: 3.00, bigBlind: 6.00,  maxPlayers: 9, horsesPerTable: 8, gameVariant: 'nlh' },
    { name: 'NLH 5.00/10.00',            smallBlind: 5.00, bigBlind: 10.00, maxPlayers: 6, horsesPerTable: 6, gameVariant: 'nlh' },
    { name: 'NLH 10.00/25.00',           smallBlind: 10.0, bigBlind: 25.00, maxPlayers: 6, horsesPerTable: 6, gameVariant: 'nlh' },
    // 6-Max tables
    { name: 'NLH 6-Max 0.10/0.20',       smallBlind: 0.10, bigBlind: 0.20,  maxPlayers: 6, horsesPerTable: 6, gameVariant: 'nlh' },
    { name: 'NLH 6-Max 0.25/0.50',       smallBlind: 0.25, bigBlind: 0.50,  maxPlayers: 6, horsesPerTable: 6, gameVariant: 'nlh' },
    { name: 'NLH 6-Max 0.50/1.00',       smallBlind: 0.50, bigBlind: 1.00,  maxPlayers: 6, horsesPerTable: 6, gameVariant: 'nlh' },
    { name: 'NLH 6-Max 1.00/2.00',       smallBlind: 1.00, bigBlind: 2.00,  maxPlayers: 6, horsesPerTable: 6, gameVariant: 'nlh' },

    // ─── POT LIMIT OMAHA 4-CARD (PLO4) ──────────────────────────────────────
    { name: 'PLO4 0.10/0.20',            smallBlind: 0.10, bigBlind: 0.20,  maxPlayers: 9, horsesPerTable: 8, gameVariant: 'plo4' },
    { name: 'PLO4 0.25/0.50',            smallBlind: 0.25, bigBlind: 0.50,  maxPlayers: 9, horsesPerTable: 8, gameVariant: 'plo4' },
    { name: 'PLO4 0.50/1.00',            smallBlind: 0.50, bigBlind: 1.00,  maxPlayers: 9, horsesPerTable: 8, gameVariant: 'plo4' },
    { name: 'PLO4 1.00/2.00',            smallBlind: 1.00, bigBlind: 2.00,  maxPlayers: 6, horsesPerTable: 6, gameVariant: 'plo4' },
    { name: 'PLO4 2.00/5.00',            smallBlind: 2.00, bigBlind: 5.00,  maxPlayers: 6, horsesPerTable: 6, gameVariant: 'plo4' },
    { name: 'PLO4 5.00/10.00',           smallBlind: 5.00, bigBlind: 10.00, maxPlayers: 6, horsesPerTable: 6, gameVariant: 'plo4' },

    // ─── POT LIMIT OMAHA 5-CARD (PLO5) ──────────────────────────────────────
    { name: 'PLO5 0.25/0.50',            smallBlind: 0.25, bigBlind: 0.50,  maxPlayers: 6, horsesPerTable: 6, gameVariant: 'plo5' },
    { name: 'PLO5 0.50/1.00',            smallBlind: 0.50, bigBlind: 1.00,  maxPlayers: 6, horsesPerTable: 6, gameVariant: 'plo5' },
    { name: 'PLO5 1.00/2.00',            smallBlind: 1.00, bigBlind: 2.00,  maxPlayers: 6, horsesPerTable: 6, gameVariant: 'plo5' },
    { name: 'PLO5 2.00/5.00',            smallBlind: 2.00, bigBlind: 5.00,  maxPlayers: 6, horsesPerTable: 6, gameVariant: 'plo5' },

    // ─── POT LIMIT OMAHA 8 OR BETTER (PLO8 / Hi-Lo) ─────────────────────────
    { name: 'PLO8 0.25/0.50',            smallBlind: 0.25, bigBlind: 0.50,  maxPlayers: 9, horsesPerTable: 8, gameVariant: 'plo8' },
    { name: 'PLO8 0.50/1.00',            smallBlind: 0.50, bigBlind: 1.00,  maxPlayers: 9, horsesPerTable: 8, gameVariant: 'plo8' },
    { name: 'PLO8 1.00/2.00',            smallBlind: 1.00, bigBlind: 2.00,  maxPlayers: 9, horsesPerTable: 8, gameVariant: 'plo8' },
    { name: 'PLO8 2.00/5.00',            smallBlind: 2.00, bigBlind: 5.00,  maxPlayers: 6, horsesPerTable: 6, gameVariant: 'plo8' },

    // ─── OFC PINEAPPLE ──────────────────────────────────────────────────────
    { name: 'Pineapple 0.25/0.50',       smallBlind: 0.25, bigBlind: 0.50,  maxPlayers: 6, horsesPerTable: 6, gameVariant: 'ofc_pineapple' },
    { name: 'Pineapple 0.50/1.00',       smallBlind: 0.50, bigBlind: 1.00,  maxPlayers: 6, horsesPerTable: 6, gameVariant: 'ofc_pineapple' },
    { name: 'Pineapple 1.00/2.00',       smallBlind: 1.00, bigBlind: 2.00,  maxPlayers: 6, horsesPerTable: 6, gameVariant: 'ofc_pineapple' },

    // ─── SHORT DECK ─────────────────────────────────────────────────────────
    { name: 'Short Deck 0.50/1.00',      smallBlind: 0.50, bigBlind: 1.00,  maxPlayers: 6, horsesPerTable: 6, gameVariant: 'short_deck' },
    { name: 'Short Deck 1.00/2.00',      smallBlind: 1.00, bigBlind: 2.00,  maxPlayers: 6, horsesPerTable: 6, gameVariant: 'short_deck' },

    // ─── BOMB POT TABLES ────────────────────────────────────────────────────
    { name: 'Bomb Pot NLH 0.25/0.50',    smallBlind: 0.25, bigBlind: 0.50,  maxPlayers: 9, horsesPerTable: 8, gameVariant: 'nlh' },
    { name: 'Bomb Pot PLO4 0.50/1.00',   smallBlind: 0.50, bigBlind: 1.00,  maxPlayers: 9, horsesPerTable: 8, gameVariant: 'plo4' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// HORSE FLEET MANAGER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class HorseFleetManager {
    private isRunning = false;
    private seedInterval: ReturnType<typeof setInterval> | null = null;
    private seeding = false; // Prevents concurrent seeding
    private clubIndex = 0;
    private clubIds = [SHARK_CLUB_ID, JAQK_CLUB_ID];

    private getNextClubId(): string {
        const id = this.clubIds[this.clubIndex % this.clubIds.length];
        this.clubIndex++;
        return id;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // START / STOP
    // ─────────────────────────────────────────────────────────────────────────

    async start(): Promise<void> {
        if (this.isRunning) {
            console.log('[HorseFleet] Already running');
            return;
        }

        this.isRunning = true;
        console.log('[HorseFleet] Starting fleet manager...');

        // Ensure all tables exist (fast — just inserts)
        await this.ensureAllTablesExist();

        // Kick off initial seeding in background — DON'T block the server
        this.seedAllTables().then(() => {
            console.log('[HorseFleet] Initial seeding complete');
        }).catch(err => {
            console.error('[HorseFleet] Initial seeding error:', err);
        });

        // Recurring check: every 30 seconds, ensure horses are seated
        this.seedInterval = setInterval(() => {
            this.seedAllTables().catch(err =>
                console.error('[HorseFleet] Seed cycle error:', err)
            );
        }, 30000);

        console.log('[HorseFleet] Running — seeding in background, checking every 30s');
    }

    stop(): void {
        this.isRunning = false;
        if (this.seedInterval) {
            clearInterval(this.seedInterval);
            this.seedInterval = null;
        }
        console.log('[HorseFleet] Stopped');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ENSURE ALL TABLES EXIST IN DATABASE
    // ─────────────────────────────────────────────────────────────────────────

    private async ensureAllTablesExist(): Promise<void> {
        console.log(`[HorseFleet] Ensuring ${DEFAULT_TABLES.length} cash tables exist...`);

        for (const config of DEFAULT_TABLES) {
            try {
                // Check if table already exists by name
                const { data: existing } = await supabase
                    .from('tables')
                    .select('id')
                    .eq('name', config.name)
                    .is('tournament_id', null)
                    .in('status', ['waiting', 'running'])
                    .maybeSingle();

                if (existing) continue; // Table exists

                // Create the table
                const clubId = this.getNextClubId();
                const { error } = await supabase
                    .from('tables')
                    .insert({
                        club_id: clubId,
                        name: config.name,
                        game_type: 'cash',
                        game_variant: config.gameVariant,
                        stakes: `${config.smallBlind}/${config.bigBlind}`,
                        small_blind: config.smallBlind,
                        big_blind: config.bigBlind,
                        min_buy_in: config.bigBlind * 40,
                        max_buy_in: config.bigBlind * 200,
                        max_players: config.maxPlayers,
                        current_players: 0,
                        status: 'waiting',
                    });

                if (error) {
                    console.error(`[HorseFleet] Failed to create table "${config.name}":`, error.message);
                } else {
                    console.log(`[HorseFleet] Created table: ${config.name}`);
                }
            } catch (err: any) {
                console.error(`[HorseFleet] Error creating table "${config.name}":`, err.message);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SEED ALL TABLES — Fill empty seats with available horses
    // ─────────────────────────────────────────────────────────────────────────

    private async seedAllTables(): Promise<void> {
        if (this.seeding) return; // Prevent concurrent seeding
        this.seeding = true;
        try {
            // Get all active cash tables
            const { data: tables, error: tablesError } = await supabase
                .from('tables')
                .select('id, name, max_players, small_blind, big_blind, game_variant')
                .is('tournament_id', null)
                .in('status', ['waiting', 'running']);

            if (tablesError || !tables) {
                console.error('[HorseFleet] Failed to fetch tables:', tablesError?.message);
                return;
            }

            console.log(`[HorseFleet] Seeding cycle: ${tables.length} tables found`);
            let totalSeated = 0;

            for (const table of tables) {
                try {
                    // Get target horse count for this table
                    const config = DEFAULT_TABLES.find(t => t.name === table.name);
                    const targetHorses = config?.horsesPerTable || Math.max(3, table.max_players - 1);

                    // Get currently occupied seats (actual seat numbers, not just count)
                    const { data: occupiedSeats } = await supabase
                        .from('table_seats')
                        .select('seat_number')
                        .eq('table_id', table.id)
                        .is('left_at', null);

                    const occupiedNumbers = new Set((occupiedSeats || []).map(s => s.seat_number));
                    const currentCount = occupiedNumbers.size;
                    const seatsNeeded = targetHorses - currentCount;
                    if (seatsNeeded <= 0) continue;

                    // Find empty seat numbers
                    const emptySeats: number[] = [];
                    for (let s = 1; s <= table.max_players && emptySeats.length < seatsNeeded; s++) {
                        if (!occupiedNumbers.has(s)) emptySeats.push(s);
                    }
                    if (emptySeats.length === 0) continue;

                    // Fetch available horses
                    const { data: availableHorses } = await supabase
                        .from('profiles')
                        .select('id, display_name, username')
                        .eq('is_horse', true)
                        .eq('horse_status', 'available')
                        .limit(emptySeats.length);

                    if (!availableHorses || availableHorses.length === 0) {
                        if (emptySeats.length > 0) {
                            console.log(`[HorseFleet] No available horses for "${table.name}" (need ${emptySeats.length})`);
                        }
                        continue;
                    }

                    // Get table's club_id
                    const { data: tableData } = await supabase
                        .from('tables')
                        .select('club_id')
                        .eq('id', table.id)
                        .single();
                    const clubId = tableData?.club_id || SHARK_CLUB_ID;

                    // Seat each horse at an ACTUAL empty seat
                    let seated = 0;
                    for (let i = 0; i < availableHorses.length && i < emptySeats.length; i++) {
                        const horse = availableHorses[i];
                        const seatNumber = emptySeats[i];
                        const buyIn = table.big_blind * 100; // Standard 100 BB buy-in

                        const success = await this.seatHorse(table.id, horse.id, seatNumber, buyIn, table.name, clubId);
                        if (success) {
                            seated++;
                            totalSeated++;
                        }
                    }

                    if (seated > 0) {
                        // Update table player count and status
                        const newCount = currentCount + seated;
                        await supabase
                            .from('tables')
                            .update({
                                current_players: newCount,
                                status: newCount >= 2 ? 'running' : 'waiting',
                            })
                            .eq('id', table.id);
                    }
                } catch (err: any) {
                    console.error(`[HorseFleet] Error seeding table "${table.name}":`, err.message);
                }
            }

            if (totalSeated > 0) {
                console.log(`[HorseFleet] Seated ${totalSeated} horses across tables`);
            }
        } catch (err: any) {
            console.error('[HorseFleet] seedAllTables error:', err.message);
        } finally {
            this.seeding = false;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SEAT A SINGLE HORSE
    // ─────────────────────────────────────────────────────────────────────────

    private async seatHorse(
        tableId: string,
        horseId: string,
        seatNumber: number,
        buyIn: number,
        tableName: string,
        clubId: string
    ): Promise<boolean> {
        try {
            // Deduct buy-in from wallet — EXACTLY like a real player
            // Every chip must be accounted for in the ledger
            const { error: deductError } = await supabase.rpc('deduct_player_wallet', {
                p_user_id: horseId,
                p_amount: buyIn,
            });

            if (deductError) {
                // No funds — skip this horse
                return false;
            }

            // Log the buy-in transaction to wallet_transactions
            await supabase.from('wallet_transactions').insert({
                user_id: horseId,
                wallet_type: 'PLAYER',
                amount: buyIn,
                type: 'debit',
                category: 'buyin',
                description: `Buy-in at ${tableName}: ${buyIn} chips`,
            });

            // Insert into table_seats
            const { error: seatError } = await supabase
                .from('table_seats')
                .insert({
                    table_id: tableId,
                    user_id: horseId,
                    seat_number: seatNumber,
                    stack: buyIn,
                    joined_at: new Date().toISOString(),
                });

            if (seatError) {
                // Refund the buy-in
                await supabase.rpc('credit_player_wallet', {
                    p_user_id: horseId,
                    p_amount: buyIn,
                });
                await supabase.from('wallet_transactions').insert({
                    user_id: horseId,
                    wallet_type: 'PLAYER',
                    amount: buyIn,
                    type: 'credit',
                    category: 'cashout',
                    description: `Seat failed refund at ${tableName}: ${buyIn} chips`,
                });
                console.error(`[HorseFleet] Seat insert failed at ${tableName}:`, seatError.message);
                return false;
            }

            // Update horse status to seated
            await supabase
                .from('profiles')
                .update({ horse_status: 'seated', updated_at: new Date().toISOString() })
                .eq('id', horseId);

            return true;
        } catch (err: any) {
            console.error(`[HorseFleet] seatHorse error:`, err.message);
            return false;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FLEET HEALTH
    // ─────────────────────────────────────────────────────────────────────────

    async getFleetHealth(): Promise<{
        total: number;
        available: number;
        seated: number;
        stuck: number;
    }> {
        try {
            const { data: horses } = await supabase
                .from('profiles')
                .select('id, horse_status')
                .eq('is_horse', true);

            if (!horses) return { total: 0, available: 0, seated: 0, stuck: 0 };

            let available = 0, seated = 0, stuck = 0;
            for (const h of horses) {
                if (h.horse_status === 'available') available++;
                else if (h.horse_status === 'seated') seated++;
                else stuck++;
            }

            return { total: horses.length, available, seated, stuck };
        } catch {
            return { total: 0, available: 0, seated: 0, stuck: 0 };
        }
    }
}

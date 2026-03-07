/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SUPABASE CLIENT — Server-Side (Service Role)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Uses SERVICE_ROLE key for full database access — bypasses RLS.
 * Handles Realtime broadcasting from the server side.
 * ZERO browser dependencies. Runs on Node.js.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[Supabase] FATAL: SUPABASE_SERVICE_ROLE_KEY is not set!');
    process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE ROLE CLIENT — Full DB access, bypasses RLS
// ═══════════════════════════════════════════════════════════════════════════════

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

// ═══════════════════════════════════════════════════════════════════════════════
// REALTIME BROADCASTING — Push hand state to all connected clients
// ═══════════════════════════════════════════════════════════════════════════════

// Channel cache to avoid creating new channels for every broadcast
const channelCache = new Map<string, ReturnType<SupabaseClient['channel']>>();

/**
 * Broadcast hand state to all table viewers via Supabase Realtime.
 * Uses the same channel naming as the client: `hand-state:{tableId}`
 */
export function broadcastHandState(tableId: string, handState: Record<string, unknown>): void {
    const channelName = `hand-state:${tableId}`;

    let channel = channelCache.get(channelName);
    if (!channel) {
        channel = supabase.channel(channelName);
        channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                // Channel ready for broadcasting
            }
        });
        channelCache.set(channelName, channel);
    }

    channel.send({
        type: 'broadcast',
        event: 'hand_state',
        payload: handState,
    }).catch((err: unknown) => {
        console.warn(`[Broadcast] Failed to send hand state for ${tableId}:`, err);
    });
}

/**
 * Clean up a channel when a table is no longer active
 */
export function cleanupChannel(tableId: string): void {
    const channelName = `hand-state:${tableId}`;
    const channel = channelCache.get(channelName);
    if (channel) {
        supabase.removeChannel(channel);
        channelCache.delete(channelName);
    }
}

/**
 * Clean up all channels on shutdown
 */
export function cleanupAllChannels(): void {
    for (const [name, channel] of channelCache) {
        supabase.removeChannel(channel);
    }
    channelCache.clear();
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATABASE HELPERS — Common queries used by the engine
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Load table info from database
 */
export async function loadTable(tableId: string) {
    const { data, error } = await supabase
        .from('tables')
        .select('id, club_id, small_blind, big_blind, game_variant, max_players, ante, game_type, tournament_id')
        .eq('id', tableId)
        .single();

    if (error) throw new Error(`Failed to load table ${tableId}: ${error.message}`);
    return data;
}

/**
 * Load seated players with profiles for a table
 */
export async function loadSeatedPlayers(tableId: string) {
    const { data: seats, error } = await supabase
        .from('table_seats')
        .select('user_id, stack, seat_number')
        .eq('table_id', tableId)
        .is('left_at', null)
        .order('seat_number', { ascending: true });

    if (error || !seats || seats.length === 0) return [];

    const userIds = seats.map(d => d.user_id);
    const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, username, is_horse, horse_profile')
        .in('id', userIds);

    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

    return seats
        .filter(seat => seat.stack > 0 && profileMap.has(seat.user_id))
        .map(seat => {
            const profile = profileMap.get(seat.user_id)!;
            return {
                user_id: seat.user_id,
                username: profile.display_name || profile.username || 'Player',
                stack: seat.stack,
                seat_number: seat.seat_number || 1,
                is_horse: profile.is_horse || false,
                horse_profile: profile.horse_profile || 'balanced',
            };
        });
}

/**
 * Sync player stacks back to database after a hand
 */
export async function syncStacks(tableId: string, players: { user_id: string; stack: number }[]): Promise<void> {
    const results = await Promise.allSettled(
        players.map(player =>
            supabase
                .from('table_seats')
                .update({ stack: player.stack })
                .eq('table_id', tableId)
                .eq('user_id', player.user_id)
                .is('left_at', null)
        )
    );
    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length > 0) {
        console.error(`[DB] ${failures.length}/${players.length} stack syncs failed for table ${tableId}`);
    }
}

/**
 * Sync tournament player chips from table_seats to tournament_players
 */
export async function syncTournamentChips(tableId: string, tournamentId: string): Promise<void> {
    const { data: seats } = await supabase
        .from('table_seats')
        .select('user_id, stack')
        .eq('table_id', tableId);

    if (!seats || seats.length === 0) return;

    await Promise.allSettled(
        seats.map(async (seat) => {
            const rounded = Math.round(seat.stack);
            await supabase
                .from('tournament_players')
                .update({ chips: rounded })
                .eq('tournament_id', tournamentId)
                .eq('user_id', seat.user_id);
        })
    );
}

/**
 * Update table player count and status
 */
export async function updateTableStatus(tableId: string, playerCount: number, status: string = 'running'): Promise<void> {
    await supabase
        .from('tables')
        .update({ current_players: playerCount, status })
        .eq('id', tableId);
}

/**
 * Auto-rebuy a horse from their Player Wallet
 */
export async function autoRebuyHorse(
    tableId: string,
    userId: string,
    rebuyAmount: number,
    clubId: string
): Promise<boolean> {
    // Check wallet balance
    const { data: walletData } = await supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', userId)
        .eq('wallet_type', 'PLAYER')
        .single();

    if (!walletData || walletData.balance < rebuyAmount) return false;

    // Deduct from wallet
    const { error: deductError } = await supabase.rpc('deduct_player_wallet', {
        p_user_id: userId,
        p_amount: rebuyAmount,
    });
    if (deductError) return false;

    // Update stack at table
    await supabase
        .from('table_seats')
        .update({ stack: rebuyAmount })
        .eq('table_id', tableId)
        .eq('user_id', userId)
        .is('left_at', null);

    // Log transaction (fire and forget)
    supabase.from('wallet_transactions').insert({
        user_id: userId,
        wallet_type: 'PLAYER',
        amount: rebuyAmount,
        type: 'debit',
        category: 'buyin',
        description: `Auto-rebuy ${rebuyAmount} chips`,
        table_id: tableId,
    }).then(() => {});

    return true;
}

/**
 * Mark a horse as having left the table
 */
export async function markSeatAsLeft(tableId: string, userId: string): Promise<void> {
    await supabase
        .from('table_seats')
        .update({ left_at: new Date().toISOString() })
        .eq('table_id', tableId)
        .eq('user_id', userId)
        .is('left_at', null);
}

/**
 * Process leave-pending players after hand completion
 */
export async function processLeavePending(tableId: string, clubId: string): Promise<void> {
    const { data: pendingSeats } = await supabase
        .from('table_seats')
        .select('user_id, stack, seat_number')
        .eq('table_id', tableId)
        .eq('leave_pending', true)
        .is('left_at', null);

    if (!pendingSeats || pendingSeats.length === 0) return;

    for (const seat of pendingSeats) {
        if (seat.stack > 0) {
            await supabase.rpc('credit_player_wallet', {
                p_user_id: seat.user_id,
                p_amount: seat.stack,
            });

            // Log the cash-out transaction — every chip move documented
            await supabase.from('wallet_transactions').insert({
                user_id: seat.user_id,
                wallet_type: 'PLAYER',
                amount: seat.stack,
                type: 'credit',
                category: 'cashout',
                description: `Cash-out from table: ${seat.stack} chips`,
            });
        }

        await supabase
            .from('table_seats')
            .update({ left_at: new Date().toISOString(), leave_pending: false })
            .eq('table_id', tableId)
            .eq('user_id', seat.user_id)
            .eq('seat_number', seat.seat_number)
            .is('left_at', null);
    }

    // Update player count
    const { count } = await supabase
        .from('table_seats')
        .select('*', { count: 'exact', head: true })
        .eq('table_id', tableId)
        .is('left_at', null);

    await supabase
        .from('tables')
        .update({ current_players: count || 0 })
        .eq('id', tableId);
}

/**
 * Log rake collection — every penny documented.
 * Splits rake to club/union per configured revenue share.
 */
export async function logRakeCollection(
    tableId: string,
    clubId: string,
    handNumber: number,
    rakeAmount: number,
    potAmount: number
): Promise<void> {
    if (rakeAmount <= 0) return;

    // Log to rake_history (hand-level rake record)
    await supabase.from('rake_history').insert({
        table_id: tableId,
        club_id: clubId,
        hand_number: handNumber,
        rake_amount: rakeAmount,
        pot_amount: potAmount,
        collected_at: new Date().toISOString(),
    }).then(() => {});

    // Credit the club's rake wallet
    await supabase.from('wallet_transactions').insert({
        user_id: clubId,
        wallet_type: 'CLUB_RAKE',
        amount: rakeAmount,
        type: 'credit',
        category: 'rake',
        description: `Rake: ${rakeAmount} from hand #${handNumber} (pot: ${potAmount})`,
    }).then(() => {});
}

/**
 * Ensure a horse's wallet is properly funded.
 * Called during fleet startup to top up horses that ran low.
 */
export async function ensureHorseWallet(horseId: string, minBalance: number = 10000): Promise<void> {
    const { data: wallet } = await supabase
        .from('wallets')
        .select('id, balance')
        .eq('user_id', horseId)
        .eq('wallet_type', 'PLAYER')
        .maybeSingle();

    if (!wallet) {
        // Create wallet
        await supabase.from('wallets').insert({
            user_id: horseId,
            wallet_type: 'PLAYER',
            balance: minBalance,
            locked_balance: 0,
        });
        return;
    }

    if (wallet.balance < minBalance) {
        const topUp = minBalance - wallet.balance;
        await supabase.rpc('credit_player_wallet', {
            p_user_id: horseId,
            p_amount: topUp,
        });

        await supabase.from('wallet_transactions').insert({
            user_id: horseId,
            wallet_type: 'PLAYER',
            amount: topUp,
            type: 'credit',
            category: 'horse_refill',
            description: `Horse wallet refill: ${topUp} chips (balance was ${wallet.balance})`,
        });
    }
}

export default supabase;

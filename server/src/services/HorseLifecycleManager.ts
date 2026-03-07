/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * HORSE LIFECYCLE MANAGER — Server-Side Status Tracking + Cleanup
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Manages the complete lifecycle of horses on the server:
 * - Tracks status transitions (available → seated → tournament → leaving → available)
 * - Cleans up after tournaments complete (reset horse status)
 * - Detects stuck/orphaned horses and resets them
 * - Cleans up stale table seats and cancelled tournaments
 * - Maintains horse fleet integrity 24/7
 *
 * ZERO browser dependency — this is the SERVER version.
 */

import { supabase } from './supabase.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const MONITORING_INTERVAL = 60000;        // 60 seconds between checks
const STUCK_HORSE_THRESHOLD_HOURS = 2;    // Consider horse stuck after 2 hours
const STALE_SNG_THRESHOLD_HOURS = 2;      // Cancel SNGs older than 2 hours that never started
const STALE_SEAT_THRESHOLD_HOURS = 4;     // Cleanup table_seats older than 4 hours

// ═══════════════════════════════════════════════════════════════════════════════
// HORSE LIFECYCLE MANAGER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class HorseLifecycleManager {
    private isRunning = false;
    private intervalHandle: ReturnType<typeof setInterval> | null = null;

    // ─────────────────────────────────────────────────────────────────────────
    // START / STOP
    // ─────────────────────────────────────────────────────────────────────────

    start(): void {
        if (this.isRunning) {
            console.log('[Lifecycle] Already running');
            return;
        }

        this.isRunning = true;
        console.log(`[Lifecycle] Starting monitoring (interval: ${MONITORING_INTERVAL}ms)`);

        // Initial check
        this.performMaintenanceCycle();

        // Recurring checks
        this.intervalHandle = setInterval(() => {
            this.performMaintenanceCycle();
        }, MONITORING_INTERVAL);
    }

    stop(): void {
        if (!this.isRunning) return;

        this.isRunning = false;
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
        }

        console.log('[Lifecycle] Stopped');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MAIN MAINTENANCE CYCLE
    // ─────────────────────────────────────────────────────────────────────────

    private async performMaintenanceCycle(): Promise<void> {
        try {
            await Promise.all([
                this.cleanupFinishedTournaments(),
                this.detectStuckHorses(),
                this.cleanupStaleSNGs(),
                this.cleanupStaleSeats(),
            ]);
        } catch (err) {
            console.error('[Lifecycle] Maintenance cycle error:', err);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TOURNAMENT CLEANUP
    // ─────────────────────────────────────────────────────────────────────────

    private async cleanupFinishedTournaments(): Promise<void> {
        try {
            const { data: tournaments } = await supabase
                .from('tournaments')
                .select('id, name')
                .in('status', ['FINISHED', 'CANCELLED']);

            if (!tournaments || tournaments.length === 0) return;

            let horsesReset = 0;

            for (const tournament of tournaments) {
                try {
                    const { data: players } = await supabase
                        .from('tournament_players')
                        .select('user_id')
                        .eq('tournament_id', tournament.id);

                    if (!players || players.length === 0) continue;

                    const playerIds = players.map(p => p.user_id);
                    const { data: profiles } = await supabase
                        .from('profiles')
                        .select('id')
                        .in('id', playerIds)
                        .eq('is_horse', true);

                    if (!profiles || profiles.length === 0) continue;

                    for (const profile of profiles) {
                        const reset = await this.resetHorse(profile.id);
                        if (reset) horsesReset++;
                    }

                    // Clean up tournament_players for horses
                    await supabase
                        .from('tournament_players')
                        .delete()
                        .eq('tournament_id', tournament.id)
                        .in('user_id', profiles.map(p => p.id));
                } catch (err) {
                    console.error(`[Lifecycle] Error processing tournament ${tournament.id}:`, err);
                }
            }

            if (horsesReset > 0) {
                console.log(`[Lifecycle] Reset ${horsesReset} horses from ${tournaments.length} finished tournaments`);
            }
        } catch (err) {
            console.error('[Lifecycle] cleanupFinishedTournaments error:', err);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STUCK HORSE DETECTION
    // ─────────────────────────────────────────────────────────────────────────

    private async detectStuckHorses(): Promise<void> {
        try {
            const thresholdTime = new Date(
                Date.now() - STUCK_HORSE_THRESHOLD_HOURS * 60 * 60 * 1000
            ).toISOString();

            const { data: stuckHorses } = await supabase
                .from('profiles')
                .select('id, display_name, horse_status, updated_at')
                .eq('is_horse', true)
                .neq('horse_status', 'available')
                .lt('updated_at', thresholdTime);

            if (!stuckHorses || stuckHorses.length === 0) return;

            let forcedResets = 0;

            for (const horse of stuckHorses) {
                try {
                    // Check if horse has active seat
                    const { data: activeSeat } = await supabase
                        .from('table_seats')
                        .select('table_id')
                        .eq('user_id', horse.id)
                        .is('left_at', null)
                        .maybeSingle();

                    if (activeSeat) continue; // Still has active seat

                    // Check if in active tournament
                    const { data: activeTournament } = await supabase
                        .from('tournament_players')
                        .select('tournament_id')
                        .eq('user_id', horse.id)
                        .eq('status', 'in_progress')
                        .maybeSingle();

                    if (activeTournament) continue; // Still in tournament

                    // Force reset
                    const reset = await this.resetHorse(horse.id);
                    if (reset) forcedResets++;
                } catch {
                    // Skip individual horse errors
                }
            }

            if (forcedResets > 0) {
                console.log(`[Lifecycle] Force-reset ${forcedResets} stuck horses`);
            }
        } catch (err) {
            console.error('[Lifecycle] detectStuckHorses error:', err);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HORSE RESET
    // ─────────────────────────────────────────────────────────────────────────

    async resetHorse(horseId: string): Promise<boolean> {
        try {
            // Clear stale seat records
            await supabase
                .from('table_seats')
                .update({ left_at: new Date().toISOString() })
                .eq('user_id', horseId)
                .is('left_at', null);

            // Reset profile status
            const { error } = await supabase
                .from('profiles')
                .update({ horse_status: 'available', updated_at: new Date().toISOString() })
                .eq('id', horseId);

            if (error) {
                console.error(`[Lifecycle] Failed to reset horse ${horseId}:`, error.message);
                return false;
            }

            return true;
        } catch {
            return false;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STALE SNG CLEANUP
    // ─────────────────────────────────────────────────────────────────────────

    private async cleanupStaleSNGs(): Promise<void> {
        try {
            const thresholdTime = new Date(
                Date.now() - STALE_SNG_THRESHOLD_HOURS * 60 * 60 * 1000
            ).toISOString();

            const { data: staleSNGs } = await supabase
                .from('tournaments')
                .select('id, name, buy_in_amount')
                .eq('variant', 'sng')
                .neq('status', 'RUNNING')
                .neq('status', 'FINISHED')
                .neq('status', 'CANCELLED')
                .lt('created_at', thresholdTime);

            if (!staleSNGs || staleSNGs.length === 0) return;

            let cancelled = 0;

            for (const sng of staleSNGs) {
                try {
                    const buyInAmount = sng.buy_in_amount || 0;

                    // Get registered players for refund
                    const { data: players } = await supabase
                        .from('tournament_players')
                        .select('user_id')
                        .eq('tournament_id', sng.id);

                    if (players && players.length > 0 && buyInAmount > 0) {
                        for (const player of players) {
                            await supabase.rpc('credit_player_wallet', {
                                p_user_id: player.user_id,
                                p_amount: buyInAmount,
                            });
                        }
                    }

                    await supabase
                        .from('tournaments')
                        .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
                        .eq('id', sng.id);

                    cancelled++;
                } catch {
                    // Skip individual errors
                }
            }

            if (cancelled > 0) {
                console.log(`[Lifecycle] Cancelled ${cancelled} stale SNGs`);
            }
        } catch {
            // Non-critical
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STALE SEAT CLEANUP
    // ─────────────────────────────────────────────────────────────────────────

    private async cleanupStaleSeats(): Promise<void> {
        try {
            const thresholdTime = new Date(
                Date.now() - STALE_SEAT_THRESHOLD_HOURS * 60 * 60 * 1000
            ).toISOString();

            const { data: staleSeats } = await supabase
                .from('table_seats')
                .select('id, table_id, user_id, joined_at')
                .is('left_at', null)
                .lt('joined_at', thresholdTime);

            if (!staleSeats || staleSeats.length === 0) return;

            let cleaned = 0;
            for (const seat of staleSeats) {
                try {
                    await supabase
                        .from('table_seats')
                        .update({ left_at: new Date().toISOString(), status: 'left' })
                        .eq('id', seat.id);
                    cleaned++;

                    // If horse, reset to available
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('is_horse')
                        .eq('id', seat.user_id)
                        .single();

                    if (profile?.is_horse) {
                        await this.resetHorse(seat.user_id);
                    }
                } catch {
                    // Skip individual errors
                }
            }

            if (cleaned > 0) {
                console.log(`[Lifecycle] Cleaned up ${cleaned} stale table seats`);
            }
        } catch {
            // Non-critical
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TOURNAMENT WINNINGS / ELIMINATION PROCESSING
    // ─────────────────────────────────────────────────────────────────────────

    async processWinnings(horseId: string, amount: number, tournamentId: string): Promise<boolean> {
        try {
            const { error } = await supabase.rpc('credit_player_wallet', {
                p_user_id: horseId,
                p_amount: amount,
            });

            if (error) {
                console.error(`[Lifecycle] Failed to credit winnings to ${horseId}:`, error.message);
                return false;
            }

            await supabase.from('wallet_transactions').insert({
                user_id: horseId,
                wallet_type: 'PLAYER',
                amount,
                type: 'credit',
                category: 'tournament_winnings',
                description: `Tournament winnings: ${amount} credits`,
            });

            return true;
        } catch {
            return false;
        }
    }

    async processElimination(horseId: string, tournamentId: string): Promise<boolean> {
        try {
            await supabase
                .from('tournament_players')
                .update({ status: 'eliminated', updated_at: new Date().toISOString() })
                .eq('user_id', horseId)
                .eq('tournament_id', tournamentId);

            return await this.resetHorse(horseId);
        } catch {
            return false;
        }
    }
}

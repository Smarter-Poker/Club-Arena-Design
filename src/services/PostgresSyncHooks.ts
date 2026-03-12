import { supabase } from '../lib/supabase';
import { masterBus } from '../core/MasterBus';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * POSTGRES SYNC HOOKS (Phase 7: Absolute Sync Perfection)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This service ensures that even if absolute external agents (Cron Jobs, Stripe Webhooks,
 * Supabase Admin Dashboard operations, Edge Functions) mutate the database completely
 * outside of the user's React session, the user's UI still updates instantly via the MasterBus.
 *
 * Row Level Security (RLS) automatically ensures the client only receives network packets
 * for data they are allowed to see.
 */
class PostgresSyncHooksService {
  private channel: RealtimeChannel | null = null;
  private initialized: boolean = false;

  init(userId: string) {
    if (this.initialized) return;

    // Use a deterministic global channel name scoped to the user to avoid leaks/re-subs
    this.channel = supabase.channel(`global_db_sync:${userId}`);

    this.channel
      // 1. Wallets (Financial integrity)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'wallets', filter: `user_id=eq.${userId}` },
        (payload) => {
          console.debug('[PostgresSync] External Wallet mutation detected:', payload);
          // Broadcast to local UI components
          masterBus.emit('BALANCE_UPDATED', { source: 'postgres_sync' });
          const w = payload.new as any;
          masterBus.emit('WALLET_REFRESHED', {
            walletType: w.wallet_type || 'PLAYER',
            available: (w.balance || 0) - (w.locked_balance || 0),
            total: w.balance || 0,
          });
        }
      )
      // 2. Profiles (Display names, avatars, diamonds)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (payload) => {
          console.debug('[PostgresSync] External Profile mutation detected:', payload);
          masterBus.emit('PROFILE_UPDATED', { userId: payload.new.id, updates: payload.new });

          const newDiamonds = (payload.new as any).diamonds;
          const oldDiamonds = (payload.old as any)?.diamonds;
          if (newDiamonds != null && oldDiamonds != null && newDiamonds !== oldDiamonds) {
            masterBus.emit('DIAMOND_BALANCE_CHANGED', {
              newBalance: newDiamonds,
              delta: newDiamonds - oldDiamonds,
              source: 'postgres_sync',
            });
          }
        }
      )
      // 3. Clubs
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'clubs' }, (payload) => {
        console.debug('[PostgresSync] External Club mutation detected:', payload);
        masterBus.emit('CLUB_UPDATED', { clubId: payload.new.id });
      })
      // 4. Unions
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'unions' }, (payload) => {
        console.debug('[PostgresSync] External Union mutation detected:', payload);
        masterBus.emit('UNION_UPDATED', { unionId: payload.new.id });
      })
      // 5. User Settings
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_table_settings',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.debug('[PostgresSync] External Settings mutation detected:', payload);
          masterBus.emit('SETTINGS_UPDATED', { settings: payload.new });
        }
      )
      // 6. Club Memberships
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'club_members', filter: `user_id=eq.${userId}` },
        (payload) => {
          console.debug('[PostgresSync] External Membership mutation detected:', payload);
          // Only trigger if role or status changes heavily affecting access
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            masterBus.emit('CLUB_UPDATED', { clubId: payload.new.club_id });
          } else if (payload.eventType === 'DELETE') {
            masterBus.emit('CLUB_LEFT', { clubId: payload.old.club_id });
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.info(`[PostgresSync] Absolute Replication Hook Mounted for user ${userId}.`);
          this.initialized = true;
        }
      });
  }

  destroy() {
    if (this.channel) {
      this.channel.unsubscribe();
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.initialized = false;
  }
}

export const postgresSyncHooks = new PostgresSyncHooksService();

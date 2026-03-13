/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  GLOBAL WAITLIST LISTENER — App-wide auto-seating (v2.0 — Resilient)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Runs in the background (App.tsx) and listens for seat vacancies across all tables.
 * If a seat opens up and the active user is #1 on the waitlist, it auto-navigates.
 *
 * v2.0 Improvements:
 * - #3: Auto-resubscribe on Supabase Realtime disconnect
 * - #10: Emits WAITLIST_POSITION_CHANGED so the UI can show queue position
 */

import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuthUser } from '../../hooks/useAuthUser';
import { masterBus } from '../../core/MasterBus';
import { useToast } from './Toast';
import type { RealtimeChannel } from '@supabase/supabase-js';

const WAITLIST_CHANNEL_KEY = 'global-waitlist-auto-seat';

export default function GlobalWaitlistListener() {
  const { user } = useAuthUser();
  const navigate = useNavigate();
  const toast = useToast();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Core subscription logic (extracted for reuse on reconnect) ───
  const setupChannel = useCallback(() => {
    if (!user?.id) return null;

    // Prevent duplicate channels
    if (channelRef.current) {
      masterBus.removeRegisteredChannel(WAITLIST_CHANNEL_KEY);
    }

    const channel = masterBus.getOrCreateChannel(WAITLIST_CHANNEL_KEY);
    channel.on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'table_seats',
      },
      async (payload) => {
        const vacatedTableId = (payload.old as any)?.table_id;
        if (!vacatedTableId) return;

        try {
          // Immediately query if the user is #1 on this table's waitlist
          const { data } = await supabase
            .from('waitlist_entries')
            .select('id, position, poker_tables(name)')
            .eq('user_id', user.id)
            .eq('table_id', vacatedTableId)
            .maybeSingle();

          if (data && data.position === 1) {
            const tableName = (data.poker_tables as any)?.name || 'the table';
            toast.success(`Seat available at ${tableName}! Joining in 3s...`);
            // Auto-navigate to the table where the seat opened
            setTimeout(() => {
              navigate(`/table/${vacatedTableId}`);
            }, 3000);
          }

          // #10: Emit position change for any waitlist entry
          if (data) {
            masterBus.emit('WAITLIST_POSITION_CHANGED', {
              tableId: vacatedTableId,
              position: data.position,
              tableName: (data.poker_tables as any)?.name || 'Unknown',
            });
          }
        } catch (err) {
          console.error('[GlobalWaitlistListener] Error checking waitlist position:', err);
        }
      }
    );

    // #3: System event listener for disconnect recovery
    channel.on('system' as any, {} as any, (status: any) => {
      if (status === 'disconnected' || status?.event === 'disconnected') {
        console.warn('[GlobalWaitlistListener] Realtime disconnected — scheduling reconnect...');
        // Auto-reconnect after 3 seconds
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('[GlobalWaitlistListener] Attempting reconnect...');
          channelRef.current = setupChannel();
        }, 3000);
      }
    });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[GlobalWaitlistListener] Connected and listening');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[GlobalWaitlistListener] Channel error/timeout — scheduling reconnect...');
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          channelRef.current = setupChannel();
        }, 5000);
      }
    });

    channelRef.current = channel;
    return channel;
  }, [user?.id, navigate, toast]);

  useEffect(() => {
    const channel = setupChannel();

    return () => {
      if (channel) masterBus.removeRegisteredChannel(WAITLIST_CHANNEL_KEY);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [setupChannel]);

  return null; // Invisible global background listener
}

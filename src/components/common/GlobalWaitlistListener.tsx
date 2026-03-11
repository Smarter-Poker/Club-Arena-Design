/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  GLOBAL WAITLIST LISTENER — App-wide auto-seating
 * ═══════════════════════════════════════════════════════════════════════════════
 * Runs in the background (App.tsx) and listens for seat vacancies across all tables.
 * If a seat opens up and the active user is #1 on the waitlist, it auto-navigates.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../stores/useUserStore';
import { useToast } from './Toast';

export default function GlobalWaitlistListener() {
    const { user } = useUserStore();
    const navigate = useNavigate();
    const toast = useToast();

    useEffect(() => {
        if (!user?.id) return;

        // Auto-seat: watch for table_seats vacancies globally
        const seatChannel = supabase
            .channel('global-waitlist-auto-seat')
            .on(
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
                    } catch (err) {
                        console.error('[GlobalWaitlistListener] Error checking waitlist position:', err);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(seatChannel);
        };
    }, [user?.id, navigate]);

    return null; // Invisible global background listener
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  WAITLIST MANAGER — Table Waitlist
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../stores/useUserStore';
import { useToast } from '../common/Toast';
import './WaitlistManager.css';

interface WaitlistManagerProps {
    tableId: string;
    isAdmin?: boolean;
    onSeatPlayer?: (userId: string) => void;
}

interface WaitlistEntry {
    id: string;
    userId: string;
    username: string;
    avatarUrl: string;
    position: number;
    joinedAt: Date;
    preferredSeat?: number;
}

export function WaitlistManager({ tableId, isAdmin, onSeatPlayer }: WaitlistManagerProps) {
    const { user } = useUserStore();
    const toast = useToast();

    const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [myPosition, setMyPosition] = useState<number | null>(null);

    useEffect(() => {
        loadWaitlist();

        const channel = supabase
            .channel(`waitlist-${tableId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'table_waitlists',
                filter: `table_id=eq.${tableId}`
            }, () => loadWaitlist())
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [tableId]);

    const loadWaitlist = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('table_waitlists')
                .select('*, player:profiles!user_id(username, avatar_url)')
                .eq('table_id', tableId)
                .order('position', { ascending: true });

            if (!error && data) {
                const list = data.map((w, idx) => {
                    const player = Array.isArray(w.player) ? w.player[0] : w.player;
                    return {
                        id: w.id,
                        userId: w.user_id,
                        username: player?.username || 'Unknown',
                        avatarUrl: player?.avatar_url || '',
                        position: idx + 1,
                        joinedAt: new Date(w.created_at),
                        preferredSeat: w.preferred_seat
                    };
                });
                setWaitlist(list);

                const myEntry = list.find(w => w.userId === user?.id);
                setMyPosition(myEntry?.position || null);
            }
        } catch (error) {
            toast.error('Failed to load waitlist');
        }
        setLoading(false);
    };

    const joinWaitlist = async () => {
        if (!user?.id) return;

        try {
            const { error } = await supabase
                .from('table_waitlists')
                .insert({
                    table_id: tableId,
                    user_id: user.id,
                    position: waitlist.length + 1
                });

            if (error) throw error;
            toast.success('Joined waitlist!');
            loadWaitlist();
        } catch (error) {
            toast.error('Failed to join waitlist');
        }
    };

    const leaveWaitlist = async () => {
        if (!user?.id) return;

        try {
            await supabase
                .from('table_waitlists')
                .delete()
                .eq('table_id', tableId)
                .eq('user_id', user.id);

            toast.success('Left waitlist');
            loadWaitlist();
        } catch (error) {
            toast.error('Failed to leave waitlist');
        }
    };

    const seatPlayer = async (entry: WaitlistEntry) => {
        if (!isAdmin) return;

        try {
            await supabase
                .from('table_waitlists')
                .delete()
                .eq('id', entry.id);

            onSeatPlayer?.(entry.userId);
            toast.success(`${entry.username} seated`);
            loadWaitlist();
        } catch (error) {
            toast.error('Failed to seat player');
        }
    };

    if (loading) {
        return <div className="waitlist loading">Loading...</div>;
    }

    return (
        <div className="waitlist">
            <div className="waitlist__header">
                <h3> Waitlist ({waitlist.length})</h3>
                {myPosition !== null ? (
                    <button className="leave-btn" onClick={leaveWaitlist}>
                        Leave (#{myPosition})
                    </button>
                ) : (
                    <button className="join-btn" onClick={joinWaitlist}>
                        Join
                    </button>
                )}
            </div>

            {waitlist.length === 0 ? (
                <div className="empty-state">No one waiting</div>
            ) : (
                <div className="waitlist__list">
                    {waitlist.map(entry => (
                        <div
                            key={entry.id}
                            className={`waitlist-row ${entry.userId === user?.id ? 'me' : ''}`}
                        >
                            <span className="position">#{entry.position}</span>
                            <span className="avatar">{entry.avatarUrl}</span>
                            <span className="username">
                                {entry.username}
                                {entry.preferredSeat && <span className="pref">Seat {entry.preferredSeat}</span>}
                            </span>
                            {isAdmin && (
                                <button
                                    className="seat-btn"
                                    onClick={() => seatPlayer(entry)}
                                >
                                    Seat
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default WaitlistManager;

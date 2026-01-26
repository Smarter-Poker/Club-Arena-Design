/**
 *  WAITLIST PAGE — Table Waitlist with Real-Time Updates
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { waitlistService, type WaitlistEntry as ServiceEntry } from '../services/WaitlistService';
import { supabase } from '../lib/supabase';
import { useUserStore } from '../stores/useUserStore';
import SmarterHeader from '../components/layout/SmarterHeader';
import './WaitlistPage.css';

interface WaitlistEntry {
    id: string;
    table_id: string;
    table_name: string;
    stakes: string;
    game_type: string;
    position: number;
    joined_at: string;
    estimated_wait: number; // minutes
}

export default function WaitlistPage() {
    const navigate = useNavigate();
    const { user } = useUserStore();

    const [entries, setEntries] = useState<WaitlistEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [leavingId, setLeavingId] = useState<string | null>(null);

    useEffect(() => {
        if (user?.id) {
            loadWaitlist();

            // Subscribe to real-time waitlist changes
            const channel = supabase
                .channel('user-waitlist')
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'waitlist',
                    },
                    (payload) => {
                        // Refresh waitlist on any change
                        // Position recalculation happens server-side
                        loadWaitlist();
                    }
                )
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        }
    }, [user?.id]);

    const loadWaitlist = async () => {
        if (!user?.id) return;
        setLoading(true);
        try {
            const waitlists = await waitlistService.getUserWaitlists(user.id);
            setEntries(waitlists.map((e: ServiceEntry) => ({
                id: e.id,
                table_id: e.tableId,
                table_name: e.tableName,
                stakes: '', // Will be loaded from table data
                game_type: 'NLH',
                position: e.position,
                joined_at: e.joinedAt,
                estimated_wait: e.position * 5, // rough estimate
            })));
        } catch (error) {
            console.error('Failed to load waitlist:', error);
        }
        setLoading(false);
    };

    const leaveWaitlist = async (tableId: string, entryId: string) => {
        if (!user?.id) return;
        setLeavingId(entryId);
        try {
            const success = await waitlistService.leave(tableId, user.id);
            if (success) {
                setEntries(prev => prev.filter(e => e.id !== entryId));
            }
        } catch (error) {
            console.error('Failed to leave waitlist:', error);
        }
        setLeavingId(null);
    };

    const getGameTypeLabel = (type: string): string => {
        switch (type.toLowerCase()) {
            case 'nlh': return "No Limit Hold'em";
            case 'plo': return 'Pot Limit Omaha';
            case 'plo5': return 'PLO 5-Card';
            default: return type.toUpperCase();
        }
    };

    const formatWaitTime = (minutes: number): string => {
        if (minutes < 1) return 'Next up!';
        if (minutes >= 60) return `~${Math.round(minutes / 60)}h`;
        return `~${minutes} min`;
    };

    return (
        <div className="waitlist-page">
            <SmarterHeader title=" My Waitlist" />

            {/* Real-time indicator */}
            {entries.length > 0 && (
                <div className="realtime-indicator">
                    <span className="live-dot"></span>
                    <span>Live updates enabled</span>
                </div>
            )}

            <div className="waitlist-content">
                {loading ? (
                    <div className="loading-state"><div className="spinner" /></div>
                ) : entries.length === 0 ? (
                    <div className="empty-state">
                        <span className="empty-icon"></span>
                        <h3>No Active Waitlists</h3>
                        <p>You're not on any table waitlists</p>
                        <button className="btn btn-primary" onClick={() => navigate('/lobby')}>
                            Browse Tables
                        </button>
                    </div>
                ) : (
                    <div className="waitlist-entries">
                        {entries.map(entry => (
                            <div key={entry.id} className={`waitlist-card ${entry.position === 1 ? 'next-up' : ''}`}>
                                <div className="waitlist-info">
                                    <h4 className="table-name">{entry.table_name}</h4>
                                    <span className="table-details">
                                        {getGameTypeLabel(entry.game_type)} • {entry.stakes}
                                    </span>
                                </div>
                                <div className="waitlist-position">
                                    <span className={`position-number ${entry.position === 1 ? 'highlight' : ''}`}>
                                        #{entry.position}
                                    </span>
                                    <span className="position-label">
                                        {entry.position === 1 ? 'next up!' : 'in line'}
                                    </span>
                                </div>
                                <div className="waitlist-actions">
                                    <span className="wait-time">{formatWaitTime(entry.estimated_wait)}</span>
                                    <button
                                        className={`btn btn-ghost btn-sm leave-btn ${leavingId === entry.id ? 'loading' : ''}`}
                                        onClick={() => leaveWaitlist(entry.table_id, entry.id)}
                                        disabled={leavingId === entry.id}
                                    >
                                        {leavingId === entry.id ? 'Leaving...' : 'Leave'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}


/**
 *  CLUB ENGINE — Table Card Component
 * Displays a single table in the lobby grid
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { waitlistService } from '../../services/WaitlistService';
import { useUserStore } from '../../stores/useUserStore';
import { supabase } from '../../lib/supabase';
import styles from './TableCard.module.css';
import type { PokerTable } from '../../types/database.types';
import { useToast } from '../common/Toast';

interface TableCardProps {
    table: PokerTable;
}

const GAME_LABELS: Record<string, string> = {
    nlh: 'NL Hold\'em',
    flh: 'FL Hold\'em',
    short_deck: 'Short Deck',
    plo4: 'PLO4',
    plo5: 'PLO5',
    plo6: 'PLO6',
    plo_hilo: 'PLO Hi-Lo',
    ofc: 'OFC',
    ofc_pineapple: 'OFC Pineapple',
    double_board: 'Double Board',
    pineapple: 'Pineapple',
    crazy_pineapple: 'Crazy Pineapple',
    mixed: 'Mixed',
};

const GAME_ICONS: Record<string, string> = {
    nlh: '♠',
    flh: '♠',
    short_deck: '6+',
    plo4: '',
    plo5: '',
    plo6: '',
    plo_hilo: 'HL',
    ofc: '',
    ofc_pineapple: '',
    double_board: '',
    pineapple: '',
    crazy_pineapple: '',
    mixed: '',
};

export default function TableCard({ table }: TableCardProps) {
    const navigate = useNavigate();
    const { user } = useUserStore();
    const toast = useToast();
    const [isJoiningWaitlist, setIsJoiningWaitlist] = useState(false);

    // Map PokerTable fields to display values
    const players = table.current_players || 0;
    const seats = table.max_players || 9;
    const seatsAvailable = seats - players;
    const isFull = seatsAvailable === 0;

    // Live waitlist count from DB
    const [waiting, setWaiting] = useState(0);
    const hasWaitlist = waiting > 0;

    // Average pot from recent completed hands
    const [avgPot, setAvgPot] = useState(0);

    useEffect(() => {
        // Fetch waitlist count
        supabase
            .from('table_waitlists')
            .select('id', { count: 'exact', head: true })
            .eq('table_id', table.id)
            .eq('status', 'waiting')
            .then(({ count }) => {
                if (count !== null) setWaiting(count);
            });

        // Fetch average pot from last 20 completed hands
        supabase
            .from('hands')
            .select('pot')
            .eq('table_id', table.id)
            .eq('status', 'completed')
            .gt('pot', 0)
            .order('ended_at', { ascending: false })
            .limit(20)
            .then(({ data }) => {
                if (data && data.length > 0) {
                    const avg = data.reduce((sum, h) => sum + (h.pot || 0), 0) / data.length;
                    setAvgPot(Math.trunc(avg * 100) / 100);
                }
            });
    }, [table.id]);

    const handleJoin = async () => {
        if (isFull && user?.id) {
            // Join waitlist for full tables using WaitlistService
            setIsJoiningWaitlist(true);
            try {
                const entry = await waitlistService.join(table.id, user.id);
                if (entry) {
                    navigate('/waitlist');
                } else {
                    toast.error('Failed to join waitlist. You may already be on it.');
                }
            } catch (err) {
                console.error('Error joining waitlist:', err);
                toast.error('Failed to join waitlist.');
            }
            setIsJoiningWaitlist(false);
        } else {
            // Navigate to table if seats available
            navigate(`/table/${table.id}`);
        }
    };

    return (
        <div className={styles.card}>
            {/* Header with game type */}
            <div className={styles.header}>
                <div className={styles.gameType}>
                    <span className={styles.gameIcon}>{GAME_ICONS[table.game_variant] || '♠'}</span>
                    <span className={styles.gameLabel}>{GAME_LABELS[table.game_variant] || table.game_variant}</span>
                </div>
                <div className={styles.stakes}>{table.stakes}</div>
            </div>

            {/* Table Name */}
            <h3 className={styles.tableName}>{table.name}</h3>

            {/* Stats Row */}
            <div className={styles.stats}>
                <div className={styles.stat}>
                    <span className={styles.statLabel}>Players</span>
                    <span className={styles.statValue}>
                        {players}/{seats}
                    </span>
                </div>
                {avgPot > 0 && (
                    <div className={styles.stat}>
                        <span className={styles.statLabel}>Avg Pot</span>
                        <span className={styles.statValue}>{avgPot.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                )}
                {hasWaitlist && (
                    <div className={`${styles.stat} ${styles.waitlist}`}>
                        <span className={styles.statLabel}>Waiting</span>
                        <span className={styles.statValue}>{waiting}</span>
                    </div>
                )}
            </div>

            {/* Seats Visualization */}
            <div className={styles.seatsBar}>
                <div
                    className={styles.seatsFilled}
                    style={{ width: `${(players / seats) * 100}%` }}
                />
            </div>

            {/* Action Button */}
            <button
                className={`${styles.joinButton} ${isFull ? styles.waitlistButton : ''}`}
                onClick={handleJoin}
                disabled={isJoiningWaitlist}
            >
                {isJoiningWaitlist ? 'Joining...' : isFull ? 'Join Waitlist' : 'Join Table'}
            </button>
        </div>
    );
}

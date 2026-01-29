/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  TOURNAMENT LOBBY CARD — Tournament Registration Display
 * Shows tournament info with registration countdown and join button
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../stores/useUserStore';
import styles from './TournamentLobbyCard.module.css';

interface Tournament {
    id: string;
    name: string;
    type: 'sng' | 'mtt' | 'satellite' | 'spin' | 'bounty';
    buyIn: number;
    prizePool: number;
    maxPlayers: number;
    registeredPlayers: number;
    startsAt?: string;
    status: 'registering' | 'running' | 'finished' | 'cancelled';
    blindStructure: string;
}

interface TournamentLobbyCardProps {
    tournament: Tournament;
    onRegister?: (tournamentId: string) => void;
}

export default function TournamentLobbyCard({
    tournament,
    onRegister
}: TournamentLobbyCardProps) {
    const navigate = useNavigate();
    const { user } = useUserStore();
    const [registering, setRegistering] = useState(false);
    const [isRegistered, setIsRegistered] = useState(false);
    const [countdown, setCountdown] = useState<string>('');

    useEffect(() => {
        checkRegistration();
        if (tournament.startsAt) {
            updateCountdown();
            const interval = setInterval(updateCountdown, 1000);
            return () => clearInterval(interval);
        }
    }, [tournament.id, tournament.startsAt]);

    const checkRegistration = async () => {
        if (!user?.id) return;
        const { data } = await supabase
            .from('tournament_players')
            .select('id')
            .eq('tournament_id', tournament.id)
            .eq('user_id', user.id)
            .single();
        setIsRegistered(!!data);
    };

    const updateCountdown = () => {
        if (!tournament.startsAt) return;
        const now = new Date().getTime();
        const start = new Date(tournament.startsAt).getTime();
        const diff = start - now;

        if (diff <= 0) {
            setCountdown('Starting now!');
            return;
        }

        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);

        if (hours > 24) {
            const days = Math.floor(hours / 24);
            setCountdown(`${days}d ${hours % 24}h`);
        } else if (hours > 0) {
            setCountdown(`${hours}h ${minutes}m`);
        } else {
            setCountdown(`${minutes}m ${seconds}s`);
        }
    };

    const handleRegister = async () => {
        if (!user?.id || registering) return;
        setRegistering(true);

        try {
            await supabase
                .from('tournament_players')
                .insert({
                    tournament_id: tournament.id,
                    user_id: user.id,
                    status: 'registered'
                });

            setIsRegistered(true);
            onRegister?.(tournament.id);
        } catch (error) {
            console.error('Failed to register:', error);
        }
        setRegistering(false);
    };

    const handleUnregister = async () => {
        if (!user?.id) return;
        await supabase
            .from('tournament_players')
            .delete()
            .eq('tournament_id', tournament.id)
            .eq('user_id', user.id);
        setIsRegistered(false);
    };

    const getTypeLabel = (type: string): string => {
        switch (type) {
            case 'sng': return 'SNG';
            case 'mtt': return 'MTT';
            case 'satellite': return 'Satellite';
            case 'spin': return 'Spin & Go';
            case 'bounty': return 'Bounty';
            default: return type.toUpperCase();
        }
    };

    const getStatusColor = (status: string): string => {
        switch (status) {
            case 'registering': return '#10b981';
            case 'running': return '#f59e0b';
            case 'finished': return '#6b7280';
            case 'cancelled': return '#ef4444';
            default: return '#6b7280';
        }
    };

    const spotsRemaining = tournament.maxPlayers - tournament.registeredPlayers;
    const isFull = spotsRemaining <= 0;

    return (
        <div className={styles.card}>
            {/* Header */}
            <div className={styles.header}>
                <span className={styles.type}>{getTypeLabel(tournament.type)}</span>
                <span
                    className={styles.status}
                    style={{ color: getStatusColor(tournament.status) }}
                >
                    {tournament.status === 'registering' ? ' Open' : tournament.status}
                </span>
            </div>

            {/* Title */}
            <h3 className={styles.title}>{tournament.name}</h3>

            {/* Info Grid */}
            <div className={styles.info}>
                <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Buy-in</span>
                    <span className={styles.infoValue}>${tournament.buyIn}</span>
                </div>
                <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Prize Pool</span>
                    <span className={styles.infoValue}>${tournament.prizePool.toLocaleString()}</span>
                </div>
                <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Players</span>
                    <span className={styles.infoValue}>
                        {tournament.registeredPlayers}/{tournament.maxPlayers}
                    </span>
                </div>
                <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Structure</span>
                    <span className={styles.infoValue}>{tournament.blindStructure}</span>
                </div>
            </div>

            {/* Countdown */}
            {tournament.startsAt && tournament.status === 'registering' && (
                <div className={styles.countdown}>
                    <span className={styles.countdownLabel}>Starts in</span>
                    <span className={styles.countdownValue}>{countdown}</span>
                </div>
            )}

            {/* Progress Bar */}
            <div className={styles.progressBar}>
                <div
                    className={styles.progressFill}
                    style={{ width: `${(tournament.registeredPlayers / tournament.maxPlayers) * 100}%` }}
                />
            </div>
            <span className={styles.spotsLabel}>
                {isFull ? 'Tournament Full' : `${spotsRemaining} spots remaining`}
            </span>

            {/* Action Button */}
            <div className={styles.actions}>
                {tournament.status === 'registering' && (
                    isRegistered ? (
                        <button className={styles.unregisterBtn} onClick={handleUnregister}>
                             Registered - Unregister?
                        </button>
                    ) : (
                        <button
                            className={styles.registerBtn}
                            onClick={handleRegister}
                            disabled={registering || isFull}
                        >
                            {registering ? 'Registering...' : isFull ? 'Tournament Full' : `Register ($${tournament.buyIn})`}
                        </button>
                    )
                )}
                {tournament.status === 'running' && isRegistered && (
                    <button
                        className={styles.playBtn}
                        onClick={() => navigate(`/tournament/${tournament.id}`)}
                    >
                         Open Tournament
                    </button>
                )}
            </div>
        </div>
    );
}

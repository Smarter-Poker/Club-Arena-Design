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
    gameType?: string;
    startingChips?: number;
    lateRegMins?: number;
    isRebuy?: boolean;
    guaranteedPrize?: number;
    isBounty?: boolean;
    isPko?: boolean;
    isMysteryBounty?: boolean;
    bountyAmount?: number;
    isMultiDay?: boolean;
    isPinned?: boolean;
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
            // Use the onRegister prop to go through proper tournament service
            // (handles wallet deduction, validation, etc.)
            if (onRegister) {
                await onRegister(tournament.id);
            }
            setIsRegistered(true);
        } catch (error) {
            console.error('Failed to register:', error);
        }
        setRegistering(false);
    };

    const handleUnregister = () => {
        // Navigate to tournament details for proper unregistration flow
        navigate(`/tournaments/${tournament.id}`);
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

    const hasMaxPlayers = tournament.maxPlayers > 0;
    const spotsRemaining = hasMaxPlayers ? tournament.maxPlayers - tournament.registeredPlayers : Infinity;
    const isFull = hasMaxPlayers && spotsRemaining <= 0;

    return (
        <div className={`${styles.card} ${tournament.isPinned ? styles.pinnedCard : ''}`} onClick={() => navigate(`/tournaments/${tournament.id}`)} style={{ cursor: 'pointer' }}>
            {/* Header */}
            <div className={styles.header}>
                {tournament.isPinned && <span className={styles.pinnedBadge}>PINNED</span>}
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
                    <span className={styles.infoValue}>{tournament.buyIn.toLocaleString()}</span>
                </div>
                <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Prize Pool</span>
                    <span className={styles.infoValue}>
                        {tournament.prizePool.toLocaleString()}
                        {tournament.guaranteedPrize && tournament.guaranteedPrize > 0 && (
                            <span className={styles.gtdBadge}>GTD</span>
                        )}
                    </span>
                </div>
                <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Players</span>
                    <span className={styles.infoValue}>
                        {tournament.registeredPlayers}{hasMaxPlayers ? `/${tournament.maxPlayers}` : ''}
                    </span>
                </div>
                <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Starting Chips</span>
                    <span className={styles.infoValue}>{tournament.startingChips ? tournament.startingChips.toLocaleString() : '—'}</span>
                </div>
                {tournament.gameType && (
                    <div className={styles.infoItem}>
                        <span className={styles.infoLabel}>Game</span>
                        <span className={styles.infoValue}>{tournament.gameType}</span>
                    </div>
                )}
                <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Structure</span>
                    <span className={styles.infoValue}>{tournament.blindStructure}</span>
                </div>
            </div>

            {/* Feature Tags */}
            {(tournament.lateRegMins || tournament.isRebuy || tournament.isBounty || tournament.isPko || tournament.isMysteryBounty || tournament.isMultiDay) && (
                <div className={styles.featureTags}>
                    {tournament.isBounty && !tournament.isPko && !tournament.isMysteryBounty && (
                        <span className={`${styles.featureTag} ${styles.bountyTag}`}>Bounty {tournament.bountyAmount ? tournament.bountyAmount : ''}</span>
                    )}
                    {tournament.isPko && (
                        <span className={`${styles.featureTag} ${styles.pkoTag}`}>PKO</span>
                    )}
                    {tournament.isMysteryBounty && (
                        <span className={`${styles.featureTag} ${styles.mysteryTag}`}>Mystery Bounty</span>
                    )}
                    {tournament.isMultiDay && (
                        <span className={`${styles.featureTag} ${styles.multiDayTag}`}>Multi-Day</span>
                    )}
                    {tournament.lateRegMins && tournament.lateRegMins > 0 && (
                        <span className={styles.featureTag}>Late Reg {tournament.lateRegMins}m</span>
                    )}
                    {tournament.isRebuy && (
                        <span className={styles.featureTag}>Rebuy</span>
                    )}
                </div>
            )}

            {/* Countdown */}
            {tournament.startsAt && tournament.status === 'registering' && (
                <div className={styles.countdown}>
                    <span className={styles.countdownLabel}>Starts in</span>
                    <span className={styles.countdownValue}>{countdown}</span>
                </div>
            )}

            {/* Progress Bar — only show for capped tournaments (SNG/Spin) */}
            {hasMaxPlayers ? (
                <>
                    <div className={styles.progressBar}>
                        <div
                            className={styles.progressFill}
                            style={{ width: `${(tournament.registeredPlayers / tournament.maxPlayers) * 100}%` }}
                        />
                    </div>
                    <span className={styles.spotsLabel}>
                        {isFull ? 'Tournament Full' : `${spotsRemaining} spots remaining`}
                    </span>
                </>
            ) : (
                <span className={styles.spotsLabel}>
                    {tournament.registeredPlayers} registered — Open entry
                </span>
            )}

            {/* Action Button */}
            <div className={styles.actions}>
                {tournament.status === 'registering' && (
                    isRegistered ? (
                        <button className={styles.unregisterBtn} onClick={(e) => { e.stopPropagation(); handleUnregister(); }}>
                             Registered - Unregister?
                        </button>
                    ) : (
                        <button
                            className={styles.registerBtn}
                            onClick={(e) => { e.stopPropagation(); handleRegister(); }}
                            disabled={registering || isFull}
                        >
                            {registering ? 'Registering...' : isFull ? 'Tournament Full' : `Register (${tournament.buyIn.toLocaleString()})`}
                        </button>
                    )
                )}
                {tournament.status === 'running' && isRegistered && (
                    <button
                        className={styles.playBtn}
                        onClick={(e) => { e.stopPropagation(); navigate(`/tournaments/${tournament.id}`); }}
                    >
                         Open Tournament
                    </button>
                )}
            </div>
        </div>
    );
}

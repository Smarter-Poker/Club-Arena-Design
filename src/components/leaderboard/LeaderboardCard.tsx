/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  LEADERBOARD CARD — Promotion Leaderboard Display
 * Shows top players with ranking, scores, and prizes
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect } from 'react';
import { promotionService, LeaderboardEntry } from '../../services/PromotionService';
import { useUserStore } from '../../stores/useUserStore';
import styles from './LeaderboardCard.module.css';

interface LeaderboardCardProps {
    promotionId: string;
    title?: string;
    limit?: number;
    showCurrentUser?: boolean;
}

export default function LeaderboardCard({
    promotionId,
    title = 'Leaderboard',
    limit = 10,
    showCurrentUser = true
}: LeaderboardCardProps) {
    const { user } = useUserStore();
    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [userRank, setUserRank] = useState<LeaderboardEntry | null>(null);

    useEffect(() => {
        loadLeaderboard();
    }, [promotionId, limit]);

    const loadLeaderboard = async () => {
        setLoading(true);
        try {
            const data = await promotionService.getLeaderboard(promotionId, limit);
            setEntries(data);

            // Find current user if not in top N
            if (showCurrentUser && user?.id) {
                const currentUserEntry = data.find(e => e.userId === user.id);
                if (!currentUserEntry) {
                    // User not in top N, fetch their rank separately
                    const allData = await promotionService.getLeaderboard(promotionId, 1000);
                    const userEntry = allData.find(e => e.userId === user.id);
                    if (userEntry) setUserRank(userEntry);
                }
            }
        } catch (error) {
            console.error('Failed to load leaderboard:', error);
        }
        setLoading(false);
    };

    const getMedalIcon = (rank: number): string => {
        switch (rank) {
            case 1: return '1st';
            case 2: return '2nd';
            case 3: return '3rd';
            default: return `#${rank}`;
        }
    };

    const formatScore = (score: number): string => {
        if (score >= 1000000) return `${(score / 1000000).toFixed(1)}M`;
        if (score >= 1000) return `${(score / 1000).toFixed(1)}K`;
        return score.toLocaleString();
    };

    if (loading) {
        return (
            <div className={styles.card}>
                <div className={styles.loading}>
                    <div className={styles.spinner}></div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.card}>
            <div className={styles.header}>
                <h3>{title}</h3>
                <span className={styles.trophy}>T</span>
            </div>

            {entries.length === 0 ? (
                <div className={styles.empty}>
                    <span>≡</span>
                    <p>No entries yet</p>
                </div>
            ) : (
                <div className={styles.list}>
                    {entries.map(entry => {
                        const isCurrentUser = user?.id === entry.userId;
                        return (
                            <div
                                key={entry.userId}
                                className={`${styles.row} ${entry.rank <= 3 ? styles.topThree : ''} ${isCurrentUser ? styles.currentUser : ''}`}
                            >
                                <div className={styles.rankCol}>
                                    {entry.rank <= 3 ? (
                                        <span className={styles.medal}>{getMedalIcon(entry.rank)}</span>
                                    ) : (
                                        <span className={styles.rankNumber}>{entry.rank}</span>
                                    )}
                                </div>

                                <div className={styles.playerCol}>
                                    <div className={styles.avatar}>
                                        {entry.avatarUrl ? (
                                            <img src={entry.avatarUrl} alt="" />
                                        ) : (
                                            <span>●</span>
                                        )}
                                    </div>
                                    <span className={styles.name}>
                                        {entry.displayName || entry.username}
                                        {isCurrentUser && <span className={styles.youBadge}>YOU</span>}
                                    </span>
                                </div>

                                <div className={styles.scoreCol}>
                                    <span className={styles.score}>{formatScore(entry.score)}</span>
                                    {entry.prize && (
                                        <span className={styles.prize}> ${entry.prize.toLocaleString()}</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Current user not in top N */}
            {userRank && !entries.find(e => e.userId === user?.id) && (
                <>
                    <div className={styles.separator}>• • •</div>
                    <div className={`${styles.row} ${styles.currentUser}`}>
                        <div className={styles.rankCol}>
                            <span className={styles.rankNumber}>{userRank.rank}</span>
                        </div>
                        <div className={styles.playerCol}>
                            <div className={styles.avatar}>
                                {userRank.avatarUrl ? (
                                    <img src={userRank.avatarUrl} alt="" />
                                ) : (
                                    <span>●</span>
                                )}
                            </div>
                            <span className={styles.name}>
                                {userRank.displayName || userRank.username}
                                <span className={styles.youBadge}>YOU</span>
                            </span>
                        </div>
                        <div className={styles.scoreCol}>
                            <span className={styles.score}>{formatScore(userRank.score)}</span>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

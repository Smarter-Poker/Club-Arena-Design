/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  SESSION SUMMARY MODAL — End-of-Session Stats
 * ═══════════════════════════════════════════════════════════════════════════════
 * Shows when a player leaves a table: hands played, P/L, duration, biggest pot.
 */

import styles from './SessionSummary.module.css';

interface SessionSummaryProps {
    duration: number; // seconds
    handsPlayed: number;
    profitLoss: number;
    biggestPot: number;
    peakStack: number;
    onClose: () => void;
}

export default function SessionSummary({
    duration,
    handsPlayed,
    profitLoss,
    biggestPot,
    peakStack,
    onClose,
}: SessionSummaryProps) {
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const durationStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    const handsPerHour = duration > 60 ? Math.round((handsPlayed / duration) * 3600) : 0;
    const isProfit = profitLoss >= 0;

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <h2 className={styles.title}>Session Complete</h2>

                {/* P/L Hero */}
                <div className={`${styles.plHero} ${isProfit ? styles.profit : styles.loss}`}>
                    <span className={styles.plLabel}>{isProfit ? 'Profit' : 'Loss'}</span>
                    <span className={styles.plValue}>
                        {isProfit ? '+' : ''}{profitLoss.toLocaleString()}
                    </span>
                </div>

                {/* Stats Grid */}
                <div className={styles.statsGrid}>
                    <div className={styles.statItem}>
                        <span className={styles.statValue}>{durationStr}</span>
                        <span className={styles.statLabel}>Duration</span>
                    </div>
                    <div className={styles.statItem}>
                        <span className={styles.statValue}>{handsPlayed}</span>
                        <span className={styles.statLabel}>Hands Played</span>
                    </div>
                    <div className={styles.statItem}>
                        <span className={styles.statValue}>{handsPerHour}</span>
                        <span className={styles.statLabel}>Hands/Hour</span>
                    </div>
                    <div className={styles.statItem}>
                        <span className={styles.statValue}>{biggestPot.toLocaleString()}</span>
                        <span className={styles.statLabel}>Biggest Pot</span>
                    </div>
                    <div className={styles.statItem}>
                        <span className={styles.statValue}>{peakStack.toLocaleString()}</span>
                        <span className={styles.statLabel}>Peak Stack</span>
                    </div>
                </div>

                <button className={styles.closeBtn} onClick={onClose}>
                    BACK TO LOBBY
                </button>
            </div>
        </div>
    );
}

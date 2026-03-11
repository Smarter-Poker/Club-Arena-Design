/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  SESSION SUMMARY MODAL — End-of-Session Stats
 * ═══════════════════════════════════════════════════════════════════════════════
 * Shows when a player leaves a table: hands played, P/L, duration, biggest pot.
 */

import { useState, useEffect, useRef } from 'react';
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
    const [displayProfit, setDisplayProfit] = useState(0);
    const [displayHands, setDisplayHands] = useState(0);
    const [displayPot, setDisplayPot] = useState(0);
    const [displayStack, setDisplayStack] = useState(0);
    const [visibleStats, setVisibleStats] = useState<Set<string>>(new Set());
    const animationFrameRef = useRef<number>(0);

    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const durationStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    const handsPerHour = duration > 60 ? Math.round((handsPlayed / duration) * 3600) : 0;
    const isProfit = profitLoss >= 0;

    // Animate profit/loss counter
    useEffect(() => {
        const startTime = Date.now();
        const duration = 800;
        const startValue = 0;

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(1, elapsed / duration);

            const easeOut = 1 - Math.pow(1 - progress, 3);
            const current = startValue + (profitLoss - startValue) * easeOut;

            setDisplayProfit(current);

            if (progress < 1) {
                animationFrameRef.current = requestAnimationFrame(animate);
            }
        };

        animationFrameRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [profitLoss]);

    // Staggered stat reveal
    useEffect(() => {
        const stats = ['hands', 'pot', 'stack'];
        stats.forEach((stat, idx) => {
            const timer = setTimeout(() => {
                setVisibleStats(prev => new Set([...prev, stat]));

                // Animate counters when revealed
                if (stat === 'hands' && !visibleStats.has('hands')) {
                    animateCounter(0, handsPlayed, 600, setDisplayHands);
                } else if (stat === 'pot' && !visibleStats.has('pot')) {
                    animateCounter(0, biggestPot, 600, setDisplayPot);
                } else if (stat === 'stack' && !visibleStats.has('stack')) {
                    animateCounter(0, peakStack, 600, setDisplayStack);
                }
            }, idx * 150);

            return () => clearTimeout(timer);
        });
    }, []);

    function animateCounter(start: number, end: number, duration: number, setter: (val: number) => void) {
        const startTime = Date.now();

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(1, elapsed / duration);

            const easeOut = 1 - Math.pow(1 - progress, 3);
            const current = start + (end - start) * easeOut;

            setter(current);

            if (progress < 1) {
                animationFrameRef.current = requestAnimationFrame(animate);
            }
        };

        animationFrameRef.current = requestAnimationFrame(animate);
    }

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <h2 className={styles.title}>Session Complete</h2>

                {/* P/L Hero */}
                <div className={`${styles.plHero} ${isProfit ? styles.profit : styles.loss} ${styles.plHeroReveal}`}>
                    <span className={styles.plLabel}>{isProfit ? 'Profit' : 'Loss'}</span>
                    <span className={styles.plValue}>
                        {isProfit ? '+' : ''}{Math.round(displayProfit).toLocaleString()}
                    </span>
                </div>

                {/* Stats Grid */}
                <div className={styles.statsGrid}>
                    <div className={styles.statItem}>
                        <span className={styles.statValue}>{durationStr}</span>
                        <span className={styles.statLabel}>Duration</span>
                    </div>
                    <div className={`${styles.statItem} ${visibleStats.has('hands') ? styles.statReveal : ''}`}>
                        <span className={styles.statValue}>{Math.round(displayHands)}</span>
                        <span className={styles.statLabel}>Hands Played</span>
                    </div>
                    <div className={styles.statItem}>
                        <span className={styles.statValue}>{handsPerHour}</span>
                        <span className={styles.statLabel}>Hands/Hour</span>
                    </div>
                    <div className={`${styles.statItem} ${visibleStats.has('pot') ? styles.statReveal : ''}`}>
                        <span className={styles.statValue}>{Math.round(displayPot).toLocaleString()}</span>
                        <span className={styles.statLabel}>Biggest Pot</span>
                    </div>
                    <div className={`${styles.statItem} ${visibleStats.has('stack') ? styles.statReveal : ''}`}>
                        <span className={styles.statValue}>{Math.round(displayStack).toLocaleString()}</span>
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

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DAILY CHALLENGES — Extracted Component
 * ═══════════════════════════════════════════════════════════════════════════════
 * Deterministic daily challenges with localStorage progress tracking.
 * Architecture-ready for Supabase `daily_challenge_progress` table.
 */

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import styles from '../../pages/HomePage.module.css';

const CHALLENGES = [
    { title: 'Win 3 Hands', reward: 50, target: 3 },
    { title: 'Play 20 Hands', reward: 30, target: 20 },
    { title: 'Win a Pot > 100 BB', reward: 75, target: 1 },
    { title: 'Play 2 Different Tables', reward: 40, target: 2 },
    { title: 'Win 5 Hands Pre-Flop', reward: 60, target: 5 },
    { title: 'Play for 30 Minutes', reward: 45, target: 30 },
    { title: 'Win 2 All-In Pots', reward: 80, target: 2 },
    { title: 'See 10 Flops', reward: 25, target: 10 },
    { title: 'Win a Hand with a Flush', reward: 100, target: 1 },
] as const;

function getDayKey(): string {
    const today = new Date();
    const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    return `challenges_${seed}`;
}

function getSeed(): number {
    const today = new Date();
    return today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
}

function pickChallenges(): typeof CHALLENGES[number][] {
    const seed = getSeed();
    const picked: typeof CHALLENGES[number][] = [];
    const usedIndices = new Set<number>();
    for (let i = 0; i < 3; i++) {
        let idx = ((seed * (i + 7) * 7919) % CHALLENGES.length);
        while (usedIndices.has(idx)) idx = (idx + 1) % CHALLENGES.length;
        usedIndices.add(idx);
        picked.push(CHALLENGES[idx]);
    }
    return picked;
}

export default function DailyChallenges() {
    const [progress, setProgress] = useState<Record<string, number>>({});
    const dayKey = getDayKey();

    // Enhancement #8: Load from Supabase first, fallback to localStorage
    const loadProgress = useCallback(async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data } = await supabase
                    .from('daily_challenge_progress')
                    .select('challenge_index, progress')
                    .eq('user_id', user.id)
                    .eq('day_key', dayKey);

                if (data && data.length > 0) {
                    const map: Record<string, number> = {};
                    data.forEach((row: any) => { map[row.challenge_index] = row.progress; });
                    setProgress(map);
                    return;
                }
            }
        } catch {
            // Supabase unavailable — fallback to localStorage
        }

        // Fallback: localStorage
        try {
            const stored = JSON.parse(localStorage.getItem(dayKey) || '{}');
            setProgress(stored);
        } catch {
            localStorage.removeItem(dayKey);
        }
    }, [dayKey]);

    useEffect(() => {
        loadProgress();
    }, [loadProgress]);

    const picked = pickChallenges();

    return (
        <div className={styles.challengesSection}>
            <h3 className={styles.challengesTitle}>DAILY CHALLENGES</h3>
            <div className={styles.challengesList}>
                {picked.map((ch, i) => {
                    const prog = progress[i] || 0;
                    const pct = Math.min(100, (prog / ch.target) * 100);
                    const isComplete = pct >= 100;
                    return (
                        <div key={i} className={isComplete ? styles.challengeItemComplete : styles.challengeItem}>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(224, 232, 240, 0.9)' }}>
                                        {ch.title}
                                    </span>
                                    <span style={{
                                        fontSize: '0.65rem',
                                        fontWeight: 700,
                                        color: isComplete ? 'rgba(0, 255, 136, 0.9)' : 'rgba(0, 212, 255, 0.8)',
                                    }}>+{ch.reward} Diamonds</span>
                                </div>
                                <div style={{
                                    height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)',
                                    overflow: 'hidden',
                                }}>
                                    <div style={{
                                        height: '100%', borderRadius: 2, width: `${pct}%`,
                                        background: isComplete
                                            ? 'linear-gradient(90deg, #00ff88, #00d4ff)'
                                            : 'linear-gradient(90deg, #00d4ff, #0088ff)',
                                        transition: 'width 0.3s ease',
                                    }} />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

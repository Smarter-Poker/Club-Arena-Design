/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  DAILY BONUS WHEEL — Spin-to-Win Component
 * Animated wheel for daily bonus claims
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useRef } from 'react';
import styles from './DailyBonusWheel.module.css';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface WheelSegment {
    label: string;
    value: number;
    type: 'chips' | 'vip' | 'diamonds';
    color: string;
    probability: number;
}

interface DailyBonusWheelProps {
    onSpin: (segment: WheelSegment) => Promise<void>;
    segments?: WheelSegment[];
    disabled?: boolean;
    spinCount?: number;
}

const DEFAULT_SEGMENTS: WheelSegment[] = [
    { label: '100 Chips', value: 100, type: 'chips', color: '#10b981', probability: 30 },
    { label: '200 Chips', value: 200, type: 'chips', color: '#34d399', probability: 25 },
    { label: '500 Chips', value: 500, type: 'chips', color: '#22c55e', probability: 15 },
    { label: '1 VIP Point', value: 1, type: 'vip', color: '#a78bfa', probability: 10 },
    { label: '750 Chips', value: 750, type: 'chips', color: '#16a34a', probability: 8 },
    { label: '1000 Chips', value: 1000, type: 'chips', color: '#059669', probability: 5 },
    { label: '5 Diamonds', value: 5, type: 'diamonds', color: '#38bdf8', probability: 4 },
    { label: '5000 Chips', value: 5000, type: 'chips', color: '#fbbf24', probability: 3 },
];

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function DailyBonusWheel({
    onSpin,
    segments = DEFAULT_SEGMENTS,
    disabled = false,
    spinCount = 0
}: DailyBonusWheelProps) {
    const [spinning, setSpinning] = useState(false);
    const [rotation, setRotation] = useState(0);
    const [result, setResult] = useState<WheelSegment | null>(null);
    const wheelRef = useRef<HTMLDivElement>(null);

    // Weighted random selection
    const selectSegment = (): WheelSegment => {
        const totalProbability = segments.reduce((sum, s) => sum + s.probability, 0);
        let random = Math.random() * totalProbability;

        for (const segment of segments) {
            random -= segment.probability;
            if (random <= 0) return segment;
        }
        return segments[0];
    };

    const handleSpin = async () => {
        if (spinning || disabled) return;

        setSpinning(true);
        setResult(null);

        // Select winning segment
        const winner = selectSegment();
        const winnerIndex = segments.indexOf(winner);

        // Calculate rotation (at least 5 full spins + landing on segment)
        const segmentAngle = 360 / segments.length;
        const targetAngle = 360 - (winnerIndex * segmentAngle) - (segmentAngle / 2);
        const spins = 5 + Math.floor(Math.random() * 3);
        const newRotation = rotation + (spins * 360) + targetAngle;

        setRotation(newRotation);

        // Wait for animation
        await new Promise(resolve => setTimeout(resolve, 4000));

        setResult(winner);
        setSpinning(false);

        // Callback to parent
        await onSpin(winner);
    };

    const getTypeIcon = (type: string): string => {
        switch (type) {
            case 'chips': return '♠';

            case 'vip': return '♛';
            case 'diamonds': return '◆';
            default: return '●';
        }
    };

    return (
        <div className={styles.wheelContainer}>
            {/* Wheel */}
            <div className={styles.wheelWrapper}>
                <div className={styles.pointer}>▼</div>
                <div
                    ref={wheelRef}
                    className={styles.wheel}
                    style={{ transform: `rotate(${rotation}deg)` }}
                >
                    {segments.map((segment, i) => {
                        const angle = (360 / segments.length) * i;
                        return (
                            <div
                                key={i}
                                className={styles.segment}
                                style={{
                                    transform: `rotate(${angle}deg)`,
                                    backgroundColor: segment.color
                                }}
                            >
                                <span className={styles.segmentLabel}>
                                    {getTypeIcon(segment.type)} {segment.label}
                                </span>
                            </div>
                        );
                    })}
                </div>
                <div className={styles.centerButton} onClick={handleSpin}>
                    {spinning ? '' : 'SPIN'}
                </div>
            </div>

            {/* Result */}
            {result && (
                <div className={styles.resultCard}>
                    <span className={styles.resultIcon}>{getTypeIcon(result.type)}</span>
                    <span className={styles.resultText}>You won {result.label}!</span>
                </div>
            )}

            {/* Spin Button */}
            <button
                className={styles.spinButton}
                onClick={handleSpin}
                disabled={spinning || disabled}
            >
                {disabled ? 'Come back tomorrow!' : spinning ? 'Spinning...' : ` Spin the Wheel`}
            </button>

            {/* Spin Count */}
            {spinCount > 0 && (
                <div className={styles.spinCount}>
                    {spinCount} day streak!
                </div>
            )}
        </div>
    );
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CHIP ANIMATION — Poker Chip Movement Effects
 * ═══════════════════════════════════════════════════════════════════════════════
 * Animated chip movement for bets, pots, and winnings
 */

import { useEffect, useState, useRef } from 'react';
import styles from './ChipAnimation.module.css';

interface Position {
    x: number;
    y: number;
}

interface ChipAnimationProps {
    from: Position;
    to: Position;
    amount: number;
    duration?: number;
    onComplete?: () => void;
    chipColor?: 'red' | 'green' | 'blue' | 'black' | 'gold';
}

export default function ChipAnimation({
    from,
    to,
    amount,
    duration = 500,
    onComplete,
    chipColor = 'gold'
}: ChipAnimationProps) {
    const [isAnimating, setIsAnimating] = useState(true);
    const [position, setPosition] = useState(from);
    const chipRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Start animation
        const startTime = Date.now();
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);

            const newX = from.x + (to.x - from.x) * eased;
            const newY = from.y + (to.y - from.y) * eased;

            setPosition({ x: newX, y: newY });

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                setIsAnimating(false);
                onComplete?.();
            }
        };

        requestAnimationFrame(animate);
    }, [from, to, duration, onComplete]);

    if (!isAnimating && position.x === to.x && position.y === to.y) {
        return null;
    }

    const chipCount = getChipCount(amount);

    return (
        <div
            ref={chipRef}
            className={styles.chipContainer}
            style={{
                transform: `translate(${position.x}px, ${position.y}px)`,
                transition: 'none'
            }}
        >
            {/* Stack of chips */}
            {Array.from({ length: Math.min(chipCount, 5) }).map((_, i) => (
                <div
                    key={i}
                    className={`${styles.chip} ${styles[chipColor]}`}
                    style={{ '--chip-offset': i } as React.CSSProperties}
                />
            ))}

            {/* Amount label */}
            <span className={styles.amount}>${formatAmount(amount)}</span>
        </div>
    );
}

// Calculate chip count based on amount
function getChipCount(amount: number): number {
    if (amount >= 10000) return 5;
    if (amount >= 1000) return 4;
    if (amount >= 100) return 3;
    if (amount >= 10) return 2;
    return 1;
}

// Format amount for display
function formatAmount(amount: number): string {
    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🎬 CHIP ANIMATION MANAGER — Controls multiple chip animations
// ═══════════════════════════════════════════════════════════════════════════════

interface ChipAnimationEvent {
    id: string;
    from: Position;
    to: Position;
    amount: number;
    chipColor?: 'red' | 'green' | 'blue' | 'black' | 'gold';
}

interface ChipAnimationManagerProps {
    animations: ChipAnimationEvent[];
    onAnimationComplete?: (id: string) => void;
}

export function ChipAnimationManager({
    animations,
    onAnimationComplete
}: ChipAnimationManagerProps) {
    return (
        <div className={styles.manager}>
            {animations.map(anim => (
                <ChipAnimation
                    key={anim.id}
                    from={anim.from}
                    to={anim.to}
                    amount={anim.amount}
                    chipColor={anim.chipColor}
                    onComplete={() => onAnimationComplete?.(anim.id)}
                />
            ))}
        </div>
    );
}

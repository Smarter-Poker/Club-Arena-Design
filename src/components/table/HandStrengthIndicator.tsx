/**
 * ♠ CLUB ARENA — Hand Strength Indicator
 * Visual display of hand strength during gameplay
 */

import React, { useMemo, useState, useEffect, useRef } from 'react';
import './HandStrengthIndicator.css';

interface HandStrengthIndicatorProps {
    cards: string[]; // e.g., ['Ah', 'Kh']
    communityCards?: string[];
    showPercent?: boolean;
    size?: 'sm' | 'md' | 'lg';
}

type HandRank =
    | 'high_card'
    | 'pair'
    | 'two_pair'
    | 'three_kind'
    | 'straight'
    | 'flush'
    | 'full_house'
    | 'four_kind'
    | 'straight_flush'
    | 'royal_flush';

interface HandEvaluation {
    rank: HandRank;
    name: string;
    strength: number; // 0-100
    color: string;
}

export const HandStrengthIndicator: React.FC<HandStrengthIndicatorProps> = ({
    cards,
    communityCards = [],
    showPercent = true,
    size = 'md',
}) => {
    const evaluation = useMemo(() => {
        return evaluateHand(cards, communityCards);
    }, [cards, communityCards]);

    const [fillWidth, setFillWidth] = useState(0);
    const [glowPulse, setGlowPulse] = useState(false);
    const prevEvaluationRef = useRef(evaluation);

    const getStrengthLabel = (strength: number): string => {
        if (strength >= 90) return 'Monster';
        if (strength >= 75) return 'Strong';
        if (strength >= 50) return 'Medium';
        if (strength >= 25) return 'Marginal';
        return 'Weak';
    };

    // Animate bar fill on mount and change
    useEffect(() => {
        const timer = setTimeout(() => setFillWidth(evaluation.strength), 50);
        return () => clearTimeout(timer);
    }, [evaluation.strength]);

    // Glow pulse when strength changes significantly
    useEffect(() => {
        const prevStrength = prevEvaluationRef.current.strength;
        if (Math.abs(evaluation.strength - prevStrength) >= 10) {
            setGlowPulse(true);
            const timer = setTimeout(() => setGlowPulse(false), 600);
            prevEvaluationRef.current = evaluation;
            return () => clearTimeout(timer);
        }
        prevEvaluationRef.current = evaluation;
    }, [evaluation.strength]);

    return (
        <div className={`hand-strength-indicator size-${size} ${glowPulse ? 'hand-strength-indicator--glow-pulse' : ''}`}>
            <div className="strength-bar-container">
                <div
                    className="strength-bar-fill"
                    style={{
                        width: `${fillWidth}%`,
                        background: evaluation.color,
                    }}
                />
                <div className="strength-markers">
                    {[25, 50, 75].map(mark => (
                        <div key={mark} className="marker" style={{ left: `${mark}%` }} />
                    ))}
                </div>
            </div>
            <div className="strength-info">
                <span className="hand-name" style={{ color: evaluation.color }}>
                    {evaluation.name}
                </span>
                {showPercent && (
                    <span className="strength-percent">
                        {getStrengthLabel(evaluation.strength)}
                    </span>
                )}
            </div>
        </div>
    );
};

// Simple hand evaluation (demo purposes)
function evaluateHand(holeCards: string[], communityCards: string[]): HandEvaluation {
    const allCards = [...holeCards, ...communityCards];

    // Preflop strength based on hole cards
    if (communityCards.length === 0) {
        const ranks = holeCards.map(c => c[0]);
        const suited = holeCards.length === 2 && holeCards[0][1] === holeCards[1][1];

        // Premium pairs
        if (ranks[0] === ranks[1] && ['A', 'K', 'Q', 'J'].includes(ranks[0])) {
            return { rank: 'pair', name: 'Premium Pair', strength: 90, color: '#27ae60' };
        }
        // Medium pairs
        if (ranks[0] === ranks[1]) {
            return { rank: 'pair', name: 'Pocket Pair', strength: 65, color: '#f39c12' };
        }
        // AK suited/offsuit
        if (ranks.includes('A') && ranks.includes('K')) {
            return { rank: 'high_card', name: suited ? 'AKs' : 'AKo', strength: suited ? 78 : 70, color: '#27ae60' };
        }
        // Suited Broadway
        if (suited && ranks.every(r => ['A', 'K', 'Q', 'J', 'T'].includes(r))) {
            return { rank: 'high_card', name: 'Suited Broadway', strength: 60, color: '#f39c12' };
        }
        // Suited connectors
        if (suited) {
            return { rank: 'high_card', name: 'Suited', strength: 45, color: '#95a5a6' };
        }
        // Default
        return { rank: 'high_card', name: 'High Card', strength: 30, color: '#e74c3c' };
    }

    // Post-flop simplified eval
    const rankCounts: Record<string, number> = {};
    allCards.forEach(c => {
        const r = c[0];
        rankCounts[r] = (rankCounts[r] || 0) + 1;
    });

    const counts = Object.values(rankCounts).sort((a, b) => b - a);

    if (counts[0] >= 4) {
        return { rank: 'four_kind', name: 'Four of a Kind', strength: 98, color: '#9b59b6' };
    }
    if (counts[0] === 3 && counts[1] >= 2) {
        return { rank: 'full_house', name: 'Full House', strength: 95, color: '#9b59b6' };
    }
    if (counts[0] === 3) {
        return { rank: 'three_kind', name: 'Three of a Kind', strength: 75, color: '#27ae60' };
    }
    if (counts[0] === 2 && counts[1] === 2) {
        return { rank: 'two_pair', name: 'Two Pair', strength: 60, color: '#f39c12' };
    }
    if (counts[0] === 2) {
        return { rank: 'pair', name: 'One Pair', strength: 40, color: '#95a5a6' };
    }

    return { rank: 'high_card', name: 'High Card', strength: 20, color: '#e74c3c' };
}

export default HandStrengthIndicator;

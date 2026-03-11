/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  COMMUNITY CARDS — Flop/Turn/River Display (PNG Custom Deck)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Displays the community cards on the poker table using the custom PNG deck:
 * - Animated card deal effects
 * - Stage-based progressive reveal
 * - Card highlighting for winning hands
 * - Uses CardImage component for custom deck rendering
 */

import React, { useMemo, useEffect, useRef, memo } from 'react';
import { CardImage, CardBack } from './CardImage';
import type { Card } from './CardImage';
import { haptic } from '../../services/SoundService';
import './CommunityCards.css';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type { Card };

export type BoardStage = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface CommunityCardsProps {
    cards: Card[];
    stage: BoardStage;
    highlightedIndices?: number[];
    isDealing?: boolean;
    winningHandName?: string; // e.g. "Straight" — shown as overlay at showdown
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

function getVisibleCardCount(stage: BoardStage): number {
    switch (stage) {
        case 'preflop': return 0;
        case 'flop': return 3;
        case 'turn': return 4;
        case 'river':
        case 'showdown': return 5;
        default: return 0;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

interface CardFaceProps {
    card: Card;
    index: number;
    isHighlighted: boolean;
    isDealing: boolean;
    stage: BoardStage;
}

function CardFace({ card, index, isHighlighted, isDealing, stage }: CardFaceProps) {
    // Apply turn/river emphasis animations to the newly dealt card
    const isTurnCard = stage === 'turn' && index === 3;
    const isRiverCard = (stage === 'river' || stage === 'showdown') && index === 4;

    return (
        <div
            className={[
                'community-cards__card',
                isHighlighted ? 'community-cards__card--highlighted' : '',
                isDealing ? 'community-cards__card--dealing' : '',
                isTurnCard ? 'community-cards__card--turn' : '',
                isRiverCard ? 'community-cards__card--river' : '',
            ].filter(Boolean).join(' ')}
            style={{ animationDelay: `${index * 100}ms`, '--card-index': index } as React.CSSProperties}
        >
            <CardImage
                card={card}
                deckStyle="4color"
                size="lg"
                isHighlighted={isHighlighted}
            />
            {/* Highlight Glow */}
            {isHighlighted && <div className="community-cards__highlight-glow" />}
        </div>
    );
}

interface PlaceholderCardProps {
    index: number;
}

function PlaceholderCard({ index }: PlaceholderCardProps) {
    return (
        <div
            className="community-cards__placeholder"
            style={{ animationDelay: `${index * 100}ms` }}
        >
            <CardBack size="lg" style="classic" />
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

function CommunityCardsComponent({
    cards,
    stage,
    highlightedIndices = [],
    isDealing = false,
    winningHandName,
}: CommunityCardsProps) {
    const visibleCount = useMemo(() => getVisibleCardCount(stage), [stage]);
    const prevStageRef = useRef(stage);

    // Haptic feedback when new community cards are dealt
    useEffect(() => {
        if (stage !== prevStageRef.current) {
            if (stage === 'flop') {
                haptic.medium();
            } else if (stage === 'turn') {
                haptic.light();
            } else if (stage === 'river') {
                haptic.medium();
            } else if (stage === 'showdown') {
                haptic.strong();
            }
            prevStageRef.current = stage;
        }
    }, [stage]);

    // Create array of 5 slots
    const slots = useMemo(() => {
        return Array.from({ length: 5 }).map((_, i) => {
            if (i < visibleCount && cards[i]) {
                return {
                    type: 'card' as const,
                    card: cards[i],
                    isHighlighted: highlightedIndices.includes(i),
                };
            }
            return { type: 'placeholder' as const };
        });
    }, [cards, visibleCount, highlightedIndices]);

    return (
        <div className="community-cards">
            {/* Card Container — no stage label clutter */}
            <div className="community-cards__container">
                {slots.map((slot, i) => (
                    slot.type === 'card' ? (
                        <CardFace
                            key={`card-${i}`}
                            card={slot.card}
                            index={i}
                            isHighlighted={slot.isHighlighted}
                            isDealing={isDealing && i === visibleCount - 1}
                            stage={stage}
                        />
                    ) : (
                        <PlaceholderCard key={`placeholder-${i}`} index={i} />
                    )
                ))}
            </div>

            {/* Separator Lines */}
            {visibleCount >= 3 && (
                <>
                    <div className="community-cards__separator community-cards__separator--flop" />
                    {visibleCount >= 4 && (
                        <div className="community-cards__separator community-cards__separator--turn" />
                    )}
                </>
            )}

            {/* Winning Hand Name — PokerBros-style "Straight" label below community cards */}
            {winningHandName && (
                <div className="community-cards__hand-name">
                    {winningHandName}
                </div>
            )}
        </div>
    );
}

export const CommunityCards = memo(CommunityCardsComponent, (prev, next) => {
    // Return true if props are equal (skip re-render)
    if (prev.stage !== next.stage) return false;
    if (prev.isDealing !== next.isDealing) return false;
    if (prev.winningHandName !== next.winningHandName) return false;
    if (JSON.stringify(prev.cards) !== JSON.stringify(next.cards)) return false;
    if (JSON.stringify(prev.highlightedIndices) !== JSON.stringify(next.highlightedIndices)) return false;
    return true;
});

export default CommunityCards;

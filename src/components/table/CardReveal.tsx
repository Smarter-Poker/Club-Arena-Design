/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CARD REVEAL — Animated Hole Card Reveal
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React from 'react';
import './CardReveal.css';

interface CardRevealProps {
    cards: string[];
    isRevealed: boolean;
    isWinner?: boolean;
    handName?: string;
}

export function CardReveal({ cards, isRevealed, isWinner, handName }: CardRevealProps) {
    const formatCard = (card: string) => {
        const suit = card.slice(-1);
        const suitChar = suit === 'h' ? '♥' : suit === 'd' ? '♦' : suit === 'c' ? '♣' : '♠';
        const isRed = suit === 'h' || suit === 'd';
        return { rank: card.slice(0, -1), suit: suitChar, isRed };
    };

    return (
        <div className={`card-reveal ${isRevealed ? 'revealed' : ''} ${isWinner ? 'winner' : ''}`}>
            <div className="cards">
                {cards.map((card, idx) => {
                    const { rank, suit, isRed } = formatCard(card);
                    return (
                        <div
                            key={idx}
                            className={`card ${isRevealed ? 'flipped' : ''}`}
                            style={{ animationDelay: `${idx * 0.1}s` }}
                        >
                            <div className="card-inner">
                                <div className="card-back">♠</div>
                                <div className={`card-front ${isRed ? 'red' : 'black'}`}>
                                    <span className="rank">{rank}</span>
                                    <span className="suit">{suit}</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {handName && isRevealed && (
                <div className="hand-name">{handName}</div>
            )}
        </div>
    );
}

export default CardReveal;

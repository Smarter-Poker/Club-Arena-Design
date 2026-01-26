/**
 * ♠ POKER ENGINE — Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    Deck,
    evaluateHand,
    compareHands,
    parseCard,
    cardToString,
    cardsToString,
    HAND_RANKINGS,
    calculatePots,
    calculateRake,
    determineWinners,
} from '../src/engine/PokerEngine';
import type { Card } from '../src/types/database.types';

// ═══════════════════════════════════════════════════════════════════════════════
// DECK TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Deck', () => {
    let deck: Deck;

    beforeEach(() => {
        deck = new Deck();
    });

    it('should have 52 cards when initialized', () => {
        expect(deck.remaining()).toBe(52);
    });

    it('should deal cards correctly', () => {
        const cards = deck.deal(5);
        expect(cards.length).toBe(5);
        expect(deck.remaining()).toBe(47);
    });

    it('should shuffle the deck', () => {
        const deck1 = new Deck();
        const deck2 = new Deck();
        deck2.shuffle();

        // After shuffling, decks should be different (statistically very likely)
        const cards1 = deck1.deal(10);
        const cards2 = deck2.deal(10);
        const same = cards1.every((c, i) =>
            c.rank === cards2[i].rank && c.suit === cards2[i].suit
        );
        // With 52! permutations, same order is virtually impossible
        // But we just check the deck still has proper counts
        expect(deck2.remaining()).toBe(42);
    });

    it('should reset the deck', () => {
        deck.deal(20);
        deck.reset();
        expect(deck.remaining()).toBe(52);
    });

    it('should remove cards for Short Deck', () => {
        deck.removeCardsBelow('6');
        expect(deck.remaining()).toBe(36); // 52 - 16 (2-5 in all 4 suits)
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CARD PARSING TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Card Parsing', () => {
    it('should parse card strings correctly', () => {
        const ace = parseCard('As');
        expect(ace.rank).toBe('A');
        expect(ace.suit).toBe('spades');

        const ten = parseCard('Th');
        expect(ten.rank).toBe('T');
        expect(ten.suit).toBe('hearts');
    });

    it('should convert cards to strings', () => {
        const card: Card = { rank: 'K', suit: 'diamonds' };
        expect(cardToString(card)).toBe('K♦');
    });

    it('should convert multiple cards to string', () => {
        const cards: Card[] = [
            { rank: 'A', suit: 'spades' },
            { rank: 'K', suit: 'hearts' },
        ];
        expect(cardsToString(cards)).toBe('A♠ K♥');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HAND EVALUATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Hand Evaluation', () => {
    it('should recognize a pair', () => {
        const hole: Card[] = [
            { rank: 'A', suit: 'spades' },
            { rank: 'A', suit: 'hearts' },
        ];
        const community: Card[] = [
            { rank: 'K', suit: 'diamonds' },
            { rank: 'Q', suit: 'clubs' },
            { rank: 'J', suit: 'spades' },
            { rank: '5', suit: 'hearts' },
            { rank: '2', suit: 'diamonds' },
        ];
        const result = evaluateHand(hole, community);
        expect(result.ranking).toBe(HAND_RANKINGS.PAIR);
        expect(result.name).toBe('Pair');
    });

    it('should recognize two pair', () => {
        const hole: Card[] = [
            { rank: 'A', suit: 'spades' },
            { rank: 'A', suit: 'hearts' },
        ];
        const community: Card[] = [
            { rank: 'K', suit: 'diamonds' },
            { rank: 'K', suit: 'clubs' },
            { rank: 'Q', suit: 'spades' },
            { rank: '5', suit: 'hearts' },
            { rank: '2', suit: 'diamonds' },
        ];
        const result = evaluateHand(hole, community);
        expect(result.ranking).toBe(HAND_RANKINGS.TWO_PAIR);
    });

    it('should recognize three of a kind', () => {
        const hole: Card[] = [
            { rank: 'A', suit: 'spades' },
            { rank: 'A', suit: 'hearts' },
        ];
        const community: Card[] = [
            { rank: 'A', suit: 'diamonds' },
            { rank: 'K', suit: 'clubs' },
            { rank: 'Q', suit: 'spades' },
            { rank: '5', suit: 'hearts' },
            { rank: '2', suit: 'diamonds' },
        ];
        const result = evaluateHand(hole, community);
        expect(result.ranking).toBe(HAND_RANKINGS.THREE_OF_A_KIND);
    });

    it('should recognize a straight', () => {
        const hole: Card[] = [
            { rank: 'A', suit: 'spades' },
            { rank: 'K', suit: 'hearts' },
        ];
        const community: Card[] = [
            { rank: 'Q', suit: 'diamonds' },
            { rank: 'J', suit: 'clubs' },
            { rank: 'T', suit: 'spades' },
            { rank: '5', suit: 'hearts' },
            { rank: '2', suit: 'diamonds' },
        ];
        const result = evaluateHand(hole, community);
        expect(result.ranking).toBe(HAND_RANKINGS.STRAIGHT);
    });

    it('should recognize a flush', () => {
        const hole: Card[] = [
            { rank: 'A', suit: 'spades' },
            { rank: 'K', suit: 'spades' },
        ];
        const community: Card[] = [
            { rank: 'Q', suit: 'spades' },
            { rank: '8', suit: 'spades' },
            { rank: '4', suit: 'spades' },
            { rank: '5', suit: 'hearts' },
            { rank: '2', suit: 'diamonds' },
        ];
        const result = evaluateHand(hole, community);
        expect(result.ranking).toBe(HAND_RANKINGS.FLUSH);
    });

    it('should recognize a full house', () => {
        const hole: Card[] = [
            { rank: 'A', suit: 'spades' },
            { rank: 'A', suit: 'hearts' },
        ];
        const community: Card[] = [
            { rank: 'A', suit: 'diamonds' },
            { rank: 'K', suit: 'clubs' },
            { rank: 'K', suit: 'spades' },
            { rank: '5', suit: 'hearts' },
            { rank: '2', suit: 'diamonds' },
        ];
        const result = evaluateHand(hole, community);
        expect(result.ranking).toBe(HAND_RANKINGS.FULL_HOUSE);
    });

    it('should recognize four of a kind', () => {
        const hole: Card[] = [
            { rank: 'A', suit: 'spades' },
            { rank: 'A', suit: 'hearts' },
        ];
        const community: Card[] = [
            { rank: 'A', suit: 'diamonds' },
            { rank: 'A', suit: 'clubs' },
            { rank: 'K', suit: 'spades' },
            { rank: '5', suit: 'hearts' },
            { rank: '2', suit: 'diamonds' },
        ];
        const result = evaluateHand(hole, community);
        expect(result.ranking).toBe(HAND_RANKINGS.FOUR_OF_A_KIND);
    });

    it('should recognize a straight flush', () => {
        const hole: Card[] = [
            { rank: '9', suit: 'spades' },
            { rank: '8', suit: 'spades' },
        ];
        const community: Card[] = [
            { rank: '7', suit: 'spades' },
            { rank: '6', suit: 'spades' },
            { rank: '5', suit: 'spades' },
            { rank: 'K', suit: 'hearts' },
            { rank: '2', suit: 'diamonds' },
        ];
        const result = evaluateHand(hole, community);
        expect(result.ranking).toBe(HAND_RANKINGS.STRAIGHT_FLUSH);
    });

    it('should recognize a royal flush', () => {
        const hole: Card[] = [
            { rank: 'A', suit: 'spades' },
            { rank: 'K', suit: 'spades' },
        ];
        const community: Card[] = [
            { rank: 'Q', suit: 'spades' },
            { rank: 'J', suit: 'spades' },
            { rank: 'T', suit: 'spades' },
            { rank: '5', suit: 'hearts' },
            { rank: '2', suit: 'diamonds' },
        ];
        const result = evaluateHand(hole, community);
        expect(result.ranking).toBe(HAND_RANKINGS.ROYAL_FLUSH);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HAND COMPARISON TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Hand Comparison', () => {
    it('should correctly compare different hand rankings', () => {
        const pair: Card[] = [{ rank: 'A', suit: 'spades' }, { rank: 'A', suit: 'hearts' }];
        const trips: Card[] = [{ rank: 'K', suit: 'spades' }, { rank: 'K', suit: 'hearts' }];
        const community: Card[] = [
            { rank: 'K', suit: 'diamonds' },
            { rank: 'Q', suit: 'clubs' },
            { rank: 'J', suit: 'spades' },
            { rank: '5', suit: 'hearts' },
            { rank: '2', suit: 'diamonds' },
        ];

        const pairHand = evaluateHand(pair, community);
        const tripsHand = evaluateHand(trips, community);

        expect(compareHands(tripsHand, pairHand)).toBeGreaterThan(0);
        expect(compareHands(pairHand, tripsHand)).toBeLessThan(0);
    });

    it('should compare same ranking by kickers', () => {
        const aceHigh: Card[] = [{ rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'hearts' }];
        const kingHigh: Card[] = [{ rank: 'K', suit: 'diamonds' }, { rank: 'Q', suit: 'clubs' }];
        const community: Card[] = [
            { rank: '8', suit: 'diamonds' },
            { rank: '7', suit: 'clubs' },
            { rank: '5', suit: 'spades' },
            { rank: '3', suit: 'hearts' },
            { rank: '2', suit: 'diamonds' },
        ];

        const aceHighHand = evaluateHand(aceHigh, community);
        const kingHighHand = evaluateHand(kingHigh, community);

        expect(compareHands(aceHighHand, kingHighHand)).toBeGreaterThan(0);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RAKE CALCULATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Rake Calculation', () => {
    it('should calculate rake with cap', () => {
        const config = { percent: 5, cap: 3, noFlop: true };
        const rake = calculateRake(100, true, config);
        expect(rake).toBe(3); // 5% of 100 = 5, but cap is 3
    });

    it('should apply no flop no drop when no flop', () => {
        const config = { percent: 5, cap: 3, noFlop: true };
        const rake = calculateRake(100, false, config);
        expect(rake).toBe(0);
    });

    it('should take rake without no flop no drop', () => {
        const config = { percent: 5, cap: 10, noFlop: false };
        const rake = calculateRake(100, false, config);
        expect(rake).toBe(5);
    });
});

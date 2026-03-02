/**
 * ♠ CLUB ARENA — Bot Logic Engine
 * Decision making for AI opponents
 */

import type { Card, ActionType, SeatPlayer, HandStage } from '../types/database.types';
import { evaluateHand, evaluateOmahaHand } from './PokerEngine';

interface BotDecision {
    action: ActionType;
    amount?: number;
}

interface GameState {
    players: SeatPlayer[];
    communityCards: Card[];
    pot: number;
    currentBet: number;
    stage: HandStage;
    gameVariant: 'nlh' | 'plo4' | 'plo5' | 'plo6';
    bigBlind: number;
}

export class BotLogic {
    // ─────────────────────────────────────────────────────────────────────────────
    // Core Decision Logic
    // ─────────────────────────────────────────────────────────────────────────────

    static decide(
        player: SeatPlayer,
        gameState: GameState
    ): BotDecision {
        const { currentBet, pot, communityCards, stage } = gameState;
        const toCall = currentBet - player.bet;
        const stack = player.stack;

        // 1. Evaluate Hand Strength (0-1 score)
        const handStrength = this.calculateHandStrength(player.cards, communityCards, stage, gameState.gameVariant);

        // 2. Calculate Pot Odds
        const potOdds = toCall / (pot + toCall);

        // 3. Determine aggression factor based on player style and variance
        // Player styles could be: 'tight-passive', 'tight-aggressive', 'loose-passive', 'loose-aggressive'
        const playerStyle = (player as any).botStyle || 'balanced';
        const baseAggression = this.getAggressionForStyle(playerStyle);
        const aggression = baseAggression + (Math.random() * 0.15 - 0.075); // +/- 7.5% variance

        // 4. Make Decision

        // PREFLOP
        if (stage === 'preflop') {
            return this.decidePreflop(player, toCall, currentBet, pot, handStrength, gameState.bigBlind);
        }

        // POSTFLOP
        return this.decidePostflop(player, toCall, currentBet, pot, handStrength, potOdds);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Stage Specific Logic
    // ─────────────────────────────────────────────────────────────────────────────

    private static decidePreflop(
        player: SeatPlayer,
        toCall: number,
        currentBet: number,
        pot: number,
        strength: number,
        bb: number
    ): BotDecision {
        const stack = player.stack;

        // Super premium (AA, KK, AKs) -> Raise big
        if (strength > 0.95) {
            return { action: 'raise', amount: Math.min(stack, Math.max(currentBet * 3, pot)) };
        }

        // Strong (QQ, JJ, AK, AQs) -> Raise
        if (strength > 0.8) {
            if (toCall === 0) return { action: 'raise', amount: bb * 3 };
            return { action: 'raise', amount: Math.min(stack, currentBet * 2.5) };
        }

        // Playable pairs / suited connectors
        if (strength > 0.4) {
            // Fold to huge raises (unless super deep, but simple logic here)
            if (toCall > 20 * bb) return { action: 'fold' };
            if (toCall > 0) return { action: 'call' };
            return { action: 'check' };
        }

        // Weak
        if (toCall === 0) return { action: 'check' };
        return { action: 'fold' };
    }

    private static decidePostflop(
        player: SeatPlayer,
        toCall: number,
        currentBet: number,
        pot: number,
        strength: number,
        potOdds: number
    ): BotDecision {
        const stack = player.stack;

        // Nutted hands (Flush, Straight, Set, etc) -> Build pot
        if (strength > 0.9) {
            if (toCall === 0) {
                // Bet 60-80% pot
                const betSize = Math.floor(pot * 0.75);
                return { action: 'bet', amount: Math.min(stack, betSize) };
            }
            // Raise for value
            return { action: 'raise', amount: Math.min(stack, currentBet * 3) };
        }

        // Strong made hands (Top Pair + kicker)
        if (strength > 0.7) {
            if (toCall === 0) return { action: 'bet', amount: Math.floor(pot * 0.5) };
            return { action: 'call' };
        }

        // Marginal / Draws (simplified)
        // If price is good, call
        if (strength > 0.4) {
            // If checking, just check
            if (toCall === 0) return { action: 'check' };

            // Call if odds justify (rough heuristic)
            if (strength > potOdds) return { action: 'call' };
            return { action: 'fold' };
        }

        // Trash
        if (toCall === 0) {
            // Random bluff (10% freq)
            if (Math.random() < 0.1) return { action: 'bet', amount: Math.floor(pot * 0.6) };
            return { action: 'check' };
        }
        return { action: 'fold' };
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Heuristics
    // ─────────────────────────────────────────────────────────────────────────────

    private static calculateHandStrength(
        holeCards: Card[],
        communityCards: Card[],
        stage: HandStage,
        gameVariant: string = 'nlh'
    ): number {
        if (!holeCards || holeCards.length === 0) return 0;

        if (stage === 'preflop') {
            // For Omaha, use a simplified preflop eval
            if (gameVariant.startsWith('plo') && holeCards.length >= 4) {
                return this.evaluateOmahaHoleCards(holeCards);
            }
            if (holeCards.length !== 2) return 0.3; // fallback
            return this.evaluateHoleCards(holeCards);
        }

        // Use correct evaluator based on game variant
        const evaluator = gameVariant.startsWith('plo') ? evaluateOmahaHand : evaluateHand;
        const myHand = evaluator(holeCards, communityCards);

        // Normalize ranking (1=High Card, 10=Royal Flush)
        // This is very crude. A real bot runs equity sims.
        // We map Hand Ranking to a 0-1 score roughly.

        // High Card: 0.0 - 0.2
        // Pair: 0.2 - 0.4
        // Two Pair: 0.4 - 0.6
        // Trips+: 0.6 - 1.0

        const baseScore = (myHand.ranking - 1) / 9; // 0 to 1

        // Adjust for Board Texture (e.g. if board is 4-flush, a pair is worth less)
        // Omitted for simplicity.

        return baseScore;
    }

    private static evaluateHoleCards(cards: Card[]): number {
        // Chen Formula simplified or similar
        const [c1, c2] = cards;
        const r1 = this.rankValue(c1.rank);
        const r2 = this.rankValue(c2.rank);

        const high = Math.max(r1, r2);
        const low = Math.min(r1, r2);

        const isPair = r1 === r2;
        const isSuited = c1.suit === c2.suit;
        const gap = high - low;

        let score = high; // Base is high card value (2..14)
        if (isPair) score *= 2; // Pairs are strong
        if (isSuited) score += 2;
        if (gap === 1) score += 1; // Connectors
        if (gap === 2) score += 0.5;

        // Max possible score ~30 (AA). Min ~2 (72o)
        // Normalize to 0-1
        return Math.min(score / 30, 1);
    }

    private static evaluateOmahaHoleCards(cards: Card[]): number {
        // Simplified Omaha preflop hand strength
        // Values: double-suited, connected, high cards, pairs
        let score = 0;
        const ranks = cards.map(c => this.rankValue(c.rank));
        const suits = cards.map(c => c.suit);
        const highCard = Math.max(...ranks);

        // High card bonus
        score += highCard * 0.5;

        // Pairs (useful in Omaha for sets)
        const rankSet = new Map<number, number>();
        for (const r of ranks) rankSet.set(r, (rankSet.get(r) || 0) + 1);
        for (const [r, count] of rankSet) {
            if (count >= 2) score += r * 0.8;
        }

        // Suited cards bonus
        const suitCounts = new Map<string, number>();
        for (const s of suits) suitCounts.set(s, (suitCounts.get(s) || 0) + 1);
        for (const count of suitCounts.values()) {
            if (count >= 2) score += 3; // double suited bonus
        }

        // Connectedness
        const sortedRanks = [...ranks].sort((a, b) => a - b);
        for (let i = 1; i < sortedRanks.length; i++) {
            if (sortedRanks[i] - sortedRanks[i - 1] <= 2) score += 1.5;
        }

        // Normalize to 0-1 (max possible ~40)
        return Math.min(score / 40, 1);
    }

    private static rankValue(rank: string): number {
        const map: Record<string, number> = {
            '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
            'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
        };
        return map[rank] || 0;
    }

    private static getAggressionForStyle(style: string): number {
        const aggressionMap: Record<string, number> = {
            'tight-passive': 0.2,
            'tight-aggressive': 0.5,
            'loose-passive': 0.3,
            'loose-aggressive': 0.7,
            'balanced': 0.4,
            'maniac': 0.9,
            'nit': 0.1,
        };
        return aggressionMap[style] || 0.4;
    }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  INSURANCE ENGINE — All-In Equity Insurance System
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Manages insurance offers when players go all-in:
 * - Triggered when 2+ players are all-in before the river
 * - Uses MonteCarloEquity to calculate real equity percentages
 * - Premium = (1 - equity%) × insuredAmount × margin
 * - Offer/accept/decline flow with configurable timeout
 * - Settlement after board is dealt
 * - Bus emissions for UI synchronization
 */

import { masterBus } from '../core/MasterBus';
import { monteCarloEquity } from './MonteCarloEquity';
import type { Card } from '../types/database.types';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface InsuranceConfig {
  /** Whether insurance is available at this table */
  enabled: boolean;
  /** Margin multiplier for the house (default: 1.05 = 5% edge) */
  houseMargin: number;
  /** Maximum insurable percentage of the pot (default: 100%) */
  maxInsurablePercent: number;
  /** Seconds to accept/decline insurance offer (default: 15) */
  offerTimeoutSeconds: number;
  /** Minimum pot size to offer insurance (default: 0) */
  minPotForInsurance: number;
  /** Number of Monte Carlo iterations for equity calc (default: 5000) */
  equityIterations: number;
}

export interface InsuranceOffer {
  tableId: string;
  handId: string;
  playerId: string;
  holeCards: Card[];
  equity: number;
  premium: number;
  insuredAmount: number;
  status: 'offered' | 'accepted' | 'declined' | 'settled';
  timeoutTimer?: ReturnType<typeof setTimeout>;
}

export interface InsuranceSettlement {
  playerId: string;
  insuredAmount: number;
  premium: number;
  payout: number;
  won: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INSURANCE ENGINE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class InsuranceEngineClass {
  private tableConfigs: Map<string, InsuranceConfig> = new Map();
  private activeOffers: Map<string, InsuranceOffer[]> = new Map(); // key: tableId

  private readonly DEFAULT_CONFIG: InsuranceConfig = {
    enabled: false,
    houseMargin: 1.05,
    maxInsurablePercent: 100,
    offerTimeoutSeconds: 15,
    minPotForInsurance: 0,
    equityIterations: 5000,
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════

  configure(tableId: string, config: Partial<InsuranceConfig>): void {
    this.tableConfigs.set(tableId, { ...this.DEFAULT_CONFIG, ...config });
  }

  isEnabled(tableId: string): boolean {
    return this.tableConfigs.get(tableId)?.enabled ?? false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INSURANCE OFFERING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create insurance offers for all-in players.
   * Called by HeadlessTableEngine when an all-in runout is pending.
   *
   * @param allInPlayers - Players who are all-in with their hole cards
   * @param board - Community cards dealt so far
   * @param pot - Total pot amount
   * @returns Array of insurance offers (one per player)
   */
  createOffers(
    tableId: string,
    handId: string,
    allInPlayers: Array<{ playerId: string; holeCards: Card[] }>,
    board: Card[],
    pot: number
  ): InsuranceOffer[] {
    const config = this.tableConfigs.get(tableId) || this.DEFAULT_CONFIG;
    if (!config.enabled || pot < config.minPotForInsurance) return [];
    if (allInPlayers.length < 2 || board.length < 3) return [];

    const offers: InsuranceOffer[] = [];
    const numOpponents = allInPlayers.length - 1;

    for (const player of allInPlayers) {
      // Calculate equity using Monte Carlo simulation
      const equity = monteCarloEquity(
        player.holeCards,
        board,
        numOpponents,
        config.equityIterations
      );

      // Maximum insurable amount
      const maxInsurable = pot * (config.maxInsurablePercent / 100);

      // Premium = probability of losing × insured amount × margin
      // Probability of losing ≈ 1 - (equity / 100)
      const lossProbability = 1 - equity / 100;
      const insuredAmount = Math.min(maxInsurable, pot * (equity / 100));
      const premium = Math.round(insuredAmount * lossProbability * config.houseMargin * 100) / 100;

      const offer: InsuranceOffer = {
        tableId,
        handId,
        playerId: player.playerId,
        holeCards: player.holeCards,
        equity,
        premium,
        insuredAmount: Math.round(insuredAmount * 100) / 100,
        status: 'offered',
      };

      // Auto-decline timeout
      offer.timeoutTimer = setTimeout(() => {
        if (offer.status === 'offered') {
          this.decline(tableId, player.playerId);
        }
      }, config.offerTimeoutSeconds * 1000);

      offers.push(offer);

      masterBus.emit('INSURANCE_OFFERED', {
        tableId,
        handId,
        playerId: player.playerId,
        equity,
        premium,
        insuredAmount: offer.insuredAmount,
      });
    }

    this.activeOffers.set(tableId, offers);
    return offers;
  }

  /**
   * Accept insurance offer
   */
  accept(tableId: string, playerId: string): boolean {
    const offers = this.activeOffers.get(tableId);
    if (!offers) return false;

    const offer = offers.find((o) => o.playerId === playerId && o.status === 'offered');
    if (!offer) return false;

    offer.status = 'accepted';
    if (offer.timeoutTimer) clearTimeout(offer.timeoutTimer);

    masterBus.emit('INSURANCE_ACCEPTED', {
      tableId,
      handId: offer.handId,
      playerId,
      premium: offer.premium,
    });

    return true;
  }

  /**
   * Decline insurance offer
   */
  decline(tableId: string, playerId: string): void {
    const offers = this.activeOffers.get(tableId);
    if (!offers) return;

    const offer = offers.find((o) => o.playerId === playerId && o.status === 'offered');
    if (!offer) return;

    offer.status = 'declined';
    if (offer.timeoutTimer) clearTimeout(offer.timeoutTimer);

    masterBus.emit('INSURANCE_DECLINED', {
      tableId,
      handId: offer.handId,
      playerId,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SETTLEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Settle all accepted insurance offers based on hand outcome.
   * Called after the hand is complete and winners are determined.
   *
   * @param winnerId - The player who won the pot
   * @returns Array of settlements (payouts for each insured player)
   */
  settle(tableId: string, winnerId: string): InsuranceSettlement[] {
    const offers = this.activeOffers.get(tableId);
    if (!offers) return [];

    const settlements: InsuranceSettlement[] = [];

    for (const offer of offers) {
      if (offer.status !== 'accepted') continue;

      const playerLost = offer.playerId !== winnerId;
      const payout = playerLost ? offer.insuredAmount : 0;

      const settlement: InsuranceSettlement = {
        playerId: offer.playerId,
        insuredAmount: offer.insuredAmount,
        premium: offer.premium,
        payout,
        won: playerLost, // Insurance "wins" when player loses the hand
      };

      settlements.push(settlement);
      offer.status = 'settled';

      masterBus.emit('INSURANCE_SETTLED', {
        tableId,
        handId: offer.handId,
        playerId: offer.playerId,
        payout,
        won: playerLost,
      });
    }

    // Cleanup
    this.activeOffers.delete(tableId);
    return settlements;
  }

  /**
   * Check if all offers have been responded to (accepted or declined)
   */
  allResponded(tableId: string): boolean {
    const offers = this.activeOffers.get(tableId);
    if (!offers || offers.length === 0) return true;
    return offers.every((o) => o.status !== 'offered');
  }

  /**
   * Get pending offers for a table
   */
  getOffers(tableId: string): InsuranceOffer[] {
    return this.activeOffers.get(tableId) || [];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════════════════

  dispose(tableId: string): void {
    const offers = this.activeOffers.get(tableId);
    if (offers) {
      for (const offer of offers) {
        if (offer.timeoutTimer) clearTimeout(offer.timeoutTimer);
      }
    }
    this.activeOffers.delete(tableId);
    this.tableConfigs.delete(tableId);
  }
}

export const insuranceEngine = new InsuranceEngineClass();
export default insuranceEngine;

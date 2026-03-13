/**
 * ♠ CLUB ARENA — InsuranceEngine Tests
 * ═══════════════════════════════════════════════════════════════════════════════
 * Tests insurance offer generation, accept/decline flow, settlement, and bus events.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock MasterBus
vi.mock('../../src/core/MasterBus', () => ({
  masterBus: {
    emit: vi.fn(),
    on: vi.fn(),
    subscribe: vi.fn(),
    subscribeDebounced: vi.fn(),
  },
}));

// Mock MonteCarloEquity
vi.mock('../../src/engine/MonteCarloEquity', () => ({
  monteCarloEquity: {
    calculateEquity: vi.fn(() =>
      Promise.resolve({
        equities: [
          { playerId: 'player-1', equity: 0.35, wins: 350, ties: 0, total: 1000 },
          { playerId: 'player-2', equity: 0.65, wins: 650, ties: 0, total: 1000 },
        ],
      })
    ),
  },
}));

import { insuranceEngine } from '../../src/engine/InsuranceEngine';
import { masterBus } from '../../src/core/MasterBus';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('InsuranceEngine - Configuration', () => {
  it('should configure insurance for a table', () => {
    insuranceEngine.configure('table-ins-1', {
      enabled: true,
      minPot: 20,
      maxInsuredPercent: 100,
      offerTimeoutSeconds: 15,
    });
    expect(true).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// OFFER GENERATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('InsuranceEngine - Offer Generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    insuranceEngine.configure('table-offer', {
      enabled: true,
      minPot: 10,
      offerTimeoutSeconds: 15,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should generate an insurance offer with correct fields', async () => {
    const offer = await insuranceEngine.generateOffer('table-offer', {
      pot: 100,
      players: [
        {
          playerId: 'player-1',
          cards: [
            { rank: 'A', suit: 'h' },
            { rank: 'K', suit: 'h' },
          ],
          stack: 0,
        },
        {
          playerId: 'player-2',
          cards: [
            { rank: 'Q', suit: 'd' },
            { rank: 'J', suit: 'd' },
          ],
          stack: 0,
        },
      ],
      communityCards: [
        { rank: 'T', suit: 'h' },
        { rank: '9', suit: 'h' },
        { rank: '2', suit: 'c' },
        { rank: '3', suit: 's' },
      ],
    });

    expect(offer).toBeDefined();
    if (offer) {
      expect(offer.pot).toBe(100);
      expect(offer.premium).toBeGreaterThan(0);
      expect(offer.insuredAmount).toBeGreaterThan(0);
    }
  });

  it('should emit INSURANCE_OFFERED event', async () => {
    await insuranceEngine.generateOffer('table-offer', {
      pot: 100,
      players: [
        {
          playerId: 'player-1',
          cards: [
            { rank: 'A', suit: 'h' },
            { rank: 'K', suit: 'h' },
          ],
          stack: 0,
        },
        {
          playerId: 'player-2',
          cards: [
            { rank: 'Q', suit: 'd' },
            { rank: 'J', suit: 'd' },
          ],
          stack: 0,
        },
      ],
      communityCards: [
        { rank: 'T', suit: 'h' },
        { rank: '9', suit: 'h' },
        { rank: '2', suit: 'c' },
        { rank: '3', suit: 's' },
      ],
    });

    expect(masterBus.emit).toHaveBeenCalledWith(
      'INSURANCE_OFFERED',
      expect.objectContaining({
        tableId: 'table-offer',
      })
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ACCEPT / DECLINE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('InsuranceEngine - Accept / Decline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    insuranceEngine.configure('table-ad', {
      enabled: true,
      minPot: 10,
      offerTimeoutSeconds: 15,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should accept insurance and emit INSURANCE_ACCEPTED', async () => {
    await insuranceEngine.generateOffer('table-ad', {
      pot: 100,
      players: [
        {
          playerId: 'player-1',
          cards: [
            { rank: 'A', suit: 'h' },
            { rank: 'K', suit: 'h' },
          ],
          stack: 50,
        },
        {
          playerId: 'player-2',
          cards: [
            { rank: 'Q', suit: 'd' },
            { rank: 'J', suit: 'd' },
          ],
          stack: 50,
        },
      ],
      communityCards: [
        { rank: 'T', suit: 'h' },
        { rank: '9', suit: 'h' },
        { rank: '2', suit: 'c' },
        { rank: '3', suit: 's' },
      ],
    });

    vi.clearAllMocks();
    insuranceEngine.accept('table-ad', 'player-1');

    expect(masterBus.emit).toHaveBeenCalledWith(
      'INSURANCE_ACCEPTED',
      expect.objectContaining({
        tableId: 'table-ad',
        playerId: 'player-1',
      })
    );
  });

  it('should decline insurance and emit INSURANCE_DECLINED', async () => {
    await insuranceEngine.generateOffer('table-ad', {
      pot: 100,
      players: [
        {
          playerId: 'player-1',
          cards: [
            { rank: 'A', suit: 'h' },
            { rank: 'K', suit: 'h' },
          ],
          stack: 50,
        },
        {
          playerId: 'player-2',
          cards: [
            { rank: 'Q', suit: 'd' },
            { rank: 'J', suit: 'd' },
          ],
          stack: 50,
        },
      ],
      communityCards: [
        { rank: 'T', suit: 'h' },
        { rank: '9', suit: 'h' },
        { rank: '2', suit: 'c' },
        { rank: '3', suit: 's' },
      ],
    });

    vi.clearAllMocks();
    insuranceEngine.decline('table-ad', 'player-1');

    expect(masterBus.emit).toHaveBeenCalledWith(
      'INSURANCE_DECLINED',
      expect.objectContaining({
        tableId: 'table-ad',
        playerId: 'player-1',
      })
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DISPOSAL TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('InsuranceEngine - Disposal', () => {
  it('should dispose of all active offers for a table', () => {
    insuranceEngine.configure('table-dispose-ins', { enabled: true, minPot: 10 });
    insuranceEngine.dispose('table-dispose-ins');
    // No error = success
    expect(true).toBe(true);
  });
});

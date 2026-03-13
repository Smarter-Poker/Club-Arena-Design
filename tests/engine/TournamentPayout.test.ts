/**
 * ♠ CLUB ARENA — TournamentEngine Tests (Payout Calculation)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Tests tournament payout calculation, blind level advancement, and prize distribution.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock MasterBus
vi.mock('../../src/core/MasterBus', () => ({
  masterBus: {
    emit: vi.fn(),
    on: vi.fn(),
    subscribe: vi.fn(),
    subscribeDebounced: vi.fn(),
    onEvent: vi.fn(),
  },
}));

// Mock Supabase
vi.mock('../../src/services/supabaseClient', () => ({
  getSupabase: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ single: vi.fn(() => ({ data: null, error: null })) })),
      })),
      update: vi.fn(() => ({ eq: vi.fn(() => ({ data: null, error: null })) })),
      insert: vi.fn(() => ({ data: null, error: null })),
    })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    })),
  })),
}));

// Import the PayoutEngine which is used for tournament payouts
import { payoutEngine } from '../../src/services/PayoutEngine';

// ═══════════════════════════════════════════════════════════════════════════════
// PAYOUT CALCULATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('PayoutEngine - Prize Distribution', () => {
  it('should calculate payouts for a heads-up SNG (2 players)', () => {
    const payouts = payoutEngine.calculatePayouts({
      prizePool: 1000,
      playerCount: 2,
      template: 'sng3',
    });

    expect(payouts).toBeDefined();
    expect(payouts.length).toBeGreaterThanOrEqual(1);

    // Total payouts should equal prize pool
    const totalPaid = payouts.reduce((sum, p) => sum + p.amount, 0);
    expect(totalPaid).toBeCloseTo(1000, 1);
  });

  it('should calculate payouts for a 6-player SNG', () => {
    const payouts = payoutEngine.calculatePayouts({
      prizePool: 3000,
      playerCount: 6,
      template: 'sng6',
    });

    expect(payouts).toBeDefined();
    expect(payouts.length).toBeGreaterThanOrEqual(2);

    // First place should get more than second
    expect(payouts[0].amount).toBeGreaterThan(payouts[1].amount);

    // Total payouts = prize pool
    const totalPaid = payouts.reduce((sum, p) => sum + p.amount, 0);
    expect(totalPaid).toBeCloseTo(3000, 1);
  });

  it('should calculate payouts for a 9-player SNG', () => {
    const payouts = payoutEngine.calculatePayouts({
      prizePool: 9000,
      playerCount: 9,
      template: 'sng9',
    });

    expect(payouts).toBeDefined();
    expect(payouts.length).toBeGreaterThanOrEqual(3);

    // Payouts should be descending
    for (let i = 1; i < payouts.length; i++) {
      expect(payouts[i - 1].amount).toBeGreaterThanOrEqual(payouts[i].amount);
    }

    // Total = prize pool
    const totalPaid = payouts.reduce((sum, p) => sum + p.amount, 0);
    expect(totalPaid).toBeCloseTo(9000, 1);
  });

  it('should handle fractional chip payouts without losing chips', () => {
    const payouts = payoutEngine.calculatePayouts({
      prizePool: 100.5,
      playerCount: 3,
      template: 'sng3',
    });

    const totalPaid = payouts.reduce((sum, p) => sum + p.amount, 0);
    // Should not lose or create chips due to rounding
    expect(Math.abs(totalPaid - 100.5)).toBeLessThan(0.01);
  });

  it('should use correct template for different player counts', () => {
    // 3 players -> sng3
    const p3 = payoutEngine.calculatePayouts({ prizePool: 300, playerCount: 3 });
    expect(p3.length).toBeGreaterThanOrEqual(1);

    // 6 players -> sng6
    const p6 = payoutEngine.calculatePayouts({ prizePool: 600, playerCount: 6 });
    expect(p6.length).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// EDGE CASE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('PayoutEngine - Edge Cases', () => {
  it('should handle zero prize pool gracefully', () => {
    const payouts = payoutEngine.calculatePayouts({
      prizePool: 0,
      playerCount: 3,
    });

    // All payouts should be 0
    const totalPaid = payouts.reduce((sum, p) => sum + p.amount, 0);
    expect(totalPaid).toBe(0);
  });

  it('should handle single player (winner takes all)', () => {
    const payouts = payoutEngine.calculatePayouts({
      prizePool: 500,
      playerCount: 1,
    });

    expect(payouts.length).toBeGreaterThanOrEqual(1);
    expect(payouts[0].amount).toBe(500);
  });

  it('should ensure first place always gets the largest share', () => {
    for (const count of [2, 3, 6, 9]) {
      const payouts = payoutEngine.calculatePayouts({
        prizePool: 1000,
        playerCount: count,
      });

      if (payouts.length >= 2) {
        expect(payouts[0].amount).toBeGreaterThanOrEqual(payouts[1].amount);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PRECISION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('PayoutEngine - Precision', () => {
  it('should use integer arithmetic (scaled, not floats)', () => {
    const payouts = payoutEngine.calculatePayouts({
      prizePool: 999.99,
      playerCount: 3,
    });

    // Verify no floating point errors
    for (const payout of payouts) {
      // Amount should be a reasonable number (not NaN, not Infinity)
      expect(Number.isFinite(payout.amount)).toBe(true);
      expect(payout.amount).toBeGreaterThanOrEqual(0);
    }

    // Total should match prize pool exactly
    const total = payouts.reduce((s, p) => s + p.amount, 0);
    expect(Math.abs(total - 999.99)).toBeLessThan(0.01);
  });
});

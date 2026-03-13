/**
 * ♠ CLUB ARENA — TimeBankEngine Tests
 * ═══════════════════════════════════════════════════════════════════════════════
 * Tests time bank allocation, activation, depletion, and bus emissions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock MasterBus + PreciseActionTimer
vi.mock('../../src/core/MasterBus', () => ({
  masterBus: {
    emit: vi.fn(),
    on: vi.fn(),
    subscribe: vi.fn(),
    subscribeDebounced: vi.fn(),
  },
}));

import { timeBankEngine } from '../../src/engine/TimeBankEngine';
import { masterBus } from '../../src/core/MasterBus';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('TimeBankEngine - Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should configure a table with custom settings', () => {
    timeBankEngine.configure('table-tb-1', {
      totalBankSeconds: 60,
      maxUses: 6,
      secondsPerUse: 10,
    });
    // No error thrown = success
    expect(true).toBe(true);
  });

  it('should configure with default settings when no overrides given', () => {
    timeBankEngine.configure('table-tb-2', {});
    expect(true).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// INITIALIZATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('TimeBankEngine - Player Initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    timeBankEngine.configure('table-init', { totalBankSeconds: 30, maxUses: 4, secondsPerUse: 15 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should initialize a player with correct bank allocation', () => {
    timeBankEngine.initializePlayer('table-init', 'player-1');
    const status = timeBankEngine.getStatus('table-init', 'player-1');

    expect(status).toBeDefined();
    expect(status!.remainingSeconds).toBe(30);
    expect(status!.usesRemaining).toBe(4);
    expect(status!.isActive).toBe(false);
  });

  it('should track multiple players independently', () => {
    timeBankEngine.initializePlayer('table-init', 'player-a');
    timeBankEngine.initializePlayer('table-init', 'player-b');

    const statusA = timeBankEngine.getStatus('table-init', 'player-a');
    const statusB = timeBankEngine.getStatus('table-init', 'player-b');

    expect(statusA).toBeDefined();
    expect(statusB).toBeDefined();
    expect(statusA!.remainingSeconds).toBe(30);
    expect(statusB!.remainingSeconds).toBe(30);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('TimeBankEngine - Activation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    timeBankEngine.configure('table-act', { totalBankSeconds: 30, maxUses: 4, secondsPerUse: 15 });
    timeBankEngine.initializePlayer('table-act', 'player-1');
  });

  afterEach(() => {
    // Clean up timers
    timeBankEngine.stop('table-act', 'player-1');
    vi.useRealTimers();
  });

  it('should activate time bank and emit TIME_BANK_ACTIVATED', () => {
    timeBankEngine.activate('table-act', 'player-1');

    expect(masterBus.emit).toHaveBeenCalledWith(
      'TIME_BANK_ACTIVATED',
      expect.objectContaining({
        tableId: 'table-act',
        playerId: 'player-1',
      })
    );
  });

  it('should decrease uses remaining on activation', () => {
    const beforeStatus = timeBankEngine.getStatus('table-act', 'player-1');
    const usesBefore = beforeStatus!.usesRemaining;

    timeBankEngine.activate('table-act', 'player-1');

    const afterStatus = timeBankEngine.getStatus('table-act', 'player-1');
    expect(afterStatus!.usesRemaining).toBe(usesBefore - 1);
  });

  it('should not activate when no uses remaining', () => {
    // Exhaust all uses
    const config = { totalBankSeconds: 30, maxUses: 1, secondsPerUse: 30 };
    timeBankEngine.configure('table-exhaust', config);
    timeBankEngine.initializePlayer('table-exhaust', 'player-ex');

    timeBankEngine.activate('table-exhaust', 'player-ex');
    timeBankEngine.stop('table-exhaust', 'player-ex');
    vi.clearAllMocks();

    // Try to activate again — should fail
    timeBankEngine.activate('table-exhaust', 'player-ex');
    expect(masterBus.emit).toHaveBeenCalledWith(
      'TIME_BANK_DEPLETED',
      expect.objectContaining({
        playerId: 'player-ex',
      })
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STOP TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('TimeBankEngine - Stop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    timeBankEngine.configure('table-stop', { totalBankSeconds: 30, maxUses: 4, secondsPerUse: 15 });
    timeBankEngine.initializePlayer('table-stop', 'player-1');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should stop time bank and emit TIME_BANK_STOPPED', () => {
    timeBankEngine.activate('table-stop', 'player-1');
    vi.clearAllMocks();

    timeBankEngine.stop('table-stop', 'player-1');

    expect(masterBus.emit).toHaveBeenCalledWith(
      'TIME_BANK_STOPPED',
      expect.objectContaining({
        tableId: 'table-stop',
        playerId: 'player-1',
      })
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// REFILL TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('TimeBankEngine - Refill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    timeBankEngine.configure('table-refill', {
      totalBankSeconds: 30,
      maxUses: 4,
      secondsPerUse: 15,
      refillPerOrbit: true,
      refillSeconds: 15,
    });
    timeBankEngine.initializePlayer('table-refill', 'player-1');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should refill time bank on orbit completion', () => {
    // Use one bank
    timeBankEngine.activate('table-refill', 'player-1');
    timeBankEngine.stop('table-refill', 'player-1');

    const statusBefore = timeBankEngine.getStatus('table-refill', 'player-1');
    const secondsBefore = statusBefore!.remainingSeconds;

    // Trigger orbit refill
    timeBankEngine.refillOnOrbit('table-refill', 'player-1');

    const statusAfter = timeBankEngine.getStatus('table-refill', 'player-1');
    expect(statusAfter!.remainingSeconds).toBeGreaterThan(secondsBefore);
  });

  it('should emit TIME_BANK_REFILLED on refill', () => {
    timeBankEngine.activate('table-refill', 'player-1');
    timeBankEngine.stop('table-refill', 'player-1');
    vi.clearAllMocks();

    timeBankEngine.refillOnOrbit('table-refill', 'player-1');

    expect(masterBus.emit).toHaveBeenCalledWith(
      'TIME_BANK_REFILLED',
      expect.objectContaining({
        playerId: 'player-1',
      })
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CLEANUP TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('TimeBankEngine - Cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should clean up player state on removePlayer', () => {
    timeBankEngine.configure('table-clean', { totalBankSeconds: 30, maxUses: 4 });
    timeBankEngine.initializePlayer('table-clean', 'player-1');
    timeBankEngine.removePlayer('table-clean', 'player-1');

    const status = timeBankEngine.getStatus('table-clean', 'player-1');
    expect(status).toBeUndefined();
  });

  it('should clean up all state on disposeTable', () => {
    timeBankEngine.configure('table-dispose', { totalBankSeconds: 30, maxUses: 4 });
    timeBankEngine.initializePlayer('table-dispose', 'player-a');
    timeBankEngine.initializePlayer('table-dispose', 'player-b');
    timeBankEngine.disposeTable('table-dispose');

    expect(timeBankEngine.getStatus('table-dispose', 'player-a')).toBeUndefined();
    expect(timeBankEngine.getStatus('table-dispose', 'player-b')).toBeUndefined();
  });
});

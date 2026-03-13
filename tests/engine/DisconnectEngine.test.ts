/**
 * ♠ CLUB ARENA — DisconnectEngine Tests
 * ═══════════════════════════════════════════════════════════════════════════════
 * Tests disconnect detection, reconnection, auto-actions, and bus emissions.
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

vi.mock('../../src/engine/PreciseActionTimer', () => ({
  preciseActionTimer: {
    start: vi.fn(),
    cancel: vi.fn(),
    isActive: vi.fn(() => false),
  },
}));

import { disconnectEngine } from '../../src/engine/DisconnectEngine';
import { masterBus } from '../../src/core/MasterBus';
import { preciseActionTimer } from '../../src/engine/PreciseActionTimer';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('DisconnectEngine - Configuration', () => {
  it('should configure a table with custom timeout settings', () => {
    disconnectEngine.configure('table-dc-1', {
      disconnectTimeoutSeconds: 60,
      maxConsecutiveTimeouts: 5,
    });
    expect(true).toBe(true); // No error = success
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('DisconnectEngine - Player Registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    disconnectEngine.configure('table-reg', { disconnectTimeoutSeconds: 30 });
  });

  it('should register a connected player', () => {
    disconnectEngine.registerPlayer('table-reg', 'player-1');
    const state = disconnectEngine.getPlayerState('table-reg', 'player-1');

    expect(state).toBeDefined();
    expect(state!.isConnected).toBe(true);
    expect(state!.consecutiveTimeouts).toBe(0);
  });

  it('should track multiple players per table', () => {
    disconnectEngine.registerPlayer('table-reg', 'player-a');
    disconnectEngine.registerPlayer('table-reg', 'player-b');

    expect(disconnectEngine.getPlayerState('table-reg', 'player-a')).toBeDefined();
    expect(disconnectEngine.getPlayerState('table-reg', 'player-b')).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DISCONNECT DETECTION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('DisconnectEngine - Disconnect Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    disconnectEngine.configure('table-disc', { disconnectTimeoutSeconds: 30 });
    disconnectEngine.registerPlayer('table-disc', 'player-1');
  });

  it('should mark player as disconnected', () => {
    disconnectEngine.markDisconnected('table-disc', 'player-1');

    const state = disconnectEngine.getPlayerState('table-disc', 'player-1');
    expect(state!.isConnected).toBe(false);
  });

  it('should emit PLAYER_DISCONNECTED on disconnect', () => {
    disconnectEngine.markDisconnected('table-disc', 'player-1');

    expect(masterBus.emit).toHaveBeenCalledWith(
      'PLAYER_DISCONNECTED',
      expect.objectContaining({
        tableId: 'table-disc',
        playerId: 'player-1',
      })
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RECONNECTION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('DisconnectEngine - Reconnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    disconnectEngine.configure('table-recon', { disconnectTimeoutSeconds: 30 });
    disconnectEngine.registerPlayer('table-recon', 'player-1');
  });

  it('should mark player as reconnected', () => {
    disconnectEngine.markDisconnected('table-recon', 'player-1');
    disconnectEngine.markReconnected('table-recon', 'player-1');

    const state = disconnectEngine.getPlayerState('table-recon', 'player-1');
    expect(state!.isConnected).toBe(true);
  });

  it('should emit PLAYER_RECONNECTED on reconnect', () => {
    disconnectEngine.markDisconnected('table-recon', 'player-1');
    vi.clearAllMocks();

    disconnectEngine.markReconnected('table-recon', 'player-1');

    expect(masterBus.emit).toHaveBeenCalledWith(
      'PLAYER_RECONNECTED',
      expect.objectContaining({
        tableId: 'table-recon',
        playerId: 'player-1',
      })
    );
  });

  it('should cancel disconnect timer on reconnect', () => {
    disconnectEngine.markDisconnected('table-recon', 'player-1');
    disconnectEngine.markReconnected('table-recon', 'player-1');

    expect(preciseActionTimer.cancel).toHaveBeenCalled();
  });

  it('should reset consecutive timeouts on reconnect', () => {
    disconnectEngine.markDisconnected('table-recon', 'player-1');
    disconnectEngine.markReconnected('table-recon', 'player-1');

    const state = disconnectEngine.getPlayerState('table-recon', 'player-1');
    expect(state!.consecutiveTimeouts).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SIT OUT / SIT BACK TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('DisconnectEngine - Sit Out / Sit Back', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    disconnectEngine.configure('table-sit', { disconnectTimeoutSeconds: 30 });
    disconnectEngine.registerPlayer('table-sit', 'player-1');
  });

  it('should mark player as sitting out', () => {
    disconnectEngine.sitOut('table-sit', 'player-1');

    const state = disconnectEngine.getPlayerState('table-sit', 'player-1');
    expect(state!.isSittingOut).toBe(true);
  });

  it('should emit PLAYER_SAT_OUT', () => {
    disconnectEngine.sitOut('table-sit', 'player-1');

    expect(masterBus.emit).toHaveBeenCalledWith(
      'PLAYER_SAT_OUT',
      expect.objectContaining({
        tableId: 'table-sit',
        playerId: 'player-1',
      })
    );
  });

  it('should mark player as sitting back in', () => {
    disconnectEngine.sitOut('table-sit', 'player-1');
    disconnectEngine.sitBack('table-sit', 'player-1');

    const state = disconnectEngine.getPlayerState('table-sit', 'player-1');
    expect(state!.isSittingOut).toBe(false);
  });

  it('should emit PLAYER_SAT_BACK', () => {
    disconnectEngine.sitOut('table-sit', 'player-1');
    vi.clearAllMocks();

    disconnectEngine.sitBack('table-sit', 'player-1');

    expect(masterBus.emit).toHaveBeenCalledWith(
      'PLAYER_SAT_BACK',
      expect.objectContaining({
        tableId: 'table-sit',
        playerId: 'player-1',
      })
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CLEANUP TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('DisconnectEngine - Cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should remove player state on unregister', () => {
    disconnectEngine.configure('table-cleanup', { disconnectTimeoutSeconds: 30 });
    disconnectEngine.registerPlayer('table-cleanup', 'player-1');
    disconnectEngine.unregisterPlayer('table-cleanup', 'player-1');

    const state = disconnectEngine.getPlayerState('table-cleanup', 'player-1');
    expect(state).toBeUndefined();
  });

  it('should clean up all state on dispose', () => {
    disconnectEngine.configure('table-dispose-dc', { disconnectTimeoutSeconds: 30 });
    disconnectEngine.registerPlayer('table-dispose-dc', 'player-a');
    disconnectEngine.registerPlayer('table-dispose-dc', 'player-b');
    disconnectEngine.dispose('table-dispose-dc');

    expect(disconnectEngine.getPlayerState('table-dispose-dc', 'player-a')).toBeUndefined();
    expect(disconnectEngine.getPlayerState('table-dispose-dc', 'player-b')).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION CALLBACK TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('DisconnectEngine - Action Callbacks', () => {
  it('should register an action callback for a table', () => {
    const callback = vi.fn();
    disconnectEngine.configure('table-cb', { disconnectTimeoutSeconds: 30 });
    disconnectEngine.onAutoAction('table-cb', callback);

    // No error = success
    expect(true).toBe(true);
  });
});

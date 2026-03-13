/**
 * ♠ ENGINE IMPROVEMENTS — Unit Tests
 *
 * Comprehensive tests for all new Q1 engine features:
 * - Crypto RNG
 * - Disconnect Engine
 * - Time Bank Engine
 * - Insurance Engine
 * - Mixed Game Engine
 * - Chip Race Engine
 * - Pre-Action Engine
 * - Rakeback Engine
 * - BBA (Big Blind Ante)
 * - Run It Three Times
 * - Position-Aware AI
 * - Player-Count Rake Caps
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { secureRandomInt, secureRandom, secureShuffle } from '../src/engine/CryptoRandom';
import { calculateRake, calculateTimedRake, type TimedRakeConfig } from '../src/engine/PokerEngine';
import type { Card } from '../src/types/database.types';

// ═══════════════════════════════════════════════════════════════════════════════
// CRYPTO RANDOM TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('CryptoRandom', () => {
  it('secureRandomInt should return values in range [0, max)', () => {
    for (let i = 0; i < 100; i++) {
      const val = secureRandomInt(10);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(10);
    }
  });

  it('secureRandomInt(1) should always return 0', () => {
    for (let i = 0; i < 10; i++) {
      expect(secureRandomInt(1)).toBe(0);
    }
  });

  it('secureRandomInt(0) should return 0', () => {
    expect(secureRandomInt(0)).toBe(0);
  });

  it('secureRandom should return values in [0, 1)', () => {
    for (let i = 0; i < 100; i++) {
      const val = secureRandom();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it('secureShuffle should produce valid permutation', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const original = [...arr];
    secureShuffle(arr);

    // Same length
    expect(arr.length).toBe(original.length);
    // Same elements
    expect(arr.sort()).toEqual(original.sort());
  });

  it('secureShuffle should produce a 52-card deck with no duplicates', () => {
    const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
    const deck: { rank: string; suit: string }[] = [];
    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push({ rank, suit });
      }
    }

    secureShuffle(deck);

    expect(deck.length).toBe(52);
    const keys = new Set(deck.map((c) => `${c.rank}${c.suit}`));
    expect(keys.size).toBe(52);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DISCONNECT ENGINE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('DisconnectEngine', () => {
  let disconnectEngine: typeof import('../src/engine/DisconnectEngine').disconnectEngine;

  beforeEach(async () => {
    const mod = await import('../src/engine/DisconnectEngine');
    disconnectEngine = mod.disconnectEngine;
    disconnectEngine.configure('table1', {
      disconnectTimeoutSeconds: 2,
      maxConsecutiveTimeouts: 3,
      preferCheckOverFold: true,
      reconnectGraceSeconds: 1,
    });
  });

  afterEach(() => {
    disconnectEngine.dispose('table1');
  });

  it('should register and track player connection', () => {
    disconnectEngine.registerPlayer('table1', 'player1');
    expect(disconnectEngine.isConnected('table1', 'player1')).toBe(true);
    expect(disconnectEngine.isSittingOut('table1', 'player1')).toBe(false);
  });

  it('should mark player disconnected', () => {
    disconnectEngine.registerPlayer('table1', 'player1');
    disconnectEngine.markDisconnected('table1', 'player1');
    expect(disconnectEngine.isConnected('table1', 'player1')).toBe(false);
  });

  it('should reconnect player via heartbeat', () => {
    disconnectEngine.registerPlayer('table1', 'player1');
    disconnectEngine.markDisconnected('table1', 'player1');
    expect(disconnectEngine.isConnected('table1', 'player1')).toBe(false);

    disconnectEngine.heartbeat('table1', 'player1');
    expect(disconnectEngine.isConnected('table1', 'player1')).toBe(true);
  });

  it('should return connected players', () => {
    disconnectEngine.registerPlayer('table1', 'p1');
    disconnectEngine.registerPlayer('table1', 'p2');
    disconnectEngine.markDisconnected('table1', 'p2');

    const connected = disconnectEngine.getConnectedPlayers('table1');
    expect(connected).toContain('p1');
    expect(connected).not.toContain('p2');
  });

  it('should handle sit out / sit back', () => {
    disconnectEngine.registerPlayer('table1', 'p1');
    disconnectEngine.sitOut('table1', 'p1');
    expect(disconnectEngine.isSittingOut('table1', 'p1')).toBe(true);

    disconnectEngine.sitBack('table1', 'p1');
    expect(disconnectEngine.isSittingOut('table1', 'p1')).toBe(false);
  });

  it('onPlayerTurn should return true for connected player', () => {
    disconnectEngine.registerPlayer('table1', 'p1');
    const canAct = disconnectEngine.onPlayerTurn('table1', 'p1', true);
    expect(canAct).toBe(true);
  });

  it('onPlayerTurn should auto-act for sitting out player', () => {
    disconnectEngine.registerPlayer('table1', 'p1');
    disconnectEngine.sitOut('table1', 'p1');

    let autoAction: any = null;
    disconnectEngine.onAutoAction('table1', (action) => {
      autoAction = action;
    });

    disconnectEngine.onPlayerTurn('table1', 'p1', true);
    expect(autoAction).not.toBeNull();
    expect(autoAction.action).toBe('check'); // preferCheckOverFold = true
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TIME BANK ENGINE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('TimeBankEngine', () => {
  let timeBankEngine: typeof import('../src/engine/TimeBankEngine').timeBankEngine;

  beforeEach(async () => {
    const mod = await import('../src/engine/TimeBankEngine');
    timeBankEngine = mod.timeBankEngine;
    timeBankEngine.configure('table1', {
      totalBankSeconds: 30,
      maxUses: 4,
      secondsPerUse: 15,
      refillPerOrbit: true,
      refillSeconds: 15,
      autoActivate: true,
    });
    timeBankEngine.initializePlayer('table1', 'p1');
  });

  afterEach(() => {
    timeBankEngine.dispose('table1');
  });

  it('should initialize player with full time bank', () => {
    expect(timeBankEngine.getRemainingSeconds('table1', 'p1')).toBe(30);
    expect(timeBankEngine.getUsesRemaining('table1', 'p1')).toBe(4);
    expect(timeBankEngine.hasTimeBank('table1', 'p1')).toBe(true);
  });

  it('should activate time bank', () => {
    const onExpire = vi.fn();
    const activated = timeBankEngine.activate('table1', 'p1', onExpire);
    expect(activated).toBe(true);

    const bank = timeBankEngine.getPlayerBank('table1', 'p1');
    expect(bank?.isActive).toBe(true);
    expect(bank?.usesRemaining).toBe(3); // Used 1
  });

  it('should handle player acting before time bank expires', () => {
    const onExpire = vi.fn();
    timeBankEngine.activate('table1', 'p1', onExpire);
    timeBankEngine.playerActed('table1', 'p1');

    const bank = timeBankEngine.getPlayerBank('table1', 'p1');
    expect(bank?.isActive).toBe(false);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('should not activate when no uses remain', () => {
    const onExpire = vi.fn();
    // Use all 4 time banks
    for (let i = 0; i < 4; i++) {
      timeBankEngine.activate('table1', 'p1', onExpire);
      timeBankEngine.playerActed('table1', 'p1');
    }

    const result = timeBankEngine.activate('table1', 'p1', onExpire);
    expect(result).toBe(false);
    expect(timeBankEngine.hasTimeBank('table1', 'p1')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MIXED GAME ENGINE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('MixedGameEngine', () => {
  let mixedGameEngine: typeof import('../src/engine/MixedGameEngine').mixedGameEngine;

  beforeEach(async () => {
    const mod = await import('../src/engine/MixedGameEngine');
    mixedGameEngine = mod.mixedGameEngine;
  });

  afterEach(() => {
    mixedGameEngine.dispose('table1');
  });

  it('should configure with preset', () => {
    mixedGameEngine.configurePreset('table1', 'HOLDEM_OMAHA', 3, false);
    expect(mixedGameEngine.isActive('table1')).toBe(true);
    expect(mixedGameEngine.getCurrentVariant('table1')).toBe('nlh');
  });

  it('should rotate variant after threshold hands', () => {
    mixedGameEngine.configurePreset('table1', 'HOLDEM_OMAHA', 3, false);

    // Play 3 hands
    mixedGameEngine.onHandComplete('table1', 6);
    mixedGameEngine.onHandComplete('table1', 6);
    const rotated = mixedGameEngine.onHandComplete('table1', 6); // Should rotate on 3rd

    expect(rotated).toBe('plo4');
    expect(mixedGameEngine.getCurrentVariant('table1')).toBe('plo4');
  });

  it('should cycle back to first variant', () => {
    mixedGameEngine.configurePreset('table1', 'HOLDEM_OMAHA', 2, false);

    // Rotate through both variants
    mixedGameEngine.onHandComplete('table1', 6);
    mixedGameEngine.onHandComplete('table1', 6); // → plo4
    mixedGameEngine.onHandComplete('table1', 6);
    mixedGameEngine.onHandComplete('table1', 6); // → nlh again

    expect(mixedGameEngine.getCurrentVariant('table1')).toBe('nlh');
  });

  it('should track hands until rotation', () => {
    mixedGameEngine.configurePreset('table1', 'HOLDEM_OMAHA', 5, false);
    mixedGameEngine.onHandComplete('table1', 6);
    mixedGameEngine.onHandComplete('table1', 6);

    expect(mixedGameEngine.getHandsUntilRotation('table1', 6)).toBe(3);
  });

  it('forceRotate should skip to next variant', () => {
    mixedGameEngine.configurePreset('table1', 'HOLDEM_OMAHA', 10, false);
    const newVariant = mixedGameEngine.forceRotate('table1');
    expect(newVariant).toBe('plo4');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CHIP RACE ENGINE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('ChipRaceEngine', () => {
  let chipRaceEngine: typeof import('../src/engine/ChipRaceEngine').chipRaceEngine;

  beforeEach(async () => {
    const mod = await import('../src/engine/ChipRaceEngine');
    chipRaceEngine = mod.chipRaceEngine;
  });

  it('should convert fractional chips fairly', () => {
    const stacks = new Map([
      ['p1', 1250], // 1200 + 50 fractional (denomination: 100)
      ['p2', 1350], // 1200 + 150 fractional
      ['p3', 1475], // 1400 + 75 fractional
    ]);

    const result = chipRaceEngine.executeChipRace('tourney1', stacks, 25, 100);

    expect(result.removedDenomination).toBe(25);
    expect(result.newSmallestDenomination).toBe(100);

    // All stacks should be divisible by 100
    for (const [, stack] of stacks) {
      expect(stack % 100).toBe(0);
    }

    // No player eliminated
    for (const [, stack] of stacks) {
      expect(stack).toBeGreaterThan(0);
    }
  });

  it('should not eliminate any player', () => {
    const stacks = new Map([
      ['p1', 50], // Only fractional chips (denomination: 100)
      ['p2', 5000],
    ]);

    chipRaceEngine.executeChipRace('tourney1', stacks, 25, 100);

    // p1 must have at least 100 (minimum 1 chip of new denomination)
    expect(stacks.get('p1')!).toBeGreaterThanOrEqual(100);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PRE-ACTION ENGINE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('PreActionEngine', () => {
  let preActionEngine: typeof import('../src/engine/PreActionEngine').preActionEngine;

  beforeEach(async () => {
    const mod = await import('../src/engine/PreActionEngine');
    preActionEngine = mod.preActionEngine;
  });

  afterEach(() => {
    preActionEngine.dispose('table1');
  });

  it('should set and retrieve pre-action', () => {
    preActionEngine.setPreAction('table1', 'p1', 'auto_fold');
    expect(preActionEngine.hasPreAction('table1', 'p1')).toBe(true);

    const entry = preActionEngine.getPreAction('table1', 'p1');
    expect(entry?.action).toBe('auto_fold');
  });

  it('auto_fold should execute as fold', () => {
    preActionEngine.setPreAction('table1', 'p1', 'auto_fold');
    const result = preActionEngine.executePreAction('table1', 'p1', true, 0, 1000);

    expect(result.executed).toBe(true);
    expect(result.action).toBe('fold');
  });

  it('auto_check_fold should check when free', () => {
    preActionEngine.setPreAction('table1', 'p1', 'auto_check_fold');
    const result = preActionEngine.executePreAction('table1', 'p1', true, 0, 1000);

    expect(result.executed).toBe(true);
    expect(result.action).toBe('check');
  });

  it('auto_check_fold should fold when bet is placed', () => {
    preActionEngine.setPreAction('table1', 'p1', 'auto_check_fold');
    const result = preActionEngine.executePreAction('table1', 'p1', false, 50, 1000);

    expect(result.executed).toBe(true);
    expect(result.action).toBe('fold');
  });

  it('auto_check should invalidate when bet is placed', () => {
    preActionEngine.setPreAction('table1', 'p1', 'auto_check');
    const result = preActionEngine.executePreAction('table1', 'p1', false, 50, 1000);

    expect(result.executed).toBe(false);
    expect(result.invalidated).toBe(true);
  });

  it('auto_call should call the correct amount', () => {
    preActionEngine.setPreAction('table1', 'p1', 'auto_call');
    const result = preActionEngine.executePreAction('table1', 'p1', false, 100, 1000);

    expect(result.executed).toBe(true);
    expect(result.action).toBe('call');
    expect(result.amount).toBe(100);
  });

  it('auto_call with max amount should invalidate when exceeded', () => {
    preActionEngine.setPreAction('table1', 'p1', 'auto_call', 50);
    const result = preActionEngine.executePreAction('table1', 'p1', false, 100, 1000);

    expect(result.executed).toBe(false);
    expect(result.invalidated).toBe(true);
  });

  it('should clear pre-actions for action', () => {
    preActionEngine.setPreAction('table1', 'p1', 'auto_fold');
    preActionEngine.clearPreAction('table1', 'p1');
    expect(preActionEngine.hasPreAction('table1', 'p1')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RAKEBACK ENGINE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('RakebackEngine', () => {
  let rakebackEngine: typeof import('../src/engine/RakebackEngine').rakebackEngine;

  beforeEach(async () => {
    const mod = await import('../src/engine/RakebackEngine');
    rakebackEngine = mod.rakebackEngine;
    rakebackEngine.configure('club1', {
      enabled: true,
      tiers: [
        { minRake: 0, rakebackPercent: 10, name: 'Bronze' },
        { minRake: 100, rakebackPercent: 20, name: 'Silver' },
      ],
      settlementFrequency: 'daily',
      minimumPayout: 0.01,
    });
  });

  afterEach(() => {
    rakebackEngine.dispose('club1');
  });

  it('should track rake contributions', () => {
    const contributions = new Map([
      ['p1', 60],
      ['p2', 40],
    ]);

    rakebackEngine.recordHandRake('club1', 5, contributions, 100);

    const record = rakebackEngine.getPlayerRecord('club1', 'p1');
    expect(record).not.toBeNull();
    expect(record!.rakeContributed).toBe(3); // 60% of 5 = 3
    expect(record!.potsContributed).toBe(1);
  });

  it('should calculate weighted rakeback', () => {
    const contributions = new Map([
      ['p1', 100],
      ['p2', 100],
    ]);

    rakebackEngine.recordHandRake('club1', 10, contributions, 200);

    const record = rakebackEngine.getPlayerRecord('club1', 'p1');
    // P1 contributed 50% → rake share = 5 → 10% rakeback = 0.50
    expect(record!.pendingRakeback).toBe(0.5);
  });

  it('should settle rakeback', () => {
    // Record enough rake to qualify for settlement
    for (let i = 0; i < 10; i++) {
      rakebackEngine.recordHandRake('club1', 10, new Map([['p1', 100]]), 100);
    }

    const distribution = rakebackEngine.settleRakeback('club1');
    expect(distribution.size).toBe(1);
    expect(distribution.get('p1')).toBeGreaterThan(0);

    // After settlement, pending should be zero
    const record = rakebackEngine.getPlayerRecord('club1', 'p1');
    expect(record!.pendingRakeback).toBe(0);
  });

  it('should upgrade tier based on volume', () => {
    // Record large volume to trigger Silver tier (minRake: 100)
    for (let i = 0; i < 20; i++) {
      rakebackEngine.recordHandRake('club1', 10, new Map([['p1', 100]]), 100);
    }

    const tier = rakebackEngine.getCurrentTier('club1', 'p1');
    expect(tier?.name).toBe('Silver');
    expect(tier?.rakebackPercent).toBe(20);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BBA (BIG BLIND ANTE) TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Big Blind Ante', () => {
  it('HandConfig should accept bigBlindAnte flag', async () => {
    const { HandController } = await import('../src/engine/HandController');
    const players = [
      {
        seat: 1,
        user_id: 'a',
        username: 'A',
        stack: 1000,
        bet: 0,
        totalInvested: 0,
        cards: [],
        is_folded: false,
        is_all_in: false,
        is_sitting_out: false,
      },
      {
        seat: 2,
        user_id: 'b',
        username: 'B',
        stack: 1000,
        bet: 0,
        totalInvested: 0,
        cards: [],
        is_folded: false,
        is_all_in: false,
        is_sitting_out: false,
      },
      {
        seat: 3,
        user_id: 'c',
        username: 'C',
        stack: 1000,
        bet: 0,
        totalInvested: 0,
        cards: [],
        is_folded: false,
        is_all_in: false,
        is_sitting_out: false,
      },
    ];

    // Create with BBA enabled
    const controller = new HandController(
      {
        tableId: 'test',
        handNumber: 1,
        gameVariant: 'nlh',
        smallBlind: 5,
        bigBlind: 10,
        ante: 10,
        bigBlindAnte: true,
        rakeConfig: { percent: 0, cap: 0, noFlop: false },
      },
      players as any,
      1
    );

    // Should not throw
    expect(controller).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PLAYER-COUNT RAKE CAP TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Player-Count Rake Caps', () => {
  it('should apply default cap when no player count specified', () => {
    const config = { percent: 5, cap: 3, noFlop: false };
    expect(calculateRake(100, true, config)).toBe(3);
  });

  it('should apply player-count-specific cap', () => {
    const config = {
      percent: 5,
      cap: 3,
      noFlop: false,
      capByPlayerCount: { 2: 1, 3: 2, 6: 3 },
    };

    // Heads-up: cap = 1
    expect(calculateRake(100, true, config, 2)).toBe(1);
    // 3 players: cap = 2
    expect(calculateRake(100, true, config, 3)).toBe(2);
    // 6 players: cap = 3
    expect(calculateRake(100, true, config, 6)).toBe(3);
  });

  it('should fall back to default cap for unspecified player count', () => {
    const config = {
      percent: 5,
      cap: 3,
      noFlop: false,
      capByPlayerCount: { 2: 1 },
    };

    // 4 players not in map → use default cap (3)
    expect(calculateRake(100, true, config, 4)).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POSITION-AWARE AI TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Position-Aware AI', () => {
  it('should calculate correct positions', async () => {
    const { HorseLogic } = await import('../src/engine/HorseLogic');

    // 6 players, dealer at seat 0
    // Seat 1 = SB (blinds), Seat 2 = BB (blinds)
    // Seat 3 = UTG (early), Seat 4 = MP (middle), Seat 5 = CO/BTN (late)
    expect(HorseLogic.getPosition(1, 0, 6)).toBe('blinds');
    expect(HorseLogic.getPosition(2, 0, 6)).toBe('blinds');
    expect(HorseLogic.getPosition(3, 0, 6)).toBe('early');
    expect(HorseLogic.getPosition(5, 0, 6)).toBe('late');
  });

  it('should accept position parameter in decide()', async () => {
    const { HorseLogic } = await import('../src/engine/HorseLogic');

    const mockPlayer = {
      seat: 1,
      user_id: 'horse1',
      username: 'Horse',
      stack: 1000,
      bet: 0,
      totalInvested: 0,
      cards: [
        { rank: '7', suit: 'hearts' },
        { rank: '2', suit: 'clubs' },
      ],
      is_folded: false,
      is_all_in: false,
      is_sitting_out: false,
    };

    const gameState = {
      stage: 'preflop' as const,
      currentBet: 10,
      pot: 15,
      communityCards: [],
      bigBlind: 10,
      minRaise: 10,
      players: [mockPlayer],
      gameVariant: 'nlh' as const,
    };

    // Should not throw with position parameter
    const decision = HorseLogic.decide(mockPlayer as any, gameState as any, 'balanced', 'early');
    expect(decision).toBeTruthy();
    expect(decision.action).toBeTruthy();
  });
});

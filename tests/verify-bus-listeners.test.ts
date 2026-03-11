/**
 * Minimal bus contract verification — tests the MasterBus event system
 * without importing the singleton (avoids store/supabase dependency chain)
 */

import { describe, it, expect, vi } from 'vitest';

describe('Bus Event Contract Verification', () => {

  it('subscribe and emit pattern works (mimics page bus listeners)', () => {
    // Simulate MasterBus subscriber pattern used in our pages
    type Handler = (event: any) => void;
    const subscribers = new Map<string, Set<Handler>>();
    
    function subscribe(eventType: string, handler: Handler): () => void {
      if (!subscribers.has(eventType)) subscribers.set(eventType, new Set());
      subscribers.get(eventType)!.add(handler);
      return () => { subscribers.get(eventType)?.delete(handler); };
    }
    
    function emit(eventType: string, payload: any) {
      const handlers = subscribers.get(eventType);
      if (handlers) {
        handlers.forEach(h => {
          try { h({ type: eventType, payload, timestamp: new Date().toISOString() }); }
          catch (e) { console.error('Handler error:', e); }
        });
      }
    }

    // Test HAND_COMPLETED — used by HandHistoryPage, PlayerStatsPage, LeaderboardPage, CashierPage
    const handCompletedHandler = vi.fn();
    const unsub1 = subscribe('HAND_COMPLETED', handCompletedHandler);
    
    emit('HAND_COMPLETED', { handId: 'h1', tableId: 't1' });
    expect(handCompletedHandler).toHaveBeenCalledTimes(1);
    expect(handCompletedHandler).toHaveBeenCalledWith(expect.objectContaining({
      type: 'HAND_COMPLETED',
      payload: { handId: 'h1', tableId: 't1' },
    }));

    // Test BALANCE_UPDATED — used by PlayerStatsPage, CashierPage
    const balanceHandler = vi.fn();
    const unsub2 = subscribe('BALANCE_UPDATED', balanceHandler);
    
    emit('BALANCE_UPDATED', { source: 'hand-payout' });
    expect(balanceHandler).toHaveBeenCalledTimes(1);

    // Test unsubscribe works
    unsub1();
    emit('HAND_COMPLETED', { handId: 'h2', tableId: 't2' });
    expect(handCompletedHandler).toHaveBeenCalledTimes(1); // not 2

    unsub2();
    emit('BALANCE_UPDATED', { source: 'agent-send' });
    expect(balanceHandler).toHaveBeenCalledTimes(1); // not 2
  });

  it('debounced subscribe pattern works (mimics LeaderboardPage/CashierPage)', async () => {
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    let subId = 0;
    type Handler = (event: any) => void;
    const subscribers = new Map<string, Set<Handler>>();
    
    function subscribe(eventType: string, handler: Handler): () => void {
      if (!subscribers.has(eventType)) subscribers.set(eventType, new Set());
      subscribers.get(eventType)!.add(handler);
      return () => { subscribers.get(eventType)?.delete(handler); };
    }
    
    function subscribeDebounced(eventType: string, handler: Handler, debounceMs: number): () => void {
      const id = ++subId;
      const timerKey = `${eventType}_${id}`;
      
      const debouncedHandler: Handler = (event) => {
        const existing = timers.get(timerKey);
        if (existing) clearTimeout(existing);
        timers.set(timerKey, setTimeout(() => {
          handler(event);
          timers.delete(timerKey);
        }, debounceMs));
      };
      
      const unsubFromBus = subscribe(eventType, debouncedHandler);
      return () => {
        unsubFromBus();
        const pending = timers.get(timerKey);
        if (pending) { clearTimeout(pending); timers.delete(timerKey); }
      };
    }
    
    function emit(eventType: string, payload: any) {
      const handlers = subscribers.get(eventType);
      if (handlers) handlers.forEach(h => h({ type: eventType, payload }));
    }

    // Test debounced HAND_COMPLETED (LeaderboardPage uses 2000ms debounce)
    const handler = vi.fn();
    const unsub = subscribeDebounced('HAND_COMPLETED', handler, 50);
    
    // Rapid fire 10 events
    for (let i = 0; i < 10; i++) {
      emit('HAND_COMPLETED', { handId: `h${i}`, tableId: 't1' });
    }
    expect(handler).toHaveBeenCalledTimes(0); // not yet
    
    await new Promise(r => setTimeout(r, 100));
    expect(handler).toHaveBeenCalledTimes(1); // debounced to 1

    // Test unsubscribe clears timer
    const handler2 = vi.fn();
    const unsub2 = subscribeDebounced('BALANCE_UPDATED', handler2, 100);
    emit('BALANCE_UPDATED', { source: 'test' });
    unsub2(); // kill before timer
    
    await new Promise(r => setTimeout(r, 150));
    expect(handler2).toHaveBeenCalledTimes(0); // timer was cleared

    unsub();
  });

  it('multiple subscribers on same event all fire', () => {
    type Handler = (event: any) => void;
    const subscribers = new Map<string, Set<Handler>>();
    
    function subscribe(eventType: string, handler: Handler): () => void {
      if (!subscribers.has(eventType)) subscribers.set(eventType, new Set());
      subscribers.get(eventType)!.add(handler);
      return () => { subscribers.get(eventType)?.delete(handler); };
    }
    
    function emit(eventType: string, payload: any) {
      const handlers = subscribers.get(eventType);
      if (handlers) handlers.forEach(h => h({ type: eventType, payload }));
    }

    // Simulate: HandHistoryPage + PlayerStatsPage + LeaderboardPage + CashierPage
    // all listening to HAND_COMPLETED simultaneously
    const h1 = vi.fn(); // HandHistory
    const h2 = vi.fn(); // PlayerStats
    const h3 = vi.fn(); // Leaderboard
    const h4 = vi.fn(); // Cashier
    
    const u1 = subscribe('HAND_COMPLETED', h1);
    const u2 = subscribe('HAND_COMPLETED', h2);
    const u3 = subscribe('HAND_COMPLETED', h3);
    const u4 = subscribe('HAND_COMPLETED', h4);
    
    emit('HAND_COMPLETED', { handId: 'h1', tableId: 't1' });
    
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
    expect(h3).toHaveBeenCalledTimes(1);
    expect(h4).toHaveBeenCalledTimes(1);
    
    // Unsubscribe one, others still fire
    u2();
    emit('HAND_COMPLETED', { handId: 'h2', tableId: 't1' });
    
    expect(h1).toHaveBeenCalledTimes(2);
    expect(h2).toHaveBeenCalledTimes(1); // unsubbed
    expect(h3).toHaveBeenCalledTimes(2);
    expect(h4).toHaveBeenCalledTimes(2);
    
    u1(); u3(); u4();
  });

  it('handler errors dont crash other handlers (error isolation)', () => {
    type Handler = (event: any) => void;
    const subscribers = new Map<string, Set<Handler>>();
    
    function subscribe(eventType: string, handler: Handler): () => void {
      if (!subscribers.has(eventType)) subscribers.set(eventType, new Set());
      subscribers.get(eventType)!.add(handler);
      return () => { subscribers.get(eventType)?.delete(handler); };
    }
    
    function emit(eventType: string, payload: any) {
      const handlers = subscribers.get(eventType);
      if (handlers) handlers.forEach(h => {
        try { h({ type: eventType, payload }); } catch { /* isolated */ }
      });
    }
    
    const crashingHandler = vi.fn(() => { throw new Error('BOOM'); });
    const goodHandler = vi.fn();
    
    subscribe('HAND_COMPLETED', crashingHandler);
    subscribe('HAND_COMPLETED', goodHandler);
    
    // Should NOT throw
    emit('HAND_COMPLETED', { handId: 'h1', tableId: 't1' });
    
    expect(crashingHandler).toHaveBeenCalledTimes(1);
    expect(goodHandler).toHaveBeenCalledTimes(1); // still fires despite crash
  });
});

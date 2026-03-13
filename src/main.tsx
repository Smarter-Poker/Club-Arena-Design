/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CLUB ENGINE — Main Entry Point (ANTI-GRAVITY PROTECTED)
 * ═══════════════════════════════════════════════════════════════════════════════
 * PokerBros Clone — Better
 *
 *  ANTI-GRAVITY FAIL-CLOSED:
 * This entry point AWAITS boot completion before ANY rendering.
 * If boot fails, ONLY the SystemOffline screen renders.
 *
 * BOOT SEQUENCE:
 * 1. Anti-Gravity Core (Env + Supabase)
 * 2. Master Bus (State Management)
 * 3. Identity DNA (Auth/User Profile)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/club-engine.css';
import './styles/animations.css';
import { initAntiGravity, isSystemOnline, getBootStatus } from './core/AntiGravityBoot';
import { initMasterBus, isMasterBusOnline } from './core/MasterBus';
import { initIdentityDNA, isIdentityDNALoaded } from './core/IdentityDNA';
import { initSentry } from './core/SentryInit';
import SystemOffline from './core/SystemOffline';
import { ErrorBoundary } from './components/common';

// ═══════════════════════════════════════════════════════════════════════════════
//  ANTI-GRAVITY BOOT SEQUENCE — MUST COMPLETE BEFORE RENDER
// ═══════════════════════════════════════════════════════════════════════════════
async function boot() {
  // PHASE 0: Initialize Sentry (FIRST - before any errors can occur)
  initSentry();

  console.log('[BOOT] Phase 1: AntiGravity...');
  // PHASE 1: Anti-Gravity Core
  const status = await initAntiGravity();
  console.log('[BOOT] Phase 1 complete:', status.antigravityOk, status.supabaseOk);

  // PHASE 2: Master Bus (State Management)
  console.log('[BOOT] Phase 2: MasterBus...');
  const busStatus = initMasterBus();
  console.log('[BOOT] Phase 2 complete:', busStatus?.online);

  // PHASE 3: Identity DNA (Auth/User Profile)
  console.log('[BOOT] Phase 3: IdentityDNA...');
  const dnaStatus = await initIdentityDNA();
  console.log('[BOOT] Phase 3 complete');

  // ═══════════════════════════════════════════════════════════════════════════
  // FINAL SYSTEM INTEGRITY CHECK
  // ═══════════════════════════════════════════════════════════════════════════

  const root = ReactDOM.createRoot(document.getElementById('root')!);

  const systemOnline = isSystemOnline();
  const busOnline = isMasterBusOnline();
  console.log('[BOOT] System online:', systemOnline, 'Bus online:', busOnline);

  // ═══════════════════════════════════════════════════════════════════════════
  // ABSOLUTE FAIL-CLOSED DECISION
  // ═══════════════════════════════════════════════════════════════════════════
  if (systemOnline && busOnline) {
    //  ALL SYSTEMS GO — Render the full app
    root.render(
      <ErrorBoundary>
        <BrowserRouter basename="/hub/club-arena">
          <App />
        </BrowserRouter>
      </ErrorBoundary>
    );
  } else {
    //  FAIL-CLOSED — Only render diagnostic screen
    console.error('[BOOT] System offline — rendering diagnostic screen');
    root.render(<SystemOffline status={status} />);
  }
}

// Execute the boot sequence with top-level error catch
boot().catch((err) => {
  console.error('[BOOT] FATAL: boot() threw an unhandled error:', err);
  // Render a minimal error page so the user sees SOMETHING
  try {
    const root = ReactDOM.createRoot(document.getElementById('root')!);
    root.render(
      <div style={{ color: '#fff', padding: '2rem', fontFamily: 'monospace' }}>
        <h1>Boot Failed</h1>
        <p>{String(err?.message || err)}</p>
        <button
          onClick={() => window.location.reload()}
          style={{ padding: '0.5rem 1rem', marginTop: '1rem' }}
        >
          Retry
        </button>
      </div>
    );
  } catch {
    document.body.innerHTML = `<div style="color:#fff;padding:2rem">Boot failed: ${String(err)}</div>`;
  }
});

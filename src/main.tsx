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

    // PHASE 1: Anti-Gravity Core
    const status = await initAntiGravity();

    // PHASE 2: Master Bus (State Management)
    const busStatus = initMasterBus();

    // PHASE 3: Identity DNA (Auth/User Profile)
    const dnaStatus = await initIdentityDNA();

    // ═══════════════════════════════════════════════════════════════════════════
    // FINAL SYSTEM INTEGRITY CHECK
    // ═══════════════════════════════════════════════════════════════════════════

    const root = ReactDOM.createRoot(document.getElementById('root')!);

    // ═══════════════════════════════════════════════════════════════════════════
    // ABSOLUTE FAIL-CLOSED DECISION
    // ═══════════════════════════════════════════════════════════════════════════
    if (isSystemOnline() && isMasterBusOnline()) {
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
        root.render(
            <SystemOffline status={status} />
        );
    }
}

// Execute the boot sequence
boot();

// Force rebuild Fri Jan 30 04:02:40 CST 2026

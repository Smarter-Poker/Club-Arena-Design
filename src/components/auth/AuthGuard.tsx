/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CLUB ARENA — Auth Guard Component
 * ═══════════════════════════════════════════════════════════════════════════════
 * Protects routes that require authentication.
 * Redirects to /auth if not authenticated.
 *
 * RESILIENT to navigator.locks deadlock — falls back to localStorage check
 * if getSession() times out or is aborted.
 */

import { ReactNode, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { pushNotificationService } from '../../services/PushNotificationService';

const AUTH_STORAGE_KEY = 'smarter-poker-auth';
const SESSION_CHECK_TIMEOUT = 3000; // 3s max wait for getSession

interface AuthGuardProps {
    children: ReactNode;
}

/**
 * Fast session check from localStorage (bypasses navigator.locks)
 */
function hasLocalSession(): boolean {
    try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        const token = data?.access_token;
        if (!token) return false;
        // Check expiry from JWT payload
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.exp * 1000 > Date.now();
    } catch {
        return false;
    }
}

export function AuthGuard({ children }: AuthGuardProps) {
    const [isLoading, setIsLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const location = useLocation();

    useEffect(() => {
        let cancelled = false;

        async function checkAuth() {
            // FAST PATH: Check localStorage directly (no navigator.locks)
            if (hasLocalSession()) {
                // We know there's a session token — try getSession with timeout
                try {
                    const sessionPromise = supabase.auth.getSession();
                    const timeoutPromise = new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error('getSession timeout')), SESSION_CHECK_TIMEOUT)
                    );
                    const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]);
                    if (!cancelled) {
                        setIsAuthenticated(!!session);
                        setIsLoading(false);
                    }
                    return;
                } catch {
                    // getSession hung or timed out — trust localStorage
                    if (!cancelled) {
                        console.warn('[AUTH GUARD] getSession timed out — using localStorage session');
                        setIsAuthenticated(true);
                        setIsLoading(false);
                    }
                    return;
                }
            }

            // NO localStorage session — try getSession with timeout for OAuth callbacks etc.
            try {
                const sessionPromise = supabase.auth.getSession();
                const timeoutPromise = new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('getSession timeout')), SESSION_CHECK_TIMEOUT)
                );
                const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]);
                if (!cancelled) {
                    setIsAuthenticated(!!session);
                    setIsLoading(false);
                }
            } catch {
                // No session in localStorage AND getSession failed — not authenticated
                if (!cancelled) {
                    setIsAuthenticated(false);
                    setIsLoading(false);
                }
            }
        }

        checkAuth();

        // Listen for auth changes — this is the reliable source of truth
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event, session) => {
                if (!cancelled) {
                    setIsAuthenticated(!!session);
                    setIsLoading(false);

                    // Register with push notifications on login
                    if (session?.user?.id && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
                        pushNotificationService.init().then(() => {
                            pushNotificationService.setExternalUserId(session.user.id);
                        }).catch(() => { /* OneSignal not configured */ });
                    }
                }
            }
        );

        return () => {
            cancelled = true;
            subscription.unsubscribe();
        };
    }, []);

    // Show loading state
    if (isLoading) {
        return (
            <div style={{
                position: 'fixed',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #0A0A0F 0%, #12121A 100%)',
                color: '#FFFFFF',
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>♠</div>
                    <div style={{ color: '#A0A0B8' }}>Loading...</div>
                </div>
            </div>
        );
    }

    // Redirect to auth if not authenticated
    if (!isAuthenticated) {
        return <Navigate to="/auth" state={{ from: location }} replace />;
    }

    // Render protected content
    return <>{children}</>;
}

/**
 * Inverse guard - redirects authenticated users away from auth page
 */
export function GuestGuard({ children }: AuthGuardProps) {
    const [isLoading, setIsLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    useEffect(() => {
        let cancelled = false;

        async function checkAuth() {
            // Fast path from localStorage
            if (hasLocalSession()) {
                if (!cancelled) {
                    setIsAuthenticated(true);
                    setIsLoading(false);
                }
                return;
            }

            try {
                const sessionPromise = supabase.auth.getSession();
                const timeoutPromise = new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('getSession timeout')), SESSION_CHECK_TIMEOUT)
                );
                const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]);
                if (!cancelled) {
                    setIsAuthenticated(!!session);
                    setIsLoading(false);
                }
            } catch {
                if (!cancelled) {
                    setIsAuthenticated(false);
                    setIsLoading(false);
                }
            }
        }

        checkAuth();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, session) => {
                if (!cancelled) {
                    setIsAuthenticated(!!session);
                    setIsLoading(false);
                }
            }
        );

        return () => {
            cancelled = true;
            subscription.unsubscribe();
        };
    }, []);

    if (isLoading) {
        return null;
    }

    if (isAuthenticated) {
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
}

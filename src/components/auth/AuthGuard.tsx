/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CLUB ARENA — Auth Guard Component
 * ═══════════════════════════════════════════════════════════════════════════════
 * Protects routes that require authentication.
 * Redirects to /auth if not authenticated.
 *
 * CRITICAL: Ensures useUserStore is hydrated with session user data BEFORE
 * rendering children. This eliminates the race condition where pages render
 * with a null user despite the user being authenticated.
 *
 * Auth state listener is owned by IdentityDNA — AuthGuard does NOT create
 * its own onAuthStateChange listener to avoid duplicate event handling.
 *
 * RESILIENT to navigator.locks deadlock — falls back to localStorage check
 * if getSession() times out or is aborted.
 */

import { ReactNode, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../stores/useUserStore';

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

/**
 * Hydrate the Zustand user store from a Supabase session if it's empty.
 * This MUST be called before AuthGuard renders children to prevent
 * the race condition where pages see user === null.
 */
function hydrateStoreFromSession(session: {
  user: { id: string; email?: string; user_metadata?: Record<string, any> };
}): void {
  const storeUser = useUserStore.getState().user;
  if (storeUser) return; // Already hydrated — skip

  const { id, email, user_metadata } = session.user;
  useUserStore.getState().setUser({
    id,
    username: email?.split('@')[0] || 'Player',
    display_name: user_metadata?.display_name || user_metadata?.full_name || null,
    avatar_url: user_metadata?.avatar_url || null,
  });
}

/**
 * Hydrate the Zustand user store from localStorage session data.
 * Used when getSession() times out but we know a valid JWT exists.
 */
function hydrateStoreFromLocalStorage(): void {
  const storeUser = useUserStore.getState().user;
  if (storeUser) return; // Already hydrated

  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    const token = data?.access_token;
    if (!token) return;
    // Decode JWT payload to get user ID and email
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.sub) {
      useUserStore.getState().setUser({
        id: payload.sub,
        username: payload.email?.split('@')[0] || 'Player',
        display_name: null,
        avatar_url: null,
      });
    }
  } catch {
    // Silent — best effort
  }
}

export function AuthGuard({ children }: AuthGuardProps) {
  // If IdentityDNA already proved we are authenticated globally, skip the loading flash entirely
  const dncStatus = useUserStore.getState().isAuthenticated;

  const [isLoading, setIsLoading] = useState(!dncStatus);
  const [isAuthenticated, setIsAuthenticated] = useState(dncStatus);

  const location = useLocation();
  const storeUser = useUserStore((s) => s.user);

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      // If we already know we're authenticated from a previous route, do nothing.
      if (useUserStore.getState().isAuthenticated) {
        if (!cancelled) {
          setIsAuthenticated(true);
          setIsLoading(false);
        }
        return;
      }

      // FAST PATH: Check localStorage directly (no navigator.locks)
      if (hasLocalSession()) {
        if (!cancelled) {
          console.warn('[AUTH GUARD] Trusting localStorage session for initial paint');
          hydrateStoreFromLocalStorage();
          setIsAuthenticated(true);
          setIsLoading(false);
        }
        return;
      }

      // NO localStorage session — try getSession with timeout for OAuth callbacks etc.
      try {
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('getSession timeout')), SESSION_CHECK_TIMEOUT)
        );
        const {
          data: { session },
        } = await Promise.race([sessionPromise, timeoutPromise]);
        if (!cancelled) {
          if (session) {
            hydrateStoreFromSession(session);
          }
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

    // NOTE: We do NOT register an onAuthStateChange listener here.
    // IdentityDNA owns the global auth state listener and hydrates useUserStore.
    // Adding a listener here would create duplicate event processing.
    // Instead, we subscribe to useUserStore.user above to react to IdentityDNA updates.

    return () => {
      cancelled = true;
    };
  }, []);

  // If IdentityDNA fires SIGNED_OUT after initial check, react to store change
  const storeAuthenticated = useUserStore((s) => s.isAuthenticated);
  useEffect(() => {
    // Only react to sign-out events AFTER initial loading is complete
    if (!isLoading && isAuthenticated && !storeAuthenticated && !storeUser) {
      setIsAuthenticated(false);
    }
  }, [storeAuthenticated, storeUser, isLoading, isAuthenticated]);

  // Show loading state
  if (isLoading) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0A0A0F 0%, #12121A 100%)',
          color: '#FFFFFF',
        }}
      >
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

export function GuestGuard({ children }: AuthGuardProps) {
  const dncStatus = useUserStore.getState().isAuthenticated;

  const [isLoading, setIsLoading] = useState(!dncStatus);
  const [isAuthenticated, setIsAuthenticated] = useState(dncStatus);

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      if (useUserStore.getState().isAuthenticated) {
        if (!cancelled) {
          setIsAuthenticated(true);
          setIsLoading(false);
        }
        return;
      }

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
        const {
          data: { session },
        } = await Promise.race([sessionPromise, timeoutPromise]);
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

    // GuestGuard keeps a lightweight listener since IdentityDNA
    // might fire SIGNED_IN after the initial check (e.g. OAuth callback)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) {
        setIsAuthenticated(!!session);
        setIsLoading(false);
      }
    });

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

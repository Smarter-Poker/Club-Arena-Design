/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  SENTRY INITIALIZATION — Error Tracking & Performance Monitoring
 * ═══════════════════════════════════════════════════════════════════════════════
 * Initializes Sentry.io for comprehensive error tracking, performance monitoring,
 * and session replay across the Club Arena application.
 *
 * Features:
 * - Automatic error capture with stack traces
 * - Performance monitoring with distributed tracing
 * - Session replay for debugging user issues
 * - User identification and context
 * - Supabase integration for database monitoring
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import * as Sentry from '@sentry/react';
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';
import React from 'react';

/**
 * Initialize Sentry error tracking and performance monitoring
 * Should be called as early as possible in the application lifecycle
 */
export function initSentry() {
  // Only initialize in production or staging environments
  const environment = import.meta.env.VITE_APP_ENV || 'production';

  if (environment === 'development') {
    return;
  }

  // Ensure DSN is configured
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) {
    console.warn('⚠️ [Sentry] DSN not configured, skipping initialization');
    return;
  }

  try {
    Sentry.init({
      dsn,

      // Environment configuration
      environment,

      // Release tracking (will be set by build process)
      release: `club-arena@${import.meta.env.VITE_APP_VERSION || '1.0.0'}`,

      // Integrations
      integrations: [
        // React Router integration for automatic route tracking
        Sentry.reactRouterV6BrowserTracingIntegration({
          useEffect: React.useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
        }),

        // Session Replay for visual debugging
        Sentry.replayIntegration({
          // Privacy controls
          maskAllText: true, // Mask all text content
          blockAllMedia: true, // Block images and videos
          maskAllInputs: true, // Mask form inputs

          // Network recording
          networkDetailAllowUrls: [
            'https://kuklfnapbkmacvwxktbh.supabase.co',
            'https://smarter.poker/api',
          ],
          networkCaptureBodies: true,
          networkRequestHeaders: ['User-Agent', 'X-Request-ID'],
          networkResponseHeaders: ['X-Response-Time'],
        }),
      ],

      // Performance Monitoring
      tracesSampleRate: environment === 'production' ? 0.1 : 1.0, // 10% in prod, 100% in staging

      // Session Replay Sampling
      replaysSessionSampleRate: 0.1, // 10% of normal sessions
      replaysOnErrorSampleRate: 1.0, // 100% of error sessions

      // Error filtering - ignore known non-critical errors
      beforeSend(event, hint) {
        const error = hint.originalException as Error | undefined;

        if (error && typeof error === 'object') {
          // Filter by error name
          if ('name' in error) {
            const name = String(error.name);
            // AbortError: benign signal cancellation (fetch teardown, navigation)
            if (name === 'AbortError') return null;
          }

          // Filter by error message
          if ('message' in error) {
            const message = String(error.message);

            if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
              return null;
            }
            if (message.includes('ResizeObserver')) {
              return null;
            }
            // Suppress benign abort signals
            if (message.includes('signal is aborted') || message.includes('aborted')) {
              return null;
            }
            // Suppress opaque internal errors (e.g. browser IndexedDB / extension glitches)
            if (message.includes('Internal error')) {
              return null;
            }
            // Suppress null-access errors from third-party scripts / instrumentation
            if (message.includes('Cannot read properties of null')) {
              // Only suppress if stack is missing or from non-app code
              const stack = 'stack' in error ? String(error.stack) : '';
              const isAppCode = stack.includes('/src/');
              if (!isAppCode) return null;
            }
          }

          // Filter out errors from browser extensions
          if ('stack' in error) {
            const stack = String(error.stack);
            if (stack.includes('chrome-extension://') || stack.includes('moz-extension://')) {
              return null;
            }
          }
        }

        return event;
      },

      // Performance filtering - don't track very fast transactions
      beforeSendTransaction(event) {
        if (event.start_timestamp && event.timestamp) {
          const duration = (event.timestamp - event.start_timestamp) * 1000;

          // Ignore transactions faster than 100ms (not useful for analysis)
          if (duration < 100) {
            return null;
          }
        }

        return event;
      },

      // Ignore specific errors
      ignoreErrors: [
        // Browser extensions
        'top.GLOBALS',
        'chrome-extension',
        'moz-extension',

        // Random plugins/extensions
        "Can't find variable: ZiteReader",
        'jigsaw is not defined',
        'ComboSearch is not defined',

        // Network errors
        'NetworkError',
        'Network request failed',

        // ResizeObserver
        'ResizeObserver loop limit exceeded',
        'ResizeObserver loop completed with undelivered notifications',

        // AbortError — benign fetch/signal cancellation
        'AbortError',
        'signal is aborted without reason',
        'signal is aborted',
        'The operation was aborted',
        'The user aborted a request',

        // Opaque internal errors (browser internals / IndexedDB)
        'UnknownError: Internal error',
        'Internal error',
      ],
    });
  } catch (error) {
    console.error('❌ [Sentry] Initialization failed:', error);
  }
}

/**
 * Set user context in Sentry
 * Should be called after user authentication
 */
export function setSentryUser(user: {
  id: string;
  email?: string;
  username?: string;
  [key: string]: any;
}) {
  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: user.username,
    ip_address: '{{auto}}', // Auto-detect IP address
  });
}

/**
 * Clear user context in Sentry
 * Should be called on logout
 */
export function clearSentryUser() {
  Sentry.setUser(null);
}

/**
 * Add custom context to Sentry events
 */
export function setSentryContext(key: string, context: Record<string, any>) {
  Sentry.setContext(key, context);
}

/**
 * Add custom tags to Sentry events
 */
export function setSentryTags(tags: Record<string, string>) {
  Sentry.setTags(tags);
}

/**
 * Manually capture an exception
 */
export function captureException(error: Error, context?: Record<string, any>) {
  Sentry.captureException(error, {
    contexts: context,
  });
}

/**
 * Manually capture a message
 */
export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
  Sentry.captureMessage(message, level);
}

/**
 * Add a breadcrumb for debugging context
 */
export function addBreadcrumb(breadcrumb: {
  message: string;
  category?: string;
  level?: 'info' | 'warning' | 'error';
  data?: Record<string, any>;
}) {
  Sentry.addBreadcrumb({
    message: breadcrumb.message,
    category: breadcrumb.category || 'custom',
    level: breadcrumb.level || 'info',
    data: breadcrumb.data,
  });
}

/**
 * Start a performance span
 */
export function startTransaction(name: string, op: string = 'custom') {
  return Sentry.startSpan(
    {
      name,
      op,
    },
    (span) => span
  );
}

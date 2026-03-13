/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  ROUTE ERROR BOUNDARY — Per-Route Error Catching
 * ═══════════════════════════════════════════════════════════════════════════════
 * Lightweight error boundary for individual routes. If a page component crashes,
 * only that page shows an error — navigation stays alive so the user can go back.
 * Resets automatically when the URL changes.
 */

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class RouteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error('[RouteErrorBoundary] Caught:', error.message);

    // Auto-reload on stale chunk errors (after deploys)
    if (
      error.message?.includes('dynamically imported module') ||
      error.message?.includes('Failed to fetch') ||
      error.message?.includes('ChunkLoadError') ||
      error.name === 'ChunkLoadError'
    ) {
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
            padding: '2rem',
            textAlign: 'center',
            color: '#334155',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '.5rem' }}>
            This page ran into an issue
          </h2>
          <p style={{ color: '#64748b', marginBottom: '1.5rem', maxWidth: 400, lineHeight: 1.5 }}>
            Something unexpected happened. You can go back or try reloading this page.
          </p>
          <div style={{ display: 'flex', gap: '.75rem' }}>
            <button
              onClick={() => window.history.back()}
              style={{
                padding: '0.625rem 1.25rem',
                background: '#f1f5f9',
                color: '#334155',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                fontSize: '.875rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              ← Go Back
            </button>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              style={{
                padding: '0.625rem 1.25rem',
                background: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '.875rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

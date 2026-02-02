/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  ERROR BOUNDARY — Sentry-Enhanced Error Handling
 * ═══════════════════════════════════════════════════════════════════════════════
 * Catches React rendering errors and reports them to Sentry with full context.
 * Provides user feedback dialog for error reporting.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import * as Sentry from '@sentry/react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    eventId: string | null;
}

class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            hasError: false,
            eventId: null,
        };
    }

    static getDerivedStateFromError(_: Error): State {
        return { hasError: true, eventId: null };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);

        // Capture exception with Sentry and get event ID
        Sentry.withScope((scope) => {
            scope.setContext('react', {
                componentStack: errorInfo.componentStack,
            });

            const eventId = Sentry.captureException(error);
            this.setState({ eventId });
        });
    }

    render() {
        if (this.state.hasError) {
            // Custom fallback UI
            return (
                this.props.fallback || (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: '100vh',
                        padding: '2rem',
                        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                        color: '#fff',
                        fontFamily: 'system-ui, -apple-system, sans-serif',
                    }}>
                        <div style={{
                            maxWidth: '500px',
                            textAlign: 'center',
                            background: 'rgba(255, 255, 255, 0.05)',
                            padding: '3rem',
                            borderRadius: '16px',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                        }}>
                            <div style={{
                                fontSize: '4rem',
                                marginBottom: '1rem',
                            }}>⚠️</div>

                            <h1 style={{
                                fontSize: '1.5rem',
                                marginBottom: '1rem',
                                fontWeight: '600',
                            }}>
                                Something went wrong
                            </h1>

                            <p style={{
                                color: 'rgba(255, 255, 255, 0.7)',
                                marginBottom: '2rem',
                                lineHeight: '1.6',
                            }}>
                                We've been notified and are working on a fix.
                                You can help us by providing more details about what happened.
                            </p>

                            <div style={{
                                display: 'flex',
                                gap: '1rem',
                                justifyContent: 'center',
                                flexWrap: 'wrap',
                            }}>
                                {this.state.eventId && (
                                    <button
                                        onClick={() => {
                                            if (this.state.eventId) {
                                                Sentry.showReportDialog({
                                                    eventId: this.state.eventId,
                                                    title: 'Help us fix this issue',
                                                    subtitle: 'Tell us what happened',
                                                    subtitle2: 'Your feedback helps us improve Club Arena',
                                                });
                                            }
                                        }}
                                        style={{
                                            padding: '0.75rem 1.5rem',
                                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: '8px',
                                            fontSize: '1rem',
                                            fontWeight: '500',
                                            cursor: 'pointer',
                                            transition: 'transform 0.2s',
                                        }}
                                        onMouseOver={(e) => {
                                            e.currentTarget.style.transform = 'translateY(-2px)';
                                        }}
                                        onMouseOut={(e) => {
                                            e.currentTarget.style.transform = 'translateY(0)';
                                        }}
                                    >
                                        📝 Report Feedback
                                    </button>
                                )}

                                <button
                                    onClick={() => window.location.reload()}
                                    style={{
                                        padding: '0.75rem 1.5rem',
                                        background: 'rgba(255, 255, 255, 0.1)',
                                        color: '#fff',
                                        border: '1px solid rgba(255, 255, 255, 0.2)',
                                        borderRadius: '8px',
                                        fontSize: '1rem',
                                        fontWeight: '500',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                    }}
                                    onMouseOver={(e) => {
                                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                    }}
                                    onMouseOut={(e) => {
                                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                                        e.currentTarget.style.transform = 'translateY(0)';
                                    }}
                                >
                                    🔄 Reload Page
                                </button>
                            </div>

                            {this.state.eventId && (
                                <p style={{
                                    marginTop: '2rem',
                                    fontSize: '0.875rem',
                                    color: 'rgba(255, 255, 255, 0.5)',
                                }}>
                                    Error ID: {this.state.eventId}
                                </p>
                            )}
                        </div>
                    </div>
                )
            );
        }

        return this.props.children;
    }
}

// Export Sentry-wrapped version for additional error handling
export default Sentry.withErrorBoundary(ErrorBoundary, {
    fallback: ({ resetError }) => (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '2rem',
            background: '#1a1a2e',
            color: '#fff',
        }}>
            <div style={{ maxWidth: '500px', textAlign: 'center' }}>
                <h1>Application Error</h1>
                <p>An unexpected error occurred. Please try reloading the page.</p>
                <button
                    onClick={resetError}
                    style={{
                        marginTop: '1rem',
                        padding: '0.75rem 1.5rem',
                        background: '#667eea',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                    }}
                >
                    Try Again
                </button>
            </div>
        </div>
    ),
    showDialog: false, // We handle the dialog manually in our component
});

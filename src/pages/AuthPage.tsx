/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🔐 CLUB ARENA — Authentication Page
 * ═══════════════════════════════════════════════════════════════════════════════
 * Login, Signup, and Password Reset flows via Supabase Auth
 * 
 * NO DEMO MODE - All authentication is real.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { masterBus } from '../core/MasterBus';
import styles from './AuthPage.module.css';

type AuthMode = 'login' | 'signup' | 'reset';

export default function AuthPage() {
    const navigate = useNavigate();
    const [mode, setMode] = useState<AuthMode>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [username, setUsername] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const { data, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (authError) throw authError;

            if (data.user) {
                masterBus.emit('AUTH_STATE_CHANGED', {
                    userId: data.user.id,
                    isAuthenticated: true,
                });
                navigate('/');
            }
        } catch (err: any) {
            console.error('🔐 [AUTH] Login failed:', err);
            setError(err.message || 'Login failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        // Validation
        if (password !== confirmPassword) {
            setError('Passwords do not match');
            setIsLoading(false);
            return;
        }

        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            setIsLoading(false);
            return;
        }

        if (!username.trim()) {
            setError('Username is required');
            setIsLoading(false);
            return;
        }

        try {
            // Sign up with Supabase
            const { data, error: authError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        username: username.trim(),
                        display_name: username.trim(),
                    },
                },
            });

            if (authError) throw authError;

            if (data.user) {
                // Create profile in database
                const { error: profileError } = await supabase
                    .from('profiles')
                    .upsert({
                        id: data.user.id,
                        username: username.trim(),
                        display_name: username.trim(),
                        vip_level: 'bronze',
                        xp: 0,
                        diamonds: 0,
                        created_at: new Date().toISOString(),
                    });

                if (profileError) {
                    console.warn('🔐 [AUTH] Profile creation failed:', profileError);
                    // Continue anyway - profile might already exist
                }


                // Check if email confirmation is required
                if (data.session) {
                    masterBus.emit('AUTH_STATE_CHANGED', {
                        userId: data.user.id,
                        isAuthenticated: true,
                    });
                    navigate('/');
                } else {
                    setSuccess('Account created! Please check your email to verify your account.');
                    setMode('login');
                }
            }
        } catch (err: any) {
            console.error('🔐 [AUTH] Signup failed:', err);
            setError(err.message || 'Signup failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handlePasswordReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/auth?mode=reset`,
            });

            if (resetError) throw resetError;

            setSuccess('Password reset email sent! Check your inbox.');
        } catch (err: any) {
            console.error('🔐 [AUTH] Password reset failed:', err);
            setError(err.message || 'Failed to send reset email.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.authCard}>
                {/* Metallic Frame Overlay */}
                <div className={styles.frameOverlay}>
                    <img
                        src={`${import.meta.env.BASE_URL}images/auth-frame.jpg`}
                        alt=""
                    />
                </div>

                {/* Card Content — positioned inside the frame */}
                <div className={styles.cardContent}>
                    {/* Logo */}
                    <div className={styles.logo}>
                        <img
                            src={`${import.meta.env.BASE_URL}images/smarter-poker-logo.jpg`}
                            alt="Smarter.Poker"
                            className={styles.logoImage}
                        />
                    </div>

                    {/* Tab Switcher */}
                    {mode !== 'reset' && (
                        <div className={styles.tabs}>
                            <button
                                className={`${styles.tab} ${mode === 'login' ? styles.tabActive : ''}`}
                                onClick={() => { setMode('login'); setError(null); setSuccess(null); }}
                            >
                                Login
                            </button>
                            <button
                                className={`${styles.tab} ${mode === 'signup' ? styles.tabActive : ''}`}
                                onClick={() => { setMode('signup'); setError(null); setSuccess(null); }}
                            >
                                Sign Up
                            </button>
                        </div>
                    )}

                    {/* Success Message */}
                    {success && (
                        <div className={styles.successMessage}>
                            <span>\u2713</span> {success}
                        </div>
                    )}

                    {/* Error Message */}
                    {error && (
                        <div className={styles.errorMessage}>
                            <span>!</span> {error}
                        </div>
                    )}

                    {/* Login Form */}
                    {mode === 'login' && (
                        <form onSubmit={handleLogin} className={styles.form}>
                            <div className={styles.inputGroup}>
                                <label htmlFor="email">Email</label>
                                <input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="your@email.com"
                                    required
                                    autoComplete="email"
                                />
                            </div>

                            <div className={styles.inputGroup}>
                                <label htmlFor="password">Password</label>
                                <input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    autoComplete="current-password"
                                />
                            </div>

                            <button
                                type="submit"
                                className={styles.submitButton}
                                disabled={isLoading}
                            >
                                {isLoading ? 'Logging in...' : 'Login'}
                            </button>

                            <button
                                type="button"
                                className={styles.linkButton}
                                onClick={() => { setMode('reset'); setError(null); }}
                            >
                                Forgot password?
                            </button>
                        </form>
                    )}

                    {/* Signup Form */}
                    {mode === 'signup' && (
                        <form onSubmit={handleSignup} className={styles.form}>
                            <div className={styles.inputGroup}>
                                <label htmlFor="username">Username</label>
                                <input
                                    id="username"
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="PokerPro123"
                                    required
                                    autoComplete="username"
                                />
                            </div>

                            <div className={styles.inputGroup}>
                                <label htmlFor="signup-email">Email</label>
                                <input
                                    id="signup-email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="your@email.com"
                                    required
                                    autoComplete="email"
                                />
                            </div>

                            <div className={styles.inputGroup}>
                                <label htmlFor="signup-password">Password</label>
                                <input
                                    id="signup-password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    minLength={6}
                                    autoComplete="new-password"
                                />
                            </div>

                            <div className={styles.inputGroup}>
                                <label htmlFor="confirm-password">Confirm Password</label>
                                <input
                                    id="confirm-password"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    autoComplete="new-password"
                                />
                            </div>

                            <button
                                type="submit"
                                className={styles.submitButton}
                                disabled={isLoading}
                            >
                                {isLoading ? 'Creating Account...' : 'Create Account'}
                            </button>
                        </form>
                    )}

                    {/* Password Reset Form */}
                    {mode === 'reset' && (
                        <form onSubmit={handlePasswordReset} className={styles.form}>
                            <p className={styles.resetText}>
                                Enter your email and we'll send you a link to reset your password.
                            </p>

                            <div className={styles.inputGroup}>
                                <label htmlFor="reset-email">Email</label>
                                <input
                                    id="reset-email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="your@email.com"
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                className={styles.submitButton}
                                disabled={isLoading}
                            >
                                {isLoading ? 'Sending...' : 'Send Reset Link'}
                            </button>

                            <button
                                type="button"
                                className={styles.linkButton}
                                onClick={() => { setMode('login'); setError(null); setSuccess(null); }}
                            >
                                ← Back to Login
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * ♠ CLUB ARENA — Action Panel Component
 * PokerBros-style action buttons: Fold (red), Check/Call (green), Raise (amber)
 * Professional 3-button horizontal layout with raise mode sub-panel
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { haptic } from '../../services/SoundService';
import './ActionPanel.css';

interface ActionPanelProps {
    canFold: boolean;
    canCheck: boolean;
    canCall: boolean;
    canRaise: boolean;
    canAllIn: boolean;
    callAmount: number;
    minRaise: number;
    maxRaise: number;
    pot: number;
    bigBlind: number;
    onAction: (action: 'fold' | 'check' | 'call' | 'raise' | 'allin', amount?: number) => void;
    isMyTurn?: boolean;
}

function formatChips(amount: number): string {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 10000) return `${(amount / 1000).toFixed(1)}K`;
    if (amount === Math.floor(amount)) return amount.toLocaleString();
    return amount.toFixed(2);
}

export default function ActionPanel({
    canFold,
    canCheck,
    canCall,
    canRaise,
    canAllIn,
    callAmount,
    minRaise,
    maxRaise,
    pot,
    bigBlind,
    onAction,
    isMyTurn = true,
}: ActionPanelProps) {
    const [isRaiseMode, setIsRaiseMode] = useState(false);
    const [raiseAmount, setRaiseAmount] = useState(minRaise);

    // Reset raise amount when minRaise changes (new street/hand)
    useEffect(() => {
        setRaiseAmount(minRaise);
    }, [minRaise]);

    // Close raise mode when turn ends
    useEffect(() => {
        if (!isMyTurn) setIsRaiseMode(false);
    }, [isMyTurn]);

    // Smart presets — adapt to street context
    const presets = [
        { label: '⅓ Pot', value: Math.round(pot * 0.33) },
        { label: '½ Pot', value: Math.round(pot * 0.5) },
        { label: '¾ Pot', value: Math.round(pot * 0.75) },
        { label: 'Pot', value: pot },
    ];

    // Track last slider value for haptic snap feedback
    const lastSnapRef = useRef<number>(minRaise);

    const handleRaiseClick = useCallback(() => {
        if (!canRaise && !canAllIn) return;
        haptic.light();
        setIsRaiseMode(true);
        setRaiseAmount(minRaise);
        lastSnapRef.current = minRaise;
    }, [canRaise, canAllIn, minRaise]);

    const handleConfirmRaise = useCallback(() => {
        haptic.strong();
        if (raiseAmount >= maxRaise) {
            onAction('allin', maxRaise);
        } else {
            onAction('raise', raiseAmount);
        }
        setIsRaiseMode(false);
    }, [raiseAmount, maxRaise, onAction]);

    const handleAllIn = useCallback(() => {
        haptic.strong();
        onAction('allin', maxRaise);
        setIsRaiseMode(false);
    }, [maxRaise, onAction]);

    const adjustRaise = useCallback((delta: number) => {
        haptic.light();
        setRaiseAmount(prev => Math.max(minRaise, Math.min(maxRaise, prev + delta)));
    }, [minRaise, maxRaise]);

    const setPreset = useCallback((value: number) => {
        haptic.medium();
        setRaiseAmount(Math.max(minRaise, Math.min(maxRaise, value)));
    }, [minRaise, maxRaise]);

    // Slider change with snap-to-preset haptic feedback
    const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const val = Number(e.target.value);
        setRaiseAmount(val);

        // Snap feedback — trigger haptic when crossing a BB boundary
        const currentBB = Math.round(val / (bigBlind || 1));
        const lastBB = Math.round(lastSnapRef.current / (bigBlind || 1));
        if (currentBB !== lastBB) {
            haptic.light();
            lastSnapRef.current = val;
        }

        // Stronger haptic when hitting a preset value (within 1 BB tolerance)
        const tolerance = bigBlind || 1;
        for (const p of presets) {
            if (Math.abs(val - p.value) <= tolerance && Math.abs(lastSnapRef.current - p.value) > tolerance) {
                haptic.medium();
                break;
            }
        }
    }, [bigBlind, presets]);

    const sliderProgress = maxRaise > minRaise
        ? ((raiseAmount - minRaise) / (maxRaise - minRaise)) * 100
        : 0;

    // ─── RAISE MODE ──────────────────────────────────────────────
    if (isRaiseMode) {
        return (
            <div className="action-panel action-panel--raise">
                {/* Amount Display with +/- */}
                <div className="raise-header">
                    <button
                        className="raise-adjust raise-adjust--minus"
                        onClick={() => adjustRaise(-bigBlind)}
                        disabled={raiseAmount <= minRaise}
                    >
                        −
                    </button>
                    <div className="raise-value">
                        <span className="raise-value__amount">{formatChips(raiseAmount)}</span>
                        {bigBlind > 0 && (
                            <span className="raise-value__bb">
                                {(raiseAmount / bigBlind).toFixed(1)} BB
                            </span>
                        )}
                    </div>
                    <button
                        className="raise-adjust raise-adjust--plus"
                        onClick={() => adjustRaise(bigBlind)}
                        disabled={raiseAmount >= maxRaise}
                    >
                        +
                    </button>
                </div>

                {/* Slider */}
                <div className="raise-slider-wrap">
                    <input
                        type="range"
                        className="raise-slider"
                        min={minRaise}
                        max={maxRaise}
                        step={bigBlind || 1}
                        value={raiseAmount}
                        onChange={handleSliderChange}
                        style={{ '--slider-progress': `${sliderProgress}%` } as React.CSSProperties}
                    />
                </div>

                {/* Preset Row */}
                <div className="raise-presets">
                    {presets.map((p) => (
                        <button
                            key={p.label}
                            className="raise-preset"
                            onClick={() => setPreset(p.value)}
                            disabled={p.value > maxRaise || p.value < minRaise}
                        >
                            {p.label}
                        </button>
                    ))}
                    <button className="raise-preset raise-preset--allin" onClick={handleAllIn}>
                        ALL IN
                    </button>
                </div>

                {/* Confirm / Cancel Row */}
                <div className="raise-actions">
                    <button className="raise-cancel" onClick={() => setIsRaiseMode(false)}>
                        Back
                    </button>
                    <button className="raise-confirm" onClick={handleConfirmRaise}>
                        Raise {formatChips(raiseAmount)}
                    </button>
                </div>
            </div>
        );
    }

    // ─── STANDARD 3-BUTTON MODE ──────────────────────────────────
    return (
        <div className={`action-panel ${isMyTurn ? 'action-panel--active' : ''}`}>
            <div className="action-row">
                {/* FOLD — Always Red, Left */}
                <button
                    className="action-btn action-btn--fold"
                    onClick={() => { haptic.medium(); onAction('fold'); }}
                    disabled={!canFold}
                >
                    <span className="action-btn__label">Fold</span>
                </button>

                {/* CHECK or CALL — Green, Center */}
                {canCheck ? (
                    <button
                        className="action-btn action-btn--check"
                        onClick={() => { haptic.medium(); onAction('check'); }}
                    >
                        <span className="action-btn__label">Check</span>
                    </button>
                ) : canCall ? (
                    <button
                        className="action-btn action-btn--call"
                        onClick={() => { haptic.medium(); onAction('call'); }}
                    >
                        <span className="action-btn__label">Call</span>
                        <span className="action-btn__amount">{formatChips(callAmount)}</span>
                    </button>
                ) : (
                    <button className="action-btn action-btn--check" disabled>
                        <span className="action-btn__label">—</span>
                    </button>
                )}

                {/* RAISE — Amber/Orange, Right */}
                {canAllIn && !canRaise ? (
                    <button
                        className="action-btn action-btn--allin"
                        onClick={handleAllIn}
                    >
                        <span className="action-btn__label">All In</span>
                        <span className="action-btn__amount">{formatChips(maxRaise)}</span>
                    </button>
                ) : (
                    <button
                        className="action-btn action-btn--raise"
                        onClick={handleRaiseClick}
                        disabled={!canRaise}
                    >
                        <span className="action-btn__label">Raise</span>
                        {minRaise > 0 && bigBlind > 0 && (
                            <span className="action-btn__amount">{(minRaise / bigBlind).toFixed(0)} BB</span>
                        )}
                    </button>
                )}
            </div>
        </div>
    );
}

export { ActionPanel };

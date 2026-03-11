/**
 * ♠ CLUB ARENA — Action Panel Component
 * PokerBros-style action buttons: Fold (red), Check/Call (green), Raise (amber)
 * Professional 3-button horizontal layout with raise mode sub-panel
 */

import { useState, useEffect, useCallback } from 'react';
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

    const presets = [
        { label: '½ POT', value: Math.round(pot * 0.5) },
        { label: 'POT', value: pot },
        { label: '2×', value: Math.round(bigBlind * 2 + callAmount) },
        { label: '3×', value: Math.round(bigBlind * 3 + callAmount) },
    ];

    const handleRaiseClick = useCallback(() => {
        if (!canRaise && !canAllIn) return;
        setIsRaiseMode(true);
        setRaiseAmount(minRaise);
    }, [canRaise, canAllIn, minRaise]);

    const handleConfirmRaise = useCallback(() => {
        if (raiseAmount >= maxRaise) {
            onAction('allin', maxRaise);
        } else {
            onAction('raise', raiseAmount);
        }
        setIsRaiseMode(false);
    }, [raiseAmount, maxRaise, onAction]);

    const handleAllIn = useCallback(() => {
        onAction('allin', maxRaise);
        setIsRaiseMode(false);
    }, [maxRaise, onAction]);

    const adjustRaise = useCallback((delta: number) => {
        setRaiseAmount(prev => Math.max(minRaise, Math.min(maxRaise, prev + delta)));
    }, [minRaise, maxRaise]);

    const setPreset = useCallback((value: number) => {
        setRaiseAmount(Math.max(minRaise, Math.min(maxRaise, value)));
    }, [minRaise, maxRaise]);

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
                        onChange={(e) => setRaiseAmount(Number(e.target.value))}
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
                    onClick={() => onAction('fold')}
                    disabled={!canFold}
                >
                    <span className="action-btn__label">Fold</span>
                </button>

                {/* CHECK or CALL — Green, Center */}
                {canCheck ? (
                    <button
                        className="action-btn action-btn--check"
                        onClick={() => onAction('check')}
                    >
                        <span className="action-btn__label">Check</span>
                    </button>
                ) : canCall ? (
                    <button
                        className="action-btn action-btn--call"
                        onClick={() => onAction('call')}
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
                    </button>
                )}
            </div>
        </div>
    );
}

export { ActionPanel };

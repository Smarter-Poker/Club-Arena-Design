/**
 * ♠ CLUB ARENA — Pre-Action Bar Component
 * Allows players to queue actions before it's their turn
 */

import { useState } from 'react';
import './PreActionBar.css';

interface PreActionBarProps {
    canCheck: boolean;
    isMyTurn: boolean;
    preAction: 'fold' | 'check' | 'callAny' | null;
    onPreActionChange: (action: 'fold' | 'check' | 'callAny' | null) => void;
}

export default function PreActionBar({
    canCheck,
    isMyTurn,
    preAction,
    onPreActionChange,
}: PreActionBarProps) {
    // Don't render when it's the player's turn (they should use main action buttons)
    if (isMyTurn) {
        return null;
    }

    const handleToggle = (action: 'fold' | 'check' | 'callAny') => {
        // If clicking the same action, deselect it
        if (preAction === action) {
            onPreActionChange(null);
        } else {
            onPreActionChange(action);
        }
    };

    const foldLabel = canCheck ? 'Check/Fold' : 'Fold';

    return (
        <div className="pre-action-bar">
            <div className="pre-action-buttons">
                {/* Fold / Check-Fold Pill */}
                <button
                    className={`pre-action-btn fold ${preAction === 'fold' ? 'active' : ''}`}
                    onClick={() => handleToggle('fold')}
                    title={canCheck ? 'Check if possible, fold if forced to act' : 'Fold when action reaches you'}
                >
                    <span className="pre-action-btn__check">
                        {preAction === 'fold' ? '✓' : ''}
                    </span>
                    {foldLabel}
                </button>

                {/* Check Pill */}
                <button
                    className={`pre-action-btn check ${preAction === 'check' ? 'active' : ''}`}
                    onClick={() => handleToggle('check')}
                    title="Check when action reaches you"
                >
                    <span className="pre-action-btn__check">
                        {preAction === 'check' ? '✓' : ''}
                    </span>
                    Check
                </button>

                {/* Call Any Pill */}
                <button
                    className={`pre-action-btn call ${preAction === 'callAny' ? 'active' : ''}`}
                    onClick={() => handleToggle('callAny')}
                    title="Call any bet when action reaches you"
                >
                    <span className="pre-action-btn__check">
                        {preAction === 'callAny' ? '✓' : ''}
                    </span>
                    Call Any
                </button>
            </div>
        </div>
    );
}

export { PreActionBar };

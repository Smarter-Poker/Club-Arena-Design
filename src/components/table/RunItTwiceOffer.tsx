/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  RUN IT TWICE OFFER — All-In Insurance Modal
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import './RunItTwiceOffer.css';

interface RunItTwiceOfferProps {
    isOpen: boolean;
    opponent: string;
    opponentAccepted?: boolean;
    timeRemaining: number;
    onAccept: () => void;
    onDecline: () => void;
}

export function RunItTwiceOffer({
    isOpen,
    opponent,
    opponentAccepted,
    timeRemaining,
    onAccept,
    onDecline
}: RunItTwiceOfferProps) {
    const [countdown, setCountdown] = useState(timeRemaining);

    useEffect(() => {
        if (!isOpen) return;
        setCountdown(timeRemaining);

        const timer = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    onDecline();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [isOpen, timeRemaining]);

    if (!isOpen) return null;

    return (
        <div className="run-it-twice-overlay">
            <div className="run-it-twice">
                <div className="rit-header">
                    <span className="icon">⇆</span>
                    <h3>Run It Twice?</h3>
                </div>

                <p className="description">
                    {opponent} {opponentAccepted ? 'agreed' : 'is asking'} to run the board twice.
                </p>

                <div className="countdown">
                    <span className="time">{countdown}s</span>
                </div>

                <div className="rit-actions">
                    <button className="decline" onClick={onDecline}>
                        Decline
                    </button>
                    <button className="accept" onClick={onAccept}>
                        Accept
                    </button>
                </div>
            </div>
        </div>
    );
}

export default RunItTwiceOffer;

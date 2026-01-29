/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  WINNER DISPLAY — Hand Winner Announcement
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React, { useEffect, useState } from 'react';
import './WinnerDisplay.css';

interface WinnerDisplayProps {
    winners: {
        username: string;
        amount: number;
        handName?: string;
    }[];
    isVisible: boolean;
    onDismiss?: () => void;
}

export function WinnerDisplay({ winners, isVisible, onDismiss }: WinnerDisplayProps) {
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (isVisible) {
            setShow(true);
            const timer = setTimeout(() => {
                setShow(false);
                onDismiss?.();
            }, 4000);
            return () => clearTimeout(timer);
        }
    }, [isVisible, onDismiss]);

    if (!show || winners.length === 0) return null;

    return (
        <div className="winner-display">
            <div className="winner-content">
                <span className="trophy"></span>

                {winners.map((winner, idx) => (
                    <div key={idx} className="winner-row">
                        <span className="username">{winner.username}</span>
                        <span className="wins">wins</span>
                        <span className="amount">{winner.amount.toLocaleString()}</span>
                        {winner.handName && (
                            <span className="hand">{winner.handName}</span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

export default WinnerDisplay;

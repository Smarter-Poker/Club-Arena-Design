/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  ACTION LOG — Real-Time Hand Action Log
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React, { useRef, useEffect } from 'react';
import './ActionLog.css';

interface ActionLogProps {
    actions: ActionEntry[];
    maxHeight?: number;
}

interface ActionEntry {
    id: string;
    player: string;
    action: string;
    amount?: number;
    timestamp: Date;
    street?: 'preflop' | 'flop' | 'turn' | 'river';
}

const ACTION_COLORS: Record<string, string> = {
    fold: '#6b7280',
    check: '#6b7280',
    call: '#22c55e',
    bet: '#3b82f6',
    raise: '#f59e0b',
    'all-in': '#ef4444'
};

export function ActionLog({ actions, maxHeight = 200 }: ActionLogProps) {
    const logRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    }, [actions]);

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    return (
        <div className="action-log" style={{ maxHeight }}>
            <div className="action-log__header">
                <h3> Action Log</h3>
            </div>

            <div className="action-log__content" ref={logRef}>
                {actions.length === 0 ? (
                    <div className="empty-state">No actions yet</div>
                ) : (
                    actions.map(action => (
                        <div key={action.id} className="action-entry">
                            <span className="time">{formatTime(action.timestamp)}</span>
                            <span className="player">{action.player}</span>
                            <span
                                className="action"
                                style={{ color: ACTION_COLORS[action.action.toLowerCase()] || '#fff' }}
                            >
                                {action.action}
                            </span>
                            {action.amount !== undefined && (
                                <span className="amount">{action.amount.toLocaleString()}</span>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

export default ActionLog;

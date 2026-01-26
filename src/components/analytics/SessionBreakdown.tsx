import React from 'react';
import './SessionBreakdown.css';

interface SessionData {
    sessionId: string;
    startTime: Date;
    endTime?: Date;
    handsPlayed: number;
    hoursPlayed: number;
    netProfit: number;
    bigBlinds: number;
    bestHand: string;
    biggestWin: number;
    biggestLoss: number;
    vpip: number;
    pfr: number;
    threebet: number;
    showdownWin: number;
}

interface SessionBreakdownProps {
    session: SessionData;
    onViewHands?: () => void;
}

export const SessionBreakdown: React.FC<SessionBreakdownProps> = ({ session, onViewHands }) => {
    const formatMoney = (amount: number) => {
        const prefix = amount >= 0 ? '+' : '';
        return `${prefix}${amount.toLocaleString()}`;
    };

    const formatDate = (date: Date) => {
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="session-breakdown">
            <div className="session-header">
                <div className="session-time">
                    <span className="start-time">{formatDate(session.startTime)}</span>
                    {session.endTime && (
                        <>
                            <span className="time-arrow">→</span>
                            <span className="end-time">{formatDate(session.endTime)}</span>
                        </>
                    )}
                </div>
                <span className="session-duration">{session.hoursPlayed.toFixed(1)}h</span>
            </div>

            <div className="session-profit">
                <div className={`profit-amount ${session.netProfit >= 0 ? 'positive' : 'negative'}`}>
                    {formatMoney(session.netProfit)}
                </div>
                <div className="profit-bb">
                    {session.bigBlinds >= 0 ? '+' : ''}{session.bigBlinds.toFixed(1)} BB/100
                </div>
            </div>

            <div className="session-stats-grid">
                <div className="stat-cell">
                    <span className="stat-value">{session.handsPlayed}</span>
                    <span className="stat-label">Hands</span>
                </div>
                <div className="stat-cell">
                    <span className="stat-value">{session.vpip}%</span>
                    <span className="stat-label">VPIP</span>
                </div>
                <div className="stat-cell">
                    <span className="stat-value">{session.pfr}%</span>
                    <span className="stat-label">PFR</span>
                </div>
                <div className="stat-cell">
                    <span className="stat-value">{session.threebet}%</span>
                    <span className="stat-label">3-Bet</span>
                </div>
            </div>

            <div className="session-highlights">
                <div className="highlight highlight-win">
                    <span className="highlight-icon"></span>
                    <div className="highlight-info">
                        <span className="highlight-value">+{session.biggestWin.toLocaleString()}</span>
                        <span className="highlight-label">Biggest Win</span>
                    </div>
                </div>
                <div className="highlight highlight-loss">
                    <span className="highlight-icon"></span>
                    <div className="highlight-info">
                        <span className="highlight-value">-{session.biggestLoss.toLocaleString()}</span>
                        <span className="highlight-label">Biggest Loss</span>
                    </div>
                </div>
            </div>

            {session.bestHand && (
                <div className="best-hand">
                    <span className="best-hand-label">Best Hand</span>
                    <span className="best-hand-value">{session.bestHand}</span>
                </div>
            )}

            {onViewHands && (
                <button className="view-hands-btn" onClick={onViewHands}>
                    View All Hands
                </button>
            )}
        </div>
    );
};

export default SessionBreakdown;

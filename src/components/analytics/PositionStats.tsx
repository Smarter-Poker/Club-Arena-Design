import React from 'react';
import './PositionStats.css';

interface PositionData {
    position: string;
    hands: number;
    winRate: number;
    vpip: number;
    pfr: number;
    netProfit: number;
}

interface PositionStatsProps {
    data: PositionData[];
    highlightBest?: boolean;
}

const POSITION_LABELS: Record<string, string> = {
    'BTN': 'Button',
    'CO': 'Cutoff',
    'HJ': 'Hijack',
    'MP': 'Middle',
    'UTG': 'Under the Gun',
    'SB': 'Small Blind',
    'BB': 'Big Blind',
};

export const PositionStats: React.FC<PositionStatsProps> = ({ data, highlightBest = true }) => {
    const bestPosition = highlightBest
        ? data.reduce((best, pos) => pos.winRate > best.winRate ? pos : best, data[0])
        : null;

    return (
        <div className="position-stats">
            <div className="position-header">
                <span>Position</span>
                <span>Hands</span>
                <span>VPIP</span>
                <span>PFR</span>
                <span>BB/100</span>
                <span>Net</span>
            </div>

            {data.map(pos => (
                <div
                    key={pos.position}
                    className={`position-row ${bestPosition?.position === pos.position ? 'best' : ''}`}
                >
                    <div className="position-name">
                        <span className="position-abbr">{pos.position}</span>
                        <span className="position-full">{POSITION_LABELS[pos.position] || pos.position}</span>
                    </div>
                    <span className="stat-hands">{pos.hands.toLocaleString()}</span>
                    <span className="stat-vpip">{pos.vpip}%</span>
                    <span className="stat-pfr">{pos.pfr}%</span>
                    <span className={`stat-winrate ${pos.winRate >= 0 ? 'positive' : 'negative'}`}>
                        {pos.winRate >= 0 ? '+' : ''}{pos.winRate.toFixed(1)}
                    </span>
                    <span className={`stat-net ${pos.netProfit >= 0 ? 'positive' : 'negative'}`}>
                        {pos.netProfit >= 0 ? '+' : ''}{pos.netProfit.toLocaleString()}
                    </span>
                </div>
            ))}
        </div>
    );
};

export default PositionStats;

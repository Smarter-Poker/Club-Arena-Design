/**
 * ♠ CLUB ARENA — Rake Reports
 * Club rake analytics and reports
 */

import React, { useState, useEffect } from 'react';
import './RakeReports.css';

interface RakeData {
    period: string;
    totalRake: number;
    totalHands: number;
    avgRakePerHand: number;
    topGames: { game: string; rake: number; hands: number }[];
    dailyBreakdown: { date: string; rake: number; hands: number }[];
}

interface RakeReportsProps {
    clubId: string;
}

export const RakeReports: React.FC<RakeReportsProps> = ({ clubId }) => {
    const [data, setData] = useState<RakeData | null>(null);
    const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'year'>('week');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadRakeData();
    }, [clubId, period]);

    const loadRakeData = async () => {
        setLoading(true);
        try {
            // Mock data
            const mock: RakeData = {
                period: 'This Week',
                totalRake: 4850,
                totalHands: 12420,
                avgRakePerHand: 0.39,
                topGames: [
                    { game: 'NLH 1/2', rake: 1850, hands: 4200 },
                    { game: 'NLH 2/4', rake: 1420, hands: 2800 },
                    { game: 'PLO 1/2', rake: 980, hands: 2100 },
                    { game: 'NLH 0.5/1', rake: 600, hands: 3320 },
                ],
                dailyBreakdown: [
                    { date: 'Mon', rake: 680, hands: 1800 },
                    { date: 'Tue', rake: 720, hands: 1950 },
                    { date: 'Wed', rake: 650, hands: 1700 },
                    { date: 'Thu', rake: 800, hands: 2100 },
                    { date: 'Fri', rake: 950, hands: 2400 },
                    { date: 'Sat', rake: 620, hands: 1600 },
                    { date: 'Sun', rake: 430, hands: 870 },
                ],
            };
            setData(mock);
        } catch (error) {
            console.error('Failed to load rake data:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading || !data) {
        return (
            <div className="rake-reports loading">
                <div className="spinner" />
            </div>
        );
    }

    const maxRake = Math.max(...data.dailyBreakdown.map(d => d.rake));

    return (
        <div className="rake-reports">
            <div className="reports-header">
                <h2>💰 Rake Reports</h2>
                <div className="period-selector">
                    {(['today', 'week', 'month', 'year'] as const).map(p => (
                        <button
                            key={p}
                            className={period === p ? 'active' : ''}
                            onClick={() => setPeriod(p)}
                        >
                            {p.charAt(0).toUpperCase() + p.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Summary Cards */}
            <div className="summary-cards">
                <div className="summary-card">
                    <span className="card-value">{data.totalRake.toLocaleString()}</span>
                    <span className="card-label">Total Rake</span>
                </div>
                <div className="summary-card">
                    <span className="card-value">{data.totalHands.toLocaleString()}</span>
                    <span className="card-label">Hands Played</span>
                </div>
                <div className="summary-card">
                    <span className="card-value">{Math.trunc(data.avgRakePerHand * 100) / 100}</span>
                    <span className="card-label">Avg per Hand</span>
                </div>
            </div>

            {/* Daily Chart */}
            <div className="daily-chart">
                <h3>Daily Breakdown</h3>
                <div className="chart-bars">
                    {data.dailyBreakdown.map(day => (
                        <div key={day.date} className="bar-group">
                            <div className="bar-container">
                                <div
                                    className="bar-fill"
                                    style={{ height: `${(day.rake / maxRake) * 100}%` }}
                                />
                            </div>
                            <span className="bar-label">{day.date}</span>
                            <span className="bar-value">{day.rake}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Top Games */}
            <div className="top-games">
                <h3>Top Games by Rake</h3>
                <div className="games-list">
                    {data.topGames.map((game, index) => (
                        <div key={game.game} className="game-row">
                            <span className="game-rank">#{index + 1}</span>
                            <span className="game-name">{game.game}</span>
                            <div className="game-stats">
                                <span className="game-rake">{game.rake.toLocaleString()}</span>
                                <span className="game-hands">{game.hands.toLocaleString()} hands</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Export Button */}
            <button className="export-btn">
                📥 Export Report
            </button>
        </div>
    );
};

export default RakeReports;

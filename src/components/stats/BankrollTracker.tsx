/**
 * BankrollTracker — Visual bankroll progression over time
 * Line chart with key milestones and trend analysis
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import './BankrollTracker.css';

interface BankrollDataPoint {
  date: string;
  dateObj: Date;
  bankroll: number;
  dayProfit: number;
}

type PeriodFilter = '7d' | '30d' | '90d' | 'all';

const BANKROLL_DATA: BankrollDataPoint[] = [
  { date: '2/18', dateObj: new Date(2026, 1, 18), bankroll: 8500, dayProfit: 0 },
  { date: '2/19', dateObj: new Date(2026, 1, 19), bankroll: 8720, dayProfit: 220 },
  { date: '2/20', dateObj: new Date(2026, 1, 20), bankroll: 8510, dayProfit: -210 },
  { date: '2/21', dateObj: new Date(2026, 1, 21), bankroll: 9150, dayProfit: 640 },
  { date: '2/22', dateObj: new Date(2026, 1, 22), bankroll: 9320, dayProfit: 170 },
  { date: '2/23', dateObj: new Date(2026, 1, 23), bankroll: 9050, dayProfit: -270 },
  { date: '2/24', dateObj: new Date(2026, 1, 24), bankroll: 9580, dayProfit: 530 },
  { date: '2/25', dateObj: new Date(2026, 1, 25), bankroll: 9420, dayProfit: -160 },
  { date: '2/26', dateObj: new Date(2026, 1, 26), bankroll: 10200, dayProfit: 780 },
  { date: '2/27', dateObj: new Date(2026, 1, 27), bankroll: 10050, dayProfit: -150 },
  { date: '2/28', dateObj: new Date(2026, 1, 28), bankroll: 10680, dayProfit: 630 },
  { date: '3/1', dateObj: new Date(2026, 2, 1), bankroll: 10420, dayProfit: -260 },
  { date: '3/2', dateObj: new Date(2026, 2, 2), bankroll: 11150, dayProfit: 730 },
  { date: '3/3', dateObj: new Date(2026, 2, 3), bankroll: 10890, dayProfit: -260 },
  { date: '3/4', dateObj: new Date(2026, 2, 4), bankroll: 11520, dayProfit: 630 },
  { date: '3/5', dateObj: new Date(2026, 2, 5), bankroll: 11780, dayProfit: 260 },
  { date: '3/6', dateObj: new Date(2026, 2, 6), bankroll: 11730, dayProfit: -50 },
  { date: '3/7', dateObj: new Date(2026, 2, 7), bankroll: 11900, dayProfit: 170 },
  { date: '3/8', dateObj: new Date(2026, 2, 8), bankroll: 11970, dayProfit: 70 },
  { date: '3/9', dateObj: new Date(2026, 2, 9), bankroll: 12150, dayProfit: 180 },
  { date: '3/10', dateObj: new Date(2026, 2, 10), bankroll: 12095, dayProfit: -55 },
  { date: '3/11', dateObj: new Date(2026, 2, 11), bankroll: 12237, dayProfit: 142 },
];

const BankrollTracker: React.FC = () => {
  const [period, setPeriod] = useState<PeriodFilter>('30d');
  const [chartData, setChartData] = useState(BANKROLL_DATA);

  // Filter data by period
  useEffect(() => {
    const now = new Date(2026, 2, 11);
    let filtered = BANKROLL_DATA;

    if (period === '7d') {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      filtered = BANKROLL_DATA.filter(d => d.dateObj >= sevenDaysAgo);
    } else if (period === '30d') {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      filtered = BANKROLL_DATA.filter(d => d.dateObj >= thirtyDaysAgo);
    } else if (period === '90d') {
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      filtered = BANKROLL_DATA.filter(d => d.dateObj >= ninetyDaysAgo);
    }

    setChartData(filtered);
  }, [period]);

  // Calculate moving average (14-day)
  const calculateMovingAverage = (data: BankrollDataPoint[], window: number = 14) => {
    return data.map((point, i) => {
      const start = Math.max(0, i - window + 1);
      const slice = data.slice(start, i + 1);
      const avg = slice.reduce((sum, d) => sum + d.bankroll, 0) / slice.length;
      return { ...point, movingAvg: avg };
    });
  };

  const dataWithAverage = useMemo(() => calculateMovingAverage(chartData), [chartData]);

  // Calculate statistics
  const current = chartData[chartData.length - 1]?.bankroll || 0;
  const previous = chartData[0]?.bankroll || current;
  const peak = Math.max(...BANKROLL_DATA.map(d => d.bankroll));
  const trough = Math.min(...BANKROLL_DATA.map(d => d.bankroll));
  const totalProfit = current - BANKROLL_DATA[0].bankroll;
  const currentStakes = '$1/$2'; // Assuming current stakes
  const buyInCount = (current / 100); // At $1/$2, each BB is $2

  const getPeriodLabel = () => {
    switch (period) {
      case '7d': return 'Last 7 Days';
      case '30d': return 'Last 30 Days';
      case '90d': return 'Last 90 Days';
      case 'all': return 'All Time';
      default: return 'Last 30 Days';
    }
  };

  const getBankrollHealth = () => {
    const buyInRatio = buyInCount;
    if (buyInRatio > 30) return { label: 'Healthy', color: '#10b981' };
    if (buyInRatio > 20) return { label: 'Adequate', color: '#f59e0b' };
    if (buyInRatio > 10) return { label: 'Tight', color: '#ef4444' };
    return { label: 'Critical', color: '#dc2626' };
  };

  const health = getBankrollHealth();

  const getMilestoneIcon = (milestone: string) => {
    if (milestone === 'peak') return '▲';
    if (milestone === 'trough') return '▼';
    return '◆';
  };

  const getTrendColor = () => {
    const change = current - previous;
    if (change > 0) return '#10b981';
    if (change < 0) return '#ef4444';
    return '#00d4ff';
  };

  return (
    <div className="bankroll-tracker">
      <div className="bankroll-header">
        <h3>Bankroll Tracker</h3>
        <p className="bankroll-subtitle">Track your bankroll progression over time</p>
      </div>

      {/* Period selector */}
      <div className="bankroll-periods">
        {(['7d', '30d', '90d', 'all'] as PeriodFilter[]).map(p => (
          <button
            key={p}
            className={period === p ? 'active' : ''}
            onClick={() => setPeriod(p)}
          >
            {p === '7d' ? '7D' : p === '30d' ? '30D' : p === '90d' ? '90D' : 'All'}
          </button>
        ))}
      </div>

      {/* Current bankroll display */}
      <div className="bankroll-display">
        <div className="bankroll-amount">
          <span className="amount-label">Current Bankroll</span>
          <div className="amount-value" style={{ color: getTrendColor() }}>
            <span className="amount-currency">$</span>
            <span className="amount-number">{current.toLocaleString()}</span>
          </div>
          <span className="amount-period">{getPeriodLabel()}</span>
        </div>

        <div className="bankroll-change">
          <span className="change-label">Period Change</span>
          <div className="change-value" style={{ color: getTrendColor() }}>
            <span className="change-sign">{current > previous ? '+' : ''}</span>
            <span className="change-amount">${(current - previous).toLocaleString()}</span>
          </div>
          <span className="change-pct">
            {((((current - previous) / previous) * 100).toFixed(1))}%
          </span>
        </div>

        <div className="bankroll-health">
          <span className="health-label">Bankroll Health</span>
          <div className="health-indicator" style={{ borderColor: health.color, color: health.color }}>
            {health.label}
          </div>
          <span className="health-detail">{buyInCount.toFixed(1)} buy-ins</span>
        </div>
      </div>

      {/* Chart */}
      <div className="bankroll-chart-container">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={dataWithAverage}>
            <defs>
              <linearGradient id="bankrollGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00d4ff" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#00d4ff" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis dataKey="date" stroke="rgba(255,255,255,0.5)" fontSize={12} />
            <YAxis stroke="rgba(255,255,255,0.5)" fontSize={12} />
            <Tooltip
              contentStyle={{
                background: '#1e1e32',
                border: '1px solid rgba(0, 212, 255, 0.2)',
                borderRadius: '8px',
              }}
              labelStyle={{ color: '#fff' }}
              formatter={(value, name) => {
                if (name === 'bankroll') return [`$${Number(value).toLocaleString()}`, 'Bankroll'];
                if (name === 'movingAvg') return [`$${Number(value).toLocaleString()}`, '14d Avg'];
                return [value, name];
              }}
            />
            <ReferenceLine y={peak} stroke="rgba(16, 185, 129, 0.3)" strokeDasharray="5 5" />
            <ReferenceLine y={trough} stroke="rgba(239, 68, 68, 0.3)" strokeDasharray="5 5" />
            <Line
              type="monotone"
              dataKey="bankroll"
              stroke="#00d4ff"
              strokeWidth={2}
              dot={false}
              name="Bankroll"
            />
            <Line
              type="monotone"
              dataKey="movingAvg"
              stroke="rgba(0, 212, 255, 0.5)"
              strokeWidth={1}
              strokeDasharray="4 4"
              dot={false}
              name="14d Average"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Milestones and stats */}
      <div className="bankroll-stats">
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon peak">▲</div>
            <div className="stat-content">
              <span className="stat-label">All-Time High</span>
              <span className="stat-value">${peak.toLocaleString()}</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon trough">▼</div>
            <div className="stat-content">
              <span className="stat-label">All-Time Low</span>
              <span className="stat-value">${trough.toLocaleString()}</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon swing">◆</div>
            <div className="stat-content">
              <span className="stat-label">Biggest Swing</span>
              <span className="stat-value">${(peak - trough).toLocaleString()}</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon total">▪</div>
            <div className="stat-content">
              <span className="stat-label">Total Growth</span>
              <span className="stat-value" style={{ color: totalProfit >= 0 ? '#10b981' : '#ef4444' }}>
                {totalProfit > 0 ? '+' : ''}{totalProfit.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Key insights */}
      <div className="bankroll-insights">
        <h4 className="insights-title">Key Insights</h4>
        <div className="insights-list">
          <div className="insight-item">
            <span className="insight-number">1</span>
            <div className="insight-content">
              <span className="insight-label">Trend</span>
              <p className="insight-text">
                Your bankroll is {current > previous ? 'growing' : 'declining'} with a moving average showing{' '}
                {current > previous ? 'upward' : 'downward'} momentum.
              </p>
            </div>
          </div>

          <div className="insight-item">
            <span className="insight-number">2</span>
            <div className="insight-content">
              <span className="insight-label">Health Status</span>
              <p className="insight-text">
                At {buyInCount.toFixed(1)} buy-ins, your bankroll is <strong>{health.label.toLowerCase()}</strong>.
                {buyInCount < 20 && ' Consider taking a shot at higher stakes or reducing your play volume.'}
              </p>
            </div>
          </div>

          <div className="insight-item">
            <span className="insight-number">3</span>
            <div className="insight-content">
              <span className="insight-label">Volatility</span>
              <p className="insight-text">
                Your swings range from ${trough.toLocaleString()} to ${peak.toLocaleString()}, reflecting
                typical poker variance at {currentStakes}.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BankrollTracker;

import React, { useMemo } from 'react';
import './WinRateChart.css';

interface DataPoint {
    date: string;
    winRate: number;
    hands: number;
}

interface WinRateChartProps {
    data: DataPoint[];
    height?: number;
    showGrid?: boolean;
}

export const WinRateChart: React.FC<WinRateChartProps> = ({
    data,
    height = 200,
    showGrid = true
}) => {
    const { path, area, points, yMin, yMax, gridLines } = useMemo(() => {
        if (data.length === 0) return { path: '', area: '', points: [], yMin: -10, yMax: 10, gridLines: [] };

        const rates = data.map(d => d.winRate);
        const min = Math.min(...rates, 0);
        const max = Math.max(...rates, 0);
        const padding = Math.max(Math.abs(max - min) * 0.2, 5);

        const yMin = min - padding;
        const yMax = max + padding;
        const yRange = yMax - yMin;

        const width = 100;
        const xStep = width / (data.length - 1 || 1);

        const pts = data.map((d, i) => ({
            x: i * xStep,
            y: ((yMax - d.winRate) / yRange) * 100,
            ...d
        }));

        const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
        const areaD = pathD + ` L ${pts[pts.length - 1].x} 100 L 0 100 Z`;

        // Grid lines at 0 and key intervals
        const lines: number[] = [];
        const step = yRange / 4;
        for (let i = 0; i <= 4; i++) {
            lines.push(yMax - (step * i));
        }

        return {
            path: pathD,
            area: areaD,
            points: pts,
            yMin,
            yMax,
            gridLines: lines
        };
    }, [data]);

    const zeroLineY = ((yMax - 0) / (yMax - yMin)) * 100;

    return (
        <div className="winrate-chart">
            <div className="chart-labels">
                <span className="label-top">+{yMax.toFixed(0)} BB</span>
                <span className="label-zero">0</span>
                <span className="label-bottom">{yMin.toFixed(0)} BB</span>
            </div>

            <svg
                viewBox={`0 0 100 100`}
                preserveAspectRatio="none"
                style={{ height }}
            >
                {showGrid && gridLines.map((val, i) => {
                    const y = ((yMax - val) / (yMax - yMin)) * 100;
                    return (
                        <line
                            key={i}
                            x1="0"
                            y1={y}
                            x2="100"
                            y2={y}
                            className="grid-line"
                        />
                    );
                })}

                {/* Zero line */}
                <line
                    x1="0"
                    y1={zeroLineY}
                    x2="100"
                    y2={zeroLineY}
                    className="zero-line"
                />

                {/* Area fill */}
                <defs>
                    <linearGradient id="winrateGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#4ade80" stopOpacity="0.3" />
                        <stop offset={`${zeroLineY}%`} stopColor="#4ade80" stopOpacity="0.1" />
                        <stop offset={`${zeroLineY}%`} stopColor="#f87171" stopOpacity="0.1" />
                        <stop offset="100%" stopColor="#f87171" stopOpacity="0.3" />
                    </linearGradient>
                </defs>

                <path d={area} fill="url(#winrateGradient)" />

                {/* Line */}
                <path
                    d={path}
                    fill="none"
                    stroke="#ffd700"
                    strokeWidth="0.5"
                    vectorEffect="non-scaling-stroke"
                />

                {/* Points */}
                {points.map((p, i) => (
                    <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r="1"
                        fill="#ffd700"
                        className="data-point"
                    />
                ))}
            </svg>

            <div className="chart-x-labels">
                {data.length > 0 && (
                    <>
                        <span>{data[0].date}</span>
                        <span>{data[data.length - 1].date}</span>
                    </>
                )}
            </div>
        </div>
    );
};

export default WinRateChart;

import React, { useMemo } from 'react';
import './HeatmapCalendar.css';

interface DayData {
    date: string;
    hands: number;
    profit: number;
}

interface HeatmapCalendarProps {
    data: DayData[];
    year?: number;
    onDayClick?: (date: string) => void;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export const HeatmapCalendar: React.FC<HeatmapCalendarProps> = ({
    data,
    year = new Date().getFullYear(),
    onDayClick
}) => {
    const { weeks, dataMap, maxHands } = useMemo(() => {
        const dataMap = new Map<string, DayData>();
        let maxHands = 0;

        data.forEach(d => {
            dataMap.set(d.date, d);
            if (d.hands > maxHands) maxHands = d.hands;
        });

        // Build weeks array
        const startDate = new Date(year, 0, 1);
        const endDate = new Date(year, 11, 31);

        // Adjust start to Sunday
        const firstSunday = new Date(startDate);
        firstSunday.setDate(startDate.getDate() - startDate.getDay());

        const weeks: Date[][] = [];
        const currentDate = new Date(firstSunday);

        while (currentDate <= endDate || weeks.length < 53) {
            const week: Date[] = [];
            for (let i = 0; i < 7; i++) {
                week.push(new Date(currentDate));
                currentDate.setDate(currentDate.getDate() + 1);
            }
            weeks.push(week);
            if (weeks.length >= 53) break;
        }

        return { weeks, dataMap, maxHands };
    }, [data, year]);

    const getIntensity = (hands: number): number => {
        if (hands === 0 || maxHands === 0) return 0;
        const intensity = Math.ceil((hands / maxHands) * 4);
        return Math.min(intensity, 4);
    };

    const formatDate = (date: Date): string => {
        return date.toISOString().split('T')[0];
    };

    const getMonthLabels = (): { month: string; col: number }[] => {
        const labels: { month: string; col: number }[] = [];
        let lastMonth = -1;

        weeks.forEach((week, idx) => {
            const firstDayOfWeek = week.find(d => d.getFullYear() === year);
            if (firstDayOfWeek) {
                const month = firstDayOfWeek.getMonth();
                if (month !== lastMonth) {
                    labels.push({ month: MONTHS[month], col: idx });
                    lastMonth = month;
                }
            }
        });

        return labels;
    };

    return (
        <div className="heatmap-calendar">
            <div className="month-labels">
                {getMonthLabels().map(({ month, col }) => (
                    <span
                        key={`${month}-${col}`}
                        style={{ gridColumn: col + 2 }}
                    >
                        {month}
                    </span>
                ))}
            </div>

            <div className="calendar-grid">
                <div className="day-labels">
                    {DAYS.map((day, i) => (
                        <span key={i}>{i % 2 === 1 ? day : ''}</span>
                    ))}
                </div>

                <div className="weeks-grid">
                    {weeks.map((week, weekIdx) => (
                        <div key={weekIdx} className="week-column">
                            {week.map((date, dayIdx) => {
                                const dateStr = formatDate(date);
                                const dayData = dataMap.get(dateStr);
                                const isCurrentYear = date.getFullYear() === year;
                                const intensity = dayData ? getIntensity(dayData.hands) : 0;

                                return (
                                    <div
                                        key={dayIdx}
                                        className={`day-cell intensity-${intensity} ${!isCurrentYear ? 'outside' : ''} ${dayData?.profit && dayData.profit < 0 ? 'loss' : ''}`}
                                        title={dayData ? `${dateStr}: ${dayData.hands} hands, ${dayData.profit >= 0 ? '+' : ''}${dayData.profit}` : dateStr}
                                        onClick={() => isCurrentYear && onDayClick?.(dateStr)}
                                    />
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>

            <div className="legend">
                <span>Less</span>
                <div className="legend-squares">
                    {[0, 1, 2, 3, 4].map(i => (
                        <div key={i} className={`legend-square intensity-${i}`} />
                    ))}
                </div>
                <span>More</span>
            </div>
        </div>
    );
};

export default HeatmapCalendar;

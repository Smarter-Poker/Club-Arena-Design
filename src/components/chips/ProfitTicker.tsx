import React, { useState, useEffect } from 'react';
import './ProfitTicker.css';

interface ProfitTickerProps {
    value: number;
    previousValue?: number;
    prefix?: string;
    suffix?: string;
    animationDuration?: number;
}

export const ProfitTicker: React.FC<ProfitTickerProps> = ({
    value,
    previousValue = 0,
    prefix = '',
    suffix = '',
    animationDuration = 1000
}) => {
    const [displayValue, setDisplayValue] = useState(previousValue);
    const [isAnimating, setIsAnimating] = useState(false);

    const isProfit = value >= 0;

    useEffect(() => {
        if (value === displayValue) return;

        setIsAnimating(true);
        const diff = value - displayValue;
        const steps = 30;
        const stepValue = diff / steps;
        const stepDuration = animationDuration / steps;

        let current = displayValue;
        let step = 0;

        const interval = setInterval(() => {
            step++;
            current += stepValue;

            if (step >= steps) {
                setDisplayValue(value);
                setIsAnimating(false);
                clearInterval(interval);
            } else {
                setDisplayValue(Math.round(current));
            }
        }, stepDuration);

        return () => clearInterval(interval);
    }, [value, animationDuration]);

    return (
        <div className={`profit-ticker ${isProfit ? 'profit' : 'loss'} ${isAnimating ? 'animating' : ''}`}>
            <span className="ticker-prefix">{prefix}</span>
            <span className="ticker-sign">{isProfit ? '+' : ''}</span>
            <span className="ticker-value">{displayValue.toLocaleString()}</span>
            <span className="ticker-suffix">{suffix}</span>
        </div>
    );
};

export default ProfitTicker;

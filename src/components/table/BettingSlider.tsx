/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  BETTING SLIDER — Amount Selection Widget
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useCallback } from 'react';
import './BettingSlider.css';

interface BettingSliderProps {
    min: number;
    max: number;
    step?: number;
    bigBlind: number;
    pot: number;
    defaultValue?: number;
    onChange: (amount: number) => void;
}

export function BettingSlider({
    min,
    max,
    step = 1,
    bigBlind,
    pot,
    defaultValue,
    onChange
}: BettingSliderProps) {
    const [value, setValue] = useState(defaultValue || min);

    const handleChange = useCallback((newValue: number) => {
        const clamped = Math.max(min, Math.min(max, newValue));
        setValue(clamped);
        onChange(clamped);
    }, [min, max, onChange]);

    const presets = [
        { label: 'Min', value: min },
        { label: '½ Pot', value: Math.round(pot * 0.5) },
        { label: '¾ Pot', value: Math.round(pot * 0.75) },
        { label: 'Pot', value: pot },
        { label: 'Max', value: max }
    ].filter(p => p.value >= min && p.value <= max);

    return (
        <div className="betting-slider">
            <div className="slider-header">
                <span className="current-value">{value.toLocaleString()}</span>
                <span className="in-bbs">{(value / bigBlind).toFixed(1)} BB</span>
            </div>

            <div className="slider-track">
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={e => handleChange(Number(e.target.value))}
                />
                <div
                    className="slider-fill"
                    style={{ width: `${((value - min) / (max - min)) * 100}%` }}
                />
            </div>

            <div className="slider-presets">
                {presets.map(preset => (
                    <button
                        key={preset.label}
                        className={value === preset.value ? 'active' : ''}
                        onClick={() => handleChange(preset.value)}
                    >
                        {preset.label}
                    </button>
                ))}
            </div>

            <div className="slider-manual">
                <button onClick={() => handleChange(value - bigBlind)}>-BB</button>
                <input
                    type="number"
                    value={value}
                    onChange={e => handleChange(Number(e.target.value))}
                    min={min}
                    max={max}
                />
                <button onClick={() => handleChange(value + bigBlind)}>+BB</button>
            </div>
        </div>
    );
}

export default BettingSlider;

/**
 * ♠ CLUB ARENA — Table Lobby Filters
 * Advanced filtering for finding the perfect table
 */

import React, { useState, useEffect } from 'react';
import './TableFilters.css';

interface FilterOptions {
    gameType: ('NLH' | 'PLO' | 'PLO5' | 'OFC')[];
    stakesRange: [number, number];
    maxPlayers: (6 | 9)[];
    tableSpeed: ('normal' | 'turbo' | 'hyper')[];
    features: {
        straddle: boolean;
        runItTwice: boolean;
        bombPot: boolean;
        anonymous: boolean;
    };
    availability: 'all' | 'seats' | 'waiting';
}

interface TableFiltersProps {
    filters: FilterOptions;
    onChange: (filters: FilterOptions) => void;
    onApply: () => void;
    onReset: () => void;
    tableCount?: number;
}

const defaultFilters: FilterOptions = {
    gameType: [],
    stakesRange: [0, 1000],
    maxPlayers: [],
    tableSpeed: [],
    features: {
        straddle: false,
        runItTwice: false,
        bombPot: false,
        anonymous: false,
    },
    availability: 'all',
};

export const TableFilters: React.FC<TableFiltersProps> = ({
    filters,
    onChange,
    onApply,
    onReset,
    tableCount,
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [localFilters, setLocalFilters] = useState(filters);

    const gameTypes = [
        { id: 'NLH', label: 'NL Hold\'em' },
        { id: 'PLO', label: 'PLO' },
        { id: 'PLO5', label: 'PLO5' },
        { id: 'OFC', label: 'OFC' },
    ];

    const speeds = [
        { id: 'normal', label: 'Normal', icon: '⏱️' },
        { id: 'turbo', label: 'Turbo', icon: '⚡' },
        { id: 'hyper', label: 'Hyper', icon: '🚀' },
    ];

    const stakesPresets = [
        { label: 'Micro', range: [0, 10] as [number, number] },
        { label: 'Low', range: [10, 50] as [number, number] },
        { label: 'Mid', range: [50, 200] as [number, number] },
        { label: 'High', range: [200, 1000] as [number, number] },
    ];

    const toggleGameType = (type: 'NLH' | 'PLO' | 'PLO5' | 'OFC') => {
        const newTypes = localFilters.gameType.includes(type)
            ? localFilters.gameType.filter(t => t !== type)
            : [...localFilters.gameType, type];
        setLocalFilters({ ...localFilters, gameType: newTypes });
    };

    const toggleSpeed = (speed: 'normal' | 'turbo' | 'hyper') => {
        const newSpeeds = localFilters.tableSpeed.includes(speed)
            ? localFilters.tableSpeed.filter(s => s !== speed)
            : [...localFilters.tableSpeed, speed];
        setLocalFilters({ ...localFilters, tableSpeed: newSpeeds });
    };

    const toggleMaxPlayers = (max: 6 | 9) => {
        const newMax = localFilters.maxPlayers.includes(max)
            ? localFilters.maxPlayers.filter(m => m !== max)
            : [...localFilters.maxPlayers, max];
        setLocalFilters({ ...localFilters, maxPlayers: newMax });
    };

    const toggleFeature = (feature: keyof FilterOptions['features']) => {
        setLocalFilters({
            ...localFilters,
            features: {
                ...localFilters.features,
                [feature]: !localFilters.features[feature],
            },
        });
    };

    const handleApply = () => {
        onChange(localFilters);
        onApply();
        setIsExpanded(false);
    };

    const handleReset = () => {
        setLocalFilters(defaultFilters);
        onChange(defaultFilters);
        onReset();
    };

    const activeFilterCount = [
        localFilters.gameType.length > 0,
        localFilters.stakesRange[0] > 0 || localFilters.stakesRange[1] < 1000,
        localFilters.maxPlayers.length > 0,
        localFilters.tableSpeed.length > 0,
        Object.values(localFilters.features).some(v => v),
        localFilters.availability !== 'all',
    ].filter(Boolean).length;

    return (
        <div className="table-filters">
            {/* Filter Toggle Button */}
            <button
                className={`filter-toggle ${activeFilterCount > 0 ? 'active' : ''}`}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className="filter-icon">⚙</span>
                <span>Filters</span>
                {activeFilterCount > 0 && (
                    <span className="filter-badge">{activeFilterCount}</span>
                )}
            </button>

            {/* Expanded Panel */}
            {isExpanded && (
                <div className="filters-panel">
                    {/* Game Type */}
                    <div className="filter-section">
                        <h4>Game Type</h4>
                        <div className="filter-chips">
                            {gameTypes.map(type => (
                                <button
                                    key={type.id}
                                    className={`filter-chip ${localFilters.gameType.includes(type.id as 'NLH' | 'PLO' | 'PLO5' | 'OFC') ? 'active' : ''}`}
                                    onClick={() => toggleGameType(type.id as 'NLH' | 'PLO' | 'PLO5' | 'OFC')}
                                >
                                    {type.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Stakes */}
                    <div className="filter-section">
                        <h4>Stakes</h4>
                        <div className="filter-chips">
                            {stakesPresets.map(preset => (
                                <button
                                    key={preset.label}
                                    className={`filter-chip ${localFilters.stakesRange[0] === preset.range[0] &&
                                            localFilters.stakesRange[1] === preset.range[1]
                                            ? 'active'
                                            : ''
                                        }`}
                                    onClick={() => setLocalFilters({ ...localFilters, stakesRange: preset.range })}
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Table Size */}
                    <div className="filter-section">
                        <h4>Table Size</h4>
                        <div className="filter-chips">
                            <button
                                className={`filter-chip ${localFilters.maxPlayers.includes(6) ? 'active' : ''}`}
                                onClick={() => toggleMaxPlayers(6)}
                            >
                                6-Max
                            </button>
                            <button
                                className={`filter-chip ${localFilters.maxPlayers.includes(9) ? 'active' : ''}`}
                                onClick={() => toggleMaxPlayers(9)}
                            >
                                9-Max
                            </button>
                        </div>
                    </div>

                    {/* Speed */}
                    <div className="filter-section">
                        <h4>Speed</h4>
                        <div className="filter-chips">
                            {speeds.map(speed => (
                                <button
                                    key={speed.id}
                                    className={`filter-chip ${localFilters.tableSpeed.includes(speed.id as 'normal' | 'turbo' | 'hyper') ? 'active' : ''}`}
                                    onClick={() => toggleSpeed(speed.id as 'normal' | 'turbo' | 'hyper')}
                                >
                                    {speed.icon} {speed.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Features */}
                    <div className="filter-section">
                        <h4>Features</h4>
                        <div className="feature-toggles">
                            {(['straddle', 'runItTwice', 'bombPot', 'anonymous'] as const).map(feature => (
                                <label key={feature} className="feature-toggle">
                                    <input
                                        type="checkbox"
                                        checked={localFilters.features[feature]}
                                        onChange={() => toggleFeature(feature)}
                                    />
                                    <span className="toggle-label">
                                        {feature === 'runItTwice' ? 'Run It Twice' :
                                            feature === 'bombPot' ? 'Bomb Pot' :
                                                feature.charAt(0).toUpperCase() + feature.slice(1)}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Availability */}
                    <div className="filter-section">
                        <h4>Availability</h4>
                        <div className="filter-chips">
                            {[
                                { id: 'all', label: 'All Tables' },
                                { id: 'seats', label: 'Open Seats' },
                                { id: 'waiting', label: 'Waitlist' },
                            ].map(opt => (
                                <button
                                    key={opt.id}
                                    className={`filter-chip ${localFilters.availability === opt.id ? 'active' : ''}`}
                                    onClick={() => setLocalFilters({ ...localFilters, availability: opt.id as 'all' | 'seats' | 'waiting' })}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="filter-actions">
                        <button className="btn-reset" onClick={handleReset}>
                            Reset
                        </button>
                        <button className="btn-apply" onClick={handleApply}>
                            Apply {tableCount !== undefined && `(${tableCount} tables)`}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TableFilters;

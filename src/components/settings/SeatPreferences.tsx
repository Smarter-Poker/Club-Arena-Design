/**
 * ♠ CLUB ARENA — Seat Preferences
 * Save and apply preferred seats at tables
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../stores/useUserStore';
import { useToast } from '../common/Toast';
import './SeatPreferences.css';

interface SeatPreference {
    tableSize: 6 | 9;
    preferredSeats: number[];
    autoSeat: boolean;
    avoidSeats: number[];
}

interface SeatPreferencesProps {
    onClose?: () => void;
    onSave?: (prefs: SeatPreference) => void;
}

export const SeatPreferences: React.FC<SeatPreferencesProps> = ({
    onClose,
    onSave,
}) => {
    const { user } = useUserStore();
    const toast = useToast();
    const [tableSize, setTableSize] = useState<6 | 9>(9);
    const [preferredSeats, setPreferredSeats] = useState<number[]>([]);
    const [avoidSeats, setAvoidSeats] = useState<number[]>([]);
    const [autoSeat, setAutoSeat] = useState(true);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadPreferences();
    }, [user?.id]);

    const loadPreferences = async () => {
        if (!user?.id) return;

        try {
            const saved = localStorage.getItem('seatPreferences');
            if (saved) {
                const prefs = JSON.parse(saved);
                setTableSize(prefs.tableSize || 9);
                setPreferredSeats(prefs.preferredSeats || []);
                setAvoidSeats(prefs.avoidSeats || []);
                setAutoSeat(prefs.autoSeat ?? true);
            }
        } catch (error) {
            console.error('Failed to load preferences:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSeatClick = (seat: number, type: 'prefer' | 'avoid') => {
        if (type === 'prefer') {
            // Remove from avoid if present
            setAvoidSeats(prev => prev.filter(s => s !== seat));
            // Toggle in preferred
            setPreferredSeats(prev =>
                prev.includes(seat) ? prev.filter(s => s !== seat) : [...prev, seat]
            );
        } else {
            // Remove from preferred if present
            setPreferredSeats(prev => prev.filter(s => s !== seat));
            // Toggle in avoid
            setAvoidSeats(prev =>
                prev.includes(seat) ? prev.filter(s => s !== seat) : [...prev, seat]
            );
        }
    };

    const handleSave = async () => {
        const prefs: SeatPreference = {
            tableSize,
            preferredSeats,
            avoidSeats,
            autoSeat,
        };

        try {
            localStorage.setItem('seatPreferences', JSON.stringify(prefs));
            toast.success('Seat preferences saved!');
            onSave?.(prefs);
            onClose?.();
        } catch (error) {
            console.error('Failed to save preferences:', error);
            toast.error('Failed to save preferences');
        }
    };

    const getSeatPosition = (seat: number, total: number) => {
        const angle = (seat / total) * 2 * Math.PI - Math.PI / 2;
        const radiusX = 42;
        const radiusY = 35;
        return {
            left: `${50 + radiusX * Math.cos(angle)}%`,
            top: `${50 + radiusY * Math.sin(angle)}%`,
        };
    };

    const getSeatStatus = (seat: number) => {
        if (preferredSeats.includes(seat)) return 'preferred';
        if (avoidSeats.includes(seat)) return 'avoid';
        return 'neutral';
    };

    const seats = Array.from({ length: tableSize }, (_, i) => i + 1);

    if (loading) {
        return (
            <div className="seat-preferences loading">
                <div className="spinner" />
            </div>
        );
    }

    return (
        <div className="seat-preferences">
            <div className="prefs-header">
                <h2>🪑 Seat Preferences</h2>
                {onClose && <button className="close-btn" onClick={onClose}>✕</button>}
            </div>

            {/* Table Size Toggle */}
            <div className="table-size-toggle">
                <button
                    className={tableSize === 6 ? 'active' : ''}
                    onClick={() => setTableSize(6)}
                >
                    6-Max
                </button>
                <button
                    className={tableSize === 9 ? 'active' : ''}
                    onClick={() => setTableSize(9)}
                >
                    9-Max
                </button>
            </div>

            {/* Table Visualization */}
            <div className="table-visual">
                <div className="table-felt" />
                {seats.map(seat => {
                    const pos = getSeatPosition(seat - 1, tableSize);
                    const status = getSeatStatus(seat);
                    return (
                        <div
                            key={seat}
                            className={`seat-marker ${status}`}
                            style={pos}
                        >
                            <div className="seat-actions">
                                <button
                                    className={`action-btn prefer ${status === 'preferred' ? 'active' : ''}`}
                                    onClick={() => handleSeatClick(seat, 'prefer')}
                                    title="Mark as preferred"
                                >
                                    ★
                                </button>
                                <span className="seat-number">{seat}</span>
                                <button
                                    className={`action-btn avoid ${status === 'avoid' ? 'active' : ''}`}
                                    onClick={() => handleSeatClick(seat, 'avoid')}
                                    title="Mark to avoid"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Legend */}
            <div className="legend">
                <span className="legend-item preferred">★ Preferred</span>
                <span className="legend-item avoid">✕ Avoid</span>
                <span className="legend-item neutral">○ Neutral</span>
            </div>

            {/* Auto-seat Toggle */}
            <label className="auto-seat-toggle">
                <input
                    type="checkbox"
                    checked={autoSeat}
                    onChange={(e) => setAutoSeat(e.target.checked)}
                />
                <span>Auto-seat me in preferred position when available</span>
            </label>

            {/* Selected Summary */}
            <div className="selection-summary">
                {preferredSeats.length > 0 && (
                    <p>Preferred: Seats {preferredSeats.sort((a, b) => a - b).join(', ')}</p>
                )}
                {avoidSeats.length > 0 && (
                    <p>Avoid: Seats {avoidSeats.sort((a, b) => a - b).join(', ')}</p>
                )}
            </div>

            {/* Save Button */}
            <button className="save-btn" onClick={handleSave}>
                Save Preferences
            </button>
        </div>
    );
};

export default SeatPreferences;

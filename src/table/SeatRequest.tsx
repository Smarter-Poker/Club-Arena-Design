/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🪑 SEAT REQUEST — Request Specific Seat
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React from 'react';
import './SeatRequest.css';

interface SeatRequestProps {
    availableSeats: number[];
    onSelect: (seat: number) => void;
    totalSeats?: number;
}

export function SeatRequest({ availableSeats, onSelect, totalSeats = 9 }: SeatRequestProps) {
    return (
        <div className="seat-request">
            <h4>🪑 Select a Seat</h4>
            <div className="seats-grid">
                {Array.from({ length: totalSeats }, (_, i) => i + 1).map(seat => {
                    const isAvailable = availableSeats.includes(seat);
                    return (
                        <button
                            key={seat}
                            className={`seat ${isAvailable ? 'available' : 'taken'}`}
                            onClick={() => isAvailable && onSelect(seat)}
                            disabled={!isAvailable}
                        >
                            {seat}
                        </button>
                    );
                })}
            </div>
            <p className="hint">Green = Available, Gray = Taken</p>
        </div>
    );
}

export default SeatRequest;

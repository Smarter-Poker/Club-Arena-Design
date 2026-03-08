/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  TOURNAMENT PAYOUT STRUCTURE — Display Prize Distribution
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React from 'react';
import './PayoutStructure.css';

interface PayoutStructureProps {
    totalPrize: number;
    entries: number;
    payouts: PayoutSlot[];
    currency?: string;
}

export interface PayoutSlot {
    position: number | string;
    percentage: number;
    amount: number;
    isGuaranteed?: boolean;
}

export function PayoutStructure({
    totalPrize,
    entries,
    payouts,
    currency = ''
}: PayoutStructureProps) {
    const paidPlaces = payouts.length;
    const inTheMoney = entries > 0 ? Math.trunc((paidPlaces / entries) * 1000) / 10 : 0;

    return (
        <div className="payout-structure">
            <div className="payout-structure__header">
                <div className="prize-info">
                    <span className="total-prize">
                        {currency} {totalPrize.toLocaleString()}
                    </span>
                    <span className="label">Prize Pool</span>
                </div>
                <div className="entries-info">
                    <span className="entries">{entries}</span>
                    <span className="label">Entries</span>
                </div>
                <div className="itm-info">
                    <span className="itm">{paidPlaces}</span>
                    <span className="label">Paid ({inTheMoney}%)</span>
                </div>
            </div>

            <div className="payout-structure__table">
                {payouts.map((payout, idx) => (
                    <div
                        key={idx}
                        className={`payout-row ${idx === 0 ? 'first' : ''} ${idx === 1 ? 'second' : ''} ${idx === 2 ? 'third' : ''}`}
                    >
                        <span className="position">
                            {typeof payout.position === 'number'
                                ? `#${payout.position}`
                                : payout.position
                            }
                        </span>
                        <div className="bar-container">
                            <div
                                className="bar"
                                style={{ width: `${payout.percentage * 2}%` }}
                            />
                        </div>
                        <span className="percentage">{Math.trunc(payout.percentage * 10) / 10}%</span>
                        <span className="amount">
                            {payout.amount.toLocaleString()}
                            {payout.isGuaranteed && <span className="gtd">GTD</span>}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default PayoutStructure;

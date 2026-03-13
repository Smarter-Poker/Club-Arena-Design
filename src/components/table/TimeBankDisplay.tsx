/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  TIME BANK DISPLAY — Shows Remaining Time Bank with VIP Limits
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React from 'react';
import { VIP_GOLD_LIMITS, FEATURE_PRICING } from '../../services/VIPService';
import './TimeBankDisplay.css';

interface TimeBankDisplayProps {
  remainingSeconds: number;
  isVIP: boolean;
  isActive: boolean;
  onBuyMore?: () => void;
}

export function TimeBankDisplay({
  remainingSeconds,
  isVIP,
  isActive,
  onBuyMore,
}: TimeBankDisplayProps) {
  const maxSeconds = isVIP ? VIP_GOLD_LIMITS.timeBankSeconds : 30;
  const percentage = Math.min(100, (remainingSeconds / maxSeconds) * 100);
  const isLow = percentage < 25;

  return (
    <div className={`time-bank ${isActive ? 'active' : ''} ${isLow ? 'low' : ''}`}>
      <div className="time-bank__header">
        <span className="time-bank__icon"></span>
        <span className="time-bank__label">Time Bank</span>
        {isVIP && <span className="time-bank__vip"></span>}
      </div>

      <div className="time-bank__bar">
        <div className="time-bank__fill" style={{ width: `${percentage}%` }} />
      </div>

      <div className="time-bank__info">
        <span className="time-bank__seconds">{remainingSeconds}s</span>
        {!isVIP && remainingSeconds < 10 && onBuyMore && (
          <button className="time-bank__buy" onClick={onBuyMore}>
            +Extension ({FEATURE_PRICING.time_bank_seconds.cost}💎)
          </button>
        )}
      </div>
    </div>
  );
}

export default TimeBankDisplay;

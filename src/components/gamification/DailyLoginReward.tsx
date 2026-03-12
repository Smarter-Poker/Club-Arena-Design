/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  DAILY LOGIN REWARD — Full-screen animated reward reveal
 * ═══════════════════════════════════════════════════════════════════════════════
 * Card flip animation revealing diamond/chip reward on first daily visit.
 * "Claim" button with haptic + particle burst.
 */

import { useState, useCallback } from 'react';
import './DailyLoginReward.css';

interface DailyLoginRewardProps {
  /** Reward amount */
  amount: number;
  /** Type of reward */
  rewardType: 'diamonds' | 'chips';
  /** Current streak day */
  streakDay: number;
  /** Called when claimed */
  onClaim: () => void;
  /** Called when dismissed */
  onClose: () => void;
}

// Haptic
const haptic = (ms: number | number[] = 10) => {
  try {
    navigator?.vibrate?.(ms);
  } catch {
    /* silent */
  }
};

export default function DailyLoginReward({
  amount,
  rewardType,
  streakDay,
  onClaim,
  onClose,
}: DailyLoginRewardProps) {
  const [revealed, setRevealed] = useState(false);
  const [claimed, setClaimed] = useState(false);

  const handleReveal = useCallback(() => {
    haptic(15);
    setRevealed(true);
  }, []);

  const handleClaim = useCallback(() => {
    haptic([20, 100, 20]);
    setClaimed(true);
    onClaim();
    // Auto-close after celebration
    setTimeout(onClose, 1800);
  }, [onClaim, onClose]);

  const icon = rewardType === 'diamonds' ? '💎' : '🪙';

  return (
    <div className="dlr-overlay" onClick={!claimed ? undefined : onClose}>
      <div className="dlr-container" onClick={(e) => e.stopPropagation()}>
        {/* Streak indicator */}
        <div className="dlr-streak">
          <span className="dlr-streak-fire">🔥</span>
          <span className="dlr-streak-text">Day {streakDay} Streak</span>
        </div>

        {/* Card */}
        <div
          className={`dlr-card ${revealed ? 'flipped' : ''} ${claimed ? 'claimed' : ''}`}
          onClick={!revealed ? handleReveal : undefined}
        >
          {/* Front face */}
          <div className="dlr-card-front">
            <div className="dlr-card-pattern" />
            <span className="dlr-card-icon">🎁</span>
            <span className="dlr-card-prompt">Tap to Reveal</span>
          </div>

          {/* Back face — reward */}
          <div className="dlr-card-back">
            <span className="dlr-reward-icon">{icon}</span>
            <span className="dlr-reward-amount">+{amount.toLocaleString()}</span>
            <span className="dlr-reward-type">
              {rewardType === 'diamonds' ? 'Diamonds' : 'Chips'}
            </span>
          </div>
        </div>

        {/* Claim button */}
        {revealed && !claimed && (
          <button className="dlr-claim-btn" onClick={handleClaim}>
            ✨ Claim Reward
          </button>
        )}

        {/* Claimed celebration */}
        {claimed && (
          <div className="dlr-celebration">
            <span className="dlr-celebration-text">Claimed! 🎉</span>
          </div>
        )}

        {/* Close */}
        {!claimed && (
          <button className="dlr-close" onClick={onClose}>
            Skip
          </button>
        )}
      </div>
    </div>
  );
}

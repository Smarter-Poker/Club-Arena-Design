import React from 'react';
import './StreakCounter.css';

interface StreakCounterProps {
  currentStreak: number;
  longestStreak: number;
  lastLoginDate?: Date;
  streakBonus?: number;
}

export const StreakCounter: React.FC<StreakCounterProps> = ({
  currentStreak,
  longestStreak,
  lastLoginDate,
  streakBonus = 0,
}) => {
  const getMilestone = (streak: number): number => {
    if (streak >= 30) return 30;
    if (streak >= 14) return 14;
    if (streak >= 7) return 7;
    if (streak >= 3) return 3;
    return 0;
  };

  const getNextMilestone = (streak: number): number => {
    if (streak >= 30) return 0;
    if (streak >= 14) return 30;
    if (streak >= 7) return 14;
    if (streak >= 3) return 7;
    return 3;
  };

  const milestone = getMilestone(currentStreak);
  const nextMilestone = getNextMilestone(currentStreak);
  const progress = nextMilestone
    ? ((currentStreak - milestone) / (nextMilestone - milestone)) * 100
    : 100;

  return (
    <div className="streak-counter">
      <div className="streak-main">
        <div className="streak-flame"></div>
        <div className="streak-number">{currentStreak}</div>
        <div className="streak-label">Day Streak</div>
      </div>

      {nextMilestone > 0 && (
        <div className="streak-progress">
          <div className="milestone-bar">
            <div className="milestone-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="milestone-text">
            {nextMilestone - currentStreak} days to {nextMilestone}-day bonus!
          </span>
        </div>
      )}

      <div className="streak-stats">
        <div className="stat">
          <span className="stat-value">{longestStreak}</span>
          <span className="stat-label">Best Streak</span>
        </div>
        {streakBonus > 0 && (
          <div className="stat bonus">
            <span className="stat-value">+{streakBonus}%</span>
            <span className="stat-label">Bonus</span>
          </div>
        )}
      </div>

      {currentStreak >= 7 && (
        <div className="streak-badge">
          {currentStreak >= 30 ? ' Legend' : currentStreak >= 14 ? ' On Fire' : ' Dedicated'}
        </div>
      )}
    </div>
  );
};

export default StreakCounter;

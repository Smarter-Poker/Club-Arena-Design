import React, { useEffect, useState } from 'react';
import './WinSplash.css';

interface WinSplashProps {
  amount: number;
  handName?: string;
  isRoyalFlush?: boolean;
  onComplete?: () => void;
}

export const WinSplash: React.FC<WinSplashProps> = ({
  amount,
  handName,
  isRoyalFlush = false,
  onComplete,
}) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      onComplete?.();
    }, 2500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  if (!isVisible) return null;

  return (
    <div className={`win-splash ${isRoyalFlush ? 'royal-flush' : ''}`}>
      <div className="splash-content">
        {isRoyalFlush && <div className="crown"></div>}
        <div className="win-label">WINNER!</div>
        <div className="win-amount">+{amount.toLocaleString()}</div>
        {handName && <div className="hand-name">{handName}</div>}
      </div>
    </div>
  );
};

export default WinSplash;

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  BOMB POT OVERLAY — Dramatic announcement animation
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import { masterBus } from '../../core/MasterBus';
import './BombPotOverlay.css';

interface BombPotOverlayProps {
  tableId: string;
}

export const BombPotOverlay: React.FC<BombPotOverlayProps> = ({ tableId }) => {
  const [visible, setVisible] = useState(false);
  const [anteAmount, setAnteAmount] = useState(0);
  const [doubleBoard, setDoubleBoard] = useState(false);
  const [bbMultiplier, setBBMultiplier] = useState(0);

  useEffect(() => {
    const unsub = masterBus.subscribe('BOMB_POT_TRIGGERED', (event: any) => {
      const data = event?.payload;
      if (data?.tableId === tableId) {
        setAnteAmount(data.anteAmount || 0);
        setDoubleBoard(data.doubleBoard || false);
        setBBMultiplier(data.bbMultiplier || 0);
        setVisible(true);

        // Auto-hide after 4 seconds
        setTimeout(() => setVisible(false), 4000);
      }
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [tableId]);

  if (!visible) return null;

  return (
    <div className="bomb-pot-overlay">
      <div className="bpo-container">
        <div className="bpo-icon">💣</div>
        <div className="bpo-title">BOMB POT</div>
        <div className="bpo-subtitle">{doubleBoard ? 'DOUBLE BOARD' : 'ALL PLAYERS IN'}</div>
        <div className="bpo-ante">
          Everyone antes {anteAmount.toLocaleString()} ({bbMultiplier}x BB)
        </div>
        <div className="bpo-action">Skipping to the flop!</div>
      </div>
      <div className="bpo-particles">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="bpo-particle"
            style={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 0.5}s`,
              animationDuration: `${1 + Math.random()}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default BombPotOverlay;

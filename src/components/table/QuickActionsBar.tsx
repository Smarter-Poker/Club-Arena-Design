/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  QuickActionsBar — Floating Quick-Access Toolbar
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Compact glassmorphism pill bar above the action panel with commonly-used
 * table toggles. Eliminates deep menu diving for frequent operations.
 *
 * Buttons: Auto-Rebuy | Chat | Hand Strength | Stats | Sound | Settings
 */

import React, { useState, useCallback } from 'react';
import { haptic } from '../../services/SoundService';
import './QuickActionsBar.css';

export interface QuickActionsBarProps {
  isSoundEnabled: boolean;
  isChatVisible: boolean;
  isHandStrengthVisible: boolean;
  isStatsVisible: boolean;
  isAutoRebuyEnabled: boolean;
  onToggleSound: () => void;
  onToggleChat: () => void;
  onToggleHandStrength: () => void;
  onToggleStats: () => void;
  onToggleAutoRebuy: () => void;
  onOpenSettings: () => void;
}

interface QuickAction {
  id: string;
  icon: string;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

export function QuickActionsBar({
  isSoundEnabled,
  isChatVisible,
  isHandStrengthVisible,
  isStatsVisible,
  isAutoRebuyEnabled,
  onToggleSound,
  onToggleChat,
  onToggleHandStrength,
  onToggleStats,
  onToggleAutoRebuy,
  onOpenSettings,
}: QuickActionsBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleAction = useCallback((action: () => void) => {
    haptic.light();
    action();
  }, []);

  const actions: QuickAction[] = [
    {
      id: 'auto-rebuy',
      icon: '🎰',
      label: 'Auto-Rebuy',
      isActive: isAutoRebuyEnabled,
      onClick: () => handleAction(onToggleAutoRebuy),
    },
    {
      id: 'chat',
      icon: '💬',
      label: 'Chat',
      isActive: isChatVisible,
      onClick: () => handleAction(onToggleChat),
    },
    {
      id: 'hand-strength',
      icon: '🎯',
      label: 'Strength',
      isActive: isHandStrengthVisible,
      onClick: () => handleAction(onToggleHandStrength),
    },
    {
      id: 'stats',
      icon: '📊',
      label: 'Stats',
      isActive: isStatsVisible,
      onClick: () => handleAction(onToggleStats),
    },
    {
      id: 'sound',
      icon: isSoundEnabled ? '🔊' : '🔇',
      label: 'Sound',
      isActive: isSoundEnabled,
      onClick: () => handleAction(onToggleSound),
    },
    {
      id: 'settings',
      icon: '⚙️',
      label: 'Settings',
      isActive: false,
      onClick: () => handleAction(onOpenSettings),
    },
  ];

  // On mobile, show 3 visible + overflow button
  const visibleActions = isExpanded ? actions : actions.slice(0, 3);
  const hasOverflow = !isExpanded && actions.length > 3;

  return (
    <div className="quick-actions-bar" role="toolbar" aria-label="Quick actions">
      <div className="qab-pill">
        {visibleActions.map((action) => (
          <button
            key={action.id}
            className={`qab-btn ${action.isActive ? 'qab-btn--active' : ''}`}
            onClick={action.onClick}
            title={action.label}
            aria-pressed={action.isActive}
          >
            <span className="qab-btn__icon">{action.icon}</span>
            <span className="qab-btn__label">{action.label}</span>
          </button>
        ))}

        {hasOverflow && (
          <button
            className="qab-btn qab-btn--more"
            onClick={() => {
              haptic.light();
              setIsExpanded(true);
            }}
            title="More actions"
          >
            <span className="qab-btn__icon">•••</span>
          </button>
        )}

        {isExpanded && (
          <button
            className="qab-btn qab-btn--collapse"
            onClick={() => {
              haptic.light();
              setIsExpanded(false);
            }}
            title="Collapse"
          >
            <span className="qab-btn__icon">‹</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default QuickActionsBar;

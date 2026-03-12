/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  LOBBY GAME TABS — Icon+Text plate navigation for game type selection
 * ═══════════════════════════════════════════════════════════════════════════════
 * Replaces text-only tabs with rich icon-plate buttons with animated underline.
 */

import { useState, useRef, useEffect } from 'react';
import './LobbyGameTabs.css';

interface GameTab {
  id: string;
  icon: string;
  label: string;
}

interface LobbyGameTabsProps {
  tabs: GameTab[];
  activeTab: string;
  onChange: (id: string) => void;
}

const DEFAULT_TABS: GameTab[] = [
  { id: 'nlh', icon: '♠', label: "Hold'em" },
  { id: 'plo', icon: '🎴', label: 'Omaha' },
  { id: 'mtt', icon: '🏆', label: 'MTT' },
  { id: 'sng', icon: '⚡', label: 'SNG' },
];

export default function LobbyGameTabs({
  tabs = DEFAULT_TABS,
  activeTab,
  onChange,
}: LobbyGameTabsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  // Calculate animated underline position
  useEffect(() => {
    if (!containerRef.current) return;
    const activeBtn = containerRef.current.querySelector(
      `[data-tab-id="${activeTab}"]`
    ) as HTMLElement;
    if (activeBtn) {
      setIndicatorStyle({
        left: activeBtn.offsetLeft,
        width: activeBtn.offsetWidth,
      });
    }
  }, [activeTab, tabs]);

  return (
    <div className="lobby-game-tabs" ref={containerRef}>
      <div className="lgt-scroll">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            data-tab-id={tab.id}
            className={`lgt-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => onChange(tab.id)}
          >
            <span className="lgt-icon">{tab.icon}</span>
            <span className="lgt-label">{tab.label}</span>
          </button>
        ))}
      </div>
      {/* Animated underline indicator */}
      <div
        className="lgt-indicator"
        style={{
          left: indicatorStyle.left,
          width: indicatorStyle.width,
        }}
      />
    </div>
  );
}

export { DEFAULT_TABS };
export type { GameTab };

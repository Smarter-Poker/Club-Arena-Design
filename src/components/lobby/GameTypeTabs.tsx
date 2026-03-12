/**
 *  CLUB ENGINE — Game Type Tabs (Q3 Wave 2 Upgrade)
 * Visual icon+text "plates" with animated underline (WPT Global style)
 */

import { useRef, useEffect, useState } from 'react';
import { haptic } from '../../services/HapticService';
import styles from './GameTypeTabs.module.css';

type GameFilter = 'all' | 'nlh' | 'plo' | 'ofc' | 'tournaments' | 'favorites';

interface GameTypeTabsProps {
  activeFilter: GameFilter;
  onFilterChange: (filter: GameFilter) => void;
}

const TABS: { id: GameFilter; label: string; icon: string; subLabel?: string }[] = [
  { id: 'all', label: 'All', icon: '🎰', subLabel: 'Games' },
  { id: 'favorites', label: 'Favorites', icon: '⭐' },
  { id: 'nlh', label: "Hold'em", icon: '♠️' },
  { id: 'plo', label: 'Omaha', icon: '🃏' },
  { id: 'ofc', label: 'OFC', icon: '🀄' },
  { id: 'tournaments', label: 'MTT', icon: '🏆', subLabel: 'Tournaments' },
];

export default function GameTypeTabs({ activeFilter, onFilterChange }: GameTypeTabsProps) {
  const tabsRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  // Animate sliding underline indicator
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!tabsRef.current || !indicatorRef.current || !mounted) return;

    const activeTab = tabsRef.current.querySelector(`[data-id="${activeFilter}"]`) as HTMLElement;
    if (activeTab) {
      const { offsetLeft, offsetWidth } = activeTab;
      indicatorRef.current.style.transform = `translateX(${offsetLeft}px)`;
      indicatorRef.current.style.width = `${offsetWidth}px`;
    }
  }, [activeFilter, mounted]);

  const handleTabClick = (id: GameFilter) => {
    haptic.selection();
    onFilterChange(id);
  };

  return (
    <div className={styles.tabs} ref={tabsRef}>
      {TABS.map((tab, idx) => (
        <button
          key={tab.id}
          data-id={tab.id}
          className={`${styles.tab} ${activeFilter === tab.id ? styles.active : ''}`}
          onClick={() => handleTabClick(tab.id)}
          style={{
            animationDelay: `${idx * 60}ms`,
          }}
        >
          <span className={styles.tabIcon}>{tab.icon}</span>
          <span className={styles.tabLabel}>{tab.label}</span>
        </button>
      ))}
      {/* Sliding underline indicator */}
      <div ref={indicatorRef} className={styles.indicator} />
    </div>
  );
}

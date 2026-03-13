import React, { useState } from 'react';
import './ThemeSelector.css';

interface Theme {
  id: string;
  name: string;
  previewColors: string[];
  isVip?: boolean;
  isPremium?: boolean;
}

interface ThemeSelectorProps {
  currentTheme: string;
  userVipTier?: 'bronze' | 'silver' | 'gold' | null;
  onChange?: (themeId: string) => void;
}

const THEMES: Theme[] = [
  { id: 'classic', name: 'Classic', previewColors: ['#1a472a', '#0d2818', '#ffd700'] },
  { id: 'midnight', name: 'Midnight', previewColors: ['#0f172a', '#1e293b', '#60a5fa'] },
  { id: 'crimson', name: 'Crimson', previewColors: ['#450a0a', '#7f1d1d', '#fca5a5'] },
  { id: 'ocean', name: 'Ocean', previewColors: ['#0c4a6e', '#0369a1', '#7dd3fc'], isVip: true },
  { id: 'royal', name: 'Royal', previewColors: ['#3b0764', '#6b21a8', '#c084fc'], isVip: true },
  { id: 'sunset', name: 'Sunset', previewColors: ['#7c2d12', '#ea580c', '#fdba74'], isVip: true },
  { id: 'neon', name: 'Neon', previewColors: ['#0a0a0a', '#000', '#22d3ee'], isPremium: true },
  {
    id: 'gold',
    name: 'Gold Elite',
    previewColors: ['#292524', '#44403c', '#fbbf24'],
    isPremium: true,
  },
];

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  currentTheme,
  userVipTier,
  onChange,
}) => {
  const [selectedTheme, setSelectedTheme] = useState(currentTheme);

  const canUseTheme = (theme: Theme): boolean => {
    if (!theme.isVip && !theme.isPremium) return true;
    if (theme.isPremium && userVipTier === 'gold') return true;
    if (theme.isVip && userVipTier) return true;
    return false;
  };

  const handleSelect = (theme: Theme) => {
    if (canUseTheme(theme)) {
      setSelectedTheme(theme.id);
      onChange?.(theme.id);
    }
  };

  return (
    <div className="theme-selector">
      <h3>Table Theme</h3>
      <div className="themes-grid">
        {THEMES.map((theme) => {
          const isLocked = !canUseTheme(theme);
          const isSelected = selectedTheme === theme.id;

          return (
            <div
              key={theme.id}
              className={`theme-card ${isSelected ? 'selected' : ''} ${isLocked ? 'locked' : ''}`}
              onClick={() => handleSelect(theme)}
            >
              <div className="theme-preview">
                {theme.previewColors.map((color, i) => (
                  <div key={i} className="preview-color" style={{ background: color }} />
                ))}
              </div>
              <div className="theme-info">
                <span className="theme-name">{theme.name}</span>
                {theme.isPremium && <span className="theme-badge premium"> Gold</span>}
                {theme.isVip && !theme.isPremium && <span className="theme-badge vip"> VIP</span>}
              </div>
              {isLocked && <div className="lock-overlay"></div>}
              {isSelected && <div className="selected-check"></div>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ThemeSelector;

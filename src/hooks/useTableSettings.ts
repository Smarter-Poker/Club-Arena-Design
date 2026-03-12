import { useState, useEffect, useCallback } from 'react';
import { masterBus } from '../core/MasterBus';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * useTableSettings Hook
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Manages user preferences for poker table UI/UX including:
 * - Sound and haptic feedback control
 * - Animation speed adjustments
 * - Table appearance (theme, deck style)
 * - Display options (HUD, pot odds, hand strength)
 * - Gameplay preferences (auto-muck, confirm all-in, etc.)
 *
 * All settings are persisted to localStorage and automatically applied to the DOM.
 */

export interface TableUserSettings {
  isSoundEnabled: boolean;
  animationSpeed: number; // 0.5, 1, 1.5, 2
  theme: string; // 'green', 'blue', 'red', 'purple', etc.
  fourColorDeck: boolean;
  showHUD: boolean;
  showPotOdds: boolean;
  confirmAllIn: boolean;
  autoMuck: boolean;
  cardBack: string; // Card back design ID
  showStackInBB: boolean;
}

const DEFAULT_SETTINGS: TableUserSettings = {
  isSoundEnabled: true,
  animationSpeed: 1,
  theme: 'green',
  fourColorDeck: false,
  showHUD: true,
  showPotOdds: false,
  confirmAllIn: true,
  autoMuck: false,
  cardBack: 'black',
  showStackInBB: false,
};

const STORAGE_KEY = 'club-arena-table-settings';
const CSS_VAR_ANIMATION_SPEED = '--animation-speed';
const DOM_ATTR_THEME = 'data-theme';

export function useTableSettings() {
  // Load from localStorage on mount
  const [settings, setSettings] = useState<TableUserSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return {
          ...DEFAULT_SETTINGS,
          ...JSON.parse(saved),
        };
      }
      return DEFAULT_SETTINGS;
    } catch (error) {
      console.warn('Failed to load table settings from localStorage:', error);
      return DEFAULT_SETTINGS;
    }
  });

  // Persist settings to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.warn('Failed to save table settings to localStorage:', error);
    }
  }, [settings]);

  // Apply theme to DOM (data-theme attribute on root element)
  useEffect(() => {
    document.documentElement.setAttribute(DOM_ATTR_THEME, settings.theme);
  }, [settings.theme]);

  // Apply animation speed to DOM (CSS custom property)
  useEffect(() => {
    document.documentElement.style.setProperty(
      CSS_VAR_ANIMATION_SPEED,
      String(settings.animationSpeed)
    );
  }, [settings.animationSpeed]);

  // Listen for SETTINGS_CHANGED bus events (e.g. card back changes from CardBackSelector)
  useEffect(() => {
    const unsub = masterBus.subscribe('SETTINGS_CHANGED', (event) => {
      const { setting, value } = event.payload;
      if (setting === 'cardBack') {
        setSettings((prev) => ({ ...prev, cardBack: value }));
      }
    });
    return unsub;
  }, []);

  // Update a single setting by key
  const updateSetting = useCallback(
    <K extends keyof TableUserSettings>(key: K, value: TableUserSettings[K]) => {
      setSettings((prev) => ({
        ...prev,
        [key]: value,
      }));
    },
    []
  );

  // Reset all settings to defaults
  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  // Bulk update multiple settings at once
  const updateSettings = useCallback((updates: Partial<TableUserSettings>) => {
    setSettings((prev) => ({
      ...prev,
      ...updates,
    }));
  }, []);

  return {
    settings,
    updateSetting,
    updateSettings,
    resetSettings,
  };
}

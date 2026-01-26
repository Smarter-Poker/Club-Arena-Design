/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 💾 STORAGE — Local Storage & Session Utilities
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════════
// LOCAL STORAGE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get item from localStorage with type safety
 */
export function getLocalStorage<T>(key: string, defaultValue: T): T {
    try {
        const item = localStorage.getItem(key);
        if (item === null) return defaultValue;
        return JSON.parse(item) as T;
    } catch {
        return defaultValue;
    }
}

/**
 * Set item in localStorage
 */
export function setLocalStorage<T>(key: string, value: T): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.warn('Failed to save to localStorage:', error);
    }
}

/**
 * Remove item from localStorage
 */
export function removeLocalStorage(key: string): void {
    try {
        localStorage.removeItem(key);
    } catch (error) {
        console.warn('Failed to remove from localStorage:', error);
    }
}

/**
 * Clear all localStorage
 */
export function clearLocalStorage(): void {
    try {
        localStorage.clear();
    } catch (error) {
        console.warn('Failed to clear localStorage:', error);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SESSION STORAGE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get item from sessionStorage with type safety
 */
export function getSessionStorage<T>(key: string, defaultValue: T): T {
    try {
        const item = sessionStorage.getItem(key);
        if (item === null) return defaultValue;
        return JSON.parse(item) as T;
    } catch {
        return defaultValue;
    }
}

/**
 * Set item in sessionStorage
 */
export function setSessionStorage<T>(key: string, value: T): void {
    try {
        sessionStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.warn('Failed to save to sessionStorage:', error);
    }
}

/**
 * Remove item from sessionStorage
 */
export function removeSessionStorage(key: string): void {
    try {
        sessionStorage.removeItem(key);
    } catch (error) {
        console.warn('Failed to remove from sessionStorage:', error);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STORAGE WITH EXPIRY
// ═══════════════════════════════════════════════════════════════════════════════

interface StoredWithExpiry<T> {
    value: T;
    expiry: number;
}

/**
 * Set item with expiration time
 */
export function setWithExpiry<T>(key: string, value: T, ttlMs: number): void {
    const item: StoredWithExpiry<T> = {
        value,
        expiry: Date.now() + ttlMs,
    };
    setLocalStorage(key, item);
}

/**
 * Get item with expiration check
 */
export function getWithExpiry<T>(key: string, defaultValue: T): T {
    const item = getLocalStorage<StoredWithExpiry<T> | null>(key, null);

    if (!item) return defaultValue;

    if (Date.now() > item.expiry) {
        removeLocalStorage(key);
        return defaultValue;
    }

    return item.value;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STORAGE KEYS (Centralized key management)
// ═══════════════════════════════════════════════════════════════════════════════

export const STORAGE_KEYS = {
    // Auth
    AUTH_TOKEN: 'club_arena_auth_token',
    REFRESH_TOKEN: 'club_arena_refresh_token',
    USER_PROFILE: 'club_arena_user_profile',

    // Preferences
    THEME: 'club_arena_theme',
    SOUND_ENABLED: 'club_arena_sound_enabled',
    NOTIFICATIONS_ENABLED: 'club_arena_notifications_enabled',
    LANGUAGE: 'club_arena_language',

    // Table Settings
    TABLE_THEME: 'club_arena_table_theme',
    CARD_STYLE: 'club_arena_card_style',
    AUTO_MUCK: 'club_arena_auto_muck',
    SHOW_BIG_BLINDS: 'club_arena_show_bbs',
    FOUR_COLOR_DECK: 'club_arena_four_color',

    // UI State
    SIDEBAR_COLLAPSED: 'club_arena_sidebar_collapsed',
    ACTIVE_CLUB_ID: 'club_arena_active_club',
    RECENT_TABLES: 'club_arena_recent_tables',

    // Cache
    LOBBY_CACHE: 'club_arena_lobby_cache',
    PLAYER_STATS_CACHE: 'club_arena_player_stats',
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// TYPED STORAGE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

export interface UserPreferences {
    theme: 'light' | 'dark' | 'system';
    soundEnabled: boolean;
    notificationsEnabled: boolean;
    language: string;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
    theme: 'dark',
    soundEnabled: true,
    notificationsEnabled: true,
    language: 'en',
};

/**
 * Get user preferences
 */
export function getPreferences(): UserPreferences {
    return {
        theme: getLocalStorage(STORAGE_KEYS.THEME, DEFAULT_PREFERENCES.theme),
        soundEnabled: getLocalStorage(STORAGE_KEYS.SOUND_ENABLED, DEFAULT_PREFERENCES.soundEnabled),
        notificationsEnabled: getLocalStorage(STORAGE_KEYS.NOTIFICATIONS_ENABLED, DEFAULT_PREFERENCES.notificationsEnabled),
        language: getLocalStorage(STORAGE_KEYS.LANGUAGE, DEFAULT_PREFERENCES.language),
    };
}

/**
 * Save user preferences
 */
export function savePreferences(prefs: Partial<UserPreferences>): void {
    if (prefs.theme !== undefined) {
        setLocalStorage(STORAGE_KEYS.THEME, prefs.theme);
    }
    if (prefs.soundEnabled !== undefined) {
        setLocalStorage(STORAGE_KEYS.SOUND_ENABLED, prefs.soundEnabled);
    }
    if (prefs.notificationsEnabled !== undefined) {
        setLocalStorage(STORAGE_KEYS.NOTIFICATIONS_ENABLED, prefs.notificationsEnabled);
    }
    if (prefs.language !== undefined) {
        setLocalStorage(STORAGE_KEYS.LANGUAGE, prefs.language);
    }
}

export interface TableSettings {
    tableTheme: string;
    cardStyle: string;
    autoMuck: boolean;
    showBigBlinds: boolean;
    fourColorDeck: boolean;
}

export const DEFAULT_TABLE_SETTINGS: TableSettings = {
    tableTheme: 'classic',
    cardStyle: 'default',
    autoMuck: true,
    showBigBlinds: false,
    fourColorDeck: false,
};

/**
 * Get table settings
 */
export function getTableSettings(): TableSettings {
    return {
        tableTheme: getLocalStorage(STORAGE_KEYS.TABLE_THEME, DEFAULT_TABLE_SETTINGS.tableTheme),
        cardStyle: getLocalStorage(STORAGE_KEYS.CARD_STYLE, DEFAULT_TABLE_SETTINGS.cardStyle),
        autoMuck: getLocalStorage(STORAGE_KEYS.AUTO_MUCK, DEFAULT_TABLE_SETTINGS.autoMuck),
        showBigBlinds: getLocalStorage(STORAGE_KEYS.SHOW_BIG_BLINDS, DEFAULT_TABLE_SETTINGS.showBigBlinds),
        fourColorDeck: getLocalStorage(STORAGE_KEYS.FOUR_COLOR_DECK, DEFAULT_TABLE_SETTINGS.fourColorDeck),
    };
}

/**
 * Save table settings
 */
export function saveTableSettings(settings: Partial<TableSettings>): void {
    if (settings.tableTheme !== undefined) {
        setLocalStorage(STORAGE_KEYS.TABLE_THEME, settings.tableTheme);
    }
    if (settings.cardStyle !== undefined) {
        setLocalStorage(STORAGE_KEYS.CARD_STYLE, settings.cardStyle);
    }
    if (settings.autoMuck !== undefined) {
        setLocalStorage(STORAGE_KEYS.AUTO_MUCK, settings.autoMuck);
    }
    if (settings.showBigBlinds !== undefined) {
        setLocalStorage(STORAGE_KEYS.SHOW_BIG_BLINDS, settings.showBigBlinds);
    }
    if (settings.fourColorDeck !== undefined) {
        setLocalStorage(STORAGE_KEYS.FOUR_COLOR_DECK, settings.fourColorDeck);
    }
}

/**
 * Add to recent tables list
 */
export function addRecentTable(tableId: string): void {
    const recent = getLocalStorage<string[]>(STORAGE_KEYS.RECENT_TABLES, []);
    const filtered = recent.filter((id) => id !== tableId);
    const updated = [tableId, ...filtered].slice(0, 10); // Keep last 10
    setLocalStorage(STORAGE_KEYS.RECENT_TABLES, updated);
}

/**
 * Get recent tables
 */
export function getRecentTables(): string[] {
    return getLocalStorage<string[]>(STORAGE_KEYS.RECENT_TABLES, []);
}

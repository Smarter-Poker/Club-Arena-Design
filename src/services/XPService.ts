/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  XP SERVICE — Player Experience & Leveling System
 *  Awards XP for gameplay actions, calculates levels, and emits bus events
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { supabase } from '../lib/supabase';
import { masterBus } from '../core/MasterBus';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type XPSource =
  | 'hand_played'
  | 'hand_won'
  | 'mission_completed'
  | 'wheel_spin'
  | 'daily_login'
  | 'referral'
  | 'achievement_unlocked';

export interface XPProgress {
  currentLevel: number;
  nextLevel: number;
  currentXP: number;
  xpForCurrentLevel: number;
  xpForNextLevel: number;
  progress: number; // 0-100
}

export interface XPLogEntry {
  id: string;
  amount: number;
  source: XPSource;
  createdAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// XP AWARD AMOUNTS
// ═══════════════════════════════════════════════════════════════════════════════

export const XP_AWARDS: Record<XPSource, number> = {
  hand_played: 2,
  hand_won: 5,
  mission_completed: 25,
  wheel_spin: 10,
  daily_login: 15,
  referral: 50,
  achievement_unlocked: 100,
};

// ═══════════════════════════════════════════════════════════════════════════════
// LEVEL THRESHOLDS
// ═══════════════════════════════════════════════════════════════════════════════

const LEVEL_THRESHOLDS: number[] = [
  0, // Level 1
  100, // Level 2
  250, // Level 3
  500, // Level 4
  1000, // Level 5
  1750, // Level 6
  2750, // Level 7
  4000, // Level 8
  5500, // Level 9
  7500, // Level 10
  10000, // Level 11
  13000, // Level 12
  16500, // Level 13
  20500, // Level 14
  25000, // Level 15
  30000, // Level 16
  36000, // Level 17
  43000, // Level 18
  51000, // Level 19
  60000, // Level 20
  70000, // Level 21
  81000, // Level 22
  93000, // Level 23
  106000, // Level 24
  120000, // Level 25
  135000, // Level 26
  151000, // Level 27
  168000, // Level 28
  186000, // Level 29
  205000, // Level 30
  230000, // Level 31
  260000, // Level 32
  295000, // Level 33
  335000, // Level 34
  380000, // Level 35
  430000, // Level 36
  485000, // Level 37
  545000, // Level 38
  610000, // Level 39
  680000, // Level 40
  760000, // Level 41
  850000, // Level 42
  950000, // Level 43
  1060000, // Level 44
  1180000, // Level 45
  1310000, // Level 46
  1450000, // Level 47
  1600000, // Level 48
  1760000, // Level 49
  1930000, // Level 50
];

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

class XPService {
  /**
   * Award XP to a player via server-side RPC
   */
  async awardXP(userId: string, source: XPSource): Promise<{ newTotal: number } | null> {
    const amount = XP_AWARDS[source];
    if (!amount || !userId) return null;

    try {
      const { data, error } = await supabase.rpc('award_player_xp', {
        p_user_id: userId,
        p_amount: amount,
        p_source: source,
      });

      if (error) {
        console.error('[XPService] Failed to award XP:', error);
        return null;
      }

      const newTotal = data?.new_total || 0;

      // Emit bus event for real-time UI updates
      masterBus.emit('XP_AWARDED', {
        userId,
        amount,
        source,
        newTotal,
      });

      return { newTotal };
    } catch (err) {
      console.error('[XPService] awardXP exception:', err);
      return null;
    }
  }

  /**
   * Get level from XP total
   */
  getLevel(xp: number): number {
    let level = 1;
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
      if (xp >= LEVEL_THRESHOLDS[i]) {
        level = i + 1;
        break;
      }
    }
    return level;
  }

  /**
   * Get XP progress toward next level
   */
  getXPProgress(xp: number): XPProgress {
    const currentLevel = this.getLevel(xp);
    const nextLevel = Math.min(currentLevel + 1, LEVEL_THRESHOLDS.length);
    const xpForCurrentLevel = LEVEL_THRESHOLDS[currentLevel - 1] || 0;
    const xpForNextLevel = LEVEL_THRESHOLDS[nextLevel - 1] || xpForCurrentLevel + 10000;

    const xpInLevel = xp - xpForCurrentLevel;
    const xpNeeded = xpForNextLevel - xpForCurrentLevel;
    const progress = xpNeeded > 0 ? Math.min(Math.round((xpInLevel / xpNeeded) * 100), 100) : 100;

    return {
      currentLevel,
      nextLevel,
      currentXP: xp,
      xpForCurrentLevel,
      xpForNextLevel,
      progress,
    };
  }

  /**
   * Get level tier color for badge display
   */
  getLevelTier(level: number): { name: string; color: string; glow: string } {
    if (level >= 50) return { name: 'Diamond', color: '#b9f2ff', glow: 'rgba(185, 242, 255, 0.5)' };
    if (level >= 30) return { name: 'Gold', color: '#ffd700', glow: 'rgba(255, 215, 0, 0.5)' };
    if (level >= 20) return { name: 'Purple', color: '#c084fc', glow: 'rgba(192, 132, 252, 0.5)' };
    if (level >= 10) return { name: 'Blue', color: '#60a5fa', glow: 'rgba(96, 165, 250, 0.5)' };
    return { name: 'Grey', color: '#94a3b8', glow: 'rgba(148, 163, 184, 0.3)' };
  }

  /**
   * Fetch recent XP log entries for a user
   */
  async getRecentXPLog(userId: string, limit = 20): Promise<XPLogEntry[]> {
    try {
      const { data, error } = await supabase
        .from('user_xp_log')
        .select('id, amount, source, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[XPService] Failed to fetch XP log:', error);
        return [];
      }

      return (data || []).map((row: any) => ({
        id: row.id,
        amount: row.amount,
        source: row.source as XPSource,
        createdAt: row.created_at,
      }));
    } catch (err) {
      console.error('[XPService] getRecentXPLog exception:', err);
      return [];
    }
  }
}

export const xpService = new XPService();

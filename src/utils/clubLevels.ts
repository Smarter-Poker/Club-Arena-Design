/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CLUB LEVELS SYSTEM (1-50 PokerBros Style)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Calculates a club's level based strictly on Database metrics derived from the Postgres RPC.
 * The system considers:
 *   - Player Count Thresholds
 *   - Hierarchy Units Thresholds (Admin/Manager = 1.0, Agent/SubAgent = 0.25)
 * The Club Level is strictly calculated server-side to prevent real-time downgrades.
 * The UI translates the current state integers into Progress Percentages.
 */

export type ClubTier =
  | 'starter'
  | 'small'
  | 'growing'
  | 'established'
  | 'large'
  | 'regional'
  | 'major'
  | 'network'
  | 'enterprise'
  | 'elite';

export interface ClubLevelInfo {
  level: number;
  tier: ClubTier;
  tierLabel: string;
  progressPercent: number;
  color: string;
  gradient: string;
}

export interface ClubLevelInput {
  level?: number;
  playerCount?: number;
  hierarchyUnits?: number;
  playerThresholdCurrent?: number;
  playerThresholdNext?: number;
  hierarchyThresholdCurrent?: number;
  hierarchyThresholdNext?: number;
  // Old fields for backward compatibility, optionally ignore
  memberCount?: number;
  activeTables?: number;
  tournamentsHosted?: number;
  totalHandsPlayed?: number;
  totalRakeGenerated?: number;
  isInUnion?: boolean;
  clubAgeDays?: number;
}

// 1-5   = Starter
// 6-10  = Small Club
// 11-15 = Growing Club
// 16-20 = Established
// 21-25 = Large Club
// 26-30 = Regional Operator
// 31-35 = Major Operator
// 36-40 = Network-Grade Club
// 41-45 = Enterprise Club
// 46-50 = Elite Network Operator

export function getTierForLevel(level: number): ClubTier {
  if (level >= 46) return 'elite';
  if (level >= 41) return 'enterprise';
  if (level >= 36) return 'network';
  if (level >= 31) return 'major';
  if (level >= 26) return 'regional';
  if (level >= 21) return 'large';
  if (level >= 16) return 'established';
  if (level >= 11) return 'growing';
  if (level >= 6) return 'small';
  return 'starter';
}

const TIER_LABELS: Record<ClubTier, string> = {
  starter: 'Starter',
  small: 'Small Club',
  growing: 'Growing Club',
  established: 'Established',
  large: 'Large Club',
  regional: 'Regional Operator',
  major: 'Major Operator',
  network: 'Network-Grade Club',
  enterprise: 'Enterprise Club',
  elite: 'Elite Network Operator',
};

const TIER_COLORS: Record<ClubTier, string> = {
  starter: '#CD7F32', // Bronze
  small: '#C0C0C0', // Silver
  growing: '#87CEEB', // Sky Blue
  established: '#4682B4', // Steel Blue
  large: '#FFD700', // Gold
  regional: '#FFA500', // Orange
  major: '#FF4500', // Red Orange
  network: '#8A2BE2', // Blue Violet
  enterprise: '#E5E4E2', // Platinum
  elite: '#00CED1', // Diamond/Cyan
};

const TIER_GRADIENTS: Record<ClubTier, string> = {
  starter: 'linear-gradient(135deg, #CD7F32 0%, #8B4513 100%)',
  small: 'linear-gradient(135deg, #C0C0C0 0%, #808080 100%)',
  growing: 'linear-gradient(135deg, #87CEEB 0%, #4682B4 100%)',
  established: 'linear-gradient(135deg, #4682B4 0%, #000080 100%)',
  large: 'linear-gradient(135deg, #FFD700 0%, #B8860B 100%)',
  regional: 'linear-gradient(135deg, #FFA500 0%, #FF8C00 100%)',
  major: 'linear-gradient(135deg, #FF4500 0%, #8B0000 100%)',
  network: 'linear-gradient(135deg, #8A2BE2 0%, #4B0082 100%)',
  enterprise: 'linear-gradient(135deg, #E5E4E2 0%, #A9A9A9 100%)',
  elite: 'linear-gradient(135deg, #B9F2FF 0%, #00CED1 100%)',
};

export function getClubLevel(input: ClubLevelInput): ClubLevelInfo {
  // If we receive the new database columns, map them
  const currentLvl = input.level || 1;
  const pCount = Math.max(input.playerCount || 0, input.memberCount || 0);

  // Calculate Progress Percent mathematically
  let progressPercent = 0;

  // Try to use DB thresholds
  if (input.playerThresholdNext && input.hierarchyThresholdNext) {
    const pT_curr = input.playerThresholdCurrent ?? 0;
    const pT_next = input.playerThresholdNext ?? 1;
    const hT_curr = input.hierarchyThresholdCurrent ?? 0;
    const hT_next = input.hierarchyThresholdNext ?? 1;

    const h_units = input.hierarchyUnits ?? 0;

    let p_prog = 0;
    if (pT_next > pT_curr) {
      p_prog = ((pCount - pT_curr) / (pT_next - pT_curr)) * 100;
    }

    let h_prog = 0;
    if (hT_next > hT_curr) {
      h_prog = ((h_units - hT_curr) / (hT_next - hT_curr)) * 100;
    }

    progressPercent = Math.max(0, Math.min(100, Math.floor(Math.max(p_prog, h_prog))));
  } else {
    // Fallback if thresholds aren't available yet
    // Provide a small artificial progress if we don't know the exact math boundaries yet
    progressPercent = Math.min(100, pCount % 30);
  }

  // Max Level Cap
  if (currentLvl >= 50) progressPercent = 100;

  const tier = getTierForLevel(currentLvl);

  return {
    level: currentLvl,
    tier,
    tierLabel: TIER_LABELS[tier],
    progressPercent,
    color: TIER_COLORS[tier],
    gradient: TIER_GRADIENTS[tier],
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CLUB LEVELS SYSTEM
 * ═══════════════════════════════════════════════════════════════════════════════
 * Calculates a club's level based on multiple growth factors:
 *   - Member count (biggest weight — community is king)
 *   - Active tables (shows engagement)
 *   - Tournaments hosted (activity breadth)
 *   - Total hands played (historical volume)
 *   - Rake generated (economic health)
 *   - Union membership (collaboration bonus)
 *
 * Levels: 1–100, grouped into tiers:
 *   1–10   Bronze Club
 *   11–25  Silver Club
 *   26–45  Gold Club
 *   46–65  Platinum Club
 *   66–85  Diamond Club
 *   86–100 Elite Club
 */

export interface ClubLevelInfo {
    level: number;
    tier: ClubTier;
    tierLabel: string;
    xp: number;
    xpForCurrentLevel: number;
    xpForNextLevel: number;
    progressPercent: number;
    color: string;
    gradient: string;
}

export type ClubTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'elite';

export interface ClubLevelInput {
    memberCount: number;
    activeTables: number;
    tournamentsHosted: number;
    totalHandsPlayed?: number;
    totalRakeGenerated?: number;
    isInUnion?: boolean;
    clubAgeDays?: number;
}

// XP thresholds per level — exponential curve
// Level 1 = 0 XP, Level 2 = 100 XP, scaling up
function xpForLevel(level: number): number {
    if (level <= 1) return 0;
    // Quadratic-ish curve: each level costs more
    return Math.floor(50 * Math.pow(level, 1.8));
}

function levelFromXp(xp: number): number {
    let level = 1;
    while (xpForLevel(level + 1) <= xp && level < 100) {
        level++;
    }
    return level;
}

function getTier(level: number): ClubTier {
    if (level >= 86) return 'elite';
    if (level >= 66) return 'diamond';
    if (level >= 46) return 'platinum';
    if (level >= 26) return 'gold';
    if (level >= 11) return 'silver';
    return 'bronze';
}

const TIER_LABELS: Record<ClubTier, string> = {
    bronze: 'Bronze Club',
    silver: 'Silver Club',
    gold: 'Gold Club',
    platinum: 'Platinum Club',
    diamond: 'Diamond Club',
    elite: 'Elite Club',
};

const TIER_COLORS: Record<ClubTier, string> = {
    bronze: '#CD7F32',
    silver: '#C0C0C0',
    gold: '#FFD700',
    platinum: '#E5E4E2',
    diamond: '#B9F2FF',
    elite: '#FF4500',
};

const TIER_GRADIENTS: Record<ClubTier, string> = {
    bronze: 'linear-gradient(135deg, #CD7F32 0%, #8B4513 100%)',
    silver: 'linear-gradient(135deg, #C0C0C0 0%, #808080 100%)',
    gold: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
    platinum: 'linear-gradient(135deg, #E5E4E2 0%, #A9A9A9 100%)',
    diamond: 'linear-gradient(135deg, #B9F2FF 0%, #00CED1 100%)',
    elite: 'linear-gradient(135deg, #FF4500 0%, #FF0000 50%, #FFD700 100%)',
};

/**
 * Calculate total club XP from input metrics.
 * Each factor contributes weighted XP:
 *   Members:      10 XP each (uncapped)
 *   Active tables: 50 XP each
 *   Tournaments:  30 XP each
 *   Hands played: 0.01 XP each (volume reward)
 *   Rake:         0.1 XP per unit generated
 *   Union bonus:  +15% multiplier
 *   Age bonus:    +1 XP per day (loyalty reward, max 365)
 */
export function calculateClubXp(input: ClubLevelInput): number {
    let xp = 0;

    // Members — strongest signal
    xp += (input.memberCount || 0) * 10;

    // Active tables — engagement
    xp += (input.activeTables || 0) * 50;

    // Tournaments hosted — breadth
    xp += (input.tournamentsHosted || 0) * 30;

    // Hands played — historical volume
    xp += Math.floor((input.totalHandsPlayed || 0) * 0.01);

    // Rake generated — economic health
    xp += Math.floor((input.totalRakeGenerated || 0) * 0.1);

    // Club age bonus (capped at 365 days)
    const ageDays = Math.min(input.clubAgeDays || 0, 365);
    xp += ageDays;

    // Union membership bonus — 15% boost
    if (input.isInUnion) {
        xp = Math.floor(xp * 1.15);
    }

    return xp;
}

/**
 * Get complete club level info from raw metrics.
 */
export function getClubLevel(input: ClubLevelInput): ClubLevelInfo {
    const xp = calculateClubXp(input);
    const level = levelFromXp(xp);
    const tier = getTier(level);

    const currentLevelXp = xpForLevel(level);
    const nextLevelXp = level < 100 ? xpForLevel(level + 1) : xpForLevel(100);
    const xpIntoLevel = xp - currentLevelXp;
    const xpNeeded = nextLevelXp - currentLevelXp;
    const progressPercent = xpNeeded > 0 ? Math.min(Math.floor((xpIntoLevel / xpNeeded) * 100), 100) : 100;

    return {
        level,
        tier,
        tierLabel: TIER_LABELS[tier],
        xp,
        xpForCurrentLevel: currentLevelXp,
        xpForNextLevel: nextLevelXp,
        progressPercent,
        color: TIER_COLORS[tier],
        gradient: TIER_GRADIENTS[tier],
    };
}

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
    points: number;
    pointsForCurrentLevel: number;
    pointsForNextLevel: number;
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

// Points thresholds per level — exponential curve
// Level 1 = 0 pts, Level 2 = 100 pts, scaling up
function pointsForLevel(level: number): number {
    if (level <= 1) return 0;
    // Quadratic-ish curve: each level costs more
    return Math.floor(50 * Math.pow(level, 1.8));
}

function levelFromPoints(pts: number): number {
    let level = 1;
    while (pointsForLevel(level + 1) <= pts && level < 100) {
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
 * Calculate total club points from input metrics.
 * Each factor contributes weighted points:
 *   Members:      10 pts each (uncapped)
 *   Active tables: 50 pts each
 *   Tournaments:  30 pts each
 *   Hands played: 0.01 pts each (volume reward)
 *   Rake:         0.1 pts per unit generated
 *   Union bonus:  +15% multiplier
 *   Age bonus:    +1 pt per day (loyalty reward, max 365)
 */
export function calculateClubPoints(input: ClubLevelInput): number {
    let pts = 0;

    // Members — strongest signal
    pts += (input.memberCount || 0) * 10;

    // Active tables — engagement
    pts += (input.activeTables || 0) * 50;

    // Tournaments hosted — breadth
    pts += (input.tournamentsHosted || 0) * 30;

    // Hands played — historical volume
    pts += Math.floor((input.totalHandsPlayed || 0) * 0.01);

    // Rake generated — economic health
    pts += Math.floor((input.totalRakeGenerated || 0) * 0.1);

    // Club age bonus (capped at 365 days)
    const ageDays = Math.min(input.clubAgeDays || 0, 365);
    pts += ageDays;

    // Union membership bonus — 15% boost
    if (input.isInUnion) {
        pts = Math.floor(pts * 1.15);
    }

    return pts;
}

/**
 * Get complete club level info from raw metrics.
 */
export function getClubLevel(input: ClubLevelInput): ClubLevelInfo {
    const pts = calculateClubPoints(input);
    const level = levelFromPoints(pts);
    const tier = getTier(level);

    const currentLevelPts = pointsForLevel(level);
    const nextLevelPts = level < 100 ? pointsForLevel(level + 1) : pointsForLevel(100);
    const ptsIntoLevel = pts - currentLevelPts;
    const ptsNeeded = nextLevelPts - currentLevelPts;
    const progressPercent = ptsNeeded > 0 ? Math.min(Math.floor((ptsIntoLevel / ptsNeeded) * 100), 100) : 100;

    return {
        level,
        tier,
        tierLabel: TIER_LABELS[tier],
        points: pts,
        pointsForCurrentLevel: currentLevelPts,
        pointsForNextLevel: nextLevelPts,
        progressPercent,
        color: TIER_COLORS[tier],
        gradient: TIER_GRADIENTS[tier],
    };
}

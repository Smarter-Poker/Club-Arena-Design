/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  GRIND REWARDS SERVICE — Rake race, tournament points, milestone tracking
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Features:
 * - Weekly Rake Race: track player rake contributions, rank, award diamonds
 * - Hands Played Race: track volume, rank, award prizes
 * - Tournament Points: series-style accumulation across events
 * - Milestone badges: "1000 Hands", "First Royal", "10 Tournament Wins"
 */

import { masterBus } from '../core/MasterBus';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface RakeRaceEntry {
  userId: string;
  displayName: string;
  avatarUrl: string;
  rakeContributed: number;
  rank: number;
  prizeAmount: number;
}

export interface TournamentPointEntry {
  userId: string;
  displayName: string;
  avatarUrl: string;
  points: number;
  tournamentsPlayed: number;
  averageFinish: number;
  rank: number;
}

export interface GrindMilestone {
  id: string;
  name: string;
  description: string;
  icon: string;
  requirement: number;
  category: 'hands' | 'wins' | 'tournaments' | 'achievement';
  rewardDiamonds: number;
}

export type GrindPeriod = 'daily' | 'weekly' | 'monthly' | 'all_time';

// ═══════════════════════════════════════════════════════════════════════════════
// MILESTONE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const MILESTONES: GrindMilestone[] = [
  // Hands played
  {
    id: 'hands_100',
    name: 'Card Shark',
    description: 'Play 100 hands',
    icon: '🃏',
    requirement: 100,
    category: 'hands',
    rewardDiamonds: 5,
  },
  {
    id: 'hands_500',
    name: 'Grinder',
    description: 'Play 500 hands',
    icon: '⚙️',
    requirement: 500,
    category: 'hands',
    rewardDiamonds: 15,
  },
  {
    id: 'hands_1000',
    name: 'Iron Player',
    description: 'Play 1,000 hands',
    icon: '🔩',
    requirement: 1000,
    category: 'hands',
    rewardDiamonds: 30,
  },
  {
    id: 'hands_5000',
    name: 'Titanium Grinder',
    description: 'Play 5,000 hands',
    icon: '💎',
    requirement: 5000,
    category: 'hands',
    rewardDiamonds: 100,
  },
  {
    id: 'hands_10000',
    name: 'Diamond Hands',
    description: 'Play 10,000 hands',
    icon: '💠',
    requirement: 10000,
    category: 'hands',
    rewardDiamonds: 250,
  },

  // Cash game wins
  {
    id: 'wins_10',
    name: 'Lucky Streak',
    description: 'Win 10 hands',
    icon: '🍀',
    requirement: 10,
    category: 'wins',
    rewardDiamonds: 5,
  },
  {
    id: 'wins_100',
    name: 'Consistent Winner',
    description: 'Win 100 hands',
    icon: '🏆',
    requirement: 100,
    category: 'wins',
    rewardDiamonds: 25,
  },
  {
    id: 'wins_500',
    name: 'Table Boss',
    description: 'Win 500 hands',
    icon: '👑',
    requirement: 500,
    category: 'wins',
    rewardDiamonds: 75,
  },

  // Tournament achievements
  {
    id: 'tourney_play_5',
    name: 'Tournament Rookie',
    description: 'Play 5 tournaments',
    icon: '🎫',
    requirement: 5,
    category: 'tournaments',
    rewardDiamonds: 10,
  },
  {
    id: 'tourney_play_25',
    name: 'Tournament Regular',
    description: 'Play 25 tournaments',
    icon: '🏅',
    requirement: 25,
    category: 'tournaments',
    rewardDiamonds: 50,
  },
  {
    id: 'tourney_win_1',
    name: 'First Blood',
    description: 'Win your first tournament',
    icon: '🥇',
    requirement: 1,
    category: 'tournaments',
    rewardDiamonds: 25,
  },
  {
    id: 'tourney_win_5',
    name: 'Serial Winner',
    description: 'Win 5 tournaments',
    icon: '🔥',
    requirement: 5,
    category: 'tournaments',
    rewardDiamonds: 100,
  },
  {
    id: 'tourney_win_10',
    name: 'Champion',
    description: 'Win 10 tournaments',
    icon: '🏆',
    requirement: 10,
    category: 'tournaments',
    rewardDiamonds: 250,
  },

  // Special achievements
  {
    id: 'royal_flush',
    name: 'Royal Flush',
    description: 'Hit a Royal Flush',
    icon: '👑',
    requirement: 1,
    category: 'achievement',
    rewardDiamonds: 50,
  },
  {
    id: 'bad_beat',
    name: 'Bad Beat Survivor',
    description: 'Lose with quads or better',
    icon: '💔',
    requirement: 1,
    category: 'achievement',
    rewardDiamonds: 15,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// RAKE RACE REWARD TIERS
// ═══════════════════════════════════════════════════════════════════════════════

const RAKE_RACE_REWARDS = [
  { rank: 1, diamonds: 500, label: '🥇 1st' },
  { rank: 2, diamonds: 300, label: '🥈 2nd' },
  { rank: 3, diamonds: 150, label: '🥉 3rd' },
  { rank: 4, diamonds: 75, label: '4th' },
  { rank: 5, diamonds: 50, label: '5th' },
  { rank: 10, diamonds: 25, label: '6-10th' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// TOURNAMENT POINTS FORMULA
// ═══════════════════════════════════════════════════════════════════════════════

const TOURNAMENT_POINT_FORMULAS = {
  /**
   * Calculate tournament points for a finishing position
   * Uses a logarithmic scale that rewards top finishes
   */
  calculatePoints(totalPlayers: number, finishPosition: number, buyIn: number): number {
    if (finishPosition < 1 || finishPosition > totalPlayers) return 0;

    // Base points from field size (sqrt scale)
    const fieldBonus = Math.sqrt(totalPlayers) * 10;

    // Position multiplier (exponential decay from 1st to last)
    const positionRatio = 1 - (finishPosition - 1) / totalPlayers;
    const positionMultiplier = Math.pow(positionRatio, 1.5);

    // Buy-in weight (log scale, so high buy-ins count but don't dominate)
    const buyInWeight = Math.max(1, Math.log10(buyIn + 1));

    // 1st place bonus
    const winBonus = finishPosition === 1 ? 20 : 0;

    // Final table bonus (top 9 or top 10%)
    const finalTableBonus = finishPosition <= Math.max(9, Math.ceil(totalPlayers * 0.1)) ? 10 : 0;

    return (
      Math.round(
        (fieldBonus * positionMultiplier * buyInWeight + winBonus + finalTableBonus) * 100
      ) / 100
    );
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// GRIND REWARDS SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

class GrindRewardsServiceClass {
  /**
   * Get all available milestones
   */
  getMilestones(): GrindMilestone[] {
    return MILESTONES;
  }

  /**
   * Check if a milestone is unlocked based on player stats
   */
  checkMilestone(milestone: GrindMilestone, currentValue: number): boolean {
    return currentValue >= milestone.requirement;
  }

  /**
   * Get rake race rewards for a given rank
   */
  getRakeRaceReward(rank: number): number {
    for (const tier of RAKE_RACE_REWARDS) {
      if (rank <= tier.rank) return tier.diamonds;
    }
    return 0; // Outside top 10
  }

  /**
   * Calculate tournament points for a player's finish
   */
  calculateTournamentPoints(totalPlayers: number, finishPosition: number, buyIn: number): number {
    return TOURNAMENT_POINT_FORMULAS.calculatePoints(totalPlayers, finishPosition, buyIn);
  }

  /**
   * Emit milestone unlocked event
   */
  emitMilestoneUnlocked(userId: string, milestone: GrindMilestone): void {
    masterBus.emit('MILESTONE_UNLOCKED', {
      userId,
      milestoneId: milestone.id,
      milestoneName: milestone.name,
      icon: milestone.icon,
      rewardDiamonds: milestone.rewardDiamonds,
    });
  }

  /**
   * Get the label for a rake race tier
   */
  getRakeRaceTiers(): typeof RAKE_RACE_REWARDS {
    return RAKE_RACE_REWARDS;
  }
}

export const grindRewardsService = new GrindRewardsServiceClass();
export default grindRewardsService;

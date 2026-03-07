/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  HORSE ORCHESTRATOR — Fleet-Wide Coordination Engine
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Manages 100 horses across ALL concurrent cash game tables, tournaments,
 * SNGs, and Spins. Produces real-time hand history data, validates
 * rake calculations, and verifies Supabase persistence.
 *
 * NOW POWERED BY: MIDWAY UNION (not Shark Club / JAQK Club)
 *
 * ARCHITECTURE:
 * - Each table runs its own HandController instance
 * - Horses are distributed across tables based on stake level
 * - Auto-rebuy keeps horses at 100 BB between hands
 * - Hand events persist to Supabase in real-time
 * - MasterBus broadcasts updates across all pages
 *
 * FULL COVERAGE:
 * - Cash Games: NLH, PLO4, PLO5, PLO8, OFC Pineapple — ALL stake levels
 * - Tournaments: Freezeout, Bounty, PKO, Mystery Bounty, Turbo, Freeroll
 * - SNGs: 6-Max Turbo, 9-Max — all game types
 * - Spins: 3-Max — all game types
 * - Weekly Schedule: Different tournaments each day with guarantees
 */

import { supabase } from '../lib/supabase';
import { HydraService } from './HydraService';
import { tournamentService } from './TournamentService';
import { RakeService } from './RakeService';
import { masterBus } from '../core/MasterBus';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface OrchestratorTable {
    tableId: string;
    name: string;
    smallBlind: number;
    bigBlind: number;
    maxPlayers: number;
    horseCount: number;
    handsPlayed: number;
    totalRake: number;
    totalBBJ: number;
    status: 'seeding' | 'running' | 'stopping' | 'stopped';
    errors: string[];
}

interface OrchestratorStats {
    totalHorses: number;
    totalTables: number;
    totalHandsPlayed: number;
    totalRakeCollected: number;
    totalBBJCollected: number;
    handsPerMinute: number;
    errors: string[];
    uptime: number;
    startedAt: string;
}

interface TableConfig {
    name: string;
    smallBlind: number;
    bigBlind: number;
    maxPlayers: number;
    horsesPerTable: number;
    gameVariant?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MIDWAY UNION — All cash games run through the union, NOT individual clubs
// ═══════════════════════════════════════════════════════════════════════════════

const MIDWAY_UNION = {
    name: 'Midway Union',
    description: 'The premier poker union — all stakes, all games, all action.',
    ownerId: '47965354-0e56-43ef-931c-ddaab82af765', // Dan's user ID
    isPublic: true,
    settings: {
        revenueSharePercent: 10,
        sharedPlayerPool: true,
        crossClubTournaments: true,
    },
};

// ═══════════════════════════════════════════════════════════════════════════════
// CASH GAME TABLE CONFIGURATIONS — EVERY STAKE LEVEL × EVERY GAME TYPE
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_TABLES: TableConfig[] = [
    // ─── NO LIMIT HOLD'EM (NLH) — Full Stake Ladder ─────────────────────────
    { name: 'NLH Micro 0.10/0.20',       smallBlind: 0.10, bigBlind: 0.20,  maxPlayers: 9, horsesPerTable: 8, gameVariant: 'nlh' },
    { name: 'NLH 0.25/0.50',             smallBlind: 0.25, bigBlind: 0.50,  maxPlayers: 9, horsesPerTable: 8, gameVariant: 'nlh' },
    { name: 'NLH 0.50/1.00',             smallBlind: 0.50, bigBlind: 1.00,  maxPlayers: 9, horsesPerTable: 8, gameVariant: 'nlh' },
    { name: 'NLH 1.00/2.00',             smallBlind: 1.00, bigBlind: 2.00,  maxPlayers: 9, horsesPerTable: 8, gameVariant: 'nlh' },
    { name: 'NLH 2.00/4.00',             smallBlind: 2.00, bigBlind: 4.00,  maxPlayers: 9, horsesPerTable: 8, gameVariant: 'nlh' },
    { name: 'NLH 2.00/5.00',             smallBlind: 2.00, bigBlind: 5.00,  maxPlayers: 9, horsesPerTable: 8, gameVariant: 'nlh' },
    { name: 'NLH 3.00/6.00',             smallBlind: 3.00, bigBlind: 6.00,  maxPlayers: 9, horsesPerTable: 8, gameVariant: 'nlh' },
    { name: 'NLH 5.00/10.00',            smallBlind: 5.00, bigBlind: 10.00, maxPlayers: 6, horsesPerTable: 6, gameVariant: 'nlh' },
    { name: 'NLH 10.00/25.00',           smallBlind: 10.0, bigBlind: 25.00, maxPlayers: 6, horsesPerTable: 6, gameVariant: 'nlh' },
    // 6-Max tables
    { name: 'NLH 6-Max 0.10/0.20',       smallBlind: 0.10, bigBlind: 0.20,  maxPlayers: 6, horsesPerTable: 6, gameVariant: 'nlh' },
    { name: 'NLH 6-Max 0.25/0.50',       smallBlind: 0.25, bigBlind: 0.50,  maxPlayers: 6, horsesPerTable: 6, gameVariant: 'nlh' },
    { name: 'NLH 6-Max 0.50/1.00',       smallBlind: 0.50, bigBlind: 1.00,  maxPlayers: 6, horsesPerTable: 6, gameVariant: 'nlh' },
    { name: 'NLH 6-Max 1.00/2.00',       smallBlind: 1.00, bigBlind: 2.00,  maxPlayers: 6, horsesPerTable: 6, gameVariant: 'nlh' },

    // ─── POT LIMIT OMAHA 4-CARD (PLO4) ──────────────────────────────────────
    { name: 'PLO4 0.10/0.20',            smallBlind: 0.10, bigBlind: 0.20,  maxPlayers: 9, horsesPerTable: 8, gameVariant: 'plo4' },
    { name: 'PLO4 0.25/0.50',            smallBlind: 0.25, bigBlind: 0.50,  maxPlayers: 9, horsesPerTable: 8, gameVariant: 'plo4' },
    { name: 'PLO4 0.50/1.00',            smallBlind: 0.50, bigBlind: 1.00,  maxPlayers: 9, horsesPerTable: 8, gameVariant: 'plo4' },
    { name: 'PLO4 1.00/2.00',            smallBlind: 1.00, bigBlind: 2.00,  maxPlayers: 6, horsesPerTable: 6, gameVariant: 'plo4' },
    { name: 'PLO4 2.00/5.00',            smallBlind: 2.00, bigBlind: 5.00,  maxPlayers: 6, horsesPerTable: 6, gameVariant: 'plo4' },
    { name: 'PLO4 5.00/10.00',           smallBlind: 5.00, bigBlind: 10.00, maxPlayers: 6, horsesPerTable: 6, gameVariant: 'plo4' },

    // ─── POT LIMIT OMAHA 5-CARD (PLO5) ──────────────────────────────────────
    { name: 'PLO5 0.25/0.50',            smallBlind: 0.25, bigBlind: 0.50,  maxPlayers: 6, horsesPerTable: 6, gameVariant: 'plo5' },
    { name: 'PLO5 0.50/1.00',            smallBlind: 0.50, bigBlind: 1.00,  maxPlayers: 6, horsesPerTable: 6, gameVariant: 'plo5' },
    { name: 'PLO5 1.00/2.00',            smallBlind: 1.00, bigBlind: 2.00,  maxPlayers: 6, horsesPerTable: 6, gameVariant: 'plo5' },
    { name: 'PLO5 2.00/5.00',            smallBlind: 2.00, bigBlind: 5.00,  maxPlayers: 6, horsesPerTable: 6, gameVariant: 'plo5' },

    // ─── POT LIMIT OMAHA 8 OR BETTER (PLO8 / Hi-Lo) ─────────────────────────
    { name: 'PLO8 0.25/0.50',            smallBlind: 0.25, bigBlind: 0.50,  maxPlayers: 9, horsesPerTable: 8, gameVariant: 'plo8' },
    { name: 'PLO8 0.50/1.00',            smallBlind: 0.50, bigBlind: 1.00,  maxPlayers: 9, horsesPerTable: 8, gameVariant: 'plo8' },
    { name: 'PLO8 1.00/2.00',            smallBlind: 1.00, bigBlind: 2.00,  maxPlayers: 9, horsesPerTable: 8, gameVariant: 'plo8' },
    { name: 'PLO8 2.00/5.00',            smallBlind: 2.00, bigBlind: 5.00,  maxPlayers: 6, horsesPerTable: 6, gameVariant: 'plo8' },

    // ─── OFC PINEAPPLE ──────────────────────────────────────────────────────
    { name: 'Pineapple 0.25/0.50',       smallBlind: 0.25, bigBlind: 0.50,  maxPlayers: 6, horsesPerTable: 6, gameVariant: 'ofc_pineapple' },
    { name: 'Pineapple 0.50/1.00',       smallBlind: 0.50, bigBlind: 1.00,  maxPlayers: 6, horsesPerTable: 6, gameVariant: 'ofc_pineapple' },
    { name: 'Pineapple 1.00/2.00',       smallBlind: 1.00, bigBlind: 2.00,  maxPlayers: 6, horsesPerTable: 6, gameVariant: 'ofc_pineapple' },

    // ─── SHORT DECK ─────────────────────────────────────────────────────────
    { name: 'Short Deck 0.50/1.00',      smallBlind: 0.50, bigBlind: 1.00,  maxPlayers: 6, horsesPerTable: 6, gameVariant: 'short_deck' },
    { name: 'Short Deck 1.00/2.00',      smallBlind: 1.00, bigBlind: 2.00,  maxPlayers: 6, horsesPerTable: 6, gameVariant: 'short_deck' },

    // ─── BOMB POT TABLES ────────────────────────────────────────────────────
    { name: 'Bomb Pot NLH 0.25/0.50',    smallBlind: 0.25, bigBlind: 0.50,  maxPlayers: 9, horsesPerTable: 8, gameVariant: 'nlh' },
    { name: 'Bomb Pot PLO4 0.50/1.00',   smallBlind: 0.50, bigBlind: 1.00,  maxPlayers: 9, horsesPerTable: 8, gameVariant: 'plo4' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// FULL WEEKLY TOURNAMENT SCHEDULE — Runs all week, horses populate everything
// ═══════════════════════════════════════════════════════════════════════════════

const STANDARD_BLIND_STRUCTURE_10_LVL = [
    { level: 1, smallBlind: 25,  bigBlind: 50,   ante: 0,   durationMinutes: 10 },
    { level: 2, smallBlind: 50,  bigBlind: 100,  ante: 10,  durationMinutes: 10 },
    { level: 3, smallBlind: 75,  bigBlind: 150,  ante: 15,  durationMinutes: 10 },
    { level: 4, smallBlind: 100, bigBlind: 200,  ante: 25,  durationMinutes: 8 },
    { level: 5, smallBlind: 150, bigBlind: 300,  ante: 30,  durationMinutes: 8 },
    { level: 6, smallBlind: 200, bigBlind: 400,  ante: 50,  durationMinutes: 8 },
    { level: 7, smallBlind: 300, bigBlind: 600,  ante: 60,  durationMinutes: 6 },
    { level: 8, smallBlind: 400, bigBlind: 800,  ante: 80,  durationMinutes: 6 },
    { level: 9, smallBlind: 500, bigBlind: 1000, ante: 100, durationMinutes: 5 },
    { level: 10, smallBlind: 750, bigBlind: 1500, ante: 150, durationMinutes: 5 },
];

const TURBO_BLIND_STRUCTURE = [
    { level: 1, smallBlind: 25,  bigBlind: 50,   ante: 5,  durationMinutes: 4 },
    { level: 2, smallBlind: 50,  bigBlind: 100,  ante: 10, durationMinutes: 4 },
    { level: 3, smallBlind: 100, bigBlind: 200,  ante: 20, durationMinutes: 3 },
    { level: 4, smallBlind: 150, bigBlind: 300,  ante: 30, durationMinutes: 3 },
    { level: 5, smallBlind: 200, bigBlind: 400,  ante: 50, durationMinutes: 3 },
    { level: 6, smallBlind: 300, bigBlind: 600,  ante: 75, durationMinutes: 2 },
    { level: 7, smallBlind: 500, bigBlind: 1000, ante: 100, durationMinutes: 2 },
    { level: 8, smallBlind: 750, bigBlind: 1500, ante: 150, durationMinutes: 2 },
];

const HYPER_TURBO_STRUCTURE = [
    { level: 1, smallBlind: 50,  bigBlind: 100,  ante: 10,  durationMinutes: 2 },
    { level: 2, smallBlind: 100, bigBlind: 200,  ante: 25,  durationMinutes: 2 },
    { level: 3, smallBlind: 200, bigBlind: 400,  ante: 50,  durationMinutes: 2 },
    { level: 4, smallBlind: 400, bigBlind: 800,  ante: 100, durationMinutes: 1 },
    { level: 5, smallBlind: 800, bigBlind: 1600, ante: 200, durationMinutes: 1 },
];

const PAYOUT_9_PLACES = [
    { place: 1, percentage: 30 }, { place: 2, percentage: 20 },
    { place: 3, percentage: 15 }, { place: 4, percentage: 10 },
    { place: 5, percentage: 8 },  { place: 6, percentage: 6 },
    { place: 7, percentage: 5 },  { place: 8, percentage: 3.5 },
    { place: 9, percentage: 2.5 },
];

const PAYOUT_5_PLACES = [
    { place: 1, percentage: 40 }, { place: 2, percentage: 25 },
    { place: 3, percentage: 18 }, { place: 4, percentage: 10 },
    { place: 5, percentage: 7 },
];

const PAYOUT_3_PLACES = [
    { place: 1, percentage: 50 }, { place: 2, percentage: 30 },
    { place: 3, percentage: 20 },
];

const TOURNAMENT_CONFIGS = [
    // ─── MONDAY: FREEROLL FIESTA ─────────────────────────────────────────────
    {
        name: 'FREEROLL — Monday Kickoff (NLH)',
        type: 'mtt' as const, gameVariant: 'nlh',
        buyIn: 0, rake: 0, guarantee: 100,
        startingStack: 3000, maxPlayers: 100, minPlayers: 10,
        horsesToRegister: 30,
        blindStructure: TURBO_BLIND_STRUCTURE,
        payoutStructure: PAYOUT_9_PLACES,
        dayOfWeek: 1, // Monday
        startHour: 19,
    },
    {
        name: 'FREEROLL — PLO4 Welcome',
        type: 'mtt' as const, gameVariant: 'plo4',
        buyIn: 0, rake: 0, guarantee: 50,
        startingStack: 3000, maxPlayers: 50, minPlayers: 6,
        horsesToRegister: 20,
        blindStructure: TURBO_BLIND_STRUCTURE,
        payoutStructure: PAYOUT_5_PLACES,
        dayOfWeek: 1,
        startHour: 21,
    },

    // ─── TUESDAY: FREEZEOUT FEST ─────────────────────────────────────────────
    {
        name: '5 Chip Freezeout — NLH Deep Stack',
        type: 'mtt' as const, gameVariant: 'nlh',
        buyIn: 5, rake: 0.50, guarantee: 200,
        startingStack: 5000, maxPlayers: 100, minPlayers: 10,
        horsesToRegister: 25,
        blindStructure: STANDARD_BLIND_STRUCTURE_10_LVL,
        payoutStructure: PAYOUT_9_PLACES,
        dayOfWeek: 2,
        startHour: 19,
    },
    {
        name: '10 Chip Freezeout — PLO5 Action',
        type: 'mtt' as const, gameVariant: 'plo5',
        buyIn: 10, rake: 1, guarantee: 300,
        startingStack: 5000, maxPlayers: 50, minPlayers: 8,
        horsesToRegister: 20,
        blindStructure: STANDARD_BLIND_STRUCTURE_10_LVL,
        payoutStructure: PAYOUT_5_PLACES,
        dayOfWeek: 2,
        startHour: 21,
    },

    // ─── WEDNESDAY: BOUNTY BONANZA ───────────────────────────────────────────
    {
        name: '10 Chip Bounty Hunter — NLH (5 Chip Bounty)',
        type: 'bounty' as const, gameVariant: 'nlh',
        buyIn: 10, rake: 1, guarantee: 500,
        startingStack: 5000, maxPlayers: 100, minPlayers: 10,
        horsesToRegister: 30,
        blindStructure: STANDARD_BLIND_STRUCTURE_10_LVL,
        payoutStructure: PAYOUT_9_PLACES,
        dayOfWeek: 3,
        startHour: 19,
    },
    {
        name: '25 Chip Bounty Hunter — PLO4 (12 Chip Bounty)',
        type: 'bounty' as const, gameVariant: 'plo4',
        buyIn: 25, rake: 2.50, guarantee: 1000,
        startingStack: 10000, maxPlayers: 50, minPlayers: 10,
        horsesToRegister: 20,
        blindStructure: STANDARD_BLIND_STRUCTURE_10_LVL,
        payoutStructure: PAYOUT_5_PLACES,
        dayOfWeek: 3,
        startHour: 21,
    },

    // ─── THURSDAY: PKO (PROGRESSIVE KNOCKOUT) ────────────────────────────────
    {
        name: '15 Chip PKO — NLH Progressive Bounty',
        type: 'progressive_bounty' as const, gameVariant: 'nlh',
        buyIn: 15, rake: 1.50, guarantee: 750,
        startingStack: 7500, maxPlayers: 100, minPlayers: 10,
        horsesToRegister: 25,
        blindStructure: STANDARD_BLIND_STRUCTURE_10_LVL,
        payoutStructure: PAYOUT_9_PLACES,
        dayOfWeek: 4,
        startHour: 19,
    },
    {
        name: '20 Chip PKO — PLO8 Hi-Lo Bounty',
        type: 'progressive_bounty' as const, gameVariant: 'plo8',
        buyIn: 20, rake: 2, guarantee: 500,
        startingStack: 7500, maxPlayers: 50, minPlayers: 8,
        horsesToRegister: 20,
        blindStructure: STANDARD_BLIND_STRUCTURE_10_LVL,
        payoutStructure: PAYOUT_5_PLACES,
        dayOfWeek: 4,
        startHour: 21,
    },

    // ─── FRIDAY: MYSTERY BOUNTY MADNESS ──────────────────────────────────────
    {
        name: '25 Chip Mystery Bounty — NLH (Random 5-500 Chip Bounties!)',
        type: 'mystery_bounty' as const, gameVariant: 'nlh',
        buyIn: 25, rake: 2.50, guarantee: 1500,
        startingStack: 10000, maxPlayers: 100, minPlayers: 15,
        horsesToRegister: 30,
        blindStructure: STANDARD_BLIND_STRUCTURE_10_LVL,
        payoutStructure: PAYOUT_9_PLACES,
        dayOfWeek: 5,
        startHour: 20,
    },
    {
        name: '10 Chip Mystery Bounty — Pineapple OFC',
        type: 'mystery_bounty' as const, gameVariant: 'ofc_pineapple',
        buyIn: 10, rake: 1, guarantee: 250,
        startingStack: 5000, maxPlayers: 30, minPlayers: 6,
        horsesToRegister: 15,
        blindStructure: TURBO_BLIND_STRUCTURE,
        payoutStructure: PAYOUT_5_PLACES,
        dayOfWeek: 5,
        startHour: 22,
    },

    // ─── SATURDAY: TURBO MARATHON + BIG GUARANTEE ────────────────────────────
    {
        name: '50 Chip Saturday Major — NLH 5K GTD',
        type: 'mtt' as const, gameVariant: 'nlh',
        buyIn: 50, rake: 5, guarantee: 5000,
        startingStack: 15000, maxPlayers: 200, minPlayers: 20,
        horsesToRegister: 40,
        blindStructure: STANDARD_BLIND_STRUCTURE_10_LVL,
        payoutStructure: PAYOUT_9_PLACES,
        dayOfWeek: 6,
        startHour: 18,
    },
    {
        name: '5 Chip Turbo Bounty — NLH Fast Action',
        type: 'bounty' as const, gameVariant: 'nlh',
        buyIn: 5, rake: 0.50, guarantee: 150,
        startingStack: 3000, maxPlayers: 50, minPlayers: 10,
        horsesToRegister: 25,
        blindStructure: TURBO_BLIND_STRUCTURE,
        payoutStructure: PAYOUT_5_PLACES,
        dayOfWeek: 6,
        startHour: 20,
    },
    {
        name: '10 Chip Turbo PLO4 — Saturday Night Action',
        type: 'mtt' as const, gameVariant: 'plo4',
        buyIn: 10, rake: 1, guarantee: 300,
        startingStack: 5000, maxPlayers: 50, minPlayers: 8,
        horsesToRegister: 20,
        blindStructure: TURBO_BLIND_STRUCTURE,
        payoutStructure: PAYOUT_5_PLACES,
        dayOfWeek: 6,
        startHour: 22,
    },

    // ─── SUNDAY: CHAMPIONSHIP SUNDAY ─────────────────────────────────────────
    {
        name: '100 Chip Sunday Championship — NLH 10K GTD',
        type: 'mtt' as const, gameVariant: 'nlh',
        buyIn: 100, rake: 10, guarantee: 10000,
        startingStack: 20000, maxPlayers: 200, minPlayers: 25,
        horsesToRegister: 50,
        blindStructure: STANDARD_BLIND_STRUCTURE_10_LVL,
        payoutStructure: PAYOUT_9_PLACES,
        dayOfWeek: 0, // Sunday
        startHour: 17,
    },
    {
        name: '50 Chip Sunday PLO4 Championship — 3K GTD',
        type: 'mtt' as const, gameVariant: 'plo4',
        buyIn: 50, rake: 5, guarantee: 3000,
        startingStack: 15000, maxPlayers: 100, minPlayers: 15,
        horsesToRegister: 30,
        blindStructure: STANDARD_BLIND_STRUCTURE_10_LVL,
        payoutStructure: PAYOUT_9_PLACES,
        dayOfWeek: 0,
        startHour: 19,
    },
    {
        name: '25 Chip PKO — Sunday Night Showdown',
        type: 'progressive_bounty' as const, gameVariant: 'nlh',
        buyIn: 25, rake: 2.50, guarantee: 1500,
        startingStack: 10000, maxPlayers: 100, minPlayers: 15,
        horsesToRegister: 30,
        blindStructure: STANDARD_BLIND_STRUCTURE_10_LVL,
        payoutStructure: PAYOUT_9_PLACES,
        dayOfWeek: 0,
        startHour: 21,
    },
    {
        name: 'FREEROLL — Sunday Night Freebie (NLH)',
        type: 'mtt' as const, gameVariant: 'nlh',
        buyIn: 0, rake: 0, guarantee: 200,
        startingStack: 3000, maxPlayers: 100, minPlayers: 10,
        horsesToRegister: 30,
        blindStructure: HYPER_TURBO_STRUCTURE,
        payoutStructure: PAYOUT_9_PLACES,
        dayOfWeek: 0,
        startHour: 23,
    },

    // ─── DAILY RECURRING (EVERY DAY) ─────────────────────────────────────────
    {
        name: 'Daily Freeroll — NLH (Every Day)',
        type: 'mtt' as const, gameVariant: 'nlh',
        buyIn: 0, rake: 0, guarantee: 50,
        startingStack: 2000, maxPlayers: 100, minPlayers: 6,
        horsesToRegister: 20,
        blindStructure: HYPER_TURBO_STRUCTURE,
        payoutStructure: PAYOUT_5_PLACES,
        dayOfWeek: -1, // -1 = every day
        startHour: 12,
    },
    {
        name: '10 Chip Daily Grinder — NLH 250 GTD',
        type: 'mtt' as const, gameVariant: 'nlh',
        buyIn: 10, rake: 1, guarantee: 250,
        startingStack: 5000, maxPlayers: 100, minPlayers: 10,
        horsesToRegister: 25,
        blindStructure: STANDARD_BLIND_STRUCTURE_10_LVL,
        payoutStructure: PAYOUT_9_PLACES,
        dayOfWeek: -1,
        startHour: 20,
    },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SNG CONFIGS — ALL GAME TYPES
// ═══════════════════════════════════════════════════════════════════════════════

const SNG_BLIND_6MAX = [
    { level: 1, smallBlind: 10,  bigBlind: 20,  ante: 0,  durationMinutes: 3 },
    { level: 2, smallBlind: 15,  bigBlind: 30,  ante: 0,  durationMinutes: 3 },
    { level: 3, smallBlind: 25,  bigBlind: 50,  ante: 5,  durationMinutes: 3 },
    { level: 4, smallBlind: 50,  bigBlind: 100, ante: 10, durationMinutes: 3 },
    { level: 5, smallBlind: 75,  bigBlind: 150, ante: 15, durationMinutes: 3 },
    { level: 6, smallBlind: 100, bigBlind: 200, ante: 25, durationMinutes: 2 },
    { level: 7, smallBlind: 150, bigBlind: 300, ante: 30, durationMinutes: 2 },
    { level: 8, smallBlind: 200, bigBlind: 400, ante: 50, durationMinutes: 2 },
];

const SNG_BLIND_9MAX = [
    { level: 1, smallBlind: 10,  bigBlind: 20,  ante: 0,  durationMinutes: 5 },
    { level: 2, smallBlind: 20,  bigBlind: 40,  ante: 0,  durationMinutes: 5 },
    { level: 3, smallBlind: 30,  bigBlind: 60,  ante: 5,  durationMinutes: 5 },
    { level: 4, smallBlind: 50,  bigBlind: 100, ante: 10, durationMinutes: 4 },
    { level: 5, smallBlind: 75,  bigBlind: 150, ante: 15, durationMinutes: 4 },
    { level: 6, smallBlind: 100, bigBlind: 200, ante: 25, durationMinutes: 3 },
    { level: 7, smallBlind: 150, bigBlind: 300, ante: 30, durationMinutes: 3 },
    { level: 8, smallBlind: 200, bigBlind: 400, ante: 50, durationMinutes: 3 },
];

const SNG_CONFIGS = [
    // NLH SNGs
    { name: '5 Chip Turbo SNG 6-Max NLH',   type: 'sng' as const, gameVariant: 'nlh',           buyIn: 5,  rake: 0.50, startingStack: 1500, maxPlayers: 6, minPlayers: 6, horsesToRegister: 6, blindStructure: SNG_BLIND_6MAX, payoutStructure: [{ place: 1, percentage: 65 }, { place: 2, percentage: 35 }] },
    { name: '10 Chip SNG 9-Max NLH',         type: 'sng' as const, gameVariant: 'nlh',           buyIn: 10, rake: 1.00, startingStack: 2000, maxPlayers: 9, minPlayers: 9, horsesToRegister: 9, blindStructure: SNG_BLIND_9MAX, payoutStructure: PAYOUT_3_PLACES },
    { name: '25 Chip SNG 6-Max NLH',         type: 'sng' as const, gameVariant: 'nlh',           buyIn: 25, rake: 2.50, startingStack: 2000, maxPlayers: 6, minPlayers: 6, horsesToRegister: 6, blindStructure: SNG_BLIND_6MAX, payoutStructure: [{ place: 1, percentage: 65 }, { place: 2, percentage: 35 }] },
    // PLO4 SNGs
    { name: '5 Chip Turbo SNG 6-Max PLO4',   type: 'sng' as const, gameVariant: 'plo4',          buyIn: 5,  rake: 0.50, startingStack: 1500, maxPlayers: 6, minPlayers: 6, horsesToRegister: 6, blindStructure: SNG_BLIND_6MAX, payoutStructure: [{ place: 1, percentage: 65 }, { place: 2, percentage: 35 }] },
    { name: '10 Chip SNG 6-Max PLO4',        type: 'sng' as const, gameVariant: 'plo4',          buyIn: 10, rake: 1.00, startingStack: 2000, maxPlayers: 6, minPlayers: 6, horsesToRegister: 6, blindStructure: SNG_BLIND_6MAX, payoutStructure: [{ place: 1, percentage: 65 }, { place: 2, percentage: 35 }] },
    // PLO5 SNGs
    { name: '10 Chip SNG 6-Max PLO5',        type: 'sng' as const, gameVariant: 'plo5',          buyIn: 10, rake: 1.00, startingStack: 2000, maxPlayers: 6, minPlayers: 6, horsesToRegister: 6, blindStructure: SNG_BLIND_6MAX, payoutStructure: [{ place: 1, percentage: 65 }, { place: 2, percentage: 35 }] },
    // PLO8 SNGs
    { name: '5 Chip SNG 9-Max PLO8',         type: 'sng' as const, gameVariant: 'plo8',          buyIn: 5,  rake: 0.50, startingStack: 2000, maxPlayers: 9, minPlayers: 9, horsesToRegister: 9, blindStructure: SNG_BLIND_9MAX, payoutStructure: PAYOUT_3_PLACES },
    // Pineapple SNGs
    { name: '5 Chip SNG 6-Max Pineapple',    type: 'sng' as const, gameVariant: 'ofc_pineapple', buyIn: 5,  rake: 0.50, startingStack: 1500, maxPlayers: 6, minPlayers: 6, horsesToRegister: 6, blindStructure: SNG_BLIND_6MAX, payoutStructure: [{ place: 1, percentage: 65 }, { place: 2, percentage: 35 }] },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SPIN CONFIGS — ALL GAME TYPES
// ═══════════════════════════════════════════════════════════════════════════════

const SPIN_BLIND_STRUCTURE = [
    { level: 1, smallBlind: 10,  bigBlind: 20,  ante: 0, durationMinutes: 2 },
    { level: 2, smallBlind: 15,  bigBlind: 30,  ante: 0, durationMinutes: 2 },
    { level: 3, smallBlind: 25,  bigBlind: 50,  ante: 0, durationMinutes: 2 },
    { level: 4, smallBlind: 50,  bigBlind: 100, ante: 0, durationMinutes: 1 },
    { level: 5, smallBlind: 100, bigBlind: 200, ante: 0, durationMinutes: 1 },
];

const SPIN_MULTIPLIERS = [
    { multiplier: 2,   weight: 75 },
    { multiplier: 3,   weight: 15 },
    { multiplier: 5,   weight: 7 },
    { multiplier: 10,  weight: 2.5 },
    { multiplier: 25,  weight: 0.4 },
    { multiplier: 100, weight: 0.1 },
];

const SPIN_CONFIGS = [
    // NLH Spins
    { name: '1 Chip Spin NLH',    type: 'spin' as const, gameVariant: 'nlh',  buyIn: 1,  rake: 0.10, startingStack: 500, maxPlayers: 3, minPlayers: 3, horsesToRegister: 3, blindStructure: SPIN_BLIND_STRUCTURE, payoutStructure: [{ place: 1, percentage: 100 }], spinMultipliers: SPIN_MULTIPLIERS },
    { name: '3 Chip Spin NLH',    type: 'spin' as const, gameVariant: 'nlh',  buyIn: 3,  rake: 0.30, startingStack: 500, maxPlayers: 3, minPlayers: 3, horsesToRegister: 3, blindStructure: SPIN_BLIND_STRUCTURE, payoutStructure: [{ place: 1, percentage: 100 }], spinMultipliers: SPIN_MULTIPLIERS },
    { name: '5 Chip Spin NLH',    type: 'spin' as const, gameVariant: 'nlh',  buyIn: 5,  rake: 0.50, startingStack: 500, maxPlayers: 3, minPlayers: 3, horsesToRegister: 3, blindStructure: SPIN_BLIND_STRUCTURE, payoutStructure: [{ place: 1, percentage: 100 }], spinMultipliers: SPIN_MULTIPLIERS },
    { name: '10 Chip Spin NLH',   type: 'spin' as const, gameVariant: 'nlh',  buyIn: 10, rake: 1.00, startingStack: 500, maxPlayers: 3, minPlayers: 3, horsesToRegister: 3, blindStructure: SPIN_BLIND_STRUCTURE, payoutStructure: [{ place: 1, percentage: 100 }], spinMultipliers: SPIN_MULTIPLIERS },
    // PLO4 Spins
    { name: '3 Chip Spin PLO4',   type: 'spin' as const, gameVariant: 'plo4', buyIn: 3,  rake: 0.30, startingStack: 500, maxPlayers: 3, minPlayers: 3, horsesToRegister: 3, blindStructure: SPIN_BLIND_STRUCTURE, payoutStructure: [{ place: 1, percentage: 100 }], spinMultipliers: SPIN_MULTIPLIERS },
    { name: '5 Chip Spin PLO4',   type: 'spin' as const, gameVariant: 'plo4', buyIn: 5,  rake: 0.50, startingStack: 500, maxPlayers: 3, minPlayers: 3, horsesToRegister: 3, blindStructure: SPIN_BLIND_STRUCTURE, payoutStructure: [{ place: 1, percentage: 100 }], spinMultipliers: SPIN_MULTIPLIERS },
    // PLO5 Spins
    { name: '3 Chip Spin PLO5',   type: 'spin' as const, gameVariant: 'plo5', buyIn: 3,  rake: 0.30, startingStack: 500, maxPlayers: 3, minPlayers: 3, horsesToRegister: 3, blindStructure: SPIN_BLIND_STRUCTURE, payoutStructure: [{ place: 1, percentage: 100 }], spinMultipliers: SPIN_MULTIPLIERS },
    // PLO8 Spins
    { name: '3 Chip Spin PLO8',   type: 'spin' as const, gameVariant: 'plo8', buyIn: 3,  rake: 0.30, startingStack: 500, maxPlayers: 3, minPlayers: 3, horsesToRegister: 3, blindStructure: SPIN_BLIND_STRUCTURE, payoutStructure: [{ place: 1, percentage: 100 }], spinMultipliers: SPIN_MULTIPLIERS },
    // Pineapple Spins
    { name: '3 Chip Spin Pineapple', type: 'spin' as const, gameVariant: 'ofc_pineapple', buyIn: 3, rake: 0.30, startingStack: 500, maxPlayers: 3, minPlayers: 3, horsesToRegister: 3, blindStructure: SPIN_BLIND_STRUCTURE, payoutStructure: [{ place: 1, percentage: 100 }], spinMultipliers: SPIN_MULTIPLIERS },
];

// ═══════════════════════════════════════════════════════════════════════════════
// ORCHESTRATOR SINGLETON
// ═══════════════════════════════════════════════════════════════════════════════

class HorseOrchestrator {
    private tables: Map<string, OrchestratorTable> = new Map();
    private startedAt: string | null = null;
    private isRunning = false;
    private handCount = 0;
    private totalRake = 0;
    private totalBBJ = 0;
    private errors: string[] = [];

    // ─── MIDWAY UNION — both clubs are members ───────────────────────────────
    private unionId = 'fade0000-0000-0000-0000-000000000001'; // Midway Union
    private sharkClubId = 'a41434bb-8d0c-400a-8f0d-e8b3d65afed4';  // Shark Club
    private jaqkClubId  = 'a0000000-0000-0000-0000-000000000001';   // Club JAQK
    // Tables alternate between clubs for cross-club union settlement testing
    private clubIds: string[] = [];
    private clubIndex = 0;

    /** Round-robin club assignment for tables/tournaments */
    private getNextClubId(): string {
        const id = this.clubIds[this.clubIndex % this.clubIds.length] || this.sharkClubId;
        this.clubIndex++;
        return id;
    }

    /** Launch the full orchestrator — ALL horses across ALL tables */
    async launch(configs: TableConfig[] = DEFAULT_TABLES): Promise<{ success: boolean; tablesCreated: number; horsesSeated: number }> {
        if (this.isRunning) {
            console.warn('[Orchestrator] Already running');
            return { success: false, tablesCreated: 0, horsesSeated: 0 };
        }

        this.isRunning = true;
        this.startedAt = new Date().toISOString();

        // Initialize dual-club round-robin for cross-club settlement testing
        this.clubIds = [this.sharkClubId, this.jaqkClubId];
        this.clubIndex = 0;

        console.log(`[Orchestrator] Launching with ${configs.length} table configs across Shark Club + Club JAQK via Midway Union (${this.unionId})`);

        // Ensure horses are members of BOTH clubs
        await this.ensureHorsesInBothClubs();

        let tablesCreated = 0;
        let horsesSeated = 0;

        for (const config of configs) {
            try {
                // Alternate tables between clubs for cross-club union testing
                const clubId = this.getNextClubId();

                // Create table in Supabase under alternating clubs
                const { data: table, error } = await supabase
                    .from('tables')
                    .insert({
                        club_id: clubId,
                        name: config.name,
                        game_type: 'cash',
                        game_variant: config.gameVariant || 'nlh',
                        stakes: `${config.smallBlind}/${config.bigBlind}`,
                        small_blind: config.smallBlind,
                        big_blind: config.bigBlind,
                        min_buy_in: config.bigBlind * 40,
                        max_buy_in: config.bigBlind * 200,
                        max_players: config.maxPlayers,
                        current_players: 0,
                        status: 'active',
                        settings: {
                            straddle_enabled: true,
                            straddle_type: 'utg',
                            run_it_twice: false,
                            bomb_pot_enabled: config.name.includes('Bomb'),
                            bomb_pot_frequency: config.name.includes('Bomb') ? 10 : 0,
                            bomb_pot_ante_bb: config.name.includes('Bomb') ? 2 : 0,
                            time_bank_seconds: 30,
                            auto_muck: true,
                        },
                    })
                    .select()
                    .single();

                if (error) {
                    this.logError(`Failed to create table "${config.name}": ${error.message}`);
                    continue;
                }

                const tableId = table.id;
                this.tables.set(tableId, {
                    tableId,
                    name: config.name,
                    smallBlind: config.smallBlind,
                    bigBlind: config.bigBlind,
                    maxPlayers: config.maxPlayers,
                    horseCount: 0,
                    handsPlayed: 0,
                    totalRake: 0,
                    totalBBJ: 0,
                    status: 'seeding',
                    errors: [],
                });

                tablesCreated++;

                // Seed horses onto table
                const seatedCount = await this.seedTableWithHorses(tableId, config);
                horsesSeated += seatedCount;

                // Mark table as running
                const tbl = this.tables.get(tableId);
                if (tbl) {
                    tbl.status = 'running';
                    tbl.horseCount = seatedCount;
                }

                console.log(`[Orchestrator] Table "${config.name}" created: ${tableId} with ${seatedCount} horses`);
            } catch (err: any) {
                this.logError(`Table "${config.name}" creation error: ${err.message}`);
            }
        }

        // Launch today's tournaments (created with near-future start_time so DealerPage picks them up)
        try {
            const tournResult = await this.launchTodaysTournaments();
            console.log(`[Orchestrator] Tournaments launched: ${tournResult.launched} tournaments, ${tournResult.totalRegistered} horses registered`);
        } catch (err: any) {
            this.logError(`Tournament launch failed: ${err.message}`);
        }

        // Broadcast launch event
        masterBus.emit('BALANCE_UPDATED', { source: 'orchestrator', tablesCreated, horsesSeated });

        console.log(`[Orchestrator] Launch complete: ${tablesCreated} tables, ${horsesSeated} horses`);
        return { success: true, tablesCreated, horsesSeated };
    }

    /** Seed a table with horses from the fleet */
    private async seedTableWithHorses(tableId: string, config: TableConfig): Promise<number> {
        let seated = 0;
        const horses = await HydraService.getAvailableHorses(config.horsesPerTable);

        for (const horse of horses) {
            try {
                const buyIn = config.bigBlind * 100; // 100 BB

                // Insert seat
                const { error: seatError } = await supabase
                    .from('table_seats')
                    .insert({
                        table_id: tableId,
                        user_id: horse.id,
                        seat_number: seated + 1,
                        stack: buyIn,
                        is_sitting_out: false,
                    });

                if (seatError) {
                    console.warn(`[Orchestrator] Failed to seat horse ${horse.name}: ${seatError.message}`);
                    continue;
                }

                // Mark horse as seated
                await supabase
                    .from('profiles')
                    .update({ horse_status: 'seated' })
                    .eq('id', horse.id);

                seated++;
            } catch (err: any) {
                console.warn(`[Orchestrator] Horse seating error: ${err.message}`);
            }
        }

        // Update table player count
        await supabase
            .from('tables')
            .update({ current_players: seated })
            .eq('id', tableId);

        return seated;
    }

    /** Get today's scheduled tournaments based on day of week */
    getTodaysTournaments(): typeof TOURNAMENT_CONFIGS {
        const today = new Date().getDay(); // 0=Sunday, 1=Monday, etc.
        return TOURNAMENT_CONFIGS.filter(t =>
            t.dayOfWeek === today || t.dayOfWeek === -1 // -1 = daily recurring
        );
    }

    /** Get this week's full tournament schedule */
    getWeeklySchedule(): { day: string; tournaments: typeof TOURNAMENT_CONFIGS }[] {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const schedule = days.map((day, i) => ({
            day,
            tournaments: TOURNAMENT_CONFIGS.filter(t => t.dayOfWeek === i || t.dayOfWeek === -1),
        }));
        return schedule;
    }

    /** Create and register horses for a tournament */
    async launchTournament(configIndex: number = 0): Promise<{ tournamentId: string | null; registered: number }> {
        const config = TOURNAMENT_CONFIGS[configIndex];
        if (!config) return { tournamentId: null, registered: 0 };

        try {
            // Set start_time to 10 seconds from now so DealerPage can discover and start it
            // (DealerPage discovers tournaments where start_time <= now AND current_players >= 2)
            const startTime = new Date(Date.now() + 10_000);

            // Map game variant to DB format (uppercase)
            const gameTypeMap: Record<string, string> = {
                'nlh': 'NLH', 'plo4': 'PLO4', 'plo5': 'PLO5', 'plo8': 'PLO8',
                'ofc_pineapple': 'OFC_PINEAPPLE', 'short_deck': 'SHORT_DECK',
            };
            const dbGameType = gameTypeMap[config.gameVariant || 'nlh'] || 'NLH';

            // Create tournament in DB (using actual column names)
            const { data: tournament, error } = await supabase
                .from('tournaments')
                .insert({
                    club_id: this.getNextClubId(),
                    name: config.name,
                    game_type: dbGameType,
                    variant: config.type === 'mtt' ? 'freezeout' : config.type, // freezeout/bounty/progressive_bounty/mystery_bounty
                    buy_in_amount: config.buyIn,
                    buy_in_fee: config.rake,
                    guaranteed_prize: config.guarantee || 0,
                    starting_chips: config.startingStack,
                    max_players: config.maxPlayers,
                    current_players: 0,
                    status: 'ANNOUNCED',
                    blind_structure: config.blindStructure,
                    payout_structure: config.payoutStructure || [],
                    start_time: startTime.toISOString(),
                    late_reg_mins: 30,
                })
                .select()
                .single();

            if (error) {
                this.logError(`Tournament creation failed: ${error.message}`);
                return { tournamentId: null, registered: 0 };
            }

            // Register horses via tournament_players
            const horses = await HydraService.getAvailableHorses(config.horsesToRegister);
            let registered = 0;

            for (const horse of horses) {
                const { error: regError } = await supabase
                    .from('tournament_players')
                    .insert({
                        tournament_id: tournament.id,
                        user_id: horse.id,
                        username: horse.name,
                        status: 'registered',
                        chips: 0,
                    });

                if (!regError) registered++;
            }

            // Update tournament player count
            const prizePool = Math.max(config.guarantee || 0, registered * config.buyIn);
            await supabase
                .from('tournaments')
                .update({
                    current_players: registered,
                    guaranteed_prize: prizePool,
                    status: 'REGISTERING',
                })
                .eq('id', tournament.id);

            console.log(`[Orchestrator] Tournament "${config.name}" created: ${tournament.id} — ${registered} horses, ${prizePool} prize pool (GTD: ${config.guarantee || 0})`);
            return { tournamentId: tournament.id, registered };
        } catch (err: any) {
            this.logError(`Tournament launch error: ${err.message}`);
            return { tournamentId: null, registered: 0 };
        }
    }

    /** Launch all of today's scheduled tournaments */
    async launchTodaysTournaments(): Promise<{ launched: number; totalRegistered: number }> {
        const todaysTournaments = this.getTodaysTournaments();
        let launched = 0;
        let totalRegistered = 0;

        console.log(`[Orchestrator] Launching ${todaysTournaments.length} tournaments for today`);

        for (let i = 0; i < TOURNAMENT_CONFIGS.length; i++) {
            const config = TOURNAMENT_CONFIGS[i];
            const today = new Date().getDay();
            if (config.dayOfWeek !== today && config.dayOfWeek !== -1) continue;

            const result = await this.launchTournament(i);
            if (result.tournamentId) {
                launched++;
                totalRegistered += result.registered;
            }
        }

        console.log(`[Orchestrator] Launched ${launched} tournaments, ${totalRegistered} horses registered`);
        return { launched, totalRegistered };
    }

    /** Create and fill a SNG table */
    async launchSNG(configIndex: number = 0): Promise<{ tournamentId: string | null; registered: number }> {
        const config = SNG_CONFIGS[configIndex];
        if (!config) return { tournamentId: null, registered: 0 };

        try {
            const gameTypeMap: Record<string, string> = {
                'nlh': 'NLH', 'plo4': 'PLO4', 'plo5': 'PLO5', 'plo8': 'PLO8',
                'ofc_pineapple': 'OFC_PINEAPPLE', 'short_deck': 'SHORT_DECK',
            };
            const dbGameType = gameTypeMap[config.gameVariant || 'nlh'] || 'NLH';

            const { data: sng, error } = await supabase
                .from('tournaments')
                .insert({
                    club_id: this.getNextClubId(),
                    name: config.name,
                    game_type: dbGameType,
                    variant: 'SNG',
                    buy_in_amount: config.buyIn,
                    buy_in_fee: config.rake,
                    guaranteed_prize: null,
                    starting_chips: config.startingStack,
                    max_players: config.maxPlayers,
                    current_players: 0,
                    status: 'REGISTERING',
                    blind_structure: config.blindStructure,
                    payout_structure: config.payoutStructure || [],
                    late_reg_mins: 0,
                    start_time: new Date(Date.now() + 10_000).toISOString(), // Start 10s from now
                })
                .select()
                .single();

            if (error) {
                this.logError(`SNG creation failed: ${error.message}`);
                return { tournamentId: null, registered: 0 };
            }

            const horses = await HydraService.getAvailableHorses(config.horsesToRegister);
            let registered = 0;

            for (const horse of horses) {
                const { error: regError } = await supabase
                    .from('tournament_players')
                    .insert({
                        tournament_id: sng.id,
                        user_id: horse.id,
                        username: horse.name,
                        status: 'registered',
                        chips: 0,
                    });
                if (!regError) registered++;
            }

            const prizePool = registered * config.buyIn;
            await supabase
                .from('tournaments')
                .update({
                    current_players: registered,
                    guaranteed_prize: prizePool,
                    status: 'REGISTERING', // DealerPage discovers REGISTERING tournaments and starts them via TournamentEngine
                })
                .eq('id', sng.id);

            console.log(`[Orchestrator] SNG "${config.name}" created: ${sng.id} with ${registered} horses`);
            return { tournamentId: sng.id, registered };
        } catch (err: any) {
            this.logError(`SNG launch error: ${err.message}`);
            return { tournamentId: null, registered: 0 };
        }
    }

    /** Launch ALL SNG configs */
    async launchAllSNGs(): Promise<{ launched: number; totalRegistered: number }> {
        let launched = 0;
        let totalRegistered = 0;

        for (let i = 0; i < SNG_CONFIGS.length; i++) {
            const result = await this.launchSNG(i);
            if (result.tournamentId) {
                launched++;
                totalRegistered += result.registered;
            }
        }

        console.log(`[Orchestrator] Launched ${launched} SNGs, ${totalRegistered} horses registered`);
        return { launched, totalRegistered };
    }

    /** Create a Spin & Go with random multiplier */
    async launchSpin(configIndex: number = 0): Promise<{ tournamentId: string | null; registered: number; multiplier: number }> {
        const config = SPIN_CONFIGS[configIndex];
        if (!config) return { tournamentId: null, registered: 0, multiplier: 0 };

        // Roll multiplier
        const multiplier = this.rollSpinMultiplier(config.spinMultipliers);
        const prizePool = config.buyIn * config.horsesToRegister * multiplier;

        try {
            const gameTypeMap: Record<string, string> = {
                'nlh': 'NLH', 'plo4': 'PLO4', 'plo5': 'PLO5', 'plo8': 'PLO8',
                'ofc_pineapple': 'OFC_PINEAPPLE', 'short_deck': 'SHORT_DECK',
            };
            const dbGameType = gameTypeMap[config.gameVariant || 'nlh'] || 'NLH';

            const { data: spin, error } = await supabase
                .from('tournaments')
                .insert({
                    club_id: this.getNextClubId(),
                    name: `${config.name} (${multiplier}x)`,
                    game_type: dbGameType,
                    variant: 'SPIN',
                    buy_in_amount: config.buyIn,
                    buy_in_fee: config.rake,
                    guaranteed_prize: prizePool,
                    starting_chips: config.startingStack,
                    max_players: config.maxPlayers,
                    current_players: 0,
                    status: 'REGISTERING',
                    blind_structure: config.blindStructure,
                    payout_structure: [{ place: 1, percentage: 100 }],
                    late_reg_mins: 0,
                    start_time: new Date(Date.now() + 10_000).toISOString(),
                })
                .select()
                .single();

            if (error) {
                this.logError(`Spin creation failed: ${error.message}`);
                return { tournamentId: null, registered: 0, multiplier };
            }

            const horses = await HydraService.getAvailableHorses(config.horsesToRegister);
            let registered = 0;

            for (const horse of horses) {
                const { error: regError } = await supabase
                    .from('tournament_players')
                    .insert({
                        tournament_id: spin.id,
                        user_id: horse.id,
                        username: horse.name,
                        status: 'registered',
                        chips: 0,
                    });
                if (!regError) registered++;
            }

            await supabase
                .from('tournaments')
                .update({
                    current_players: registered,
                    status: 'REGISTERING',
                })
                .eq('id', spin.id);

            console.log(`[Orchestrator] Spin "${config.name}" (${multiplier}x = ${prizePool}) created with ${registered} horses`);
            return { tournamentId: spin.id, registered, multiplier };
        } catch (err: any) {
            this.logError(`Spin launch error: ${err.message}`);
            return { tournamentId: null, registered: 0, multiplier: 0 };
        }
    }

    /** Launch ALL Spin configs */
    async launchAllSpins(): Promise<{ launched: number; totalRegistered: number }> {
        let launched = 0;
        let totalRegistered = 0;

        for (let i = 0; i < SPIN_CONFIGS.length; i++) {
            const result = await this.launchSpin(i);
            if (result.tournamentId) {
                launched++;
                totalRegistered += result.registered;
            }
        }

        console.log(`[Orchestrator] Launched ${launched} Spins, ${totalRegistered} horses registered`);
        return { launched, totalRegistered };
    }

    /** FULL LAUNCH — Cash games + Today's tournaments + All SNGs + All Spins */
    async launchEverything(): Promise<{
        cashTables: number;
        cashHorses: number;
        tournaments: number;
        tournamentHorses: number;
        sngs: number;
        sngHorses: number;
        spins: number;
        spinHorses: number;
    }> {
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('[Orchestrator] 🐎 LAUNCHING EVERYTHING — FULL FLEET DEPLOYMENT');
        console.log('═══════════════════════════════════════════════════════════════');

        // 1. Cash games + today's tournaments (launch() now includes launchTodaysTournaments())
        const cashResult = await this.launch();

        // 2. All SNGs
        const sngResult = await this.launchAllSNGs();

        // 3. All Spins
        const spinResult = await this.launchAllSpins();

        // Count today's tournaments (already launched inside launch())
        const todaysCount = this.getTodaysTournaments().length;

        const summary = {
            cashTables: cashResult.tablesCreated,
            cashHorses: cashResult.horsesSeated,
            tournaments: todaysCount,
            tournamentHorses: 0, // Already counted in launch()
            sngs: sngResult.launched,
            sngHorses: sngResult.totalRegistered,
            spins: spinResult.launched,
            spinHorses: spinResult.totalRegistered,
        };

        const totalHorses = summary.cashHorses + summary.tournamentHorses + summary.sngHorses + summary.spinHorses;

        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`[Orchestrator] LAUNCH COMPLETE:`);
        console.log(`  Cash Tables: ${summary.cashTables} (${summary.cashHorses} horses)`);
        console.log(`  Tournaments: ${summary.tournaments} (${summary.tournamentHorses} horses)`);
        console.log(`  SNGs:        ${summary.sngs} (${summary.sngHorses} horses)`);
        console.log(`  Spins:       ${summary.spins} (${summary.spinHorses} horses)`);
        console.log(`  TOTAL:       ${totalHorses} horse seats across ${summary.cashTables + summary.tournaments + summary.sngs + summary.spins} games`);
        console.log('═══════════════════════════════════════════════════════════════');

        return summary;
    }

    /** Roll weighted random multiplier for Spin */
    private rollSpinMultiplier(multipliers: { multiplier: number; weight: number }[]): number {
        const totalWeight = multipliers.reduce((sum, m) => sum + m.weight, 0);
        let roll = Math.random() * totalWeight;
        for (const m of multipliers) {
            roll -= m.weight;
            if (roll <= 0) return m.multiplier;
        }
        return multipliers[0].multiplier;
    }

    /** Record a completed hand's rake data */
    recordHandComplete(tableId: string, rakeAmount: number, bbjAmount: number): void {
        this.handCount++;
        this.totalRake += rakeAmount;
        this.totalBBJ += bbjAmount;

        const table = this.tables.get(tableId);
        if (table) {
            table.handsPlayed++;
            table.totalRake += rakeAmount;
            table.totalBBJ += bbjAmount;
        }
    }

    /** Get orchestrator statistics */
    getStats(): OrchestratorStats {
        const uptimeMs = this.startedAt ? Date.now() - new Date(this.startedAt).getTime() : 0;
        const uptimeMin = uptimeMs / 60000;

        return {
            totalHorses: Array.from(this.tables.values()).reduce((sum, t) => sum + t.horseCount, 0),
            totalTables: this.tables.size,
            totalHandsPlayed: this.handCount,
            totalRakeCollected: Math.round(this.totalRake * 100) / 100,
            totalBBJCollected: Math.round(this.totalBBJ * 100) / 100,
            handsPerMinute: uptimeMin > 0 ? Math.round(this.handCount / uptimeMin * 10) / 10 : 0,
            errors: this.errors.slice(-20), // Last 20 errors
            uptime: Math.round(uptimeMs / 1000),
            startedAt: this.startedAt || '',
        };
    }

    /** Get all table statuses */
    getTableStatuses(): OrchestratorTable[] {
        return Array.from(this.tables.values());
    }

    /** Stop all tables and release horses */
    async shutdown(): Promise<void> {
        console.log('[Orchestrator] Shutting down...');
        this.isRunning = false;

        for (const [tableId, table] of this.tables) {
            table.status = 'stopping';

            // Soft-delete all seats (mark as left)
            await supabase
                .from('table_seats')
                .update({ left_at: new Date().toISOString() })
                .eq('table_id', tableId)
                .is('left_at', null);

            // Close table
            await supabase
                .from('tables')
                .update({ status: 'closed', current_players: 0 })
                .eq('id', tableId);

            // Reset ALL horse statuses to available on shutdown (not just 'seated')
            await supabase
                .from('profiles')
                .update({ horse_status: 'available' })
                .eq('is_horse', true)
                .neq('horse_status', 'available');

            table.status = 'stopped';
        }

        console.log(`[Orchestrator] Shutdown complete. ${this.handCount} hands played, ${this.totalRake.toFixed(2)} rake collected`);
    }

    /**
     * Ensure ALL 100 horses are members of BOTH Shark Club AND Club JAQK.
     * This enables cross-club union settlement testing — each horse plays in
     * both clubs and their stats/ledgers are tracked independently per club.
     */
    private async ensureHorsesInBothClubs(): Promise<void> {
        try {
            // Get all horse profile IDs
            const { data: horses, error: horsesError } = await supabase
                .from('profiles')
                .select('id, username')
                .eq('is_horse', true)
                .limit(200);

            if (horsesError || !horses?.length) {
                this.logError(`Failed to fetch horses: ${horsesError?.message || 'No horses found'}`);
                return;
            }

            console.log(`[Orchestrator] Ensuring ${horses.length} horses are members of both clubs...`);

            const clubIds = [this.sharkClubId, this.jaqkClubId];
            let membershipsCreated = 0;

            for (const clubId of clubIds) {
                // Get existing members for this club
                const { data: existing } = await supabase
                    .from('club_members')
                    .select('user_id')
                    .eq('club_id', clubId);

                const existingIds = new Set((existing || []).map((m: any) => m.user_id));

                // Find horses not yet in this club
                const missing = horses.filter(h => !existingIds.has(h.id));

                if (missing.length === 0) {
                    console.log(`[Orchestrator] All horses already in club ${clubId}`);
                    continue;
                }

                // Batch insert missing memberships
                const rows = missing.map(h => ({
                    club_id: clubId,
                    user_id: h.id,
                    role: 'player',
                    status: 'active',
                }));

                // Insert in batches of 50 to avoid payload limits
                for (let i = 0; i < rows.length; i += 50) {
                    const batch = rows.slice(i, i + 50);
                    const { error: insertError } = await supabase
                        .from('club_members')
                        .upsert(batch, { onConflict: 'club_id,user_id', ignoreDuplicates: true });

                    if (insertError) {
                        // If upsert fails (e.g. no unique constraint), try individual inserts
                        for (const row of batch) {
                            const { error: singleError } = await supabase
                                .from('club_members')
                                .insert(row);
                            if (!singleError) membershipsCreated++;
                            // Ignore duplicate key errors silently
                        }
                    } else {
                        membershipsCreated += batch.length;
                    }
                }

                console.log(`[Orchestrator] Added ${missing.length} horses to club ${clubId}`);
            }

            // Update member counts on both clubs
            for (const clubId of clubIds) {
                const { count } = await supabase
                    .from('club_members')
                    .select('*', { count: 'exact', head: true })
                    .eq('club_id', clubId);

                if (count !== null) {
                    await supabase
                        .from('clubs')
                        .update({ member_count: count })
                        .eq('id', clubId);
                }
            }

            console.log(`[Orchestrator] Cross-club membership complete: ${membershipsCreated} new memberships created`);
        } catch (err: any) {
            this.logError(`ensureHorsesInBothClubs error: ${err.message}`);
        }
    }

    private logError(msg: string): void {
        console.error(`[Orchestrator] ${msg}`);
        this.errors.push(`${new Date().toISOString()} - ${msg}`);
    }
}

// Singleton
export const horseOrchestrator = new HorseOrchestrator();
export { DEFAULT_TABLES, TOURNAMENT_CONFIGS, SNG_CONFIGS, SPIN_CONFIGS };
export type { OrchestratorTable, OrchestratorStats, TableConfig };

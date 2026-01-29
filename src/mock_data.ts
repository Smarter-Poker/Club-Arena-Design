/**
 * MOCK DATA FOR CLUB ARENA UI SANDBOX
 * This file contains realistic dummy data for UI development
 * NO REAL DATABASE CONNECTIONS - ALL DATA IS HARDCODED
 */

export interface MockPlayer {
    id: string;
    username: string;
    avatar: string;
    chips: number;
    position: number;
    isDealer: boolean;
    isBigBlind: boolean;
    isSmallBlind: boolean;
    cards?: string[];
    isFolded: boolean;
    currentBet: number;
}

export interface MockClub {
    id: string;
    name: string;
    logo: string;
    memberCount: number;
    activeGames: number;
    totalChips: number;
}

export interface MockTable {
    id: string;
    name: string;
    stakes: string;
    players: MockPlayer[];
    pot: number;
    communityCards: string[];
    currentTurn: number;
}

// Mock Club Data
export const mockClub: MockClub = {
    id: 'club_001',
    name: 'Royal Flush Poker Club',
    logo: '/club-logos/royal-flush.png',
    memberCount: 47,
    activeGames: 3,
    totalChips: 1250000
};

// Mock Players
export const mockPlayers: MockPlayer[] = [
    {
        id: 'player_001',
        username: 'PokerPro88',
        avatar: '/images/avatars/avatar1.png',
        chips: 25000,
        position: 0,
        isDealer: true,
        isBigBlind: false,
        isSmallBlind: false,
        cards: ['AS', 'KH'],
        isFolded: false,
        currentBet: 0
    },
    {
        id: 'player_002',
        username: 'BluffMaster',
        avatar: '/images/avatars/avatar2.png',
        chips: 18500,
        position: 1,
        isDealer: false,
        isBigBlind: false,
        isSmallBlind: true,
        cards: ['QD', 'JC'],
        isFolded: false,
        currentBet: 50
    },
    {
        id: 'player_003',
        username: 'ChipLeader',
        avatar: '/images/avatars/avatar3.png',
        chips: 42000,
        position: 2,
        isDealer: false,
        isBigBlind: true,
        isSmallBlind: false,
        cards: ['10H', '9S'],
        isFolded: false,
        currentBet: 100
    },
    {
        id: 'player_004',
        username: 'AllInAnnie',
        avatar: '/images/avatars/avatar4.png',
        chips: 12300,
        position: 3,
        isDealer: false,
        isBigBlind: false,
        isSmallBlind: false,
        cards: ['7D', '7C'],
        isFolded: false,
        currentBet: 0
    },
    {
        id: 'player_005',
        username: 'RiverRat',
        avatar: '/images/avatars/avatar5.png',
        chips: 31200,
        position: 4,
        isDealer: false,
        isBigBlind: false,
        isSmallBlind: false,
        cards: ['AH', 'AD'],
        isFolded: false,
        currentBet: 0
    },
    {
        id: 'player_006',
        username: 'FoldQueen',
        avatar: '/images/avatars/avatar6.png',
        chips: 8900,
        position: 5,
        isDealer: false,
        isBigBlind: false,
        isSmallBlind: false,
        cards: [],
        isFolded: true,
        currentBet: 0
    }
];

// Mock Table State
export const mockTable: MockTable = {
    id: 'table_001',
    name: 'High Stakes Table',
    stakes: '$50/$100',
    players: mockPlayers,
    pot: 1500,
    communityCards: ['KS', 'QH', '10D'],
    currentTurn: 1
};

// Mock Club Members
export const mockMembers = [
    { id: '1', username: 'PokerPro88', chips: 25000, gamesPlayed: 142, winRate: 58 },
    { id: '2', username: 'BluffMaster', chips: 18500, gamesPlayed: 89, winRate: 52 },
    { id: '3', username: 'ChipLeader', chips: 42000, gamesPlayed: 201, winRate: 61 },
    { id: '4', username: 'AllInAnnie', chips: 12300, gamesPlayed: 67, winRate: 48 },
    { id: '5', username: 'RiverRat', chips: 31200, gamesPlayed: 156, winRate: 55 },
    { id: '6', username: 'FoldQueen', chips: 8900, gamesPlayed: 45, winRate: 42 }
];

// Mock Leaderboard
export const mockLeaderboard = [
    { rank: 1, username: 'ChipLeader', chips: 42000, profit: 12000 },
    { rank: 2, username: 'RiverRat', chips: 31200, profit: 8200 },
    { rank: 3, username: 'PokerPro88', chips: 25000, profit: 5000 },
    { rank: 4, username: 'BluffMaster', chips: 18500, profit: 1500 },
    { rank: 5, username: 'AllInAnnie', chips: 12300, profit: -2700 },
    { rank: 6, username: 'FoldQueen', chips: 8900, profit: -6100 }
];

// Helper function to get mock data
export const getMockData = () => ({
    club: mockClub,
    players: mockPlayers,
    table: mockTable,
    members: mockMembers,
    leaderboard: mockLeaderboard
});

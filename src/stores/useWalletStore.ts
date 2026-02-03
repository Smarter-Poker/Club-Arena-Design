/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CLUB ENGINE — Wallet Store (Zustand)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Global state for the Triple-Wallet system (Business, Player, Promo)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import { WalletService } from '../services/WalletService';

// ═══════════════════════════════════════════════════════════════════════════════
// 📦 TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type WalletType = 'BUSINESS' | 'PLAYER' | 'PROMO';

export interface WalletBalance {
    type: WalletType;
    available: number;
    locked: number;
    pending: number;
    total: number;
}

export interface WalletTransaction {
    id: string;
    walletType: WalletType;
    amount: number;
    direction: 'credit' | 'debit';
    category: 'buy_in' | 'cash_out' | 'transfer' | 'mint' | 'commission' | 'rakeback' | 'promo';
    description: string;
    timestamp: string;
    reference?: string;
}

interface WalletState {
    // Wallet balances
    balances: {
        BUSINESS: WalletBalance;
        PLAYER: WalletBalance;
        PROMO: WalletBalance;
    };
    isLoadingWallet: boolean;

    // Diamond balance
    diamonds: number;
    isLoadingDiamonds: boolean;

    // Transaction history
    transactions: WalletTransaction[];
    isLoadingTransactions: boolean;

    // Pending operations
    pendingBuyIn: number | null;
    pendingTableId: string | null;

    // Actions
    loadBalances: (userId: string) => Promise<void>;
    loadDiamonds: (userId: string) => Promise<void>;
    loadTransactions: (userId: string, limit?: number) => Promise<void>;
    refreshAll: (userId: string) => Promise<void>;

    // Wallet operations
    lockForBuyIn: (userId: string, amount: number, tableId: string) => Promise<boolean>;
    unlockFromTable: (userId: string, amount: number, tableId: string) => Promise<boolean>;
    internalTransfer: (userId: string, fromWallet: WalletType, toWallet: WalletType, amount: number) => Promise<boolean>;
    mintChips: (clubId: string, chips: number) => Promise<{ chips: number; success: boolean }>;

    reset: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 📐 CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const createEmptyBalance = (type: WalletType): WalletBalance => ({
    type,
    available: 0,
    locked: 0,
    pending: 0,
    total: 0,
});

const initialState = {
    balances: {
        BUSINESS: createEmptyBalance('BUSINESS'),
        PLAYER: createEmptyBalance('PLAYER'),
        PROMO: createEmptyBalance('PROMO'),
    },
    isLoadingWallet: false,
    diamonds: 0,
    isLoadingDiamonds: false,
    transactions: [] as WalletTransaction[],
    isLoadingTransactions: false,
    pendingBuyIn: null as number | null,
    pendingTableId: null as string | null,
};

// ═══════════════════════════════════════════════════════════════════════════════
// 🏪 STORE IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

export const useWalletStore = create<WalletState>()(
    persist(
        (set, get) => ({
            ...initialState,

            loadBalances: async (userId: string) => {
                set({ isLoadingWallet: true });
                try {
                    const walletBalances = await WalletService.getBalances(userId);
                    const balances = {
                        BUSINESS: createEmptyBalance('BUSINESS'),
                        PLAYER: createEmptyBalance('PLAYER'),
                        PROMO: createEmptyBalance('PROMO'),
                    };

                    for (const wallet of walletBalances) {
                        const type = wallet.walletType as WalletType;
                        if (type in balances) {
                            balances[type] = {
                                type,
                                available: wallet.availableBalance,
                                locked: wallet.lockedBalance,
                                pending: 0,
                                total: wallet.balance,
                            };
                        }
                    }

                    set({ balances });
                } catch (error) {
                    console.error('[Store] Load balances failed:', error);
                } finally {
                    set({ isLoadingWallet: false });
                }
            },

            loadDiamonds: async (userId: string) => {
                set({ isLoadingDiamonds: true });
                try {
                    // Load diamonds from user profile
                    const { data, error } = await supabase
                        .from('profiles')
                        .select('diamonds')
                        .eq('id', userId)
                        .single();

                    if (!error && data) {
                        set({ diamonds: data.diamonds || 0 });
                    } else {
                        set({ diamonds: 0 });
                    }
                } catch (error) {
                    console.error('[Store] Load diamonds failed:', error);
                    set({ diamonds: 0 });
                } finally {
                    set({ isLoadingDiamonds: false });
                }
            },

            loadTransactions: async (userId: string, limit = 50) => {
                set({ isLoadingTransactions: true });
                try {
                    const txHistory = await WalletService.getTransactionHistory(userId, { limit });
                    const transactions: WalletTransaction[] = txHistory.map(tx => ({
                        id: tx.id,
                        walletType: tx.walletType as WalletType,
                        amount: tx.amount,
                        direction: tx.type as 'credit' | 'debit',
                        category: tx.category as WalletTransaction['category'],
                        description: tx.description,
                        timestamp: tx.createdAt,
                        reference: tx.relatedEntityId,
                    }));
                    set({ transactions });
                } catch (error) {
                    console.error('[Store] Load transactions failed:', error);
                } finally {
                    set({ isLoadingTransactions: false });
                }
            },

            refreshAll: async (userId: string) => {
                await Promise.all([
                    get().loadBalances(userId),
                    get().loadDiamonds(userId),
                    get().loadTransactions(userId),
                ]);
            },

            lockForBuyIn: async (userId: string, amount: number, tableId: string) => {
                const { balances } = get();
                if (balances.PLAYER.available < amount) {
                    console.error('[Store] Insufficient balance for buy-in');
                    return false;
                }

                // Optimistic update
                set({
                    pendingBuyIn: amount,
                    pendingTableId: tableId,
                    balances: {
                        ...balances,
                        PLAYER: {
                            ...balances.PLAYER,
                            available: balances.PLAYER.available - amount,
                            locked: balances.PLAYER.locked + amount,
                        },
                    },
                });

                try {
                    await WalletService.lockForBuyIn(userId, tableId, amount);
                    return true;
                } catch (error) {
                    // Revert on failure
                    set({
                        pendingBuyIn: null,
                        pendingTableId: null,
                        balances,
                    });
                    console.error('[Store] Lock for buy-in failed:', error);
                    return false;
                }
            },

            unlockFromTable: async (userId: string, amount: number, tableId: string) => {
                const { balances, pendingTableId } = get();
                if (pendingTableId !== tableId) {
                    console.warn('[Store] Table ID mismatch for unlock');
                }

                set({
                    pendingBuyIn: null,
                    pendingTableId: null,
                    balances: {
                        ...balances,
                        PLAYER: {
                            ...balances.PLAYER,
                            available: balances.PLAYER.available + amount,
                            locked: Math.max(0, balances.PLAYER.locked - amount),
                        },
                    },
                });

                try {
                    await WalletService.unlockFromTable(userId, tableId, amount);
                    return true;
                } catch (error) {
                    console.error('[Store] Unlock from table failed:', error);
                    return false;
                }
            },

            internalTransfer: async (userId: string, fromWallet: WalletType, toWallet: WalletType, amount: number) => {
                const { balances } = get();
                if (balances[fromWallet].available < amount) {
                    console.error('[Store] Insufficient balance for transfer');
                    return false;
                }

                // Optimistic update
                const previousBalances = { ...balances };
                set({
                    balances: {
                        ...balances,
                        [fromWallet]: {
                            ...balances[fromWallet],
                            available: balances[fromWallet].available - amount,
                            total: balances[fromWallet].total - amount,
                        },
                        [toWallet]: {
                            ...balances[toWallet],
                            available: balances[toWallet].available + amount,
                            total: balances[toWallet].total + amount,
                        },
                    },
                });

                try {
                    await WalletService.internalTransfer(userId, {
                        fromWallet,
                        toWallet,
                        amount,
                    });
                    return true;
                } catch (error) {
                    // Revert on failure
                    set({ balances: previousBalances });
                    console.error('[Store] Internal transfer failed:', error);
                    return false;
                }
            },

            mintChips: async (clubId: string, chips: number) => {
                try {
                    const result = await WalletService.mintChips(clubId, chips);
                    if (result.success) {
                        // Refresh balances after minting
                        return { chips: result.chipsAdded, success: true };
                    }
                    return { chips: 0, success: false };
                } catch (error) {
                    console.error('[Store] Mint chips failed:', error);
                    return { chips: 0, success: false };
                }
            },

            reset: () => {
                set(initialState);
            },
        }),
        {
            name: 'wallet-store',
            partialize: () => ({}), // Don't persist wallet data for security
        }
    )
);

// ═══════════════════════════════════════════════════════════════════════════════
// 📐 HELPER HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

export function useTotalBalance() {
    const balances = useWalletStore((s) => s.balances);
    return balances.BUSINESS.total + balances.PLAYER.total + balances.PROMO.total;
}

export function useAvailableChips() {
    const balances = useWalletStore((s) => s.balances);
    return balances.PLAYER.available;
}

export function useCanBuyIn(amount: number) {
    const balances = useWalletStore((s) => s.balances);
    return balances.PLAYER.available >= amount;
}

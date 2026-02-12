/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  DIAMOND SERVICE — Purchase & Balance Management
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Handles diamond balance queries, top-up operations, and transaction history.
 * Diamonds are the in-app currency used for VIP features and a-la-carte purchases.
 */

import { supabase } from '../lib/supabase';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface DiamondPackage {
    id: string;
    name: string;
    diamonds: number;
    bonusDiamonds: number;
    priceUSD: number;
    popular?: boolean;
    bestValue?: boolean;
}

export interface DiamondWallet {
    balance: number;
    lifetimeEarned: number;
    lifetimeSpent: number;
}

export interface DiamondTransaction {
    id: string;
    type: string;
    amount: number;
    description: string;
    createdAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DIAMOND PACKAGES — Available for purchase
// ═══════════════════════════════════════════════════════════════════════════════

export const DIAMOND_PACKAGES: DiamondPackage[] = [
    { id: 'starter', name: 'Starter', diamonds: 100, bonusDiamonds: 0, priceUSD: 0.99 },
    { id: 'popular', name: 'Popular', diamonds: 500, bonusDiamonds: 50, priceUSD: 3.99, popular: true },
    { id: 'value', name: 'Value Pack', diamonds: 1200, bonusDiamonds: 200, priceUSD: 7.99 },
    { id: 'premium', name: 'Premium', diamonds: 3000, bonusDiamonds: 750, priceUSD: 14.99 },
    { id: 'elite', name: 'Elite Bundle', diamonds: 6500, bonusDiamonds: 2000, priceUSD: 24.99, bestValue: true },
    { id: 'whale', name: 'Diamond Vault', diamonds: 15000, bonusDiamonds: 5000, priceUSD: 49.99 },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export const DiamondService = {
    /**
     * Get user's diamond wallet balance
     */
    async getBalance(userId: string): Promise<DiamondWallet> {
        const { data, error } = await supabase
            .from('diamond_wallets')
            .select('balance, lifetime_earned, lifetime_spent')
            .eq('user_id', userId)
            .single();

        if (error || !data) {
            return { balance: 0, lifetimeEarned: 0, lifetimeSpent: 0 };
        }

        return {
            balance: data.balance || 0,
            lifetimeEarned: data.lifetime_earned || 0,
            lifetimeSpent: data.lifetime_spent || 0,
        };
    },

    /**
     * Get transaction history
     */
    async getTransactions(userId: string, limit = 20): Promise<DiamondTransaction[]> {
        const { data, error } = await supabase
            .from('wallet_transactions')
            .select('id, type, amount, description, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error || !data) return [];

        return data.map((t: any) => ({
            id: t.id,
            type: t.type,
            amount: t.amount,
            description: t.description,
            createdAt: t.created_at,
        }));
    },

    /**
     * Purchase diamonds (calls backend RPC to credit balance)
     * In production this would be behind a Stripe payment intent verification.
     * For now, it directly credits via the fn_add_diamonds RPC.
     */
    async purchaseDiamonds(
        userId: string,
        packageId: string
    ): Promise<{ success: boolean; newBalance?: number; error?: string }> {
        const pkg = DIAMOND_PACKAGES.find(p => p.id === packageId);
        if (!pkg) {
            return { success: false, error: 'Invalid package' };
        }

        const totalDiamonds = pkg.diamonds + pkg.bonusDiamonds;

        const { data, error } = await supabase.rpc('fn_add_diamonds', {
            p_user_id: userId,
            p_amount: totalDiamonds,
            p_reason: `Purchased ${pkg.name} (${pkg.diamonds}+${pkg.bonusDiamonds} bonus)`,
        });

        if (error) {
            console.error('DiamondService.purchaseDiamonds error:', error);
            return { success: false, error: error.message };
        }

        return {
            success: data?.success ?? true,
            newBalance: data?.new_balance,
        };
    },

    /**
     * Check if user can afford a specific cost
     */
    async canAfford(userId: string, cost: number): Promise<boolean> {
        const wallet = await this.getBalance(userId);
        return wallet.balance >= cost;
    },
};

export default DiamondService;

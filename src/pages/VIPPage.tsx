/**
 *  VIP PAGE — VIP Diamond Member + A-la-Carte Purchases with Live Updates
 */

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useUserStore } from '../stores/useUserStore';
import { vipService, VIP_GOLD_LIMITS, FEATURE_PRICING, type VIPFeature } from '../services/VIPService';
import { VIPCardsModal } from '../components/vip/VIPCardsModal';
import { VIPPerksGrid } from '../components/vip/VIPPerksGrid';
import { DiamondTopUpModal } from '../components/vip/DiamondTopUpModal';
import { useToast } from '../components/common/Toast';
import './VIPPage.css';

export default function VIPPage() {
    const { user } = useUserStore();
    const toast = useToast();

    const [isVIP, setIsVIP] = useState(false);
    const [diamonds, setDiamonds] = useState(0);
    const [loading, setLoading] = useState(true);
    const [showInfoModal, setShowInfoModal] = useState(false);
    const [showTopUpModal, setShowTopUpModal] = useState(false);
    const [purchasing, setPurchasing] = useState<string | null>(null);
    const [vipEntranceComplete, setVIPEntranceComplete] = useState(false);

    // VIP entrance animation
    useEffect(() => {
        if (!loading) {
            const timer = setTimeout(() => setVIPEntranceComplete(true), 200);
            return () => clearTimeout(timer);
        }
    }, [loading]);

    useEffect(() => {
        loadVIPStatus();

        // Real-time profile updates (diamonds, VIP status)
        if (user?.id) {
            const channel = supabase
                .channel('vip-status')
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'profiles',
                        filter: `id=eq.${user.id}`,
                    },
                    (payload) => {
                        const newData = payload.new as any;
                        if (newData.diamonds !== undefined) {
                            setDiamonds(newData.diamonds);
                        }
                    }
                )
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        }
    }, [user?.id]);

    const loadVIPStatus = async () => {
        if (!user?.id) {
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            // Check VIP Gold status
            const vipStatus = await vipService.checkVIPStatus(user.id);
            setIsVIP(vipStatus.isVIP);

            // Load diamond balance
            const { data } = await supabase
                .from('profiles')
                .select('diamonds')
                .eq('id', user.id)
                .single();

            setDiamonds(data?.diamonds || 0);
        } catch (error) {
            toast.error('Failed to load VIP status');
        }
        setLoading(false);
    };

    const handlePurchase = async (feature: VIPFeature) => {
        if (!user?.id) return;

        setPurchasing(feature);
        try {
            const result = await vipService.purchaseFeature(user.id, feature);
            if (result.success) {
                toast.success(`Purchased ${feature} for ${result.charged} `);
                setDiamonds(prev => prev - result.charged);
            } else {
                toast.error(result.error || 'Purchase failed');
            }
        } catch (error) {
            toast.error('Purchase failed');
        }
        setPurchasing(null);
    };

    if (loading) {
        return (
            <div className="vip-page">
                <div className="loading-state"><div className="spinner" /></div>
            </div>
        );
    }

    return (
        <div className="vip-page">

            {/* VIP Gold Status */}
            <section
                className="vip-section vip-card-section"
                style={{
                    opacity: vipEntranceComplete ? 1 : 0,
                    transform: vipEntranceComplete ? 'translateY(0)' : 'translateY(12px)',
                    transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                }}
            >
                <h3> VIP Diamond</h3>
                {isVIP ? (
                    <div className="vip-card-active" style={{ borderColor: '#ffd700', textAlign: 'center' }}>
                        {/* VIP Card Image */}
                        <div style={{ marginBottom: 16 }}>
                            <img
                                src="/vip-card.png"
                                alt="VIP Card"
                                style={{
                                    width: '100%',
                                    maxWidth: 300,
                                    height: 'auto',
                                    borderRadius: 12,
                                    boxShadow: '0 8px 32px rgba(255, 215, 0, 0.3)',
                                }}
                            />
                        </div>
                        <div className="vip-card-info" style={{ textAlign: 'center' }}>
                            <span className="vip-card-tier" style={{ color: '#ffd700', fontSize: 18, fontWeight: 700 }}>Diamond Member</span>
                            <span className="vip-card-expiry">Included with Smarter.Poker</span>
                        </div>
                        <button className="vip-extend-btn" onClick={() => setShowInfoModal(true)}>
                            View Benefits
                        </button>
                    </div>
                ) : (
                    <div className="vip-card-inactive">
                        <p>Get VIP Diamond with your Smarter.Poker Membership</p>
                        <ul className="vip-card-features">
                            <li>🐰 Free Rabbit Hunt</li>
                            <li> Show Stack in BBs</li>
                            <li> Offline Protection</li>
                            <li> {VIP_GOLD_LIMITS.timeBankSeconds}s Free Time Bank</li>
                        </ul>
                        <button className="vip-purchase-btn" onClick={() => setShowInfoModal(true)}>
                            View All Benefits
                        </button>
                    </div>
                )}

                {/* VIP Benefits if active */}
                {isVIP && (
                    <div className="vip-benefits-grid">
                        <div className="vip-benefit">
                            <span className="benefit-value">∞</span>
                            <span className="benefit-label">Rabbit Hunt</span>
                        </div>
                        <div className="vip-benefit">
                            <span className="benefit-value">{VIP_GOLD_LIMITS.timeBankSeconds}s</span>
                            <span className="benefit-label">Time Bank</span>
                        </div>
                        <div className="vip-benefit">
                            <span className="benefit-value">+{VIP_GOLD_LIMITS.themes}</span>
                            <span className="benefit-label">Themes</span>
                        </div>
                        <div className="vip-benefit">
                            <span className="benefit-value">{(VIP_GOLD_LIMITS.leaderboardBoost * 100).toFixed(0)}%</span>
                            <span className="benefit-label">Score Boost</span>
                        </div>
                    </div>
                )}

                {/* VIP Perks Grid */}
                {isVIP && (
                    <VIPPerksGrid
                        currentTier="diamond"
                        perks={[
                            { id: 'rabbit', icon: '🐰', title: 'Rabbit Hunt', description: 'See undealt cards', value: 'Unlimited' },
                            { id: 'timebank', icon: '⏱️', title: 'Time Bank', description: `${VIP_GOLD_LIMITS.timeBankSeconds}s free per month`, value: `${VIP_GOLD_LIMITS.timeBankSeconds}s` },
                            { id: 'throwable', icon: '💣', title: 'Throwables', description: '500 free throws per month', value: '500/mo' },
                            { id: 'offline', icon: '🛡️', title: 'Offline Protection', description: 'Unlimited timeout protection', value: 'Unlimited' },
                            { id: 'autobank', icon: '⏱️', title: 'Auto Time Bank', description: 'Automatic time bank usage', value: 'Free' },
                            { id: 'themes', icon: '🎨', title: 'Themes', description: `${VIP_GOLD_LIMITS.themes} premium themes`, value: `${VIP_GOLD_LIMITS.themes}` },
                            { id: 'boost', icon: '📊', title: 'Leaderboard Boost', description: `${(VIP_GOLD_LIMITS.leaderboardBoost * 100).toFixed(0)}% score boost`, value: `+${(VIP_GOLD_LIMITS.leaderboardBoost * 100).toFixed(0)}%` },
                            { id: 'emojis', icon: '😀', title: 'Emojis', description: 'Access to all emoji packs', value: 'All Packs' },
                        ]}
                    />
                )}
            </section>

            {/* Diamond Balance */}
            <section className="vip-section">
                <div className="diamond-balance">
                    <span className="diamond-icon"></span>
                    <span className="diamond-count">{diamonds.toLocaleString()}</span>
                    <span className="diamond-label">Diamonds</span>
                    <button
                        className="diamond-buy-btn"
                        onClick={() => setShowTopUpModal(true)}
                    >
                        + Buy Diamonds
                    </button>
                </div>
            </section>

            {/* A-la-Carte Purchases */}
            {!isVIP && (
                <section className="vip-section">
                    <h3> Buy Features</h3>
                    <p className="section-desc">Not a Diamond member? Purchase features individually with diamonds.</p>

                    <div className="purchase-grid">
                        {Object.entries(FEATURE_PRICING)
                            .filter(([, pricing]) => pricing.cost > 0)
                            .map(([feature, pricing]) => (
                                <div key={feature} className="purchase-card">
                                    <div className="purchase-info">
                                        <span className="purchase-name">{feature.replace(/_/g, ' ')}</span>
                                        <span className="purchase-desc">{pricing.description}</span>
                                    </div>
                                    <div className="purchase-action">
                                        <span className="purchase-cost">{pricing.cost} 💎</span>
                                        <button
                                            className="purchase-btn"
                                            onClick={() => handlePurchase(feature as VIPFeature)}
                                            disabled={purchasing === feature || diamonds < pricing.cost}
                                        >
                                            {purchasing === feature ? '...' : 'Buy'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                    </div>
                </section>
            )}

            {/* Info Modal */}
            <VIPCardsModal
                isOpen={showInfoModal}
                onClose={() => setShowInfoModal(false)}
            />

            {/* Diamond Top-Up Modal */}
            <DiamondTopUpModal
                isOpen={showTopUpModal}
                onClose={() => setShowTopUpModal(false)}
                onPurchaseComplete={(newBal) => setDiamonds(newBal)}
            />
        </div>
    );
}

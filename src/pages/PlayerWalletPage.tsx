/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  PLAYER WALLET PAGE — Triple-Wallet View (Metal UI)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Displays Business, Player, and Promo wallet balances with transfer options
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase'
import { masterBus } from '../core/MasterBus';
import { useWalletStore } from '../stores/useWalletStore';
import { useUserStore } from '../stores/useUserStore';
import { TransactionHistory } from '../components/wallet/TransactionHistory';
import DepositWithdrawModal from '../components/wallet/DepositWithdrawModal';
import { WalletService } from '../services/WalletService';
import { MetalFrame, MetalButton, MetalInput, MetalCard } from '../components/metal-ui';
import './PlayerWalletPage.css';

type WalletTab = 'overview' | 'transfer' | 'history';
type WalletType = 'BUSINESS' | 'PLAYER' | 'PROMO';

export default function PlayerWalletPage() {
    const navigate = useNavigate();
    const { user } = useUserStore();
    const {
        balances,
        diamonds,
        isLoadingWallet,
        loadBalances,
        loadDiamonds,
        internalTransfer,
    } = useWalletStore();

    const [activeTab, setActiveTab] = useState<WalletTab>('overview');
    const [transferFrom, setTransferFrom] = useState<WalletType>('PLAYER');
    const [transferTo, setTransferTo] = useState<WalletType>('BUSINESS');
    const [transferAmount, setTransferAmount] = useState('');
    const [isTransferring, setIsTransferring] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [showDepositModal, setShowDepositModal] = useState(false);
    const [showWithdrawModal, setShowWithdrawModal] = useState(false);
    const [visibleWalletCards, setVisibleWalletCards] = useState(new Set<number>());

    // Stagger wallet cards on mount
    useEffect(() => {
        const timers = [0, 1, 2].map((i) =>
            setTimeout(() => setVisibleWalletCards(prev => new Set([...prev, i])), i * 70)
        );
        return () => timers.forEach(t => clearTimeout(t));
    }, []);

    useEffect(() => {
        if (user?.id) {
            loadBalances(user.id);
            loadDiamonds(user.id);
        }
    }, [user?.id, loadBalances, loadDiamonds]);

    // ── Realtime subscription: live wallet balance updates ──
    useEffect(() => {
        if (!user?.id) return;

        const channelKey = `user-wallet-${user.id}`;


        const channel = masterBus.getOrCreateChannel(channelKey);
            channel
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'wallets',
                    filter: `user_id=eq.${user.id}`,
                },
                (payload) => {
                    // On any wallet change, refetch the balances
                    if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
                        loadBalances(user.id);
                        loadDiamonds(user.id);
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'wallet_transactions',
                    filter: `user_id=eq.${user.id}`,
                },
                (payload) => {
                    // On any wallet transaction, refetch balances and let TransactionHistory handle updates
                    if (payload.eventType === 'INSERT') {
                        loadBalances(user.id);
                        loadDiamonds(user.id);
                    }
                }
            )
            .subscribe();

        // Cleanup on unmount
        return () => {
            masterBus.removeRegisteredChannel(channelKey);
        };
    }, [user?.id, loadBalances, loadDiamonds]);

    // ── Bus Listeners: cross-page wallet event reactivity ──
    useEffect(() => {
        if (!user?.id) return;
        const unsubBalance = masterBus.subscribeDebounced('BALANCE_UPDATED', () => { loadBalances(user.id); loadDiamonds(user.id); }, 500);
        const unsubWallet = masterBus.subscribeDebounced('WALLET_REFRESHED', () => { loadBalances(user.id); loadDiamonds(user.id); }, 500);
        return () => { unsubBalance(); unsubWallet(); };
    }, [user?.id, loadBalances, loadDiamonds]);

    const totalBalance = balances.BUSINESS.total + balances.PLAYER.total + balances.PROMO.total;

    // Animated balance counter
    const useCountUpNumber = (target: number, duration: number = 600) => {
        const [display, setDisplay] = useState(0);
        useEffect(() => {
            let startTime: number;
            const animate = (now: number) => {
                if (!startTime) startTime = now;
                const progress = Math.min((now - startTime) / duration, 1);
                setDisplay(Math.floor(target * progress));
                if (progress < 1) requestAnimationFrame(animate);
                else setDisplay(target);
            };
            requestAnimationFrame(animate);
        }, [target, duration]);
        return display;
    };

    const displayedBalance = useCountUpNumber(totalBalance, 600);

    const handleTransfer = async () => {
        const amount = parseFloat(transferAmount);
        if (isNaN(amount) || amount <= 0) {
            setMessage({ type: 'error', text: 'Please enter a valid amount' });
            return;
        }
        if (transferFrom === transferTo) {
            setMessage({ type: 'error', text: 'Cannot transfer to the same wallet' });
            return;
        }

        setIsTransferring(true);
        setMessage(null);
        try {
            if (!user?.id) return;
            await internalTransfer(user.id, transferFrom, transferTo, amount);
            setMessage({ type: 'success', text: `Transferred ${amount.toLocaleString()} chips successfully!` });
            setTransferAmount('');
            if (user?.id) loadBalances(user.id);
        } catch (error) {
            setMessage({ type: 'error', text: 'Transfer failed. Please try again.' });
        }
        setIsTransferring(false);
    };

    const walletInfo: Record<WalletType, { icon: string; label: string; description: string }> = {
        BUSINESS: {
            icon: '',
            label: 'Business',
            description: 'Commissions & Settlements',
        },
        PLAYER: {
            icon: '',
            label: 'Player',
            description: 'Table Buy-ins & Gameplay',
        },
        PROMO: {
            icon: '',
            label: 'Promo',
            description: 'Bonuses & Rewards',
        },
    };

    return (
        <div className="wallet-page">

            {/* Total Balance Card - Metal Frame */}
            <div style={{
                opacity: activeTab === 'overview' ? 1 : 0.9,
                transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            }}>
            <MetalFrame variant="card" size="lg">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div>
                        <span style={{ fontSize: '0.85rem', color: '#8899aa', textTransform: 'uppercase', letterSpacing: '1px' }}>Total Balance</span>
                        <div style={{ fontSize: '2rem', fontWeight: 700, color: '#00d4ff', fontFamily: 'monospace' }}>{displayedBalance.toLocaleString()}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1.5rem' }}>◆</span>
                        <span style={{ fontSize: '1.25rem', fontWeight: 600, color: '#fff' }}>{diamonds.toLocaleString()}</span>
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                    <MetalButton variant="primary" size="sm" onClick={() => setShowDepositModal(true)}>
                        Deposit
                    </MetalButton>
                    <MetalButton variant="secondary" size="sm" onClick={() => setShowWithdrawModal(true)}>
                        Withdraw
                    </MetalButton>
                    <MetalButton variant="ghost" size="sm" onClick={() => navigate('/rakeback')}>
                        Rake Back
                    </MetalButton>
                    <MetalButton variant="ghost" size="sm" onClick={() => navigate('/transactions')}>
                        History
                    </MetalButton>
                </div>
            </MetalFrame>
            </div>

            {/* Tabs - Metal Style */}
            <div className="wallet-tabs" style={{
                display: 'flex',
                gap: '8px',
                padding: '8px',
                background: 'linear-gradient(180deg, #1a2a3a 0%, #0d1520 100%)',
                border: '2px solid #2a3a4a',
                borderRadius: '8px',
                marginTop: '16px'
            }}>
                {(['overview', 'transfer', 'history'] as WalletTab[]).map((tab) => (
                    <button
                        key={tab}
                        style={{
                            flex: 1,
                            padding: '12px',
                            background: activeTab === tab ? 'linear-gradient(135deg, #00d4ff 0%, #0099cc 100%)' : 'transparent',
                            border: activeTab === tab ? '1px solid #00d4ff' : '1px solid transparent',
                            borderRadius: '6px',
                            color: activeTab === tab ? '#fff' : '#8899aa',
                            fontWeight: 600,
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                        }}
                        onClick={() => setActiveTab(tab)}
                    >
                        {tab === 'overview' ? 'Overview' :
                            tab === 'transfer' ? 'Transfer' :
                                'History'}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="wallet-content" style={{ marginTop: '16px' }}>
                {activeTab === 'overview' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {(Object.keys(walletInfo) as WalletType[]).map((type, index) => (
                            <div
                                key={type}
                                style={{
                                    opacity: visibleWalletCards.has(index) ? 1 : 0,
                                    transform: visibleWalletCards.has(index) ? 'translateY(0)' : 'translateY(8px)',
                                    transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                                }}
                            >
                            <MetalCard
                                size="md"
                                glow
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <div style={{
                                        width: '50px',
                                        height: '50px',
                                        fontSize: '24px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: 'linear-gradient(135deg, #1a2a3a 0%, #0d1520 100%)',
                                        border: '1px solid #2a3a4a',
                                        borderRadius: '10px'
                                    }}>{walletInfo[type].icon}</div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, fontSize: '1.1rem', color: '#fff' }}>{walletInfo[type].label}</div>
                                        <div style={{ fontSize: '0.8rem', color: '#6a7a8a' }}>{walletInfo[type].description}</div>
                                    </div>
                                </div>
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-around',
                                    padding: '16px 0',
                                    marginTop: '16px',
                                    borderTop: '1px solid rgba(255,255,255,0.1)'
                                }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#00d4ff' }}>{balances[type].available.toLocaleString()}</div>
                                        <div style={{ fontSize: '0.7rem', color: '#6a7a8a', textTransform: 'uppercase' }}>Available</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ff9500' }}>{balances[type].locked.toLocaleString()}</div>
                                        <div style={{ fontSize: '0.7rem', color: '#6a7a8a', textTransform: 'uppercase' }}>Locked</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>{balances[type].total.toLocaleString()}</div>
                                        <div style={{ fontSize: '0.7rem', color: '#6a7a8a', textTransform: 'uppercase' }}>Total</div>
                                    </div>
                                </div>
                            </MetalCard>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'transfer' && (
                    <MetalFrame title="INTERNAL TRANSFER" variant="form" size="md">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <p style={{ color: '#8899aa', textAlign: 'center', margin: 0 }}>
                                Move funds between your wallets instantly.
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{
                                    fontFamily: "'Orbitron', 'Rajdhani', sans-serif",
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    color: '#fff',
                                    textTransform: 'uppercase',
                                    letterSpacing: '1px'
                                }}>FROM:</label>
                                <select
                                    value={transferFrom}
                                    onChange={(e) => setTransferFrom(e.target.value as WalletType)}
                                    style={{
                                        width: '100%',
                                        padding: '14px 18px',
                                        background: 'linear-gradient(180deg, #0d1520 0%, #1a2332 100%)',
                                        border: '2px solid #2a3a4a',
                                        borderRadius: '6px',
                                        color: '#fff',
                                        fontSize: '1rem'
                                    }}
                                >
                                    {(Object.keys(walletInfo) as WalletType[]).map((type) => (
                                        <option key={type} value={type}>
                                            {walletInfo[type].icon} {walletInfo[type].label} ({balances[type].available.toLocaleString()})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ textAlign: 'center', fontSize: '1.5rem', color: '#00d4ff' }}>↓</div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{
                                    fontFamily: "'Orbitron', 'Rajdhani', sans-serif",
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    color: '#fff',
                                    textTransform: 'uppercase',
                                    letterSpacing: '1px'
                                }}>TO:</label>
                                <select
                                    value={transferTo}
                                    onChange={(e) => setTransferTo(e.target.value as WalletType)}
                                    style={{
                                        width: '100%',
                                        padding: '14px 18px',
                                        background: 'linear-gradient(180deg, #0d1520 0%, #1a2332 100%)',
                                        border: '2px solid #2a3a4a',
                                        borderRadius: '6px',
                                        color: '#fff',
                                        fontSize: '1rem'
                                    }}
                                >
                                    {(Object.keys(walletInfo) as WalletType[]).map((type) => (
                                        <option key={type} value={type}>
                                            {walletInfo[type].icon} {walletInfo[type].label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <MetalInput
                                label="AMOUNT:"
                                type="number"
                                placeholder="0.00"
                                value={transferAmount}
                                onChange={(e) => setTransferAmount(e.target.value)}
                            />

                            {message && (
                                <div style={{
                                    color: message.type === 'success' ? '#00ff88' : '#ff6b6b',
                                    textAlign: 'center',
                                    fontSize: '0.875rem'
                                }}>
                                    {message.text}
                                </div>
                            )}

                            <MetalButton
                                variant="primary"
                                fullWidth
                                onClick={handleTransfer}
                                disabled={isTransferring || !transferAmount}
                            >
                                {isTransferring ? 'Transferring...' : 'TRANSFER'}
                            </MetalButton>
                        </div>
                    </MetalFrame>
                )}

                {activeTab === 'history' && user?.id && (
                    <MetalCard size="lg">
                        <TransactionHistory walletId={user.id} limit={50} />
                    </MetalCard>
                )}
            </div>

            {/* Deposit Modal */}
            <DepositWithdrawModal
                isOpen={showDepositModal}
                onClose={() => setShowDepositModal(false)}
                mode="deposit"
                userId={user?.id || ''}
                currentBalance={balances.PLAYER.available}
                onComplete={() => user?.id && loadBalances(user.id)}
            />

            {/* Withdraw Modal */}
            <DepositWithdrawModal
                isOpen={showWithdrawModal}
                onClose={() => setShowWithdrawModal(false)}
                mode="withdraw"
                userId={user?.id || ''}
                currentBalance={balances.PLAYER.available}
                onComplete={() => user?.id && loadBalances(user.id)}
            />
        </div>
    );
}

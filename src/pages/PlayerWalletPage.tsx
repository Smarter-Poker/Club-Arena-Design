/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  PLAYER WALLET PAGE — Triple-Wallet View
 * ═══════════════════════════════════════════════════════════════════════════════
 * Displays Business, Player, and Promo wallet balances with transfer options
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWalletStore } from '../stores/useWalletStore';
import { useUserStore } from '../stores/useUserStore';
import TransactionHistory from '../components/TransactionHistory';
import SmarterHeader from '../components/layout/SmarterHeader';
import DepositWithdrawModal from '../components/wallet/DepositWithdrawModal';
import { WalletService } from '../services/WalletService';
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

    useEffect(() => {
        if (user?.id) {
            loadBalances(user.id);
            loadDiamonds(user.id);
        }
    }, [user?.id, loadBalances, loadDiamonds]);

    const totalBalance = balances.BUSINESS.total + balances.PLAYER.total + balances.PROMO.total;

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
            setMessage({ type: 'success', text: `Transferred $${amount.toLocaleString()} successfully!` });
            setTransferAmount('');
            if (user?.id) loadBalances(user.id);
        } catch (error) {
            setMessage({ type: 'error', text: 'Transfer failed. Please try again.' });
        }
        setIsTransferring(false);
    };

    const walletInfo: Record<WalletType, { icon: string; label: string; description: string }> = {
        BUSINESS: {
            icon: '💼',
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
            <SmarterHeader title=" My Wallet" />

            {/* Total Balance Card */}
            <div className="total-balance-card">
                <div className="balance-section">
                    <span className="balance-label">Total Balance</span>
                    <span className="balance-value">${totalBalance.toLocaleString()}</span>
                </div>
                <div className="diamonds-section">
                    <span className="diamond-icon"></span>
                    <span className="diamond-count">{diamonds.toLocaleString()}</span>
                </div>
                <div className="balance-actions">
                    <button className="action-btn deposit" onClick={() => setShowDepositModal(true)}>
                         Deposit
                    </button>
                    <button className="action-btn withdraw" onClick={() => setShowWithdrawModal(true)}>
                         Withdraw
                    </button>
                    <button className="action-btn rakeback" onClick={() => navigate('/rakeback')}>
                         Rakeback
                    </button>
                    <button className="action-btn history" onClick={() => navigate('/transactions')}>
                         Full History
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="wallet-tabs">
                {(['overview', 'transfer', 'history'] as WalletTab[]).map((tab) => (
                    <button
                        key={tab}
                        className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab)}
                    >
                        {tab === 'overview' ? ' Overview' :
                            tab === 'transfer' ? '↔️ Transfer' :
                                ' History'}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="wallet-content">
                {activeTab === 'overview' && (
                    <div className="wallets-grid">
                        {(Object.keys(walletInfo) as WalletType[]).map((type) => (
                            <div key={type} className={`wallet-card wallet-${type.toLowerCase()}`}>
                                <div className="wallet-icon">{walletInfo[type].icon}</div>
                                <div className="wallet-details">
                                    <span className="wallet-label">{walletInfo[type].label}</span>
                                    <span className="wallet-description">{walletInfo[type].description}</span>
                                </div>
                                <div className="wallet-balances">
                                    <div className="balance-row">
                                        <span>Available</span>
                                        <span className="amount">${balances[type].available.toLocaleString()}</span>
                                    </div>
                                    <div className="balance-row">
                                        <span>Locked</span>
                                        <span className="amount locked">${balances[type].locked.toLocaleString()}</span>
                                    </div>
                                    <div className="balance-row total">
                                        <span>Total</span>
                                        <span className="amount">${balances[type].total.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'transfer' && (
                    <div className="transfer-section">
                        <h3>Transfer Between Wallets</h3>

                        <div className="transfer-form">
                            <div className="form-row">
                                <label>From</label>
                                <select
                                    value={transferFrom}
                                    onChange={(e) => setTransferFrom(e.target.value as WalletType)}
                                >
                                    {(Object.keys(walletInfo) as WalletType[]).map((type) => (
                                        <option key={type} value={type}>
                                            {walletInfo[type].icon} {walletInfo[type].label} (${balances[type].available.toLocaleString()})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="transfer-arrow">↓</div>

                            <div className="form-row">
                                <label>To</label>
                                <select
                                    value={transferTo}
                                    onChange={(e) => setTransferTo(e.target.value as WalletType)}
                                >
                                    {(Object.keys(walletInfo) as WalletType[]).map((type) => (
                                        <option key={type} value={type}>
                                            {walletInfo[type].icon} {walletInfo[type].label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-row">
                                <label>Amount</label>
                                <input
                                    type="number"
                                    placeholder="0.00"
                                    value={transferAmount}
                                    onChange={(e) => setTransferAmount(e.target.value)}
                                />
                            </div>

                            {message && (
                                <div className={`message ${message.type}`}>
                                    {message.text}
                                </div>
                            )}

                            <button
                                className="btn btn-primary transfer-btn"
                                onClick={handleTransfer}
                                disabled={isTransferring || !transferAmount}
                            >
                                {isTransferring ? 'Transferring...' : 'Transfer'}
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === 'history' && user?.id && (
                    <TransactionHistory clubId="" userId={user.id} limit={50} />
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

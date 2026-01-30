/**
 *  CASHIER PAGE — Buy-in / Cash-out
 */

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useWalletStore } from '../stores/useWalletStore';
import { useUserStore } from '../stores/useUserStore';
import ClubBottomNav from '../components/club/ClubBottomNav';
import './CashierPage.css';

type CashierAction = 'buyin' | 'cashout' | 'mint';

export default function CashierPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const tableId = searchParams.get('table');
    const clubId = searchParams.get('club');

    const { user } = useUserStore();
    const { balances, diamonds, mintChips } = useWalletStore();

    const [action, setAction] = useState<CashierAction>('buyin');
    const [amount, setAmount] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [userRole, setUserRole] = useState<'owner' | 'admin' | 'agent' | 'member'>('member');

    const preset = (action === 'buyin' || action === 'cashout')
        ? [100, 200, 500, 1000, 2000]
        : [1000, 5000, 10000, 50000];

    const handleAction = async () => {
        const value = parseFloat(amount);
        if (isNaN(value) || value <= 0) {
            setMessage({ type: 'error', text: 'Please enter a valid amount' });
            return;
        }

        setIsProcessing(true);
        setMessage(null);

        try {
            if (action === 'mint') {
                // Mint chips from diamonds
                await mintChips('default', value);
                setMessage({ type: 'success', text: `Minted ${value.toLocaleString()} chips!` });
            } else if (action === 'buyin') {
                // Buy-in: Transfer from PLAYER wallet to table
                if (balances.PLAYER.available < value) {
                    setMessage({ type: 'error', text: 'Insufficient chip balance for buy-in' });
                    setIsProcessing(false);
                    return;
                }

                // Wire to WalletStore lockForBuyIn
                if (user?.id && tableId) {
                    const { lockForBuyIn } = useWalletStore.getState();
                    const success = await lockForBuyIn(user.id, value, tableId);
                    if (success) {
                        setMessage({ type: 'success', text: `Bought in for $${value.toLocaleString()}` });
                        navigate(`/table/${tableId}`);
                    } else {
                        setMessage({ type: 'error', text: 'Buy-in failed. Please try again.' });
                    }
                } else {
                    setMessage({ type: 'success', text: `Bought in for $${value.toLocaleString()}` });
                }
            } else {
                // Cash-out: Transfer from table back to PLAYER wallet
                if (user?.id && tableId) {
                    const { unlockFromTable } = useWalletStore.getState();
                    const success = await unlockFromTable(user.id, value, tableId);
                    if (success) {
                        setMessage({ type: 'success', text: `Cashed out $${value.toLocaleString()}` });
                        navigate(`/table/${tableId}`);
                    } else {
                        setMessage({ type: 'error', text: 'Cash-out failed. Please try again.' });
                    }
                } else {
                    setMessage({ type: 'success', text: `Cashed out $${value.toLocaleString()}` });
                }
            }
            setAmount('');
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message || 'Transaction failed. Please try again.' });
        }
        setIsProcessing(false);
    };

    // Diamond to chip conversion rate
    const DIAMOND_RATE = 38 / 100; // 38 diamonds = 100 chips

    return (
        <div className="cashier-page">
            {/* Balance Cards */}
            <div className="balance-cards">
                <div className="balance-card chips">
                    <span className="balance-icon"></span>
                    <div className="balance-info">
                        <span className="balance-label">Available Chips</span>
                        <span className="balance-amount">${balances.PLAYER.available.toLocaleString()}</span>
                    </div>
                </div>
                <div className="balance-card diamonds">
                    <span className="balance-icon"></span>
                    <div className="balance-info">
                        <span className="balance-label">Diamonds</span>
                        <span className="balance-amount">{diamonds.toLocaleString()}</span>
                    </div>
                </div>
            </div>

            {/* Action Tabs */}
            <div className="action-tabs">
                <button
                    className={action === 'buyin' ? 'active' : ''}
                    onClick={() => setAction('buyin')}
                >
                    Buy-In
                </button>
                <button
                    className={action === 'cashout' ? 'active' : ''}
                    onClick={() => setAction('cashout')}
                >
                    Cash-Out
                </button>
                <button
                    className={action === 'mint' ? 'active' : ''}
                    onClick={() => setAction('mint')}
                >
                    Mint Chips
                </button>
            </div>

            {/* Amount Input */}
            <div className="amount-section">
                <label>{action === 'mint' ? 'Chips to Mint' : 'Amount'}</label>
                <div className="amount-input">
                    <span className="currency">$</span>
                    <input
                        type="number"
                        placeholder="0"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                    />
                </div>

                {action === 'mint' && amount && (
                    <div className="conversion-info">
                        {Math.ceil(parseFloat(amount || '0') * DIAMOND_RATE).toLocaleString()} diamonds required
                    </div>
                )}

                {/* Presets */}
                <div className="preset-buttons">
                    {preset.map((val) => (
                        <button
                            key={val}
                            className="preset-btn"
                            onClick={() => setAmount(val.toString())}
                        >
                            ${val >= 1000 ? `${val / 1000}K` : val}
                        </button>
                    ))}
                </div>
            </div>

            {/* Messages */}
            {message && (
                <div className={`message ${message.type}`}>
                    {message.text}
                </div>
            )}

            {/* Action Button */}
            <button
                className="btn btn-primary action-btn"
                onClick={handleAction}
                disabled={isProcessing || !amount}
            >
                {isProcessing ? 'Processing...' :
                    action === 'buyin' ? 'Buy In' :
                        action === 'cashout' ? 'Cash Out' :
                            'Mint Chips'}
            </button>

            {tableId && (
                <p className="table-context">
                    Returning to table after transaction
                </p>
            )}

            {clubId && (
                <ClubBottomNav
                    clubId={clubId}
                    userRole={userRole}
                />
            )}
        </div>
    );
}

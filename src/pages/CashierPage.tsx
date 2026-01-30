/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CASHIER PAGE — Buy-in / Cash-out (Metal UI)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { useWalletStore } from '../stores/useWalletStore';
import { useUserStore } from '../stores/useUserStore';
import ClubBottomNav from '../components/club/ClubBottomNav';
import { MetalFrame, MetalButton, MetalInput, MetalCard } from '../components/metal-ui';
import './CashierPage.css';

type CashierAction = 'buyin' | 'cashout' | 'mint';

export default function CashierPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { clubId: routeClubId } = useParams<{ clubId?: string }>();
    const tableId = searchParams.get('table');
    const clubId = routeClubId || searchParams.get('club');

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
                await mintChips('default', value);
                setMessage({ type: 'success', text: `Minted ${value.toLocaleString()} chips!` });
            } else if (action === 'buyin') {
                if (balances.PLAYER.available < value) {
                    setMessage({ type: 'error', text: 'Insufficient chip balance for buy-in' });
                    setIsProcessing(false);
                    return;
                }

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

    const DIAMOND_RATE = 38 / 100;

    return (
        <div className="cashier-page" style={{ padding: '16px', paddingBottom: '100px' }}>
            {/* Balance Cards - Metal Style */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <MetalCard size="sm" glow>
                    <div style={{ textAlign: 'center' }}>
                        <span style={{ fontSize: '1.5rem' }}>🎰</span>
                        <div style={{ fontSize: '0.75rem', color: '#6a7a8a', textTransform: 'uppercase', marginTop: '4px' }}>Available Chips</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#00d4ff', fontFamily: 'monospace' }}>
                            ${balances.PLAYER.available.toLocaleString()}
                        </div>
                    </div>
                </MetalCard>
                <MetalCard size="sm" glow>
                    <div style={{ textAlign: 'center' }}>
                        <span style={{ fontSize: '1.5rem' }}>💎</span>
                        <div style={{ fontSize: '0.75rem', color: '#6a7a8a', textTransform: 'uppercase', marginTop: '4px' }}>Diamonds</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#00d4ff', fontFamily: 'monospace' }}>
                            {diamonds.toLocaleString()}
                        </div>
                    </div>
                </MetalCard>
            </div>

            {/* Action Tabs - Metal Style */}
            <div style={{
                display: 'flex',
                gap: '4px',
                padding: '6px',
                background: 'linear-gradient(180deg, #1a2a3a 0%, #0d1520 100%)',
                border: '2px solid #2a3a4a',
                borderRadius: '8px',
                marginBottom: '16px'
            }}>
                {(['buyin', 'cashout', 'mint'] as CashierAction[]).map((act) => (
                    <button
                        key={act}
                        style={{
                            flex: 1,
                            padding: '12px 8px',
                            background: action === act ? 'linear-gradient(135deg, #00d4ff 0%, #0099cc 100%)' : 'transparent',
                            border: action === act ? '1px solid #00d4ff' : '1px solid transparent',
                            borderRadius: '6px',
                            color: action === act ? '#fff' : '#8899aa',
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                        }}
                        onClick={() => setAction(act)}
                    >
                        {act === 'buyin' ? '⬆️ Buy-In' : act === 'cashout' ? '⬇️ Cash-Out' : '🏭 Mint'}
                    </button>
                ))}
            </div>

            {/* Main Form - Metal Frame */}
            <MetalFrame
                title={action === 'buyin' ? 'TABLE BUY-IN' : action === 'cashout' ? 'CASH OUT' : 'MINT CHIPS'}
                variant="form"
                size="md"
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <MetalInput
                        label={action === 'mint' ? 'CHIPS TO MINT:' : 'AMOUNT:'}
                        type="number"
                        placeholder="0"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        style={{ textAlign: 'center', fontSize: '1.5rem', fontFamily: 'monospace' }}
                    />

                    {action === 'mint' && amount && (
                        <div style={{
                            color: '#ff9500',
                            textAlign: 'center',
                            fontSize: '0.875rem',
                            padding: '8px',
                            background: 'rgba(255, 149, 0, 0.1)',
                            border: '1px solid rgba(255, 149, 0, 0.3)',
                            borderRadius: '6px'
                        }}>
                            💎 {Math.ceil(parseFloat(amount || '0') * DIAMOND_RATE).toLocaleString()} diamonds required
                        </div>
                    )}

                    {/* Presets */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                        {preset.map((val) => (
                            <MetalButton
                                key={val}
                                variant="ghost"
                                size="sm"
                                onClick={() => setAmount(val.toString())}
                            >
                                ${val >= 1000 ? `${val / 1000}K` : val}
                            </MetalButton>
                        ))}
                    </div>

                    {/* Messages */}
                    {message && (
                        <div style={{
                            color: message.type === 'success' ? '#00ff88' : '#ff6b6b',
                            textAlign: 'center',
                            fontSize: '0.875rem',
                            padding: '10px',
                            background: message.type === 'success' ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 107, 107, 0.1)',
                            border: `1px solid ${message.type === 'success' ? 'rgba(0, 255, 136, 0.3)' : 'rgba(255, 107, 107, 0.3)'}`,
                            borderRadius: '6px'
                        }}>
                            {message.text}
                        </div>
                    )}

                    {/* Action Button */}
                    <MetalButton
                        variant="primary"
                        fullWidth
                        onClick={handleAction}
                        disabled={isProcessing || !amount}
                        loading={isProcessing}
                    >
                        {action === 'buyin' ? 'BUY IN' :
                            action === 'cashout' ? 'CASH OUT' :
                                'MINT CHIPS'}
                    </MetalButton>

                    {tableId && (
                        <p style={{ color: '#6a7a8a', textAlign: 'center', fontSize: '0.8rem', margin: 0 }}>
                            ↩️ Returning to table after transaction
                        </p>
                    )}
                </div>
            </MetalFrame>

            {clubId && (
                <ClubBottomNav
                    clubId={clubId}
                    userRole={userRole}
                />
            )}
        </div>
    );
}

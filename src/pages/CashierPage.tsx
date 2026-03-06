/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CASHIER PAGE — Buy-in / Cash-out (Metal UI)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect } from 'react';
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

    // Load user's club role for bottom nav
    useEffect(() => {
        async function loadRole() {
            if (!clubId || !user?.id) return;
            try {
                const { supabase } = await import('../lib/supabase');
                const { data } = await supabase
                    .from('club_members')
                    .select('role')
                    .eq('club_id', clubId)
                    .eq('user_id', user.id)
                    .single();
                if (data?.role) setUserRole(data.role as typeof userRole);
            } catch { /* keep default 'member' */ }
        }
        loadRole();
    }, [clubId, user?.id]);

    // Quick-amount presets only for buy-in / cash-out — Mint is manual input only
    const preset = [100, 200, 500, 1000, 2000];
    const showPresets = action === 'buyin' || action === 'cashout';

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

                if (!user?.id || !tableId) {
                    setMessage({ type: 'error', text: 'No table selected for buy-in.' });
                    setIsProcessing(false);
                    return;
                }
                const { lockForBuyIn } = useWalletStore.getState();
                const success = await lockForBuyIn(user.id, value, tableId);
                if (success) {
                    setMessage({ type: 'success', text: `Bought in for $${value.toLocaleString()}` });
                    navigate(`/table/${tableId}`);
                } else {
                    setMessage({ type: 'error', text: 'Buy-in failed. Please try again.' });
                }
            } else {
                if (!user?.id || !tableId) {
                    setMessage({ type: 'error', text: 'No table selected for cash-out.' });
                    setIsProcessing(false);
                    return;
                }
                const { unlockFromTable } = useWalletStore.getState();
                const success = await unlockFromTable(user.id, value, tableId);
                if (success) {
                    setMessage({ type: 'success', text: `Cashed out $${value.toLocaleString()}` });
                    navigate(`/table/${tableId}`);
                } else {
                    setMessage({ type: 'error', text: 'Cash-out failed. Please try again.' });
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
            <div className="balance-cards-grid">
                <MetalCard size="sm" glow>
                    <div className="balance-card-content">
                        <span className="balance-icon">♠</span>
                        <div className="balance-label">Player Wallet</div>
                        <div className="balance-value">
                            {balances.PLAYER.available.toLocaleString()} chips
                        </div>
                    </div>
                </MetalCard>
                <MetalCard size="sm" glow>
                    <div className="balance-card-content">
                        <span className="balance-icon">◆</span>
                        <div className="balance-label">Diamonds</div>
                        <div className="balance-value">
                            {diamonds.toLocaleString()}
                        </div>
                    </div>
                </MetalCard>
            </div>


            {/* Action Tabs - Metal Style */}
            {/* Mint Chips is Union-only — chips flow: Union → Club Bank → Agent Wallet → Player Wallet */}
            <div className="action-tabs-metal">
                {(['buyin', 'cashout', ...(userRole === 'owner' ? ['mint'] as const : [])] as CashierAction[]).map((act) => (
                    <MetalButton
                        key={act}
                        variant={action === act ? 'primary' : 'secondary'}
                        size="md"
                        onClick={() => setAction(act)}
                        fullWidth
                    >
                        {act === 'buyin' ? 'Buy-In' : act === 'cashout' ? 'Cash-Out' : 'Mint Chips'}
                    </MetalButton>
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
                    />

                    {action === 'mint' && amount && (
                        <div className="cashier-message info">
                            {Math.ceil(parseFloat(amount || '0') * DIAMOND_RATE).toLocaleString()} diamonds required
                        </div>
                    )}

                    {/* Presets — only for buy-in / cash-out (minting is manual input only) */}
                    {showPresets && (
                        <div className="preset-buttons-grid">
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
                    )}

                    {/* Messages */}
                    {message && (
                        <div className={`cashier-message ${message.type}`}>
                            {message.text}
                        </div>
                    )}

                    {/* Action Button */}
                    <div className="cashier-confirm-button">
                        <MetalButton
                            variant="primary"
                            fullWidth
                            onClick={handleAction}
                            disabled={isProcessing || !amount}
                            loading={isProcessing}
                        >
                            {action === 'buyin' ? 'CONFIRM BUY-IN' :
                                action === 'cashout' ? 'CONFIRM CASH-OUT' :
                                    'CONFIRM MINT'}
                        </MetalButton>
                    </div>

                    {tableId && (
                        <p className="table-context-info">
                            Returning to table after transaction
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

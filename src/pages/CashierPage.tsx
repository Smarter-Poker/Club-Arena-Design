/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CASHIER PAGE — Buy-in / Cash-out / Transfer / Transactions (Metal UI)
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Chip Flow: Union → Club Bank → Agent Wallet → Player Wallet → Games
 *  All transactions are recorded and tracked as currency-grade operations.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { useWalletStore } from '../stores/useWalletStore';
import { useUserStore } from '../stores/useUserStore';
import { WalletService } from '../services/WalletService';
import ClubBottomNav from '../components/club/ClubBottomNav';
import { MetalFrame, MetalButton, MetalInput, MetalCard } from '../components/metal-ui';
import './CashierPage.css';

type CashierAction = 'buyin' | 'cashout' | 'transfer' | 'mint' | 'history';

interface Transaction {
    id: string;
    wallet_type: string;
    amount: number;
    type: string;
    category: string;
    description: string;
    created_at: string;
}

export default function CashierPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { clubId: routeClubId } = useParams<{ clubId?: string }>();
    const tableId = searchParams.get('table');
    const clubId = routeClubId || searchParams.get('club');

    const { user } = useUserStore();
    const { balances, diamonds, mintChips, loadBalances } = useWalletStore();

    const [action, setAction] = useState<CashierAction>('buyin');
    const [amount, setAmount] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [userRole, setUserRole] = useState<'owner' | 'admin' | 'agent' | 'member'>('member');
    const [isInUnion, setIsInUnion] = useState(false);
    const [isAgent, setIsAgent] = useState(false);
    const [agentBalance, setAgentBalance] = useState(0);

    // Transaction history state
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loadingTx, setLoadingTx] = useState(false);

    // Load user's club role + check if club is in a union + check agent status
    useEffect(() => {
        async function loadRoleAndUnion() {
            if (!clubId || !user?.id) return;
            try {
                const { supabase } = await import('../lib/supabase');

                // Get user role
                const { data } = await supabase
                    .from('club_members')
                    .select('role')
                    .eq('club_id', clubId)
                    .eq('user_id', user.id)
                    .single();
                if (data?.role) setUserRole(data.role as typeof userRole);

                // Check if this club belongs to a union (unions handle minting)
                const { data: unionData } = await supabase
                    .from('union_clubs')
                    .select('union_id')
                    .eq('club_id', clubId)
                    .limit(1);
                setIsInUnion(!!(unionData && unionData.length > 0));

                // Check if user is an agent (has agent wallet)
                const { data: agentData } = await supabase
                    .from('agents')
                    .select('id, business_balance, player_balance')
                    .eq('user_id', user.id)
                    .eq('club_id', clubId)
                    .eq('status', 'active')
                    .single();

                if (agentData) {
                    setIsAgent(true);
                    setAgentBalance(agentData.business_balance || 0);
                }
            } catch { /* keep defaults */ }
        }
        loadRoleAndUnion();
    }, [clubId, user?.id]);

    // Load transaction history
    const loadTransactions = useCallback(async () => {
        if (!user?.id) return;
        setLoadingTx(true);
        try {
            const { supabase } = await import('../lib/supabase');
            const { data, error } = await supabase
                .from('wallet_transactions')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(50);

            if (!error && data) {
                setTransactions(data);
            }
        } catch { /* silent */ }
        setLoadingTx(false);
    }, [user?.id]);

    useEffect(() => {
        if (action === 'history') {
            loadTransactions();
        }
    }, [action, loadTransactions]);

    // Refresh balances on mount
    useEffect(() => {
        if (user?.id) loadBalances(user.id);
    }, [user?.id, loadBalances]);

    // Quick-amount presets only for buy-in / cash-out
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
                if (user?.id) loadBalances(user.id);
            } else if (action === 'transfer') {
                // Agent → Player wallet transfer
                if (!isAgent) {
                    setMessage({ type: 'error', text: 'Only agents can transfer from Agent Wallet' });
                    setIsProcessing(false);
                    return;
                }
                if (agentBalance < value) {
                    setMessage({ type: 'error', text: `Insufficient Agent Wallet balance. Have ${agentBalance.toLocaleString()}, need ${value.toLocaleString()}` });
                    setIsProcessing(false);
                    return;
                }
                if (!user?.id || !clubId) {
                    setMessage({ type: 'error', text: 'Missing user or club context' });
                    setIsProcessing(false);
                    return;
                }

                // Deduct from agent business_balance and credit Player Wallet
                const { supabase } = await import('../lib/supabase');

                // 1. Deduct from agents table
                const { error: agentDeductErr } = await supabase
                    .from('agents')
                    .update({ business_balance: agentBalance - value })
                    .eq('user_id', user.id)
                    .eq('club_id', clubId)
                    .eq('status', 'active');

                if (agentDeductErr) {
                    throw new Error('Failed to deduct from Agent Wallet');
                }

                // 2. Credit to Player Wallet via RPC
                const { error: creditErr } = await supabase.rpc('credit_player_wallet', {
                    p_user_id: user.id,
                    p_amount: value,
                });

                if (creditErr) {
                    // Rollback agent deduction
                    await supabase
                        .from('agents')
                        .update({ business_balance: agentBalance })
                        .eq('user_id', user.id)
                        .eq('club_id', clubId);
                    throw new Error('Failed to credit Player Wallet');
                }

                // 3. Log both sides of the transfer
                await WalletService.logTransaction(
                    user.id, 'BUSINESS', -value, 'debit', 'transfer',
                    `Agent → Player wallet transfer`
                );
                await WalletService.logTransaction(
                    user.id, 'PLAYER', value, 'credit', 'transfer',
                    `Agent → Player wallet transfer`
                );

                setAgentBalance(agentBalance - value);
                setMessage({ type: 'success', text: `Transferred ${value.toLocaleString()} chips to Player Wallet!` });
                if (user?.id) loadBalances(user.id);
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
                    setMessage({ type: 'success', text: `Bought in for ${value.toLocaleString()} chips` });
                    navigate(`/table/${tableId}`);
                } else {
                    setMessage({ type: 'error', text: 'Buy-in failed. Please try again.' });
                }
            } else if (action === 'cashout') {
                if (!user?.id || !tableId) {
                    setMessage({ type: 'error', text: 'No table selected for cash-out.' });
                    setIsProcessing(false);
                    return;
                }
                const { unlockFromTable } = useWalletStore.getState();
                const success = await unlockFromTable(user.id, value, tableId);
                if (success) {
                    setMessage({ type: 'success', text: `Cashed out ${value.toLocaleString()} chips` });
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

    // Build the available tabs based on role/agent status
    const tabs: CashierAction[] = [
        'buyin',
        'cashout',
        ...(isAgent ? ['transfer' as const] : []),
        ...((userRole === 'owner' && !isInUnion) ? ['mint' as const] : []),
        'history',
    ];

    const tabLabels: Record<CashierAction, string> = {
        buyin: 'Buy-In',
        cashout: 'Cash-Out',
        transfer: 'Transfer',
        mint: 'Mint',
        history: 'History',
    };

    const CATEGORY_ICONS: Record<string, string> = {
        buyin: '♠',
        cashout: '♦',
        transfer: '↔',
        mint: '⊕',
        settlement: '★',
        commission: '⚙',
        rake: '♣',
        promo: '🎁',
        TIP: '💰',
        INSURANCE: '🛡',
    };

    return (
        <div className="cashier-page" style={{ padding: '16px', paddingBottom: '100px' }}>
            {/* Balance Cards */}
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
                {isAgent ? (
                    <MetalCard size="sm" glow>
                        <div className="balance-card-content">
                            <span className="balance-icon">⚙</span>
                            <div className="balance-label">Agent Wallet</div>
                            <div className="balance-value">
                                {agentBalance.toLocaleString()} chips
                            </div>
                        </div>
                    </MetalCard>
                ) : (
                    <MetalCard size="sm" glow>
                        <div className="balance-card-content">
                            <span className="balance-icon">◆</span>
                            <div className="balance-label">Diamonds</div>
                            <div className="balance-value">
                                {diamonds.toLocaleString()}
                            </div>
                        </div>
                    </MetalCard>
                )}
            </div>

            {/* Action Tabs */}
            <div className="action-tabs-metal">
                {tabs.map((act) => (
                    <MetalButton
                        key={act}
                        variant={action === act ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => { setAction(act); setMessage(null); }}
                        fullWidth
                    >
                        {tabLabels[act]}
                    </MetalButton>
                ))}
            </div>

            {/* Transaction History View */}
            {action === 'history' ? (
                <MetalFrame title="TRANSACTION HISTORY" variant="form" size="md">
                    <div className="transaction-history-cashier">
                        {loadingTx ? (
                            <div className="tx-loading">Loading transactions...</div>
                        ) : transactions.length === 0 ? (
                            <div className="tx-empty">No transactions recorded yet</div>
                        ) : (
                            <div className="tx-list">
                                {transactions.map((tx) => (
                                    <div key={tx.id} className={`tx-row ${tx.type}`}>
                                        <span className="tx-icon">
                                            {CATEGORY_ICONS[tx.category] || '📄'}
                                        </span>
                                        <div className="tx-details">
                                            <span className="tx-category">
                                                {(tx.category || tx.type || '').replace(/_/g, ' ').toUpperCase()}
                                            </span>
                                            <span className="tx-desc">{tx.description}</span>
                                        </div>
                                        <div className="tx-amounts">
                                            <span className={`tx-amount ${tx.amount >= 0 ? 'positive' : 'negative'}`}>
                                                {tx.amount >= 0 ? '+' : ''}{Math.abs(tx.amount).toLocaleString()}
                                            </span>
                                            <span className="tx-wallet">{tx.wallet_type}</span>
                                        </div>
                                        <span className="tx-time">
                                            {new Date(tx.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                            {' '}
                                            {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </MetalFrame>
            ) : (
                /* Main Form */
                <MetalFrame
                    title={
                        action === 'buyin' ? 'TABLE BUY-IN' :
                        action === 'cashout' ? 'CASH OUT' :
                        action === 'transfer' ? 'AGENT → PLAYER TRANSFER' :
                        'MINT CHIPS'
                    }
                    variant="form"
                    size="md"
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {/* Transfer info banner */}
                        {action === 'transfer' && (
                            <div className="cashier-message info">
                                Transfer chips from your Agent Wallet to your Player Wallet to play at tables and tournaments.
                            </div>
                        )}

                        <MetalInput
                            label={
                                action === 'mint' ? 'CHIPS TO MINT:' :
                                action === 'transfer' ? 'TRANSFER AMOUNT:' :
                                'AMOUNT:'
                            }
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

                        {action === 'transfer' && amount && (
                            <div className="cashier-message info">
                                Agent Wallet: {agentBalance.toLocaleString()} → {Math.max(0, agentBalance - parseFloat(amount || '0')).toLocaleString()} chips
                                <br />
                                Player Wallet: {balances.PLAYER.available.toLocaleString()} → {(balances.PLAYER.available + parseFloat(amount || '0')).toLocaleString()} chips
                            </div>
                        )}

                        {/* Presets — only for buy-in / cash-out */}
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
                                    action === 'transfer' ? 'CONFIRM TRANSFER' :
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

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CASHIER PAGE — Universal Chip Transfer Hub (Metal UI)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  ALL chip movements happen through the Cashier via respective wallets.
 *
 *  Chip Flow: Union → Club Bank → Agent Wallet → Player Wallet → Games
 *
 *  Roles & Actions:
 *  - Union Owner: Mint, Send to clubs, Send to agents/players, History
 *  - Club Owner (standalone): Mint, Send to agents/players, History
 *  - Club Owner (in union): Send to agents/players, History (no mint)
 *  - Agent/Super Agent: Send to sub-agents/players, History
 *  - Sub Agent: Send to players, History
 *  - Player: Buy-in, Cash-out, History
 *
 *  Every single chip transaction is recorded with full audit trail.
 */

import { useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { masterBus } from '../core/MasterBus';
import { useWalletStore } from '../stores/useWalletStore';
import { useUserStore } from '../stores/useUserStore';
import { WalletService } from '../services/WalletService';
import { ChipFlowService } from '../services/ChipFlowService';
import { supabase } from '../lib/supabase';
import ClubBottomNav from '../components/club/ClubBottomNav';
import { MetalFrame, MetalButton, MetalInput, MetalCard } from '../components/metal-ui';
import './CashierPage.css';

type CashierAction = 'send' | 'buyin' | 'cashout' | 'mint' | 'history';

interface Transaction {
    id: string;
    wallet_type: string;
    amount: number;
    type: string;
    category: string;
    description: string;
    created_at: string;
}

interface Recipient {
    id: string;
    username: string;
    role: string;
    balance: number;
}

const CATEGORY_LABELS: Record<string, string> = {
    buyin: 'Buy-In', cashout: 'Cash-Out', rake: 'Rake', prize: 'Prize',
    rebuy: 'Rebuy', addon: 'Add-On', mint: 'Mint', settlement: 'Settlement',
    commission: 'Commission', TIP: 'Dealer Tip', INSURANCE: 'Insurance',
    funding: 'Funding', promotion: 'Promotion', promo: 'Promo Bonus',
    bbj: 'Bad Beat Jackpot', horse_refill: 'Auto Refill', transfer: 'Transfer',
    deposit: 'Deposit', withdrawal: 'Withdrawal', refund: 'Refund', bonus: 'Bonus',
};

const CATEGORY_ICONS: Record<string, string> = {
    buyin: '▦', cashout: '◉', rake: '%', prize: '★', rebuy: '↺',
    addon: '⊞', mint: '◆', settlement: '≡', commission: '◈',
    TIP: '♥', INSURANCE: '⊕', funding: '→', promotion: '↑',
    promo: '★', bbj: '♣', horse_refill: '↺', transfer: '→',
    deposit: '+', withdrawal: '-', refund: '↻', bonus: '★',
};

// Premium balance counter
function useCountAnimation(target: number, duration: number = 800) {
    const [display, setDisplay] = useState(0);
    useEffect(() => {
        let startTime: number;
        let animationFrame: number;
        const animate = (time: number) => {
            if (!startTime) startTime = time;
            const progress = Math.min((time - startTime) / duration, 1);
            setDisplay(Math.floor(target * progress));
            if (progress < 1) animationFrame = requestAnimationFrame(animate);
        };
        animationFrame = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animationFrame);
    }, [target, duration]);
    return display;
}

export default function CashierPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { clubId: routeClubId } = useParams<{ clubId?: string }>();
    const tableId = searchParams.get('table');
    const clubId = routeClubId || searchParams.get('club');

    const { user } = useUserStore();
    const { balances, diamonds, mintChips, loadBalances } = useWalletStore();

    const [action, setAction] = useState<CashierAction>('send');
    const [amount, setAmount] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

    // Rate limiting: 3s cooldown after each action
    const startCooldown = useCallback(() => {
        setCooldown(3);
        if (cooldownRef.current) clearInterval(cooldownRef.current);
        cooldownRef.current = setInterval(() => {
            setCooldown(prev => {
                if (prev <= 1) {
                    clearInterval(cooldownRef.current!);
                    cooldownRef.current = null;
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }, []);

    // Cleanup cooldown interval on unmount
    useEffect(() => {
        return () => {
            if (cooldownRef.current) clearInterval(cooldownRef.current);
        };
    }, []);

    // Role state
    const [userRole, setUserRole] = useState<string>('member');
    const [isInUnion, setIsInUnion] = useState(false);
    const [isUnionOwner, setIsUnionOwner] = useState(false);
    const [clubName, setClubName] = useState('');

    // Send chips state
    const [recipients, setRecipients] = useState<Recipient[]>([]);
    const [selectedRecipient, setSelectedRecipient] = useState('');
    const [loadingRecipients, setLoadingRecipients] = useState(false);

    // Transaction history state
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loadingTx, setLoadingTx] = useState(false);
    const [txFilter, setTxFilter] = useState('all');

    // Animated balance
    const animatedPlayerBalance = useCountAnimation(balances.PLAYER.available, 900);

    // ─────────────────────────────────────────────────────────────────────────────
    // LOAD ROLE, UNION STATUS, AND RECIPIENTS
    // ─────────────────────────────────────────────────────────────────────────────

    useEffect(() => {
        if (!clubId || !user?.id) return;
        loadUserContext();
    }, [clubId, user?.id]);

    const loadUserContext = async () => {
        if (!clubId || !user?.id) return;
        try {
            // Get user's role in this club
            const { data: memberData } = await supabase
                .from('club_members')
                .select('role')
                .eq('club_id', clubId)
                .eq('user_id', user.id)
                .single();
            const role = memberData?.role || 'member';
            setUserRole(role);

            // Get club name
            const { data: clubData } = await supabase
                .from('clubs')
                .select('name')
                .eq('id', clubId)
                .single();
            setClubName(clubData?.name || '');

            // Check if club is in a union
            const { data: unionClub } = await supabase
                .from('union_clubs')
                .select('union_id, unions!inner(owner_id)')
                .eq('club_id', clubId)
                .single();

            if (unionClub) {
                setIsInUnion(true);
                setIsUnionOwner((unionClub as any).unions?.owner_id === user.id);
            } else {
                setIsInUnion(false);
                setIsUnionOwner(false);
            }
        } catch {
            // Keep defaults
        }
    };

    // Load recipients when "Send" tab is active
    useEffect(() => {
        if (action === 'send' && user?.id && clubId) {
            loadRecipients();
        }
    }, [action, user?.id, clubId]);

    const loadRecipients = async () => {
        if (!user?.id || !clubId) return;
        setLoadingRecipients(true);
        try {
            let query = supabase
                .from('club_members')
                .select(`
                    user_id,
                    role,
                    users:user_id (id, username)
                `)
                .eq('club_id', clubId)
                .neq('user_id', user.id);

            // Filter based on role hierarchy
            if (userRole === 'owner' || isUnionOwner) {
                // Owner/Union owner can send to anyone
                query = query.in('role', ['agent', 'super_agent', 'sub_agent', 'member', 'player']);
            } else if (userRole === 'agent' || userRole === 'super_agent') {
                query = query.in('role', ['sub_agent', 'member', 'player']);
            } else if (userRole === 'sub_agent') {
                query = query.in('role', ['member', 'player']);
            } else {
                // Regular members can't send chips
                setRecipients([]);
                setLoadingRecipients(false);
                return;
            }

            const { data } = await query;

            // Get wallet balances for all recipients
            const recipientIds = (data || []).map((m: any) => m.users?.id).filter(Boolean);
            const { data: wallets } = await supabase
                .from('wallets')
                .select('user_id, balance')
                .in('user_id', recipientIds.length > 0 ? recipientIds : ['none'])
                .eq('wallet_type', 'PLAYER');

            const walletMap: Record<string, number> = {};
            (wallets || []).forEach((w: any) => {
                walletMap[w.user_id] = w.balance;
            });

            const list: Recipient[] = (data || [])
                .filter((m: any) => m.users?.id)
                .map((m: any) => ({
                    id: m.users.id,
                    username: m.users.username || 'Unknown',
                    role: m.role,
                    balance: walletMap[m.users.id] || 0,
                }))
                .sort((a: Recipient, b: Recipient) => {
                    const order: Record<string, number> = { agent: 0, super_agent: 0, sub_agent: 1, member: 2, player: 2 };
                    return (order[a.role] || 3) - (order[b.role] || 3);
                });

            setRecipients(list);
        } catch (err) {
            console.error('Failed to load recipients:', err);
        }
        setLoadingRecipients(false);
    };

    // ─────────────────────────────────────────────────────────────────────────────
    // LOAD TRANSACTIONS
    // ─────────────────────────────────────────────────────────────────────────────

    const loadTransactions = useCallback(async () => {
        if (!user?.id) return;
        setLoadingTx(true);
        try {
            const { data, error } = await supabase
                .from('wallet_transactions')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(50);

            if (!error && data) setTransactions(data);
        } catch { /* silent */ }
        setLoadingTx(false);
    }, [user?.id]);

    useEffect(() => {
        if (action === 'history') loadTransactions();
    }, [action, loadTransactions]);

    // ─────────────────────────────────────────────────────────────────────────────
    // REALTIME WALLET SUBSCRIPTION (#1: Using Channel Registry)
    // ─────────────────────────────────────────────────────────────────────────────
    // Subscribes to both wallets and wallet_transactions tables for live updates

    useEffect(() => {
        if (!user?.id) return;

        // Initial load
        loadBalances(user.id);
        if (action === 'history') loadTransactions();

        // #1: Use Channel Registry for deduplication
        const channelKey = `cashier-realtime-${user.id}`;
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
                        if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
                            loadBalances(user.id);
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
                        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                            loadBalances(user.id);
                            if (action === 'history') loadTransactions();
                        }
                    }
                )
                .subscribe();

        // Cleanup: remove channel via registry on unmount
        return () => {
            masterBus.removeRegisteredChannel(`cashier-realtime-${user.id}`);
        };
    }, [user?.id, loadBalances, loadTransactions, action]);

    // ─────────────────────────────────────────────────────────────────────────────
    // DETERMINE AVAILABLE TABS
    // ─────────────────────────────────────────────────────────────────────────────

    const canSend = userRole === 'owner' || isUnionOwner || userRole === 'agent' ||
        userRole === 'super_agent' || userRole === 'sub_agent';
    const canMint = (userRole === 'owner' && !isInUnion) || isUnionOwner;

    const tabs = useMemo(() => {
        const t: CashierAction[] = [];
        if (canSend) t.push('send');
        t.push('buyin', 'cashout');
        if (canMint) t.push('mint');
        t.push('history');
        return t;
    }, [canSend, canMint]);

    const tabLabels: Record<CashierAction, string> = {
        send: 'Send',
        buyin: 'Buy-In',
        cashout: 'Cash-Out',
        mint: 'Mint',
        history: 'History',
    };

    // ─────────────────────────────────────────────────────────────────────────────
    // HANDLE ACTIONS
    // ─────────────────────────────────────────────────────────────────────────────

    // Helper to notify the parent World Hub and the local Master Bus of a balance change
    const notifyWalletChange = (targetUserId: string, chipAmount: number) => {
        try {
            // 1. Notify local React app via MasterBus for instant sync
            masterBus.emit('WALLET_REFRESHED', {
                walletType: 'PLAYER',
                available: balances.PLAYER.available,
                total: balances.PLAYER.total
            });

            // 2. Notify parent World Hub iframe
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({
                    type: 'USE_TRAINING_BUS_EMIT',
                    event: 'chips_distributed',
                    payload: {
                        userId: targetUserId,
                        amount: chipAmount,
                        timestamp: Date.now()
                    }
                }, '*');
            }
        } catch (e) {
            console.error('Failed to notify of wallet change:', e);
        }
    };

    const selectedRecipientData = useMemo(() => {
        return recipients.find(r => r.id === selectedRecipient);
    }, [recipients, selectedRecipient]);

    const handleAction = async () => {
        const value = parseFloat(amount);
        if (isNaN(value) || value <= 0) {
            setMessage({ type: 'error', text: 'Please enter a valid amount' });
            return;
        }
        if (!user?.id) return;

        setIsProcessing(true);
        setMessage(null);

        try {
            if (action === 'send') {
                // ─── SEND CHIPS ───
                if (!selectedRecipient) {
                    setMessage({ type: 'error', text: 'Please select a recipient' });
                    setIsProcessing(false);
                    return;
                }
                if (balances.PLAYER.available < value) {
                    setMessage({ type: 'error', text: `Insufficient balance. Available: ${balances.PLAYER.available.toLocaleString()}` });
                    setIsProcessing(false);
                    return;
                }

                const recipient = selectedRecipientData;
                const recipientIsAgent = recipient?.role === 'agent' || recipient?.role === 'super_agent';
                const recipientIsSubAgent = recipient?.role === 'sub_agent';

                if (userRole === 'owner' && recipientIsAgent) {
                    await ChipFlowService.clubToAgent(
                        user.id, selectedRecipient, clubId!, value,
                        recipient?.username || 'Agent', clubName
                    );
                } else if (userRole === 'owner' || isUnionOwner) {
                    await ChipFlowService.clubToPlayer(
                        user.id, selectedRecipient, value,
                        recipient?.username || 'Player', clubName
                    );
                } else {
                    await ChipFlowService.agentToPlayer(
                        user.id, selectedRecipient, value,
                        user.username || 'Agent',
                        recipient?.username || 'Player', clubName
                    );
                }

                setMessage({ type: 'success', text: `Sent ${value.toLocaleString()} chips to ${recipient?.username}` });
                loadBalances(user.id);
                loadRecipients(); // Refresh balances
                setSelectedRecipient('');
                notifyWalletChange(user.id, value);
                notifyWalletChange(selectedRecipient, value);

            } else if (action === 'mint') {
                // ─── MINT CHIPS ───
                await mintChips('default', value);
                setMessage({ type: 'success', text: `Minted ${value.toLocaleString()} chips` });
                loadBalances(user.id);
                notifyWalletChange(user.id, value);

            } else if (action === 'buyin') {
                // ─── TABLE BUY-IN ───
                if (balances.PLAYER.available < value) {
                    setMessage({ type: 'error', text: 'Insufficient chip balance for buy-in' });
                    setIsProcessing(false);
                    return;
                }
                if (!tableId) {
                    setMessage({ type: 'error', text: 'No table selected for buy-in.' });
                    setIsProcessing(false);
                    return;
                }
                const { lockForBuyIn } = useWalletStore.getState();
                const success = await lockForBuyIn(user.id, value, tableId);
                if (success) {
                    setMessage({ type: 'success', text: `Bought in for ${value.toLocaleString()} chips` });
                    notifyWalletChange(user.id, value);
                    navigate(`/table/${tableId}`);
                } else {
                    setMessage({ type: 'error', text: 'Buy-in failed. Please try again.' });
                }

            } else if (action === 'cashout') {
                // ─── CASH OUT ───
                if (!tableId) {
                    setMessage({ type: 'error', text: 'No table selected for cash-out.' });
                    setIsProcessing(false);
                    return;
                }
                const { unlockFromTable } = useWalletStore.getState();
                const success = await unlockFromTable(user.id, value, tableId);
                if (success) {
                    setMessage({ type: 'success', text: `Cashed out ${value.toLocaleString()} chips` });
                    notifyWalletChange(user.id, value);
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
        startCooldown(); // Rate limit
    };

    const DIAMOND_RATE = 38 / 100;
    const preset = [100, 500, 1000, 5000];

    const filteredTransactions = txFilter === 'all'
        ? transactions
        : txFilter === 'credit'
            ? transactions.filter(t => t.type === 'credit')
            : txFilter === 'debit'
                ? transactions.filter(t => t.type === 'debit')
                : transactions.filter(t => t.category === txFilter);

    // ─────────────────────────────────────────────────────────────────────────────
    // CSV EXPORT LOGIC
    // ─────────────────────────────────────────────────────────────────────────────
    const exportCSV = () => {
        if (filteredTransactions.length === 0) {
            setMessage({ type: 'error', text: 'No transactions to export' });
            return;
        }
        
        const headers = ['Date', 'Time', 'Type', 'Category', 'Amount', 'Wallet', 'Description'];
        const rows = filteredTransactions.map(tx => {
            const date = new Date(tx.created_at).toLocaleDateString();
            const time = new Date(tx.created_at).toLocaleTimeString();
            const typeText = tx.type === 'credit' ? 'Credit' : 'Debit';
            const categoryText = CATEGORY_LABELS[tx.category] || (tx.category || tx.type || '').replace(/_/g, ' ').toUpperCase();
            
            // Escape quotes and commas in description
            const desc = `"${(tx.description || '').replace(/"/g, '""')}"`;
            
            return [date, time, typeText, categoryText, tx.amount, tx.wallet_type, desc].join(',');
        });
        
        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `audit_trail_${txFilter}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // ─────────────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────────────

    return (
        <div className="cashier-page" style={{ padding: '16px', paddingBottom: '100px' }}>
            <style>{`
                @keyframes slideInDown { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes fadeInStagger { from { opacity: 0; } to { opacity: 1; } }
                .cashier-balance-card { animation: slideInDown 0.6s cubic-bezier(0.34, 1.56, 0.64, 1); }
                .cashier-balance-card:nth-child(2) { animation: slideInDown 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both; }
                .cashier-tx-item { animation: fadeInStagger 0.5s ease-out forwards; opacity: 0; }
                @keyframes shimmer { 0% { background-position: -1000px 0; } 100% { background-position: 1000px 0; } }
                .cashier-skeleton { background: linear-gradient(90deg, rgba(255,255,255,0.1) 25%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.1)); background-size: 1000px 100%; animation: shimmer 2s infinite; }
            `}</style>
            {/* Balance Cards */}
            <div className="balance-cards-grid">
                <MetalCard size="sm" glow className="cashier-balance-card">
                    <div className="balance-card-content">
                        <span className="balance-icon">♠</span>
                        <div className="balance-label">Player Wallet</div>
                        <div className="balance-value">
                            {animatedPlayerBalance.toLocaleString()} chips
                        </div>
                    </div>
                </MetalCard>
                <MetalCard size="sm" glow className="cashier-balance-card">
                    <div className="balance-card-content">
                        <span className="balance-icon">◆</span>
                        <div className="balance-label">Diamonds</div>
                        <div className="balance-value">
                            {diamonds.toLocaleString()}
                        </div>
                    </div>
                </MetalCard>
            </div>

            {/* Action Tabs */}
            <div className="action-tabs-metal">
                {tabs.map((act) => (
                    <MetalButton
                        key={act}
                        variant={action === act ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => { setAction(act); setMessage(null); }}
                    >
                        {tabLabels[act]}
                    </MetalButton>
                ))}
            </div>

            {/* ═══ SEND CHIPS ═══ */}
            {action === 'send' && (
                <MetalFrame title="SEND CHIPS" variant="form" size="md">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div className="cashier-message info">
                            Send chips from your wallet to {userRole === 'owner' ? 'agents, sub-agents, and players' :
                            userRole === 'agent' || userRole === 'super_agent' ? 'sub-agents and players' : 'players'}
                        </div>

                        {/* Recipient Select */}
                        <div className="cashier-form-group">
                            <label className="cashier-form-label">SEND TO:</label>
                            {loadingRecipients ? (
                                <div style={{ color: '#6a7a8a', fontSize: '0.8rem' }}>Loading...</div>
                            ) : (
                                <select
                                    className="cashier-select"
                                    value={selectedRecipient}
                                    onChange={(e) => setSelectedRecipient(e.target.value)}
                                >
                                    <option value="">Select recipient</option>
                                    {recipients.map((r) => (
                                        <option key={r.id} value={r.id}>
                                            {r.role === 'agent' || r.role === 'super_agent' ? '[Agent] ' :
                                             r.role === 'sub_agent' ? '[Sub-Agent] ' : ''}
                                            {r.username} (Bal: {r.balance.toLocaleString()})
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>

                        <MetalInput
                            label="AMOUNT:"
                            type="number"
                            placeholder="0"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                        />

                        {/* Quick amounts */}
                        <div className="preset-buttons-grid">
                            {preset.map((val) => (
                                <MetalButton key={val} variant="ghost" size="sm" onClick={() => setAmount(val.toString())}>
                                    {val.toLocaleString()}
                                </MetalButton>
                            ))}
                            <MetalButton variant="ghost" size="sm" onClick={() => setAmount(String(balances.PLAYER.available))}>
                                Max
                            </MetalButton>
                        </div>

                        {/* Preview */}
                        {selectedRecipientData && amount && parseFloat(amount) > 0 && (
                            <div className="cashier-message info">
                                You: {balances.PLAYER.available.toLocaleString()} → {Math.max(0, balances.PLAYER.available - parseFloat(amount)).toLocaleString()} chips
                                <br />
                                {selectedRecipientData.username}: {selectedRecipientData.balance.toLocaleString()} → {(selectedRecipientData.balance + parseFloat(amount)).toLocaleString()} chips
                            </div>
                        )}

                        {message && <div className={`cashier-message ${message.type}`}>{message.text}</div>}

                        <div className="cashier-confirm-button">
                            <MetalButton
                                variant="primary"
                                fullWidth
                                onClick={handleAction}
                                disabled={isProcessing || cooldown > 0 || !amount || !selectedRecipient}
                                loading={isProcessing}
                            >
                                CONFIRM SEND
                            </MetalButton>
                        </div>
                    </div>
                </MetalFrame>
            )}

            {/* ═══ BUY-IN / CASH-OUT / MINT ═══ */}
            {(action === 'buyin' || action === 'cashout' || action === 'mint') && (
                <MetalFrame
                    title={
                        action === 'buyin' ? 'TABLE BUY-IN' :
                        action === 'cashout' ? 'CASH OUT' :
                        'MINT CHIPS'
                    }
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

                        {/* Presets */}
                        <div className="preset-buttons-grid">
                            {preset.map((val) => (
                                <MetalButton key={val} variant="ghost" size="sm" onClick={() => setAmount(val.toString())}>
                                    {val.toLocaleString()}
                                </MetalButton>
                            ))}
                        </div>

                        {message && <div className={`cashier-message ${message.type}`}>{message.text}</div>}

                        <div className="cashier-confirm-button">
                            <MetalButton
                                variant="primary"
                                fullWidth
                                onClick={handleAction}
                                disabled={isProcessing || cooldown > 0 || !amount}
                                loading={isProcessing}
                            >
                                {action === 'buyin' ? 'CONFIRM BUY-IN' :
                                 action === 'cashout' ? 'CONFIRM CASH-OUT' :
                                 'CONFIRM MINT'}
                            </MetalButton>
                        </div>

                        {tableId && (
                            <p className="table-context-info">Returning to table after transaction</p>
                        )}
                    </div>
                </MetalFrame>
            )}

            {/* ═══ TRANSACTION HISTORY ═══ */}
            {action === 'history' && (
                <MetalFrame title="TRANSACTION HISTORY" variant="form" size="md">
                    <div className="transaction-history-cashier">
                        {/* Filter */}
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                            {['all', 'credit', 'debit', 'transfer', 'buyin', 'cashout', 'rake', 'prize'].map(f => (
                                <button
                                    key={f}
                                    className={`tx-filter-btn ${txFilter === f ? 'active' : ''}`}
                                    onClick={() => setTxFilter(f)}
                                    style={{
                                        padding: '4px 10px',
                                        borderRadius: '12px',
                                        border: txFilter === f ? '1px solid #00d4ff' : '1px solid rgba(255,255,255,0.1)',
                                        background: txFilter === f ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.03)',
                                        color: txFilter === f ? '#00d4ff' : '#8a9aaa',
                                        fontSize: '0.65rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        textTransform: 'uppercase',
                                        letterSpacing: '1px',
                                    }}
                                >
                                    {f === 'all' ? 'All' : f === 'credit' ? 'Credits' : f === 'debit' ? 'Debits' :
                                     CATEGORY_LABELS[f] || f}
                                </button>
                            ))}
                            <button
                                onClick={exportCSV}
                                style={{
                                    marginLeft: 'auto',
                                    padding: '4px 12px',
                                    borderRadius: '12px',
                                    border: '1px solid #31A24C',
                                    background: 'rgba(49, 162, 76, 0.15)',
                                    color: '#31A24C',
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    textTransform: 'uppercase',
                                    letterSpacing: '1px',
                                }}
                            >
                                📥 Export CSV
                            </button>
                        </div>

                        {loadingTx ? (
                            <div className="tx-loading">Loading transactions...</div>
                        ) : filteredTransactions.length === 0 ? (
                            <div className="tx-empty">No transactions recorded yet</div>
                        ) : (
                            <div className="tx-list">
                                {filteredTransactions.map((tx, idx) => (
                                    <div key={tx.id} className={`tx-row ${tx.type}`} style={{ animation: `fadeInStagger 0.5s ease-out ${idx * 0.05}s both` }}>
                                        <span className="tx-icon">
                                            {CATEGORY_ICONS[tx.category] || '●'}
                                        </span>
                                        <div className="tx-details">
                                            <span className="tx-category">
                                                {CATEGORY_LABELS[tx.category] || (tx.category || tx.type || '').replace(/_/g, ' ').toUpperCase()}
                                            </span>
                                            <span className="tx-desc">{tx.description}</span>
                                        </div>
                                        <div className="tx-amounts">
                                            <span className={`tx-amount ${tx.type === 'credit' ? 'positive' : 'negative'}`}>
                                                {tx.type === 'credit' ? '+' : '-'}{Math.abs(tx.amount).toLocaleString()}
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
            )}

            {clubId && (
                <ClubBottomNav
                    clubId={clubId}
                    userRole={userRole as 'owner' | 'admin' | 'agent' | 'member'}
                />
            )}
        </div>
    );
}

/**
 *  CHIP TRANSFER MODAL — Agent Credit Distribution
 * Allows agents to transfer chips to players or other agents
 */

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../stores/useUserStore';
import { useToast } from '../common/Toast';
import './ChipTransferModal.css';

interface Player {
    id: string;
    username: string;
    avatar_url: string;
    current_balance: number;
}

interface ChipTransferModalProps {
    isOpen: boolean;
    onClose: () => void;
    clubId: string;
    recipientId?: string; // Pre-selected recipient
    recipientType: 'player' | 'agent';
    onTransferComplete?: () => void;
}

export default function ChipTransferModal({
    isOpen,
    onClose,
    clubId,
    recipientId,
    recipientType,
    onTransferComplete
}: ChipTransferModalProps) {
    const { user } = useUserStore();
    const toast = useToast();
    const [players, setPlayers] = useState<Player[]>([]);
    const [selectedPlayer, setSelectedPlayer] = useState<string>(recipientId || '');
    const [amount, setAmount] = useState<string>('');
    const [note, setNote] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingPlayers, setIsLoadingPlayers] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [agentBalance, setAgentBalance] = useState<number>(0);

    // Load players under this agent
    useEffect(() => {
        if (isOpen && user?.id && !recipientId) {
            loadPlayers();
        }
        if (recipientId) {
            setSelectedPlayer(recipientId);
        }
    }, [isOpen, user?.id, clubId, recipientId]);

    // Load agent's available balance
    useEffect(() => {
        if (isOpen && user?.id) {
            loadAgentBalance();
        }
    }, [isOpen, user?.id, clubId]);

    const loadPlayers = async () => {
        if (!user?.id) return;
        setIsLoadingPlayers(true);

        try {
            // Load players assigned to this agent in this club
            const { data, error } = await supabase
                .from('club_members')
                .select(`
                    user_id,
                    users:user_id (
                        id,
                        username,
                        avatar_url
                    ),
                    player_balance
                `)
                .eq('club_id', clubId)
                .eq('agent_id', user.id)
                .eq('role', 'player');

            if (error) throw error;

            const playerList = (data || []).map((m: any) => ({
                id: m.users.id,
                username: m.users.username || 'Unknown',
                avatar_url: m.users.avatar_url || '',
                current_balance: m.player_balance || 0
            }));

            setPlayers(playerList);
        } catch (err) {
            console.error('Error loading players:', err);
            toast.error('Failed to load players');
        }

        setIsLoadingPlayers(false);
    };

    const loadAgentBalance = async () => {
        if (!user?.id) return;

        try {
            const { data, error } = await supabase
                .from('club_members')
                .select('agent_credit_limit, agent_credit_used')
                .eq('club_id', clubId)
                .eq('user_id', user.id)
                .single();

            if (error) throw error;

            // Available balance = credit limit - used
            const available = (data?.agent_credit_limit || 0) - (data?.agent_credit_used || 0);
            setAgentBalance(available);
        } catch (err) {
            console.error('Error loading agent balance:', err);
        }
    };

    const handleTransfer = async () => {
        const transferAmount = parseFloat(amount);

        // Validation
        if (!selectedPlayer) {
            setError('Please select a recipient');
            return;
        }
        if (isNaN(transferAmount) || transferAmount <= 0) {
            setError('Please enter a valid amount');
            return;
        }
        if (transferAmount > agentBalance) {
            setError('Insufficient balance');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // 1. Update agent's credit used
            const { error: agentError } = await supabase
                .from('club_members')
                .update({
                    agent_credit_used: supabase.rpc('increment', { x: transferAmount })
                })
                .eq('club_id', clubId)
                .eq('user_id', user?.id);

            if (agentError) throw agentError;

            // 2. Update player's balance
            const { error: playerError } = await supabase
                .from('club_members')
                .update({
                    player_balance: supabase.rpc('increment', { x: transferAmount })
                })
                .eq('club_id', clubId)
                .eq('user_id', selectedPlayer);

            if (playerError) throw playerError;

            // 3. Record the transaction
            const { error: txError } = await supabase
                .from('club_transactions')
                .insert({
                    club_id: clubId,
                    from_user_id: user?.id,
                    to_user_id: selectedPlayer,
                    amount: transferAmount,
                    transaction_type: recipientType === 'player' ? 'agent_to_player' : 'agent_to_agent',
                    note: note || null,
                    status: 'completed'
                });

            if (txError) throw txError;

            setSuccess(`Successfully transferred $${transferAmount.toLocaleString()}`);
            toast.success(`Transferred $${transferAmount.toLocaleString()} successfully`);
            setAmount('');
            setNote('');
            setSelectedPlayer('');

            // Refresh balance
            await loadAgentBalance();

            if (onTransferComplete) {
                onTransferComplete();
            }

            // Auto-close after success
            setTimeout(() => {
                onClose();
                setSuccess(null);
            }, 2000);

        } catch (err: any) {
            console.error('Transfer error:', err);
            setError(err.message || 'Transfer failed. Please try again.');
        }

        setIsLoading(false);
    };

    const handleClose = () => {
        setError(null);
        setSuccess(null);
        setAmount('');
        setNote('');
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="chip-transfer-overlay" onClick={handleClose}>
            <div className="chip-transfer-modal" onClick={(e) => e.stopPropagation()}>
                <div className="chip-transfer-header">
                    <h2> Transfer Credits</h2>
                    <button className="close-btn" onClick={handleClose}>×</button>
                </div>

                <div className="agent-balance">
                    <span>Available Balance:</span>
                    <span className="balance-amount">${agentBalance.toLocaleString()}</span>
                </div>

                <div className="chip-transfer-form">
                    {/* Recipient Selection */}
                    {!recipientId && (
                        <div className="form-group">
                            <label>Recipient</label>
                            {isLoadingPlayers ? (
                                <div className="loading-text">Loading players...</div>
                            ) : (
                                <select
                                    value={selectedPlayer}
                                    onChange={(e) => setSelectedPlayer(e.target.value)}
                                    className="player-select"
                                >
                                    <option value="">Select a player</option>
                                    {players.map((player) => (
                                        <option key={player.id} value={player.id}>
                                            {player.username} (Balance: ${player.current_balance.toLocaleString()})
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                    )}

                    {/* Amount Input */}
                    <div className="form-group">
                        <label>Amount</label>
                        <div className="amount-input-wrapper">
                            <span className="currency-symbol">$</span>
                            <input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0.00"
                                min="0"
                                max={agentBalance}
                                step="0.01"
                            />
                        </div>
                        <div className="quick-amounts">
                            <button type="button" onClick={() => setAmount('50')}>$50</button>
                            <button type="button" onClick={() => setAmount('100')}>$100</button>
                            <button type="button" onClick={() => setAmount('500')}>$500</button>
                            <button type="button" onClick={() => setAmount(String(agentBalance))}>Max</button>
                        </div>
                    </div>

                    {/* Note Input */}
                    <div className="form-group">
                        <label>Note (Optional)</label>
                        <input
                            type="text"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="e.g., Initial deposit, bonus, etc."
                        />
                    </div>

                    {/* Messages */}
                    {error && <div className="message error">{error}</div>}
                    {success && <div className="message success">{success}</div>}

                    {/* Submit Button */}
                    <button
                        className="transfer-btn"
                        onClick={handleTransfer}
                        disabled={isLoading || !selectedPlayer || !amount}
                    >
                        {isLoading ? 'Processing...' : 'Transfer Credits'}
                    </button>
                </div>
            </div>
        </div>
    );
}

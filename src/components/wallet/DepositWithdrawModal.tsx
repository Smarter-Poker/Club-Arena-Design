/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 💳 DEPOSIT/WITHDRAW MODAL — Payment Processing
 * Handles deposits and withdrawals with multiple payment methods
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../common/Toast';
import styles from './DepositWithdrawModal.module.css';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type Mode = 'deposit' | 'withdraw';
type PaymentMethod = 'crypto' | 'venmo' | 'zelle' | 'cashapp' | 'agent';

interface DepositWithdrawModalProps {
    isOpen: boolean;
    onClose: () => void;
    mode: Mode;
    userId: string;
    currentBalance: number;
    onComplete?: () => void;
}

interface PaymentMethodInfo {
    id: PaymentMethod;
    icon: string;
    label: string;
    description: string;
    minAmount: number;
    maxAmount: number;
    fee: number; // percentage
    processingTime: string;
}

const PAYMENT_METHODS: PaymentMethodInfo[] = [
    {
        id: 'agent',
        icon: '',
        label: 'Agent',
        description: 'Transfer through your agent',
        minAmount: 10,
        maxAmount: 50000,
        fee: 0,
        processingTime: 'Instant'
    },
    {
        id: 'crypto',
        icon: '₿',
        label: 'Crypto',
        description: 'BTC, ETH, USDT',
        minAmount: 20,
        maxAmount: 100000,
        fee: 0,
        processingTime: '10-30 minutes'
    },
    {
        id: 'venmo',
        icon: '💜',
        label: 'Venmo',
        description: '@ClubArena',
        minAmount: 10,
        maxAmount: 5000,
        fee: 3,
        processingTime: '1-2 hours'
    },
    {
        id: 'zelle',
        icon: '💚',
        label: 'Zelle',
        description: 'pay@clubarena.com',
        minAmount: 10,
        maxAmount: 10000,
        fee: 2,
        processingTime: '1-2 hours'
    },
    {
        id: 'cashapp',
        icon: '',
        label: 'Cash App',
        description: '$ClubArena',
        minAmount: 10,
        maxAmount: 5000,
        fee: 3,
        processingTime: '1-2 hours'
    }
];

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function DepositWithdrawModal({
    isOpen,
    onClose,
    mode,
    userId,
    currentBalance,
    onComplete
}: DepositWithdrawModalProps) {
    const toast = useToast();
    const [step, setStep] = useState<'method' | 'amount' | 'confirm' | 'success'>('method');
    const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
    const [amount, setAmount] = useState('');
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [referenceId, setReferenceId] = useState<string | null>(null);

    // Withdrawal-specific fields
    const [withdrawAddress, setWithdrawAddress] = useState('');

    const currentMethod = PAYMENT_METHODS.find(m => m.id === selectedMethod);
    const numericAmount = parseFloat(amount) || 0;
    const feeAmount = currentMethod ? (numericAmount * currentMethod.fee / 100) : 0;
    const totalAmount = mode === 'deposit' ? numericAmount : numericAmount + feeAmount;

    const handleMethodSelect = (method: PaymentMethod) => {
        setSelectedMethod(method);
        setStep('amount');
        setError(null);
    };

    const handleAmountSubmit = () => {
        if (!currentMethod) return;

        if (numericAmount < currentMethod.minAmount) {
            setError(`Minimum amount is $${currentMethod.minAmount}`);
            return;
        }
        if (numericAmount > currentMethod.maxAmount) {
            setError(`Maximum amount is $${currentMethod.maxAmount.toLocaleString()}`);
            return;
        }
        if (mode === 'withdraw' && numericAmount > currentBalance) {
            setError('Insufficient balance');
            return;
        }

        setStep('confirm');
        setError(null);
    };

    const handleConfirm = async () => {
        if (!currentMethod) return;

        setProcessing(true);
        setError(null);

        try {
            // Create transaction record
            const { data, error: txError } = await supabase
                .from('wallet_transactions')
                .insert({
                    user_id: userId,
                    type: mode,
                    amount: numericAmount,
                    fee: feeAmount,
                    payment_method: selectedMethod,
                    status: mode === 'deposit' ? 'pending' : 'processing',
                    wallet_type: 'PLAYER',
                    metadata: {
                        withdraw_address: mode === 'withdraw' ? withdrawAddress : null
                    }
                })
                .select()
                .single();

            if (txError) throw txError;

            // For withdrawals, update wallet status directly (locking handled via status)
            if (mode === 'withdraw') {
                try {
                    await supabase.from('wallets').update({ locked_until: new Date(Date.now() + 3600000).toISOString() }).eq('user_id', userId);
                } catch (err) {
                    console.warn('[DepositWithdraw] Failed to lock wallet (non-fatal):', err);
                }
            }

            setReferenceId(data.id);
            setStep('success');
            onComplete?.();
        } catch (err) {
            console.error(`${mode} failed:`, err);
            toast.error(`Failed to process ${mode}. Please try again.`);
            setError(`Failed to process ${mode}. Please try again.`);
        }
        setProcessing(false);
    };

    const handleClose = () => {
        setStep('method');
        setSelectedMethod(null);
        setAmount('');
        setError(null);
        setReferenceId(null);
        setWithdrawAddress('');
        onClose();
    };

    const quickAmounts = [25, 50, 100, 250, 500, 1000];

    if (!isOpen) return null;

    return (
        <div className={styles.overlay} onClick={handleClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className={styles.header}>
                    <h2>
                        {mode === 'deposit' ? ' Deposit' : ' Withdraw'}
                    </h2>
                    {step !== 'method' && step !== 'success' && (
                        <button
                            className={styles.backBtn}
                            onClick={() => setStep(step === 'confirm' ? 'amount' : 'method')}
                        >
                            ← Back
                        </button>
                    )}
                    <button className={styles.closeBtn} onClick={handleClose}>✕</button>
                </div>

                {/* Current Balance */}
                <div className={styles.balanceBar}>
                    <span>Current Balance</span>
                    <span className={styles.balanceValue}>${currentBalance.toLocaleString()}</span>
                </div>

                {/* Error */}
                {error && <div className={styles.error}>{error}</div>}

                {/* Step 1: Select Method */}
                {step === 'method' && (
                    <div className={styles.methodGrid}>
                        {PAYMENT_METHODS.map(method => (
                            <button
                                key={method.id}
                                className={styles.methodCard}
                                onClick={() => handleMethodSelect(method.id)}
                            >
                                <span className={styles.methodIcon}>{method.icon}</span>
                                <span className={styles.methodLabel}>{method.label}</span>
                                <span className={styles.methodDesc}>{method.description}</span>
                                <span className={styles.methodFee}>
                                    {method.fee > 0 ? `${method.fee}% fee` : 'No fee'}
                                </span>
                            </button>
                        ))}
                    </div>
                )}

                {/* Step 2: Enter Amount */}
                {step === 'amount' && currentMethod && (
                    <div className={styles.amountSection}>
                        <div className={styles.selectedMethod}>
                            <span>{currentMethod.icon} {currentMethod.label}</span>
                            <span className={styles.processingTime}> {currentMethod.processingTime}</span>
                        </div>

                        <div className={styles.amountInput}>
                            <span className={styles.currency}>$</span>
                            <input
                                type="number"
                                placeholder="0.00"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                autoFocus
                            />
                        </div>

                        <div className={styles.quickAmounts}>
                            {quickAmounts.map(qa => (
                                <button
                                    key={qa}
                                    onClick={() => setAmount(qa.toString())}
                                    className={numericAmount === qa ? styles.active : ''}
                                >
                                    ${qa}
                                </button>
                            ))}
                        </div>

                        <div className={styles.limits}>
                            <span>Min: ${currentMethod.minAmount}</span>
                            <span>Max: ${currentMethod.maxAmount.toLocaleString()}</span>
                        </div>

                        {mode === 'withdraw' && (
                            <div className={styles.addressInput}>
                                <label>
                                    {selectedMethod === 'crypto' ? 'Wallet Address' :
                                        selectedMethod === 'venmo' ? 'Venmo Username' :
                                            selectedMethod === 'zelle' ? 'Email/Phone' :
                                                selectedMethod === 'cashapp' ? 'Cash App Tag' :
                                                    'Agent ID'}
                                </label>
                                <input
                                    type="text"
                                    placeholder="Enter destination..."
                                    value={withdrawAddress}
                                    onChange={e => setWithdrawAddress(e.target.value)}
                                />
                            </div>
                        )}

                        <button
                            className={styles.continueBtn}
                            onClick={handleAmountSubmit}
                            disabled={numericAmount <= 0}
                        >
                            Continue
                        </button>
                    </div>
                )}

                {/* Step 3: Confirm */}
                {step === 'confirm' && currentMethod && (
                    <div className={styles.confirmSection}>
                        <div className={styles.summary}>
                            <div className={styles.summaryRow}>
                                <span>Amount</span>
                                <span>${numericAmount.toLocaleString()}</span>
                            </div>
                            {feeAmount > 0 && (
                                <div className={styles.summaryRow}>
                                    <span>Fee ({currentMethod.fee}%)</span>
                                    <span>-${feeAmount.toFixed(2)}</span>
                                </div>
                            )}
                            <div className={`${styles.summaryRow} ${styles.total}`}>
                                <span>{mode === 'deposit' ? 'You Pay' : 'You Receive'}</span>
                                <span>
                                    ${mode === 'deposit' ?
                                        numericAmount.toLocaleString() :
                                        (numericAmount - feeAmount).toFixed(2)}
                                </span>
                            </div>
                        </div>

                        <div className={styles.methodInfo}>
                            <span className={styles.methodIcon}>{currentMethod.icon}</span>
                            <span>{currentMethod.label}</span>
                            <span className={styles.processingTime}> {currentMethod.processingTime}</span>
                        </div>

                        {mode === 'deposit' && (
                            <div className={styles.instructions}>
                                <p>After clicking confirm:</p>
                                <ol>
                                    <li>Send ${numericAmount.toLocaleString()} to <strong>{currentMethod.description}</strong></li>
                                    <li>Include your reference ID in the memo</li>
                                    <li>Funds will be credited within {currentMethod.processingTime}</li>
                                </ol>
                            </div>
                        )}

                        <button
                            className={styles.confirmBtn}
                            onClick={handleConfirm}
                            disabled={processing}
                        >
                            {processing ? 'Processing...' : `Confirm ${mode === 'deposit' ? 'Deposit' : 'Withdrawal'}`}
                        </button>
                    </div>
                )}

                {/* Step 4: Success */}
                {step === 'success' && (
                    <div className={styles.successSection}>
                        <span className={styles.successIcon}></span>
                        <h3>{mode === 'deposit' ? 'Deposit Initiated!' : 'Withdrawal Submitted!'}</h3>

                        {mode === 'deposit' && (
                            <>
                                <p>Send exactly <strong>${numericAmount.toLocaleString()}</strong> to:</p>
                                <div className={styles.paymentDetails}>
                                    <span className={styles.destination}>{currentMethod?.description}</span>
                                </div>
                                <div className={styles.referenceBox}>
                                    <span className={styles.refLabel}>Reference ID</span>
                                    <span className={styles.refValue}>{referenceId?.slice(0, 8).toUpperCase()}</span>
                                </div>
                                <p className={styles.hint}>Include this ID in your payment memo</p>
                            </>
                        )}

                        {mode === 'withdraw' && (
                            <p>Your withdrawal is being processed. You'll receive confirmation soon.</p>
                        )}

                        <button className={styles.doneBtn} onClick={handleClose}>
                            Done
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

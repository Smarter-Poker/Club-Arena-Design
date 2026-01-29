import React, { useState } from 'react';
import './ChipTransferConfirm.css';

interface ChipTransferConfirmProps {
    isOpen: boolean;
    amount: number;
    fromName: string;
    toName: string;
    fee?: number;
    onConfirm: () => void;
    onCancel: () => void;
}

export const ChipTransferConfirm: React.FC<ChipTransferConfirmProps> = ({
    isOpen,
    amount,
    fromName,
    toName,
    fee = 0,
    onConfirm,
    onCancel
}) => {
    const [isProcessing, setIsProcessing] = useState(false);

    if (!isOpen) return null;

    const handleConfirm = async () => {
        setIsProcessing(true);
        try {
            await onConfirm();
        } finally {
            setIsProcessing(false);
        }
    };

    const finalAmount = amount - fee;

    return (
        <div className="transfer-confirm-overlay" onClick={onCancel}>
            <div className="transfer-confirm" onClick={(e) => e.stopPropagation()}>
                <div className="confirm-icon"></div>
                <h3>Confirm Transfer</h3>

                <div className="transfer-visual">
                    <div className="transfer-party">
                        <span className="party-label">From</span>
                        <span className="party-name">{fromName}</span>
                    </div>
                    <div className="transfer-arrow">→</div>
                    <div className="transfer-party">
                        <span className="party-label">To</span>
                        <span className="party-name">{toName}</span>
                    </div>
                </div>

                <div className="transfer-details">
                    <div className="detail-row">
                        <span>Amount</span>
                        <span>{amount.toLocaleString()}</span>
                    </div>
                    {fee > 0 && (
                        <div className="detail-row fee">
                            <span>Transfer Fee</span>
                            <span>-{fee.toLocaleString()}</span>
                        </div>
                    )}
                    <div className="detail-row total">
                        <span>Recipient Gets</span>
                        <span>{finalAmount.toLocaleString()}</span>
                    </div>
                </div>

                <div className="confirm-actions">
                    <button className="cancel-btn" onClick={onCancel}>
                        Cancel
                    </button>
                    <button
                        className="confirm-btn"
                        onClick={handleConfirm}
                        disabled={isProcessing}
                    >
                        {isProcessing ? 'Processing...' : 'Confirm Transfer'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChipTransferConfirm;

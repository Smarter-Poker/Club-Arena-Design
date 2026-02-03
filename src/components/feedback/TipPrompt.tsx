import React from 'react';
import './TipPrompt.css';

interface TipPromptProps {
    isOpen: boolean;
    dealerName?: string;
    suggestedAmounts?: number[];
    onTip?: (amount: number) => void;
    onSkip?: () => void;
}

export const TipPrompt: React.FC<TipPromptProps> = ({
    isOpen,
    dealerName = 'the dealer',
    suggestedAmounts = [50, 100, 250, 500],
    onTip,
    onSkip
}) => {
    if (!isOpen) return null;

    return (
        <div className="tip-prompt-overlay">
            <div className="tip-prompt">
                <div className="tip-icon">$</div>
                <h3>Nice Win!</h3>
                <p>Would you like to tip {dealerName}?</p>

                <div className="tip-amounts">
                    {suggestedAmounts.map(amount => (
                        <button
                            key={amount}
                            className="tip-amount-btn"
                            onClick={() => onTip?.(amount)}
                        >
                            {amount}
                        </button>
                    ))}
                </div>

                <button className="skip-tip-btn" onClick={onSkip}>
                    No thanks
                </button>
            </div>
        </div>
    );
};

export default TipPrompt;

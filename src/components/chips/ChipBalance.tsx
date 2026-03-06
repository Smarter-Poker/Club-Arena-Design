import React from 'react';
import './ChipBalance.css';

interface ChipBalanceProps {
    amount: number;
    currency?: 'chips' | 'diamonds';
    showChange?: boolean;
    changeAmount?: number;
    size?: 'small' | 'medium' | 'large';
    onClick?: () => void;
}

export const ChipBalance: React.FC<ChipBalanceProps> = ({
    amount,
    currency = 'chips',
    showChange = false,
    changeAmount = 0,
    size = 'medium',
    onClick
}) => {
    const formatAmount = (n: number) => {
        return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    return (
        <div
            className={`chip-balance ${size} ${currency}`}
            onClick={onClick}
        >
            <span className="balance-icon">
                {currency === 'chips' ? '' : ''}
            </span>
            <span className="balance-amount">{formatAmount(amount)}</span>

            {showChange && changeAmount !== 0 && (
                <span className={`balance-change ${changeAmount > 0 ? 'positive' : 'negative'}`}>
                    {changeAmount > 0 ? '+' : ''}{formatAmount(changeAmount)}
                </span>
            )}
        </div>
    );
};

export default ChipBalance;

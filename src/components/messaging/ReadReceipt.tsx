/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ♠ READ RECEIPTS — Q3 Social Upgrade (Phase 2: Social Richness)
 * Double-checkmark read receipt indicator (WhatsApp-style)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React from 'react';

export type ReadStatus = 'sending' | 'sent' | 'delivered' | 'seen';

interface ReadReceiptProps {
  status: ReadStatus;
  className?: string;
}

/**
 * Visual read receipt indicator:
 * - sending:   ○ (hollow circle, spinning)
 * - sent:      ✓ (single grey check)
 * - delivered: ✓✓ (double grey checks)
 * - seen:      ✓✓ (double blue checks)
 */
export const ReadReceipt: React.FC<ReadReceiptProps> = ({ status, className = '' }) => {
  return (
    <span
      className={`read-receipt read-receipt-${status} ${className}`}
      aria-label={`Message ${status}`}
    >
      {status === 'sending' && (
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            cx="7"
            cy="7"
            r="5.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="24"
            strokeDashoffset="8"
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              dur="1s"
              repeatCount="indefinite"
              from="0 7 7"
              to="360 7 7"
            />
          </circle>
        </svg>
      )}
      {status === 'sent' && (
        <svg
          width="16"
          height="12"
          viewBox="0 0 16 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M1 6L5.5 10.5L14.5 1.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {(status === 'delivered' || status === 'seen') && (
        <svg
          width="20"
          height="12"
          viewBox="0 0 20 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M1 6L5.5 10.5L14.5 1.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M5 6L9.5 10.5L18.5 1.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
};

export default ReadReceipt;

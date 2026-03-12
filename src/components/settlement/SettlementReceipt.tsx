/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  SETTLEMENT RECEIPT — Professional PDF-style receipt card
 * ═══════════════════════════════════════════════════════════════════════════════
 * Displays settlement payout details with hash ID for dispute resolution,
 * animated "stamp" effect, and copy-to-clipboard functionality.
 */

import { useState, useCallback } from 'react';
import './SettlementReceipt.css';

interface SettlementReceiptProps {
  receiptId: string;
  amount: number;
  fee?: number;
  netAmount: number;
  settledAt: string;
  periodStart: string;
  periodEnd: string;
  status: 'paid' | 'pending' | 'processing';
  method?: string;
}

// Haptic
const haptic = (ms: number | number[] = 10) => {
  try {
    navigator?.vibrate?.(ms);
  } catch {
    /* vibrate unsupported */
  }
};

export default function SettlementReceipt({
  receiptId,
  amount,
  fee = 0,
  netAmount,
  settledAt,
  periodStart,
  periodEnd,
  status,
  method = 'Agent',
}: SettlementReceiptProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const shortId = receiptId.slice(0, 8).toUpperCase();

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(receiptId);
      haptic([10, 50, 10]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text
    }
  }, [receiptId]);

  const statusConfig = {
    paid: { label: 'Settled', color: '#00c853', icon: '✅' },
    pending: { label: 'Pending', color: '#ffa726', icon: '⏳' },
    processing: { label: 'Processing', color: '#448aff', icon: '⚙️' },
  };

  const s = statusConfig[status];

  return (
    <div className={`settlement-receipt ${status}`}>
      {/* Stamp watermark */}
      {status === 'paid' && <div className="sr-stamp">SETTLED</div>}

      {/* Header */}
      <div className="sr-header">
        <div className="sr-logo">💰</div>
        <div className="sr-title-block">
          <span className="sr-title">Settlement Receipt</span>
          <span className="sr-period">
            {new Date(periodStart).toLocaleDateString()} —{' '}
            {new Date(periodEnd).toLocaleDateString()}
          </span>
        </div>
        <div
          className="sr-status-badge"
          style={{ background: `${s.color}15`, color: s.color, borderColor: `${s.color}40` }}
        >
          {s.icon} {s.label}
        </div>
      </div>

      {/* Amount display */}
      <div className="sr-amount-block">
        <span className="sr-amount-label">Net Payout</span>
        <span className="sr-amount-value">{netAmount.toLocaleString()}</span>
        <span className="sr-amount-unit">chips</span>
      </div>

      {/* Expandable details */}
      <button
        className="sr-expand-btn"
        onClick={() => {
          setExpanded(!expanded);
          haptic(8);
        }}
      >
        {expanded ? '▲ Hide Details' : '▼ Show Details'}
      </button>

      {expanded && (
        <div className="sr-details">
          <div className="sr-detail-row">
            <span>Gross Amount</span>
            <span>{amount.toLocaleString()}</span>
          </div>
          {fee > 0 && (
            <div className="sr-detail-row">
              <span>Processing Fee</span>
              <span className="sr-fee">-{fee.toLocaleString()}</span>
            </div>
          )}
          <div className="sr-detail-row sr-total">
            <span>Net Payout</span>
            <span>{netAmount.toLocaleString()}</span>
          </div>
          <div className="sr-detail-row">
            <span>Method</span>
            <span>{method}</span>
          </div>
          <div className="sr-detail-row">
            <span>Settled</span>
            <span>{new Date(settledAt).toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Receipt ID */}
      <div className="sr-receipt-id">
        <span className="sr-id-label">Receipt ID</span>
        <div className="sr-id-row">
          <code className="sr-id-value">{shortId}</code>
          <button className="sr-copy-btn" onClick={handleCopy}>
            {copied ? '✓ Copied' : '📋 Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}

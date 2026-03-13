/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MetalFrame - Futuristic Metal Modal/Card Container
 * Uses Grok-generated frame images as backgrounds
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { ReactNode } from 'react';
import styles from './MetalFrame.module.css';

export type MetalFrameVariant = 'modal' | 'card' | 'wide' | 'form';
export type MetalFrameSize = 'sm' | 'md' | 'lg' | 'xl' | 'auto';

interface MetalFrameProps {
  children: ReactNode;
  title?: string;
  variant?: MetalFrameVariant;
  size?: MetalFrameSize;
  onClose?: () => void;
  className?: string;
}

export default function MetalFrame({
  children,
  title,
  variant = 'modal',
  size = 'md',
  onClose,
  className = '',
}: MetalFrameProps) {
  return (
    <div className={`${styles.frame} ${styles[variant]} ${styles[size]} ${className}`}>
      {/* Title Bar */}
      {title && (
        <div className={styles.titleBar}>
          <span className={styles.titleText}>{title}</span>
        </div>
      )}

      {/* Close Button */}
      {onClose && (
        <button className={styles.closeButton} onClick={onClose} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
          </svg>
        </button>
      )}

      {/* Content Area */}
      <div className={styles.content}>{children}</div>
    </div>
  );
}

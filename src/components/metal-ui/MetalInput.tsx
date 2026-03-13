/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MetalInput - Futuristic Metal Input Component
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { InputHTMLAttributes, forwardRef } from 'react';
import styles from './MetalInput.module.css';

interface MetalInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  fullWidth?: boolean;
}

const MetalInput = forwardRef<HTMLInputElement, MetalInputProps>(
  ({ label, error, fullWidth = true, className = '', ...props }, ref) => {
    return (
      <div className={`${styles.container} ${fullWidth ? styles.fullWidth : ''}`}>
        {label && <label className={styles.label}>{label}</label>}
        <div className={styles.inputWrapper}>
          <input
            ref={ref}
            className={`${styles.input} ${error ? styles.error : ''} ${className}`}
            {...props}
          />
          <div className={styles.glow} />
        </div>
        {error && <span className={styles.errorText}>{error}</span>}
      </div>
    );
  }
);

MetalInput.displayName = 'MetalInput';

export default MetalInput;

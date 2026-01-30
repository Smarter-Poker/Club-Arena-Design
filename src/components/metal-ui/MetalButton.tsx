/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MetalButton - Futuristic Metal Button Component
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { ReactNode, ButtonHTMLAttributes } from 'react';
import styles from './MetalButton.module.css';

export type MetalButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type MetalButtonSize = 'sm' | 'md' | 'lg';

interface MetalButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    children: ReactNode;
    variant?: MetalButtonVariant;
    size?: MetalButtonSize;
    icon?: ReactNode;
    loading?: boolean;
    fullWidth?: boolean;
}

export default function MetalButton({
    children,
    variant = 'primary',
    size = 'md',
    icon,
    loading = false,
    fullWidth = false,
    disabled,
    className = '',
    ...props
}: MetalButtonProps) {
    return (
        <button
            className={`
        ${styles.button}
        ${styles[variant]}
        ${styles[size]}
        ${fullWidth ? styles.fullWidth : ''}
        ${loading ? styles.loading : ''}
        ${className}
      `}
            disabled={disabled || loading}
            {...props}
        >
            {loading ? (
                <span className={styles.spinner} />
            ) : (
                <>
                    {icon && <span className={styles.icon}>{icon}</span>}
                    <span className={styles.text}>{children}</span>
                </>
            )}
        </button>
    );
}

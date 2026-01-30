/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MetalIconBox - Futuristic Metal Icon Container
 * For upload buttons, action icons, etc.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { ReactNode } from 'react';
import styles from './MetalIconBox.module.css';

interface MetalIconBoxProps {
    icon?: ReactNode;
    label?: string;
    onClick?: () => void;
    disabled?: boolean;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

export default function MetalIconBox({
    icon,
    label,
    onClick,
    disabled = false,
    size = 'md',
    className = '',
}: MetalIconBoxProps) {
    return (
        <button
            className={`${styles.iconBox} ${styles[size]} ${className}`}
            onClick={onClick}
            disabled={disabled}
            type="button"
        >
            <div className={styles.iconContainer}>
                {icon || (
                    <svg className={styles.plusIcon} viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 4v16m-8-8h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                )}
            </div>
            {label && <span className={styles.label}>{label}</span>}
            <div className={styles.glowEffect} />
        </button>
    );
}

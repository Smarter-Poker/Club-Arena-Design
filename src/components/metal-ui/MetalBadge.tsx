/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MetalBadge - Futuristic Metal Badge Component
 * Status indicators with glow effects
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { ReactNode } from 'react';
import styles from './MetalBadge.module.css';

export type MetalBadgeVariant =
  | 'live'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'premium'
  | 'muted';
export type MetalBadgeSize = 'sm' | 'md' | 'lg';

interface MetalBadgeProps {
  children: ReactNode;
  variant?: MetalBadgeVariant;
  size?: MetalBadgeSize;
  icon?: ReactNode;
  pulse?: boolean;
  className?: string;
}

export default function MetalBadge({
  children,
  variant = 'info',
  size = 'md',
  icon,
  pulse = false,
  className = '',
}: MetalBadgeProps) {
  return (
    <span
      className={`
                ${styles.badge}
                ${styles[variant]}
                ${styles[size]}
                ${pulse ? styles.pulse : ''}
                ${className}
            `}
    >
      {icon && <span className={styles.icon}>{icon}</span>}
      <span className={styles.text}>{children}</span>
    </span>
  );
}

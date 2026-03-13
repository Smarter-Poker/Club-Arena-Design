/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MetalCard - Futuristic Metal Card Container
 * For sections, info blocks, and smaller containers
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { ReactNode } from 'react';
import styles from './MetalCard.module.css';

interface MetalCardProps {
  children: ReactNode;
  title?: string;
  size?: 'sm' | 'md' | 'lg';
  glow?: boolean;
  className?: string;
}

export default function MetalCard({
  children,
  title,
  size = 'md',
  glow = false,
  className = '',
}: MetalCardProps) {
  return (
    <div className={`${styles.card} ${styles[size]} ${glow ? styles.glow : ''} ${className}`}>
      {title && <h3 className={styles.title}>{title}</h3>}
      <div className={styles.content}>{children}</div>
    </div>
  );
}

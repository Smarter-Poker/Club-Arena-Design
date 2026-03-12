/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  PARTICLE SYSTEM — GPU-Accelerated Celebration Effects
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Canvas-based particle emitter for winner celebrations and dramatic moments.
 * Modes:
 *   - 'sparks'  — Gold/white sparkle burst emanating from a point
 *   - 'chips'   — Casino chip-colored circles
 *   - 'confetti' — Colorful rectangle confetti (wraps existing ConfettiCanvas)
 *
 * Key features:
 *   - Configurable origin point (emanate from winner's seat)
 *   - Radial burst pattern with gravity
 *   - Glow/bloom effect via shadow blur
 *   - Auto-cleanup after duration
 */

import { useRef, useEffect, useCallback } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type ParticleMode = 'sparks' | 'chips' | 'confetti';

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  opacity: number;
  gravity: number;
  life: number;
  maxLife: number;
  glow: number;
}

export interface ParticleSystemProps {
  /** Whether the particle system is active */
  active: boolean;
  /** Visual mode */
  mode?: ParticleMode;
  /** Origin point for particle burst (viewport coords) */
  origin?: { x: number; y: number };
  /** Duration in ms */
  duration?: number;
  /** Number of particles */
  count?: number;
  /** Burst intensity (1 = normal, 2 = big win) */
  intensity?: number;
  /** Called when animation completes */
  onComplete?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COLOR PALETTES
// ═══════════════════════════════════════════════════════════════════════════════

const PALETTES: Record<ParticleMode, string[]> = {
  sparks: [
    '#FFD700',
    '#FFF8DC',
    '#FFFACD',
    '#FFE66D',
    '#FFB800',
    '#FFFFFF',
    '#FFF5E1',
    '#FF8C00',
    '#FFD700',
  ],
  chips: ['#e74c3c', '#27ae60', '#1a1a2e', '#8e44ad', '#f1c40f', '#e67e22', '#ffffff'],
  confetti: [
    '#FFD700',
    '#C0C0C0',
    '#EF4444',
    '#3B82F6',
    '#22C55E',
    '#FFFFFF',
    '#EC4899',
    '#8B5CF6',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function ParticleSystem({
  active,
  mode = 'sparks',
  origin,
  duration = 2500,
  count = 60,
  intensity = 1,
  onComplete,
}: ParticleSystemProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const particlesRef = useRef<Spark[]>([]);
  const startTimeRef = useRef<number>(0);

  const createParticles = useCallback(
    (width: number, height: number): Spark[] => {
      const palette = PALETTES[mode];
      const cx = origin?.x ?? width / 2;
      const cy = origin?.y ?? height * 0.3;
      const sparks: Spark[] = [];
      const burstSpeed = 6 * intensity;

      for (let i = 0; i < count; i++) {
        // Radial burst pattern
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
        const speed = Math.random() * burstSpeed + burstSpeed * 0.3;

        sparks.push({
          x: cx + (Math.random() - 0.5) * 10,
          y: cy + (Math.random() - 0.5) * 10,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - (mode === 'sparks' ? 2 : 0),
          size:
            mode === 'sparks'
              ? Math.random() * 3 + 1.5
              : mode === 'chips'
                ? Math.random() * 6 + 4
                : Math.random() * 6 + 3,
          color: palette[Math.floor(Math.random() * palette.length)],
          opacity: 1,
          gravity: mode === 'sparks' ? 0.08 : 0.12,
          life: 0,
          maxLife: duration * (0.6 + Math.random() * 0.4),
          glow: mode === 'sparks' ? 8 + Math.random() * 12 : 0,
        });
      }
      return sparks;
    },
    [mode, origin, count, intensity, duration]
  );

  useEffect(() => {
    if (!active) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = 0;
      }
      particlesRef.current = [];
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // HiDPI setup
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.scale(dpr, dpr);

    particlesRef.current = createParticles(window.innerWidth, window.innerHeight);
    startTimeRef.current = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTimeRef.current;

      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      let aliveCount = 0;

      particlesRef.current.forEach((p) => {
        p.life += 16; // ~60fps
        if (p.life >= p.maxLife) return;
        aliveCount++;

        // Physics
        p.vy += p.gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.98; // Air drag

        // Fade out in last 40% of life
        const lifeProgress = p.life / p.maxLife;
        p.opacity = lifeProgress > 0.6 ? Math.max(0, 1 - (lifeProgress - 0.6) / 0.4) : 1;

        // Size shrink for sparks
        const sizeMultiplier = mode === 'sparks' ? Math.max(0.3, 1 - lifeProgress * 0.7) : 1;

        ctx.save();
        ctx.globalAlpha = p.opacity;

        if (p.glow > 0) {
          ctx.shadowBlur = p.glow * p.opacity;
          ctx.shadowColor = p.color;
        }

        ctx.fillStyle = p.color;

        if (mode === 'sparks') {
          // Draw circle sparkle
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * sizeMultiplier, 0, Math.PI * 2);
          ctx.fill();
        } else if (mode === 'chips') {
          // Draw circle (chip)
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          // Inner ring
          ctx.strokeStyle = 'rgba(255,255,255,0.3)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          // Confetti rectangle
          ctx.translate(p.x, p.y);
          ctx.rotate(p.life * 0.01 * (p.vx > 0 ? 1 : -1));
          ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
        }

        ctx.restore();
      });

      if (elapsed < duration && aliveCount > 0) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        particlesRef.current = [];
        onComplete?.();
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [active, duration, createParticles, onComplete, mode]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    />
  );
}

export default ParticleSystem;

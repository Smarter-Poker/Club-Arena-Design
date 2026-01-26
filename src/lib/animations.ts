/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🎬 ANIMATION UTILITIES — Framer Motion Presets
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { Transition, Variants } from 'framer-motion';

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSITIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const springTransition: Transition = {
    type: 'spring',
    stiffness: 300,
    damping: 30,
};

export const smoothTransition: Transition = {
    duration: 0.3,
    ease: 'easeInOut',
};

export const quickTransition: Transition = {
    duration: 0.15,
    ease: 'easeOut',
};

export const slowTransition: Transition = {
    duration: 0.5,
    ease: 'easeInOut',
};

export const bounceTransition: Transition = {
    type: 'spring',
    stiffness: 500,
    damping: 25,
    mass: 0.5,
};

// ═══════════════════════════════════════════════════════════════════════════════
// FADE VARIANTS
// ═══════════════════════════════════════════════════════════════════════════════

export const fadeIn: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 },
};

export const fadeInUp: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
};

export const fadeInDown: Variants = {
    hidden: { opacity: 0, y: -20 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 10 },
};

export const fadeInLeft: Variants = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 },
};

export const fadeInRight: Variants = {
    hidden: { opacity: 0, x: 20 },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCALE VARIANTS
// ═══════════════════════════════════════════════════════════════════════════════

export const scaleIn: Variants = {
    hidden: { scale: 0, opacity: 0 },
    visible: { scale: 1, opacity: 1 },
    exit: { scale: 0, opacity: 0 },
};

export const scaleInBounce: Variants = {
    hidden: { scale: 0, opacity: 0 },
    visible: {
        scale: 1,
        opacity: 1,
        transition: bounceTransition,
    },
    exit: { scale: 0, opacity: 0 },
};

export const popIn: Variants = {
    hidden: { scale: 0.8, opacity: 0 },
    visible: {
        scale: 1,
        opacity: 1,
        transition: springTransition,
    },
    exit: { scale: 0.9, opacity: 0 },
};

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE VARIANTS
// ═══════════════════════════════════════════════════════════════════════════════

export const slideUp: Variants = {
    hidden: { y: '100%' },
    visible: { y: 0 },
    exit: { y: '100%' },
};

export const slideDown: Variants = {
    hidden: { y: '-100%' },
    visible: { y: 0 },
    exit: { y: '-100%' },
};

export const slideLeft: Variants = {
    hidden: { x: '100%' },
    visible: { x: 0 },
    exit: { x: '100%' },
};

export const slideRight: Variants = {
    hidden: { x: '-100%' },
    visible: { x: 0 },
    exit: { x: '-100%' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// STAGGER CONTAINERS
// ═══════════════════════════════════════════════════════════════════════════════

export const staggerContainer = (
    staggerChildren = 0.1,
    delayChildren = 0
): Variants => ({
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren,
            delayChildren,
        },
    },
});

export const staggerItem: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
};

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL VARIANTS
// ═══════════════════════════════════════════════════════════════════════════════

export const modalOverlay: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 },
};

export const modalContent: Variants = {
    hidden: { opacity: 0, scale: 0.9, y: 20 },
    visible: {
        opacity: 1,
        scale: 1,
        y: 0,
        transition: springTransition,
    },
    exit: {
        opacity: 0,
        scale: 0.95,
        y: 10,
        transition: quickTransition,
    },
};

// ═══════════════════════════════════════════════════════════════════════════════
// POKER-SPECIFIC ANIMATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const cardDeal: Variants = {
    hidden: { x: 0, y: -200, rotateY: 180, opacity: 0 },
    visible: {
        x: 0,
        y: 0,
        rotateY: 0,
        opacity: 1,
        transition: { duration: 0.4, ease: 'easeOut' },
    },
};

export const cardFlip: Variants = {
    hidden: { rotateY: 180 },
    visible: {
        rotateY: 0,
        transition: { duration: 0.6, ease: 'easeInOut' },
    },
};

export const chipPush: Variants = {
    hidden: { scale: 0, opacity: 0 },
    visible: {
        scale: 1,
        opacity: 1,
        transition: bounceTransition,
    },
};

export const potCollect: Variants = {
    hidden: { scale: 1 },
    visible: {
        scale: 0,
        opacity: 0,
        transition: { duration: 0.5 },
    },
};

export const winnerHighlight: Variants = {
    hidden: { boxShadow: '0 0 0 0 rgba(255, 215, 0, 0)' },
    visible: {
        boxShadow: [
            '0 0 0 0 rgba(255, 215, 0, 0.7)',
            '0 0 20px 10px rgba(255, 215, 0, 0.3)',
            '0 0 0 0 rgba(255, 215, 0, 0)',
        ],
        transition: { duration: 1.5, repeat: 2 },
    },
};

// ═══════════════════════════════════════════════════════════════════════════════
// BUTTON INTERACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const buttonTap = {
    scale: 0.95,
    transition: quickTransition,
};

export const buttonHover = {
    scale: 1.02,
    transition: quickTransition,
};

// ═══════════════════════════════════════════════════════════════════════════════
// LOADING STATES
// ═══════════════════════════════════════════════════════════════════════════════

export const pulse: Variants = {
    hidden: { opacity: 0.5 },
    visible: {
        opacity: [0.5, 1, 0.5],
        transition: { duration: 1.5, repeat: Infinity },
    },
};

export const spin: Variants = {
    hidden: { rotate: 0 },
    visible: {
        rotate: 360,
        transition: { duration: 1, repeat: Infinity, ease: 'linear' },
    },
};

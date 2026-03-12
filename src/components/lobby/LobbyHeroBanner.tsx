/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ♠ LOBBY HERO BANNER — Q3 Wave 2 (Block E: Discovery Magnetism)
 * Auto-rotating promotional carousel at the top of the lobby
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { haptic } from '../../services/HapticService';
import './LobbyHeroBanner.css';

export interface BannerSlide {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  gradient: string;
  actionUrl?: string;
  actionLabel?: string;
}

// Default promotional slides — can be replaced with dynamic data from `promotions` table
const DEFAULT_SLIDES: BannerSlide[] = [
  {
    id: 'tournament-series',
    title: 'Weekly Tournament Series',
    subtitle: 'Join the weekly championship — massive guaranteed prizes',
    icon: '🏆',
    gradient: 'linear-gradient(135deg, #1a0533 0%, #2d1b69 50%, #1a0533 100%)',
    actionUrl: '/tournaments',
    actionLabel: 'View Tournaments',
  },
  {
    id: 'daily-bonus',
    title: 'Daily Spin Bonus',
    subtitle: 'Spin the wheel every day for free diamonds and rewards',
    icon: '🎰',
    gradient: 'linear-gradient(135deg, #0a2540 0%, #0d4f2f 50%, #0a2540 100%)',
    actionUrl: '/bonus',
    actionLabel: 'Spin Now',
  },
  {
    id: 'invite-friends',
    title: 'Invite Friends, Earn Rewards',
    subtitle: 'Get 100 diamonds for every friend who joins your club',
    icon: '💎',
    gradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    actionUrl: '/friends',
    actionLabel: 'Invite Now',
  },
  {
    id: 'vip-upgrade',
    title: 'VIP Membership',
    subtitle: 'Unlock exclusive avatars, throwables, and premium perks',
    icon: '👑',
    gradient: 'linear-gradient(135deg, #2d1b00 0%, #4a2c00 50%, #2d1b00 100%)',
    actionUrl: '/vip',
    actionLabel: 'Upgrade',
  },
];

const AUTO_SLIDE_INTERVAL = 5000;

interface LobbyHeroBannerProps {
  slides?: BannerSlide[];
  className?: string;
}

export default function LobbyHeroBanner({
  slides = DEFAULT_SLIDES,
  className = '',
}: LobbyHeroBannerProps) {
  const navigate = useNavigate();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const touchStartRef = useRef<number>(0);

  const goToSlide = useCallback(
    (index: number) => {
      if (isTransitioning) return;
      setIsTransitioning(true);
      setActiveIndex(index);
      setTimeout(() => setIsTransitioning(false), 500);
    },
    [isTransitioning]
  );

  const nextSlide = useCallback(() => {
    goToSlide((activeIndex + 1) % slides.length);
  }, [activeIndex, slides.length, goToSlide]);

  // Auto-rotate
  useEffect(() => {
    intervalRef.current = setInterval(nextSlide, AUTO_SLIDE_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [nextSlide]);

  // Reset interval on manual interaction
  const resetAutoSlide = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(nextSlide, AUTO_SLIDE_INTERVAL);
  };

  // Touch/swipe support
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartRef.current;
    if (Math.abs(dx) > 50) {
      haptic.selection();
      if (dx > 0) {
        goToSlide(activeIndex === 0 ? slides.length - 1 : activeIndex - 1);
      } else {
        goToSlide((activeIndex + 1) % slides.length);
      }
      resetAutoSlide();
    }
  };

  const handleDotClick = (index: number) => {
    haptic.selection();
    goToSlide(index);
    resetAutoSlide();
  };

  const handleAction = (slide: BannerSlide) => {
    haptic.medium();
    if (slide.actionUrl) {
      navigate(slide.actionUrl);
    }
  };

  if (slides.length === 0) return null;

  const currentSlide = slides[activeIndex];

  return (
    <div
      className={`lobby-hero-banner ${className}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Active Slide */}
      <div
        className={`hero-slide ${isTransitioning ? 'transitioning' : ''}`}
        style={{ background: currentSlide.gradient }}
      >
        <div className="hero-content">
          <span className="hero-icon">{currentSlide.icon}</span>
          <div className="hero-text">
            <h3 className="hero-title">{currentSlide.title}</h3>
            <p className="hero-subtitle">{currentSlide.subtitle}</p>
          </div>
          {currentSlide.actionLabel && (
            <button className="hero-action" onClick={() => handleAction(currentSlide)}>
              {currentSlide.actionLabel}
            </button>
          )}
        </div>
      </div>

      {/* Dot Indicators */}
      {slides.length > 1 && (
        <div className="hero-dots">
          {slides.map((_, i) => (
            <button
              key={i}
              className={`hero-dot ${i === activeIndex ? 'active' : ''}`}
              onClick={() => handleDotClick(i)}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

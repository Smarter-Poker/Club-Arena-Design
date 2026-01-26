/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ♠ CLUB ARENA — Intro Video Overlay
 * ═══════════════════════════════════════════════════════════════════════════════
 * Plays a 3-second intro video while the page loads in the background.
 * Video plays at 2x speed to fit within 3 seconds.
 * Auto-dismisses when video ends or after timeout.
 */

import React, { useState, useEffect, useRef } from 'react';
import './IntroVideo.css';

interface IntroVideoProps {
    videoSrc: string;
    duration?: number; // Max duration in ms (default 3000)
    onComplete: () => void;
}

export default function IntroVideo({
    videoSrc,
    duration = 3000,
    onComplete
}: IntroVideoProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [fadeOut, setFadeOut] = useState(false);

    useEffect(() => {
        // Set up timeout as fallback
        const timeout = setTimeout(() => {
            setFadeOut(true);
            setTimeout(onComplete, 500); // Allow fade animation
        }, duration);

        // Try to speed up and play the video
        if (videoRef.current) {
            videoRef.current.playbackRate = 2.0; // 2x speed
            videoRef.current.play().catch(err => {
                console.warn('Video autoplay blocked:', err);
                // If autoplay is blocked, skip intro immediately
                onComplete();
            });
        }

        return () => clearTimeout(timeout);
    }, [duration, onComplete]);

    const handleVideoEnd = () => {
        setFadeOut(true);
        setTimeout(onComplete, 500);
    };

    const handleSkip = () => {
        setFadeOut(true);
        setTimeout(onComplete, 300);
    };

    return (
        <div className={`intro-video-overlay ${fadeOut ? 'fade-out' : ''}`}>
            <video
                ref={videoRef}
                className="intro-video"
                src={videoSrc}
                muted
                playsInline
                onEnded={handleVideoEnd}
            />

            {/* Skip button */}
            <button className="intro-skip-btn" onClick={handleSkip}>
                Skip →
            </button>

            {/* Loading indicator */}
            <div className="intro-loading-hint">
                Loading Club Arena...
            </div>
        </div>
    );
}

/**
 * ♠ CLUB ARENA — PWA Install Prompt
 * Smart add-to-homescreen prompt for mobile users
 */

import React, { useState, useEffect } from 'react';
import './InstallPrompt.css';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const InstallPrompt: React.FC = () => {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [showPrompt, setShowPrompt] = useState(false);
    const [isIOS, setIsIOS] = useState(false);

    useEffect(() => {
        // Check if already installed
        if (window.matchMedia('(display-mode: standalone)').matches) {
            return; // Already installed as PWA
        }

        // Detect iOS
        const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        setIsIOS(isIOSDevice);

        // Check if we've already prompted recently
        const lastPrompt = localStorage.getItem('pwaPromptDismissed');
        if (lastPrompt) {
            const daysSince = (Date.now() - parseInt(lastPrompt)) / (1000 * 60 * 60 * 24);
            if (daysSince < 7) return; // Don't show again for 7 days
        }

        // Listen for beforeinstallprompt event (Android/Desktop Chrome)
        const handleBeforeInstall = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
            // Show prompt after 30 seconds of user engagement
            setTimeout(() => setShowPrompt(true), 30000);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstall);

        // For iOS, show manual instructions after engagement
        if (isIOSDevice) {
            setTimeout(() => setShowPrompt(true), 30000);
        }

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
        };
    }, []);

    const handleInstall = async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                setShowPrompt(false);
            }
            setDeferredPrompt(null);
        }
    };

    const handleDismiss = () => {
        localStorage.setItem('pwaPromptDismissed', Date.now().toString());
        setShowPrompt(false);
    };

    if (!showPrompt) return null;

    return (
        <div className="install-prompt-overlay">
            <div className="install-prompt">
                <button className="prompt-close" onClick={handleDismiss}>✕</button>

                <div className="prompt-icon">♠️</div>
                <h3>Add Club Arena to Home Screen</h3>
                <p>Get instant access with a native app experience!</p>

                {isIOS ? (
                    <div className="ios-instructions">
                        <p>Tap the <span className="share-icon">⬆</span> share button</p>
                        <p>Then tap <strong>"Add to Home Screen"</strong></p>
                    </div>
                ) : (
                    <div className="prompt-actions">
                        <button className="btn-install" onClick={handleInstall}>
                            Install App
                        </button>
                        <button className="btn-later" onClick={handleDismiss}>
                            Maybe Later
                        </button>
                    </div>
                )}

                <div className="prompt-benefits">
                    <span>✓ Instant launch</span>
                    <span>✓ Works offline</span>
                    <span>✓ Push notifications</span>
                </div>
            </div>
        </div>
    );
};

export default InstallPrompt;

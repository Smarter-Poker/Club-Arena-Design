/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  WAITLIST BANNER — Floating Queue Position Indicator (#5, v1.1 Hardened)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Subscribes to WAITLIST_POSITION_CHANGED via masterBus and displays a floating
 * animated banner at the bottom showing "You are #3 in line for High Rollers Table"
 *
 * v1.1: Synchronous masterBus import for deterministic cleanup
 */

import { useState, useEffect } from 'react';
import { masterBus } from '../../core/MasterBus';

interface WaitlistInfo {
    tableId: string;
    position: number;
    tableName: string;
}

export default function WaitlistBanner() {
    const [waitlistInfo, setWaitlistInfo] = useState<WaitlistInfo | null>(null);

    useEffect(() => {
        const unsubscribe = masterBus.subscribe('WAITLIST_POSITION_CHANGED', (event: any) => {
            const { tableId, position, tableName } = event.payload || {};
            if (position && position > 0) {
                setWaitlistInfo({ tableId, position, tableName });
            } else {
                setWaitlistInfo(null);
            }
        });

        return () => { unsubscribe(); };
    }, []);

    if (!waitlistInfo) return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            background: 'linear-gradient(135deg, rgba(0, 20, 40, 0.95) 0%, rgba(10, 30, 60, 0.95) 100%)',
            backdropFilter: 'blur(20px) saturate(1.5)',
            WebkitBackdropFilter: 'blur(20px) saturate(1.5)',
            border: '1px solid rgba(0, 212, 255, 0.3)',
            borderRadius: 14,
            padding: '10px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(0, 212, 255, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
            animation: 'waitlistSlideUp 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            maxWidth: '90vw',
        }}>
            {/* Pulsing dot indicator */}
            <div style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: '#00d4ff',
                boxShadow: '0 0 8px rgba(0, 212, 255, 0.6)',
                animation: 'waitlistPulse 1.5s ease-in-out infinite',
                flexShrink: 0,
            }} />

            <div>
                <div style={{
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    color: '#e0e8f0',
                    lineHeight: 1.3,
                }}>
                    You are <span style={{
                        color: '#00d4ff',
                        fontSize: '0.85rem',
                    }}>#{waitlistInfo.position}</span> in line
                </div>
                <div style={{
                    fontSize: '0.62rem',
                    color: '#6a7a8a',
                    marginTop: 2,
                }}>
                    {waitlistInfo.tableName}
                </div>
            </div>

            {/* Close button */}
            <button
                onClick={() => setWaitlistInfo(null)}
                style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '50%',
                    width: 22,
                    height: 22,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: '#5a6a7a',
                    fontSize: '0.65rem',
                    flexShrink: 0,
                    transition: 'all 0.2s',
                }}
                title="Dismiss"
            >
                ✕
            </button>

            <style>{`
                @keyframes waitlistSlideUp {
                    from { opacity: 0; transform: translateX(-50%) translateY(20px); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
                @keyframes waitlistPulse {
                    0%, 100% { opacity: 0.5; transform: scale(0.8); }
                    50% { opacity: 1; transform: scale(1.2); }
                }
            `}</style>
        </div>
    );
}

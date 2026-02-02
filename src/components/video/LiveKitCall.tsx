/**
 * 📹 LIVEKIT VIDEO CALL COMPONENT
 * Ported from World Hub
 * 
 * A seamless video calling experience using LiveKit.
 * Drop-in replacement for Jitsi with no prejoin screens or lobbies.
 */

import { useEffect, useState, useCallback } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface LiveKitCallProps {
    roomName: string;
    participantName: string;
    participantId?: string;
    callType?: 'video' | 'audio';
    otherUserName?: string;
    onEnd?: () => void;
}

interface TokenResponse {
    token: string;
    wsUrl: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN FETCHER
// ═══════════════════════════════════════════════════════════════════════════

export async function getLiveKitToken(
    roomName: string,
    participantName: string,
    participantId?: string
): Promise<TokenResponse> {
    const response = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName, participantName, participantId }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get video token');
    }

    return response.json();
}

// ═══════════════════════════════════════════════════════════════════════════
// 📹 LIVEKIT CALL COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function LiveKitCall({
    roomName,
    participantName,
    participantId,
    callType = 'video',
    otherUserName,
    onEnd,
}: LiveKitCallProps) {
    const [token, setToken] = useState<string | null>(null);
    const [wsUrl, setWsUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [connecting, setConnecting] = useState(true);

    // Get LiveKit token on mount
    useEffect(() => {
        if (!roomName || !participantName) return;

        getLiveKitToken(roomName, participantName, participantId)
            .then(({ token, wsUrl }) => {
                setToken(token);
                setWsUrl(wsUrl);
                setConnecting(false);
            })
            .catch((err: Error) => {
                console.error('LiveKit token error:', err);
                setError(err.message);
                setConnecting(false);
            });
    }, [roomName, participantName, participantId]);

    const handleDisconnect = useCallback(() => {
        onEnd?.();
    }, [onEnd]);

    // Loading state
    if (connecting) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1,
                background: '#111',
                color: 'white',
                height: '100%',
                minHeight: 400
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>
                        {callType === 'video' ? '📹' : '📞'}
                    </div>
                    <div>Connecting to {otherUserName || 'call'}...</div>
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1,
                background: '#111',
                color: 'white',
                height: '100%',
                minHeight: 400
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
                    <div style={{ marginBottom: 16 }}>{error}</div>
                    <button
                        onClick={onEnd}
                        style={{
                            padding: '10px 20px',
                            background: '#E53935',
                            color: 'white',
                            border: 'none',
                            borderRadius: 8,
                            cursor: 'pointer',
                        }}
                    >
                        Close
                    </button>
                </div>
            </div>
        );
    }

    // No token yet
    if (!token || !wsUrl) {
        return null;
    }

    // Placeholder for LiveKit integration
    // In production, this would use @livekit/components-react
    return (
        <div style={{
            display: 'flex',
            flex: 1,
            flexDirection: 'column',
            background: '#111',
            height: '100%',
            minHeight: 400
        }}>
            {/* Video Grid */}
            <div style={{
                flex: 1,
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
                padding: 8,
                minHeight: 0,
            }}>
                {/* Local Video */}
                <div style={{
                    background: '#222',
                    borderRadius: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white'
                }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 48, marginBottom: 8 }}>👤</div>
                        <div>{participantName}</div>
                    </div>
                </div>

                {/* Remote Video */}
                <div style={{
                    background: '#333',
                    borderRadius: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white'
                }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 48, marginBottom: 8 }}>👤</div>
                        <div>{otherUserName || 'Waiting...'}</div>
                    </div>
                </div>
            </div>

            {/* Control Bar */}
            <div style={{
                padding: '12px 16px',
                background: 'rgba(0,0,0,0.8)',
                display: 'flex',
                justifyContent: 'center',
                gap: 16
            }}>
                {/* Mute Button */}
                <button style={{
                    width: 48, height: 48,
                    borderRadius: '50%',
                    border: 'none',
                    background: '#444',
                    color: 'white',
                    fontSize: 20,
                    cursor: 'pointer'
                }}>
                    🎤
                </button>

                {/* Camera Toggle */}
                {callType === 'video' && (
                    <button style={{
                        width: 48, height: 48,
                        borderRadius: '50%',
                        border: 'none',
                        background: '#444',
                        color: 'white',
                        fontSize: 20,
                        cursor: 'pointer'
                    }}>
                        📹
                    </button>
                )}

                {/* End Call */}
                <button
                    onClick={handleDisconnect}
                    style={{
                        width: 48, height: 48,
                        borderRadius: '50%',
                        border: 'none',
                        background: '#E53935',
                        color: 'white',
                        fontSize: 20,
                        cursor: 'pointer'
                    }}
                >
                    📵
                </button>
            </div>
        </div>
    );
}

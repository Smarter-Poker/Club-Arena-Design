/**
 * ♠ CLUB ARENA — Voice Chat Indicator
 * Shows active voice chat status at the table
 */

import React, { useState, useEffect } from 'react';
import './VoiceChatIndicator.css';

interface VoiceParticipant {
    id: string;
    name: string;
    avatar?: string;
    isSpeaking: boolean;
    isMuted: boolean;
}

interface VoiceChatIndicatorProps {
    tableId: string;
    participants?: VoiceParticipant[];
    isConnected?: boolean;
    onToggleMute?: () => void;
    onLeaveCall?: () => void;
}

export const VoiceChatIndicator: React.FC<VoiceChatIndicatorProps> = ({
    tableId,
    participants = [],
    isConnected = false,
    onToggleMute,
    onLeaveCall,
}) => {
    const [isMuted, setIsMuted] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const activeSpeakers = participants.filter(p => p.isSpeaking);

    const handleToggleMute = () => {
        setIsMuted(!isMuted);
        onToggleMute?.();
    };

    if (!isConnected && participants.length === 0) {
        return (
            <button className="voice-join-btn">
                <span className="icon">🎙️</span>
                <span>Join Voice</span>
            </button>
        );
    }

    return (
        <div className={`voice-indicator ${isExpanded ? 'expanded' : ''}`}>
            <button
                className="voice-toggle"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="voice-status">
                    {isConnected ? (
                        <span className="connected-icon">🎙️</span>
                    ) : (
                        <span className="disconnected-icon">🔇</span>
                    )}
                    <span className="participant-count">{participants.length}</span>
                </div>

                {/* Speaking indicators */}
                <div className="speaking-avatars">
                    {activeSpeakers.slice(0, 3).map((speaker) => (
                        <div key={speaker.id} className="speaking-avatar">
                            {speaker.avatar ? (
                                <img src={speaker.avatar} alt={speaker.name} />
                            ) : (
                                <span>{speaker.name[0]}</span>
                            )}
                            <div className="speaking-ring" />
                        </div>
                    ))}
                </div>
            </button>

            {/* Expanded Panel */}
            {isExpanded && (
                <div className="voice-panel">
                    <div className="voice-header">
                        <span>Voice Chat</span>
                        <span className="voice-quality">●</span>
                    </div>

                    <div className="voice-participants">
                        {participants.map((p) => (
                            <div key={p.id} className={`voice-participant ${p.isSpeaking ? 'speaking' : ''}`}>
                                <div className="participant-avatar">
                                    {p.avatar ? (
                                        <img src={p.avatar} alt={p.name} />
                                    ) : (
                                        <span>{p.name[0]}</span>
                                    )}
                                    {p.isSpeaking && <div className="speaking-indicator" />}
                                </div>
                                <span className="participant-name">{p.name}</span>
                                {p.isMuted && <span className="muted-icon">🔇</span>}
                            </div>
                        ))}
                    </div>

                    <div className="voice-controls">
                        <button
                            className={`control-btn mute ${isMuted ? 'active' : ''}`}
                            onClick={handleToggleMute}
                        >
                            {isMuted ? '🔇' : '🎙️'}
                        </button>
                        <button
                            className="control-btn leave"
                            onClick={onLeaveCall}
                        >
                            📞 Leave
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VoiceChatIndicator;

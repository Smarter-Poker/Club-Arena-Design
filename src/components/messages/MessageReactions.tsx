/**
 * ♠ CLUB ARENA — Message Reactions
 * Emoji reactions for chat messages
 */

import React, { useState } from 'react';
import './MessageReactions.css';

interface Reaction {
    emoji: string;
    count: number;
    users: string[];
    hasReacted: boolean;
}

interface MessageReactionsProps {
    messageId: string;
    reactions: Reaction[];
    onReact: (messageId: string, emoji: string) => void;
    onRemoveReaction: (messageId: string, emoji: string) => void;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '💯'];

export const MessageReactions: React.FC<MessageReactionsProps> = ({
    messageId,
    reactions,
    onReact,
    onRemoveReaction,
}) => {
    const [showPicker, setShowPicker] = useState(false);

    const handleReactionClick = (emoji: string, hasReacted: boolean) => {
        if (hasReacted) {
            onRemoveReaction(messageId, emoji);
        } else {
            onReact(messageId, emoji);
        }
    };

    const handleQuickReaction = (emoji: string) => {
        const existing = reactions.find(r => r.emoji === emoji);
        if (existing?.hasReacted) {
            onRemoveReaction(messageId, emoji);
        } else {
            onReact(messageId, emoji);
        }
        setShowPicker(false);
    };

    return (
        <div className="message-reactions">
            {/* Existing Reactions */}
            {reactions.length > 0 && (
                <div className="reactions-list">
                    {reactions.map((reaction) => (
                        <button
                            key={reaction.emoji}
                            className={`reaction-chip ${reaction.hasReacted ? 'reacted' : ''}`}
                            onClick={() => handleReactionClick(reaction.emoji, reaction.hasReacted)}
                            title={reaction.users.slice(0, 3).join(', ') + (reaction.users.length > 3 ? ` +${reaction.users.length - 3} more` : '')}
                        >
                            <span className="reaction-emoji">{reaction.emoji}</span>
                            <span className="reaction-count">{reaction.count}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Add Reaction Button */}
            <div className="add-reaction-wrapper">
                <button
                    className="add-reaction-btn"
                    onClick={() => setShowPicker(!showPicker)}
                >
                    😀+
                </button>

                {/* Quick Picker */}
                {showPicker && (
                    <div className="reaction-picker">
                        {QUICK_REACTIONS.map(emoji => {
                            const existing = reactions.find(r => r.emoji === emoji);
                            return (
                                <button
                                    key={emoji}
                                    className={`picker-emoji ${existing?.hasReacted ? 'selected' : ''}`}
                                    onClick={() => handleQuickReaction(emoji)}
                                >
                                    {emoji}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

// Inline reactions for compact display
export const InlineReactions: React.FC<{
    reactions: Reaction[];
    maxShow?: number;
}> = ({ reactions, maxShow = 3 }) => {
    const displayReactions = reactions.slice(0, maxShow);
    const totalCount = reactions.reduce((sum, r) => sum + r.count, 0);
    const overflowTypes = reactions.length - maxShow;

    if (reactions.length === 0) return null;

    return (
        <div className="inline-reactions">
            <div className="inline-emojis">
                {displayReactions.map(r => (
                    <span key={r.emoji} className="inline-emoji">{r.emoji}</span>
                ))}
            </div>
            <span className="inline-count">{totalCount}</span>
            {overflowTypes > 0 && (
                <span className="inline-more">+{overflowTypes}</span>
            )}
        </div>
    );
};

export default MessageReactions;

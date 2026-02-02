/**
 * 💬 FACEBOOK-STYLE MESSENGER
 * Ported from World Hub Social System
 * 
 * Features:
 * - Chat window with voice/video call buttons
 * - Conversation list
 * - Chat dock (floating chats)
 * - Full social messaging experience
 */

import React, { useState, useRef, useEffect } from 'react';
import { FBAvatar, FB_COLORS, MessageBubble } from './FacebookStyleCard';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface Message {
    id?: string;
    text: string;
    time?: string;
    senderId: string;
    reactions?: { emoji: string }[];
}

interface Participant {
    id: string;
    name: string;
    avatar?: string;
    online?: boolean;
}

interface Conversation {
    id: string;
    participants?: Participant[];
    lastMessage?: {
        text: string;
        time?: string;
        isOwn?: boolean;
    };
    unread?: boolean;
    unreadCount?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// 💬 CHAT WINDOW
// ═══════════════════════════════════════════════════════════════════════════

interface ChatWindowProps {
    conversation: Conversation;
    messages?: Message[];
    currentUser?: { id: string };
    onSend?: (text: string) => void;
    onClose?: () => void;
    onMinimize?: () => void;
    onVoiceCall?: () => void;
    onVideoCall?: () => void;
    minimized?: boolean;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
    conversation,
    messages = [],
    currentUser,
    onSend,
    onClose,
    onMinimize,
    onVoiceCall,
    onVideoCall,
    minimized = false
}) => {
    const [inputText, setInputText] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = () => {
        if (inputText.trim()) {
            onSend?.(inputText);
            setInputText('');
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const otherUser = conversation?.participants?.find(p => p.id !== currentUser?.id);

    if (minimized) {
        return (
            <div
                onClick={onMinimize}
                style={{ position: 'relative', cursor: 'pointer' }}
            >
                <FBAvatar src={otherUser?.avatar} size={48} online={otherUser?.online} />
                {conversation?.unreadCount && conversation.unreadCount > 0 && (
                    <span style={{
                        position: 'absolute',
                        top: -4,
                        right: -4,
                        minWidth: 18,
                        height: 18,
                        background: '#E41E3F',
                        color: 'white',
                        fontSize: 11,
                        fontWeight: 700,
                        borderRadius: 9,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        {conversation.unreadCount}
                    </span>
                )}
            </div>
        );
    }

    return (
        <div style={{
            width: 328,
            height: 455,
            background: FB_COLORS.bgWhite,
            borderRadius: '8px 8px 0 0',
            boxShadow: '0 0 8px rgba(0,0,0,0.15)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: 8,
                background: FB_COLORS.bgWhite,
                borderBottom: `1px solid ${FB_COLORS.divider}`,
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
            }}>
                <FBAvatar src={otherUser?.avatar} size={32} online={otherUser?.online} />
                <div style={{ flex: 1 }}>
                    <span style={{
                        display: 'block',
                        fontWeight: 600,
                        fontSize: 13,
                        color: FB_COLORS.textPrimary
                    }}>
                        {otherUser?.name}
                    </span>
                    <span style={{
                        fontSize: 11,
                        color: FB_COLORS.textSecondary
                    }}>
                        {otherUser?.online ? 'Active now' : 'Active 2h ago'}
                    </span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                    {/* 📞 Voice Call Button */}
                    <button
                        onClick={onVoiceCall}
                        style={{
                            width: 28, height: 28, border: 'none',
                            background: 'transparent', borderRadius: '50%',
                            cursor: 'pointer', fontSize: 14
                        }}
                        title="Start a call"
                    >
                        📞
                    </button>
                    {/* 📹 Video Call Button */}
                    <button
                        onClick={onVideoCall}
                        style={{
                            width: 28, height: 28, border: 'none',
                            background: 'transparent', borderRadius: '50%',
                            cursor: 'pointer', fontSize: 14
                        }}
                        title="Start a video call"
                    >
                        📹
                    </button>
                    <button
                        onClick={onMinimize}
                        style={{
                            width: 28, height: 28, border: 'none',
                            background: 'transparent', borderRadius: '50%',
                            cursor: 'pointer', fontSize: 14
                        }}
                    >
                        −
                    </button>
                    <button
                        onClick={onClose}
                        style={{
                            width: 28, height: 28, border: 'none',
                            background: 'transparent', borderRadius: '50%',
                            cursor: 'pointer', fontSize: 14
                        }}
                    >
                        ✕
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
                {messages.map((msg, i) => {
                    const isOwn = msg.senderId === currentUser?.id;
                    const prevMsg = messages[i - 1];
                    const showAvatar = !isOwn && (!prevMsg || prevMsg.senderId !== msg.senderId);

                    return (
                        <MessageBubble
                            key={msg.id || i}
                            message={msg}
                            isOwn={isOwn}
                            showAvatar={showAvatar}
                            user={otherUser}
                        />
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: 8,
                borderTop: `1px solid ${FB_COLORS.divider}`
            }}>
                <button style={{
                    width: 28, height: 28, border: 'none',
                    background: 'transparent', borderRadius: '50%',
                    cursor: 'pointer', fontSize: 16, color: FB_COLORS.blue
                }}>
                    ➕
                </button>
                <button style={{
                    width: 28, height: 28, border: 'none',
                    background: 'transparent', borderRadius: '50%',
                    cursor: 'pointer', fontSize: 16, color: FB_COLORS.blue
                }}>
                    📷
                </button>
                <button style={{
                    width: 28, height: 28, border: 'none',
                    background: 'transparent', borderRadius: '50%',
                    cursor: 'pointer', fontSize: 16, color: FB_COLORS.blue
                }}>
                    🎁
                </button>
                <button style={{
                    width: 28, height: 28, border: 'none',
                    background: 'transparent', borderRadius: '50%',
                    cursor: 'pointer', fontSize: 16, color: FB_COLORS.blue
                }}>
                    🎵
                </button>

                <div style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    background: FB_COLORS.bgMain,
                    borderRadius: 20,
                    padding: '0 8px'
                }}>
                    <input
                        type="text"
                        placeholder="Aa"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyPress={handleKeyPress}
                        style={{
                            flex: 1,
                            border: 'none',
                            background: 'transparent',
                            padding: 8,
                            fontSize: 14,
                            outline: 'none'
                        }}
                    />
                    <button style={{
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        fontSize: 16
                    }}>
                        😊
                    </button>
                </div>

                <button
                    onClick={handleSend}
                    disabled={!inputText.trim()}
                    style={{
                        width: 32, height: 32, border: 'none',
                        background: 'transparent', borderRadius: '50%',
                        cursor: 'pointer', fontSize: 18,
                        color: FB_COLORS.blue,
                        opacity: inputText.trim() ? 1 : 0.5
                    }}
                >
                    {inputText.trim() ? '➤' : '👍'}
                </button>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// 📋 CONVERSATION LIST
// ═══════════════════════════════════════════════════════════════════════════

interface ConversationListProps {
    conversations?: Conversation[];
    currentUser?: { id: string };
    onSelectConversation?: (conv: Conversation) => void;
    onNewMessage?: () => void;
}

export const ConversationList: React.FC<ConversationListProps> = ({
    conversations = [],
    currentUser,
    onSelectConversation,
    onNewMessage
}) => {
    const [searchQuery, setSearchQuery] = useState('');

    const filteredConversations = conversations.filter(conv => {
        const otherUser = conv.participants?.find(p => p.id !== currentUser?.id);
        return otherUser?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    });

    return (
        <div style={{
            width: 360,
            maxHeight: 500,
            background: FB_COLORS.bgWhite,
            borderRadius: 8,
            boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
            display: 'flex',
            flexDirection: 'column'
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px'
            }}>
                <h2 style={{
                    fontSize: 24,
                    fontWeight: 700,
                    color: FB_COLORS.textPrimary,
                    margin: 0
                }}>
                    Chats
                </h2>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button style={{
                        width: 36, height: 36, border: 'none',
                        background: FB_COLORS.bgMain, borderRadius: '50%',
                        cursor: 'pointer', fontSize: 16
                    }} title="Options">
                        ⋯
                    </button>
                    <button style={{
                        width: 36, height: 36, border: 'none',
                        background: FB_COLORS.bgMain, borderRadius: '50%',
                        cursor: 'pointer', fontSize: 16
                    }} title="See all in Messenger">
                        ↗️
                    </button>
                    <button
                        onClick={onNewMessage}
                        style={{
                            width: 36, height: 36, border: 'none',
                            background: FB_COLORS.bgMain, borderRadius: '50%',
                            cursor: 'pointer', fontSize: 16
                        }}
                        title="New message"
                    >
                        ✏️
                    </button>
                </div>
            </div>

            {/* Search */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                margin: '0 16px 8px',
                padding: '8px 12px',
                background: FB_COLORS.bgMain,
                borderRadius: 20
            }}>
                <span style={{ color: FB_COLORS.textSecondary }}>🔍</span>
                <input
                    type="text"
                    placeholder="Search Messenger"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                        flex: 1,
                        border: 'none',
                        background: 'transparent',
                        fontSize: 15,
                        marginLeft: 8,
                        outline: 'none'
                    }}
                />
            </div>

            {/* Conversation Items */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {filteredConversations.map((conv, i) => {
                    const otherUser = conv.participants?.find(p => p.id !== currentUser?.id);
                    const lastMessage = conv.lastMessage;

                    return (
                        <div
                            key={conv.id || i}
                            onClick={() => onSelectConversation?.(conv)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '8px 16px',
                                cursor: 'pointer'
                            }}
                        >
                            <FBAvatar
                                src={otherUser?.avatar}
                                size={56}
                                online={otherUser?.online}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <span style={{
                                    display: 'block',
                                    fontWeight: conv.unread ? 600 : 500,
                                    fontSize: 15,
                                    color: FB_COLORS.textPrimary
                                }}>
                                    {otherUser?.name}
                                </span>
                                <span style={{
                                    fontSize: 13,
                                    color: conv.unread ? FB_COLORS.textPrimary : FB_COLORS.textSecondary,
                                    fontWeight: conv.unread ? 500 : 400,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                }}>
                                    {lastMessage?.isOwn && 'You: '}
                                    {lastMessage?.text?.slice(0, 30)}
                                    {(lastMessage?.text?.length || 0) > 30 && '...'}
                                    <span style={{ color: FB_COLORS.textSecondary }}> · {lastMessage?.time}</span>
                                </span>
                            </div>
                            {conv.unread && (
                                <div style={{
                                    width: 12,
                                    height: 12,
                                    background: FB_COLORS.blue,
                                    borderRadius: '50%'
                                }} />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Footer */}
            <div style={{
                padding: 12,
                textAlign: 'center',
                borderTop: `1px solid ${FB_COLORS.divider}`
            }}>
                <a
                    href="/messages"
                    style={{
                        color: FB_COLORS.blue,
                        fontSize: 15,
                        fontWeight: 500,
                        textDecoration: 'none'
                    }}
                >
                    See all in Messenger
                </a>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// 💬 CHAT DOCK (Bottom right floating chats)
// ═══════════════════════════════════════════════════════════════════════════

interface OpenChat {
    conversation: Conversation;
    messages: Message[];
    minimized: boolean;
}

interface ChatDockProps {
    openChats?: OpenChat[];
    currentUser?: { id: string };
    onClose?: (conversationId: string) => void;
    onMinimize?: (conversationId: string) => void;
    onSend?: (conversationId: string, text: string) => void;
    onVoiceCall?: (conversationId: string) => void;
    onVideoCall?: (conversationId: string) => void;
}

export const ChatDock: React.FC<ChatDockProps> = ({
    openChats = [],
    currentUser,
    onClose,
    onMinimize,
    onSend,
    onVoiceCall,
    onVideoCall
}) => {
    return (
        <div style={{
            position: 'fixed',
            bottom: 0,
            right: 80,
            display: 'flex',
            gap: 8,
            alignItems: 'flex-end',
            zIndex: 1000
        }}>
            {openChats.map((chat, i) => (
                <ChatWindow
                    key={chat.conversation.id || i}
                    conversation={chat.conversation}
                    messages={chat.messages}
                    currentUser={currentUser}
                    minimized={chat.minimized}
                    onClose={() => onClose?.(chat.conversation.id)}
                    onMinimize={() => onMinimize?.(chat.conversation.id)}
                    onSend={(text) => onSend?.(chat.conversation.id, text)}
                    onVoiceCall={() => onVoiceCall?.(chat.conversation.id)}
                    onVideoCall={() => onVideoCall?.(chat.conversation.id)}
                />
            ))}
        </div>
    );
};

export default {
    ChatWindow,
    ConversationList,
    ChatDock
};

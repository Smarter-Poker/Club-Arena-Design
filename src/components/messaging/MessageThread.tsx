/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  MESSAGE THREAD — Real-time Chat View (SNGINE-inspired)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Features: Chat bubbles, typing indicator, seen status, reactions, infinite scroll
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase'
import { masterBus } from '../../core/MasterBus';;
import { useUserStore } from '../../stores/useUserStore';
import ChatBubble from './ChatBubble';
import MessageInput from './MessageInput';
import styles from './MessageThread.module.css';

interface Message {
    id: string;
    conversationId: string;
    userId: string;
    userFullname: string;
    userPicture: string;
    content: string;
    imageUrl?: string;
    createdAt: string;
    isSeen: boolean;
    reactions: { [emoji: string]: number };
    myReaction?: string;
}

interface Participant {
    userId: string;
    username: string;
    avatar: string;
    isOnline: boolean;
    isTyping: boolean;
}

interface MessageThreadProps {
    conversationId: string;
    onBack?: () => void;
}

export default function MessageThread({ conversationId, onBack }: MessageThreadProps) {
    const { user } = useUserStore();
    const [messages, setMessages] = useState<Message[]>([]);
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [typingUsers, setTypingUsers] = useState<string[]>([]);
    const [seenBy, setSeenBy] = useState<string[]>([]);
    const [visibleMessages, setVisibleMessages] = useState<Set<number>>(new Set());
    const scrollRef = useRef<HTMLDivElement>(null);
    const heartbeatRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Load conversation details
    const loadConversation = useCallback(async () => {
        if (!conversationId || !user?.id) return;

        try {
            // Load participants
            const { data: participantData } = await supabase
                .from('conversation_participants')
                .select(`
                    user_id,
                    is_typing,
                    last_seen_message_id,
                    profiles(id, username, avatar_url, is_online)
                `)
                .eq('conversation_id', conversationId);

            if (participantData) {
                setParticipants(participantData.map((p: any) => ({
                    userId: p.user_id,
                    username: p.profiles?.username || 'Unknown',
                    avatar: p.profiles?.avatar_url || '/default-avatar.png',
                    isOnline: p.profiles?.is_online || false,
                    isTyping: p.is_typing || false
                })));

                // Get typing users
                const typing = participantData
                    .filter((p: any) => p.is_typing && p.user_id !== user.id)
                    .map((p: any) => p.profiles?.username || 'Someone');
                setTypingUsers(typing);
            }
        } catch (error) {
            console.error('Failed to load conversation:', error);
        }
    }, [conversationId, user?.id]);

    // Load messages
    const loadMessages = useCallback(async (replace = false) => {
        if (!conversationId) return;

        try {
            const { data, error } = await supabase
                .from('messages')
                .select(`
                    id,
                    conversation_id,
                    user_id,
                    content,
                    image_url,
                    created_at,
                    is_seen,
                    profiles(id, username, avatar_url)
                `)
                .eq('conversation_id', conversationId)
                .order('created_at', { ascending: false })
                .range(offset, offset + 29);

            if (!error && data) {
                const mapped: Message[] = data.map((m: any) => ({
                    id: m.id,
                    conversationId: m.conversation_id,
                    userId: m.user_id,
                    userFullname: m.profiles?.username || 'Unknown',
                    userPicture: m.profiles?.avatar_url || '/default-avatar.png',
                    content: m.content,
                    imageUrl: m.image_url,
                    createdAt: m.created_at,
                    isSeen: m.is_seen,
                    reactions: {},
                    myReaction: undefined
                })).reverse();

                if (replace) {
                    setMessages(mapped);
                } else {
                    setMessages(prev => [...mapped, ...prev]);
                }
                setHasMore(data.length === 30);
            }
        } catch (error) {
            console.error('Failed to load messages:', error);
        }
        setLoading(false);
    }, [conversationId, offset]);

    // Send message
    const sendMessage = async (text: string, imageUrl?: string) => {
        if (!text.trim() && !imageUrl) return;
        if (!user?.id || !conversationId) return;

        setSending(true);
        try {
            const { data, error } = await supabase
                .from('messages')
                .insert({
                    conversation_id: conversationId,
                    user_id: user.id,
                    content: text.trim(),
                    image_url: imageUrl || null
                })
                .select()
                .single();

            if (!error && data) {
                // Add to local state immediately
                const newMessage: Message = {
                    id: data.id,
                    conversationId: data.conversation_id,
                    userId: data.user_id,
                    userFullname: user.username || 'You',
                    userPicture: user.avatar_url || '/default-avatar.png',
                    content: data.content,
                    imageUrl: data.image_url,
                    createdAt: data.created_at,
                    isSeen: false,
                    reactions: {},
                    myReaction: undefined
                };
                setMessages(prev => [...prev, newMessage]);

                // Scroll to bottom
                setTimeout(() => {
                    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
                }, 100);

                // Update conversation's last_message
                await supabase
                    .from('conversations')
                    .update({
                        last_message: text.trim().substring(0, 100),
                        last_message_time: new Date().toISOString(),
                        last_message_user_id: user.id
                    })
                    .eq('id', conversationId);
            }
        } catch (error) {
            console.error('Failed to send message:', error);
        }
        setSending(false);
    };

    // Set typing status
    const setTyping = async (isTyping: boolean) => {
        if (!user?.id || !conversationId) return;
        await supabase
            .from('conversation_participants')
            .update({ is_typing: isTyping })
            .eq('conversation_id', conversationId)
            .eq('user_id', user.id);
    };

    // React to message
    const reactToMessage = async (messageId: string, emoji: string) => {
        if (!user?.id) return;

        try {
            // Toggle reaction
            const { data: existing } = await supabase
                .from('message_reactions')
                .select('id, reaction')
                .eq('message_id', messageId)
                .eq('user_id', user.id)
                .single();

            if (existing) {
                if (existing.reaction === emoji) {
                    // Remove reaction
                    await supabase.from('message_reactions').delete().eq('id', existing.id);
                } else {
                    // Change reaction
                    await supabase.from('message_reactions').update({ reaction: emoji }).eq('id', existing.id);
                }
            } else {
                // Add reaction
                await supabase.from('message_reactions').insert({
                    message_id: messageId,
                    user_id: user.id,
                    reaction: emoji
                });
            }

            // Refresh messages
            loadMessages(true);
        } catch (error) {
            console.error('Failed to react:', error);
        }
    };

    // Delete message
    const deleteMessage = async (messageId: string) => {
        try {
            await supabase.from('messages').delete().eq('id', messageId).eq('user_id', user?.id);
            setMessages(prev => prev.filter(m => m.id !== messageId));
        } catch (error) {
            console.error('Failed to delete:', error);
        }
    };

    // Heartbeat
    useEffect(() => {
        loadConversation();
        loadMessages(true);

        heartbeatRef.current = setInterval(() => {
            loadConversation();
        }, 5000);

        // Real-time subscription
        const channelKey = `messages-${conversationId}`;

        const channel = masterBus.getOrCreateChannel(channelKey);
            channel
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `conversation_id=eq.${conversationId}`
            }, (payload) => {
                // Only add if not from current user (they already have it)
                if (payload.new && (payload.new as any).user_id !== user?.id) {
                    loadMessages(true);
                }
            })
            .subscribe();

        return () => {
            if (heartbeatRef.current) clearInterval(heartbeatRef.current);
            masterBus.removeRegisteredChannel(channelKey);
        };
    }, [conversationId, loadConversation, loadMessages, user?.id]);

    // Auto-scroll on new messages
    useEffect(() => {
        if (messages.length > 0) {
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
            // Stagger message entrance
            setVisibleMessages(new Set());
            messages.forEach((_, i) => {
                setTimeout(() => setVisibleMessages(prev => new Set(prev).add(i)), i * 30);
            });
        }
    }, [messages.length]);

    const otherParticipant = participants.find(p => p.userId !== user?.id);

    return (
        <div className={styles.container}>
            {/* Header */}
            <div className={styles.header}>
                {onBack && (
                    <button className={styles.backBtn} onClick={onBack}>←</button>
                )}
                {otherParticipant && (
                    <div className={styles.headerUser}>
                        <img src={otherParticipant.avatar} alt="" className={styles.headerAvatar} />
                        <div className={styles.headerInfo}>
                            <span className={styles.headerName}>{otherParticipant.username}</span>
                            <span className={styles.headerStatus}>
                                {typingUsers.length > 0 ? (
                                    <span className={styles.typing}>typing...</span>
                                ) : otherParticipant.isOnline ? (
                                    <span className={styles.online}>Online</span>
                                ) : (
                                    'Offline'
                                )}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Messages */}
            <div className={styles.messages} ref={scrollRef}>
                {loading ? (
                    <div className={styles.loading}>
                        <div className={styles.spinner} />
                    </div>
                ) : messages.length === 0 ? (
                    <div className={styles.empty}>
                        <span className={styles.emptyIcon}></span>
                        <p>Start the conversation!</p>
                    </div>
                ) : (
                    messages.map((message, idx) => (
                        <div key={message.id} style={{
                            opacity: visibleMessages.has(idx) ? 1 : 0,
                            transform: visibleMessages.has(idx) ? 'translateY(0)' : 'translateY(8px)',
                            transition: 'all 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                        }}>
                            <ChatBubble
                                message={message}
                                isCurrentUser={message.userId === user?.id}
                                onReact={reactToMessage}
                                onDelete={deleteMessage}
                            />
                        </div>
                    ))
                )}

                {/* Typing Indicator */}
                {typingUsers.length > 0 && (
                    <div className={styles.typingIndicator}>
                        <div className={styles.typingDots}>
                            <span /><span /><span />
                        </div>
                        <span className={styles.typingText}>{typingUsers.join(', ')} typing...</span>
                    </div>
                )}

                {/* Seen Status */}
                {seenBy.length > 0 && (
                    <div className={styles.seenStatus}>
                         Seen by {seenBy.join(', ')}
                    </div>
                )}
            </div>

            {/* Input */}
            <MessageInput
                onSend={sendMessage}
                onTyping={setTyping}
                disabled={sending}
            />
        </div>
    );
}

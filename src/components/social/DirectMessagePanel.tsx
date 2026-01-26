/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  DIRECT MESSAGE PANEL — One-on-One Chat
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../stores/useUserStore';
import { useToast } from '../common/Toast';
import './DirectMessagePanel.css';

interface DirectMessagePanelProps {
    recipientId: string;
    recipientName: string;
    recipientAvatar?: string;
    isOpen: boolean;
    onClose: () => void;
}

interface Message {
    id: string;
    senderId: string;
    content: string;
    createdAt: Date;
    isRead: boolean;
}

export function DirectMessagePanel({
    recipientId,
    recipientName,
    recipientAvatar = '',
    isOpen,
    onClose
}: DirectMessagePanelProps) {
    const { user } = useUserStore();
    const toast = useToast();
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);

    useEffect(() => {
        if (isOpen && user?.id) {
            loadMessages();
            markAsRead();

            // Subscribe to new messages
            const channel = supabase
                .channel(`dm-${user.id}-${recipientId}`)
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'direct_messages',
                    filter: `or(and(sender_id.eq.${user.id},recipient_id.eq.${recipientId}),and(sender_id.eq.${recipientId},recipient_id.eq.${user.id}))`
                }, (payload) => {
                    const msg = payload.new as any;
                    setMessages(prev => [...prev, {
                        id: msg.id,
                        senderId: msg.sender_id,
                        content: msg.content,
                        createdAt: new Date(msg.created_at),
                        isRead: msg.is_read
                    }]);
                })
                .subscribe();

            return () => { supabase.removeChannel(channel); };
        }
    }, [isOpen, user?.id, recipientId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const loadMessages = async () => {
        if (!user?.id) return;
        setLoading(true);

        try {
            const { data, error } = await supabase
                .from('direct_messages')
                .select('*')
                .or(`and(sender_id.eq.${user.id},recipient_id.eq.${recipientId}),and(sender_id.eq.${recipientId},recipient_id.eq.${user.id})`)
                .order('created_at', { ascending: true })
                .limit(100);

            if (!error && data) {
                setMessages(data.map(m => ({
                    id: m.id,
                    senderId: m.sender_id,
                    content: m.content,
                    createdAt: new Date(m.created_at),
                    isRead: m.is_read
                })));
            }
        } catch (error) {
            toast.error('Failed to load messages');
        }
        setLoading(false);
    };

    const markAsRead = async () => {
        if (!user?.id) return;

        await supabase
            .from('direct_messages')
            .update({ is_read: true })
            .eq('recipient_id', user.id)
            .eq('sender_id', recipientId)
            .eq('is_read', false);
    };

    const sendMessage = async () => {
        if (!user?.id || !newMessage.trim()) return;

        setSending(true);
        try {
            const { error } = await supabase
                .from('direct_messages')
                .insert({
                    sender_id: user.id,
                    recipient_id: recipientId,
                    content: newMessage.trim()
                });

            if (error) throw error;
            setNewMessage('');
        } catch (error) {
            toast.error('Failed to send message');
        }
        setSending(false);
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="dm-panel">
            <div className="dm-panel__header">
                <span className="dm-panel__avatar">{recipientAvatar}</span>
                <span className="dm-panel__name">{recipientName}</span>
                <button className="dm-panel__close" onClick={onClose}>×</button>
            </div>

            <div className="dm-panel__messages">
                {loading ? (
                    <div className="loading-state">Loading...</div>
                ) : messages.length === 0 ? (
                    <div className="empty-state">No messages yet. Say hi!</div>
                ) : (
                    messages.map(msg => (
                        <div
                            key={msg.id}
                            className={`message ${msg.senderId === user?.id ? 'sent' : 'received'}`}
                        >
                            <p>{msg.content}</p>
                            <span className="timestamp">
                                {msg.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="dm-panel__input">
                <textarea
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Type a message..."
                    disabled={sending}
                />
                <button
                    onClick={sendMessage}
                    disabled={sending || !newMessage.trim()}
                >
                    {sending ? '...' : '→'}
                </button>
            </div>
        </div>
    );
}

export default DirectMessagePanel;

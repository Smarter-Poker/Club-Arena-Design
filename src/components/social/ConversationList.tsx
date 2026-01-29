/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CONVERSATION LIST — Message Inbox
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../stores/useUserStore';
import { useToast } from '../common/Toast';
import './ConversationList.css';

interface ConversationListProps {
    onSelectConversation: (userId: string, username: string, avatarUrl: string) => void;
}

interface Conversation {
    partnerId: string;
    partnerName: string;
    partnerAvatar: string;
    lastMessage: string;
    lastMessageAt: Date;
    unreadCount: number;
}

export function ConversationList({ onSelectConversation }: ConversationListProps) {
    const { user } = useUserStore();
    const toast = useToast();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user?.id) {
            loadConversations();
        }
    }, [user?.id]);

    const loadConversations = async () => {
        if (!user?.id) return;
        setLoading(true);

        try {
            const { data, error } = await supabase
                .rpc('fn_get_conversations', { p_user_id: user.id });

            if (!error && data) {
                setConversations(data.map((c: any) => ({
                    partnerId: c.partner_id,
                    partnerName: c.partner_name,
                    partnerAvatar: c.partner_avatar || '',
                    lastMessage: c.last_message,
                    lastMessageAt: new Date(c.last_message_at),
                    unreadCount: c.unread_count || 0
                })));
            }
        } catch (error) {
            toast.error('Failed to load conversations');
        }
        setLoading(false);
    };

    const formatTime = (date: Date) => {
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));

        if (hours < 1) return 'Just now';
        if (hours < 24) return `${hours}h ago`;
        if (hours < 48) return 'Yesterday';
        return date.toLocaleDateString();
    };

    if (loading) {
        return <div className="conversation-list loading">Loading...</div>;
    }

    return (
        <div className="conversation-list">
            <div className="conversation-list__header">
                <h3> Messages</h3>
            </div>

            {conversations.length === 0 ? (
                <div className="empty-state">No conversations yet</div>
            ) : (
                <div className="conversations">
                    {conversations.map(conv => (
                        <div
                            key={conv.partnerId}
                            className={`conversation-item ${conv.unreadCount > 0 ? 'unread' : ''}`}
                            onClick={() => onSelectConversation(conv.partnerId, conv.partnerName, conv.partnerAvatar)}
                        >
                            <span className="avatar">{conv.partnerAvatar}</span>
                            <div className="info">
                                <span className="name">{conv.partnerName}</span>
                                <span className="preview">{conv.lastMessage}</span>
                            </div>
                            <div className="meta">
                                <span className="time">{formatTime(conv.lastMessageAt)}</span>
                                {conv.unreadCount > 0 && (
                                    <span className="badge">{conv.unreadCount}</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default ConversationList;

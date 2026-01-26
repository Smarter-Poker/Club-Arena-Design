/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  MESSAGING SERVICE — Direct Messages
 * User-to-user messaging with real-time updates
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { supabase } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { clubMessagingPermissions } from './ClubMessagingPermissions';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface Message {
    id: string;
    conversationId: string;
    senderId: string;
    senderName?: string;
    senderAvatar?: string;
    content: string;
    isRead: boolean;
    createdAt: string;
}

export interface Conversation {
    id: string;
    participantIds: string[];
    participants: {
        id: string;
        displayName: string;
        avatarUrl?: string;
        isOnline: boolean;
    }[];
    lastMessage?: Message;
    unreadCount: number;
    updatedAt: string;
}

interface MessageCallbacks {
    onNewMessage?: (message: Message) => void;
    onMessageRead?: (messageId: string) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class MessagingServiceClass {
    private channel: RealtimeChannel | null = null;
    private currentUserId: string | null = null;

    /**
     * Subscribe to real-time messages
     */
    async subscribe(userId: string, callbacks: MessageCallbacks): Promise<void> {
        if (this.channel) {
            await this.unsubscribe();
        }

        this.currentUserId = userId;

        this.channel = supabase
            .channel(`messages:${userId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `receiver_id=eq.${userId}`
                },
                async (payload) => {
                    if (callbacks.onNewMessage && payload.new) {
                        const message = await this.mapMessage(payload.new as Record<string, unknown>);
                        callbacks.onNewMessage(message);
                    }
                }
            )
            .subscribe();

    }

    /**
     * Unsubscribe from messages
     */
    async unsubscribe(): Promise<void> {
        if (this.channel) {
            await supabase.removeChannel(this.channel);
            this.channel = null;
        }
    }

    /**
     * Get all conversations for a user
     */
    async getConversations(userId: string): Promise<Conversation[]> {
        const { data, error } = await supabase
            .from('conversations')
            .select(`
                *,
                messages(*)
            `)
            .contains('participant_ids', [userId])
            .order('updated_at', { ascending: false });

        if (error) {
            console.error('[Messaging] Failed to get conversations:', error);
            return [];
        }

        const conversations: Conversation[] = [];

        for (const conv of data || []) {
            // Get participant profiles
            const participantIds = conv.participant_ids as string[];
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, display_name, avatar_url, is_online')
                .in('id', participantIds);

            // Get unread count
            const { count } = await supabase
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('conversation_id', conv.id)
                .eq('receiver_id', userId)
                .eq('is_read', false);

            // Get last message
            const messages = conv.messages as Record<string, unknown>[] || [];
            const lastMsg = messages.sort((a, b) =>
                new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime()
            )[0];

            conversations.push({
                id: conv.id,
                participantIds,
                participants: (profiles || []).map(p => ({
                    id: p.id,
                    displayName: p.display_name || 'Unknown',
                    avatarUrl: p.avatar_url,
                    isOnline: p.is_online || false
                })),
                lastMessage: lastMsg ? await this.mapMessage(lastMsg) : undefined,
                unreadCount: count || 0,
                updatedAt: conv.updated_at
            });
        }

        return conversations;
    }

    /**
     * Get messages in a conversation
     */
    async getMessages(conversationId: string, limit: number = 50): Promise<Message[]> {
        const { data, error } = await supabase
            .from('messages')
            .select(`
                *,
                sender:sender_id(display_name, avatar_url)
            `)
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('[Messaging] Failed to get messages:', error);
            return [];
        }

        return (data || []).map(m => ({
            id: m.id,
            conversationId: m.conversation_id,
            senderId: m.sender_id,
            senderName: (m.sender as Record<string, unknown>)?.display_name as string,
            senderAvatar: (m.sender as Record<string, unknown>)?.avatar_url as string,
            content: m.content,
            isRead: m.is_read,
            createdAt: m.created_at
        })).reverse();
    }

    /**
     * Send a message
     */
    async sendMessage(conversationId: string, senderId: string, receiverId: string, content: string): Promise<Message | null> {
        const { data, error } = await supabase
            .from('messages')
            .insert({
                conversation_id: conversationId,
                sender_id: senderId,
                receiver_id: receiverId,
                content,
                is_read: false
            })
            .select()
            .single();

        if (error) {
            console.error('[Messaging] Failed to send:', error);
            return null;
        }

        // Update conversation's updated_at
        await supabase
            .from('conversations')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', conversationId);

        return this.mapMessage(data);
    }

    /**
     * Start a new conversation
     */
    async startConversation(userId: string, otherUserId: string): Promise<Conversation | null> {
        // Check if conversation already exists
        const { data: existing } = await supabase
            .from('conversations')
            .select('*')
            .contains('participant_ids', [userId, otherUserId])
            .single();

        if (existing) {
            const convs = await this.getConversations(userId);
            return convs.find(c => c.id === existing.id) || null;
        }

        // Create new conversation
        const { data, error } = await supabase
            .from('conversations')
            .insert({
                participant_ids: [userId, otherUserId]
            })
            .select()
            .single();

        if (error) {
            console.error('[Messaging] Failed to create conversation:', error);
            return null;
        }

        const convs = await this.getConversations(userId);
        return convs.find(c => c.id === data.id) || null;
    }

    /**
     * Start a new CLUB conversation (category = 'club')
     * Used for club-internal messaging
     * ENFORCES role-based messaging permissions
     */
    async startClubConversation(
        userId: string,
        otherUserId: string,
        clubId: string
    ): Promise<Conversation | null> {
        // Check messaging permission based on roles
        const permission = await clubMessagingPermissions.canMessage(userId, otherUserId, clubId);
        if (!permission.allowed) {
            console.error('[Messaging] Permission denied:', permission.reason);
            throw new Error(permission.reason || 'Not allowed to message this user');
        }

        // Check if club conversation already exists between these users
        const { data: existing } = await supabase
            .from('conversations')
            .select('*')
            .contains('participant_ids', [userId, otherUserId])
            .eq('club_id', clubId)
            .eq('category', 'club')
            .single();

        if (existing) {
            const convs = await this.getConversations(userId);
            return convs.find(c => c.id === existing.id) || null;
        }

        // Create new club conversation
        const { data, error } = await supabase
            .from('conversations')
            .insert({
                participant_ids: [userId, otherUserId],
                category: 'club',
                club_id: clubId
            })
            .select()
            .single();

        if (error) {
            console.error('[Messaging] Failed to create club conversation:', error);
            return null;
        }

        const convs = await this.getConversations(userId);
        return convs.find(c => c.id === data.id) || null;
    }

    async markAsRead(conversationId: string, userId: string): Promise<boolean> {
        const { error } = await supabase
            .from('messages')
            .update({ is_read: true })
            .eq('conversation_id', conversationId)
            .eq('receiver_id', userId)
            .eq('is_read', false);

        return !error;
    }

    /**
     * Get total unread count
     */
    async getUnreadCount(userId: string): Promise<number> {
        const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('receiver_id', userId)
            .eq('is_read', false);

        return count || 0;
    }

    /**
     * Map database record to Message
     */
    private async mapMessage(data: Record<string, unknown>): Promise<Message> {
        return {
            id: data.id as string,
            conversationId: data.conversation_id as string,
            senderId: data.sender_id as string,
            senderName: (data.sender as Record<string, unknown>)?.display_name as string,
            senderAvatar: (data.sender as Record<string, unknown>)?.avatar_url as string,
            content: data.content as string,
            isRead: data.is_read as boolean,
            createdAt: data.created_at as string
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REACTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Toggle a reaction on a message (add if not exists, remove if exists)
     */
    async toggleReaction(messageId: string, reaction: string): Promise<boolean> {
        const { data, error } = await supabase
            .rpc('toggle_message_reaction', {
                p_message_id: messageId,
                p_reaction: reaction
            });

        if (error) {
            console.error('[Messaging] Failed to toggle reaction:', error);
            return false;
        }

        return data as boolean; // true = added, false = removed
    }

    /**
     * Get reactions for a message
     */
    async getReactions(messageId: string): Promise<MessageReaction[]> {
        const { data, error } = await supabase
            .rpc('get_message_reactions', {
                p_message_id: messageId
            });

        if (error) {
            console.error('[Messaging] Failed to get reactions:', error);
            return [];
        }

        return (data || []).map((r: { reaction: string; count: number; user_reacted: boolean }) => ({
            reaction: r.reaction,
            count: r.count,
            userReacted: r.user_reacted
        }));
    }

    /**
     * Add a reaction to a message (direct insert)
     */
    async addReaction(messageId: string, userId: string, reaction: string): Promise<boolean> {
        const { error } = await supabase
            .from('message_reactions')
            .insert({
                message_id: messageId,
                user_id: userId,
                reaction
            });

        if (error) {
            // Might already exist (unique constraint)
            if (error.code === '23505') {
                return true; // Already reacted
            }
            console.error('[Messaging] Failed to add reaction:', error);
            return false;
        }

        return true;
    }

    /**
     * Remove a reaction from a message
     */
    async removeReaction(messageId: string, userId: string, reaction: string): Promise<boolean> {
        const { error } = await supabase
            .from('message_reactions')
            .delete()
            .eq('message_id', messageId)
            .eq('user_id', userId)
            .eq('reaction', reaction);

        return !error;
    }
}

// Reaction type
export interface MessageReaction {
    reaction: string;
    count: number;
    userReacted: boolean;
}

// Export singleton
export const messagingService = new MessagingServiceClass();

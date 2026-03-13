/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  MESSAGING SERVICE — Direct Messages
 * User-to-user messaging with real-time updates
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { supabase } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { clubMessagingPermissions } from './ClubMessagingPermissions';
import { masterBus } from '../core/MasterBus';

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
          filter: `receiver_id=eq.${userId}`,
        },
        async (payload) => {
          if (callbacks.onNewMessage && payload.new) {
            const message = await this.mapMessage(payload.new as Record<string, unknown>);
            callbacks.onNewMessage(message);
            masterBus.emit('MESSAGE_RECEIVED', {
              message: message as unknown as Record<string, unknown>,
            });
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
      .select(
        `
                *,
                messages(id, conversation_id, sender_id, content, is_read, created_at)
            `
      )
      .contains('participant_ids', [userId])
      .order('updated_at', { ascending: false })
      .limit(100);

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
      const messages = (conv.messages as Record<string, unknown>[]) || [];
      const lastMsg = messages.sort(
        (a, b) =>
          new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime()
      )[0];

      conversations.push({
        id: conv.id,
        participantIds,
        participants: (profiles || []).map((p) => ({
          id: p.id,
          displayName: p.display_name || 'Unknown',
          avatarUrl: p.avatar_url,
          isOnline: p.is_online || false,
        })),
        lastMessage: lastMsg ? await this.mapMessage(lastMsg) : undefined,
        unreadCount: count || 0,
        updatedAt: conv.updated_at,
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
      .select(
        `
                *,
                sender:sender_id(display_name, avatar_url)
            `
      )
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[Messaging] Failed to get messages:', error);
      return [];
    }

    return (data || [])
      .map((m) => ({
        id: m.id,
        conversationId: m.conversation_id,
        senderId: m.sender_id,
        senderName: (m.sender as Record<string, unknown>)?.display_name as string,
        senderAvatar: (m.sender as Record<string, unknown>)?.avatar_url as string,
        content: m.content,
        isRead: m.is_read,
        createdAt: m.created_at,
      }))
      .reverse();
  }

  /**
   * Send a message
   */
  async sendMessage(
    conversationId: string,
    senderId: string,
    receiverId: string,
    content: string
  ): Promise<Message | null> {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        receiver_id: receiverId,
        content,
        is_read: false,
      })
      .select()
      .maybeSingle();

    if (error || !data) {
      console.error('[Messaging] Failed to send:', error);
      return null;
    }

    const mapped = await this.mapMessage(data);
    masterBus.emit('MESSAGE_SENT', {
      message: mapped as unknown as Record<string, unknown>,
      conversationId,
    });

    // Update conversation's updated_at
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);

    return mapped;
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
      .maybeSingle();

    if (existing) {
      const convs = await this.getConversations(userId);
      return convs.find((c) => c.id === existing.id) || null;
    }

    // Create new conversation
    const { data, error } = await supabase
      .from('conversations')
      .insert({
        participant_ids: [userId, otherUserId],
      })
      .select()
      .maybeSingle();

    if (error) {
      console.error('[Messaging] Failed to create conversation:', error);
      return null;
    }

    const convs = await this.getConversations(userId);
    return convs.find((c) => c.id === data.id) || null;
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
      .maybeSingle();

    if (existing) {
      const convs = await this.getConversations(userId);
      return convs.find((c) => c.id === existing.id) || null;
    }

    // Create new club conversation
    const { data, error } = await supabase
      .from('conversations')
      .insert({
        participant_ids: [userId, otherUserId],
        category: 'club',
        club_id: clubId,
      })
      .select()
      .maybeSingle();

    if (error) {
      console.error('[Messaging] Failed to create club conversation:', error);
      return null;
    }

    const convs = await this.getConversations(userId);
    return convs.find((c) => c.id === data.id) || null;
  }

  async markAsRead(conversationId: string, userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('conversation_id', conversationId)
        .eq('receiver_id', userId)
        .eq('is_read', false);

      if (error) {
        console.error('[Messaging] Failed to mark as read:', error);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[Messaging] markAsRead error:', err);
      return false;
    }
  }

  /**
   * Get total unread count
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      const { count, error } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', userId)
        .eq('is_read', false);

      if (error) {
        console.error('[Messaging] Failed to get unread count:', error);
        return 0;
      }
      return count || 0;
    } catch (err) {
      console.error('[Messaging] getUnreadCount error:', err);
      return 0;
    }
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
      createdAt: data.created_at as string,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Toggle a reaction on a message (add if not exists, remove if exists)
   */
  async toggleReaction(messageId: string, reaction: string): Promise<boolean> {
    const userId = (await supabase.auth.getUser()).data?.user?.id;
    if (!userId) {
      console.error('[Messaging] No user ID available for reaction');
      return false;
    }

    const { data, error } = await supabase.rpc('fn_toggle_message_reaction', {
      p_message_id: messageId,
      p_reaction: reaction,
      p_user_id: userId,
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
    try {
      const { data, error } = await supabase.rpc('get_message_reactions', {
        p_message_id: messageId,
      });

      if (error) {
        console.warn('[Messaging] get_message_reactions RPC not available - returning empty array');
        return [];
      }

      return (data || []).map((r: { reaction: string; count: number; user_reacted: boolean }) => ({
        reaction: r.reaction,
        count: r.count,
        userReacted: r.user_reacted,
      }));
    } catch (err) {
      console.warn('[Messaging] Failed to get reactions:', err);
      return [];
    }
  }

  /**
   * Add a reaction to a message (direct insert)
   */
  async addReaction(messageId: string, userId: string, reaction: string): Promise<boolean> {
    const { error } = await supabase.from('message_reactions').insert({
      message_id: messageId,
      user_id: userId,
      reaction,
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

  // ═══════════════════════════════════════════════════════════════════════════
  // MESSAGE SEARCH
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Search messages within a conversation
   */
  async searchMessages(
    conversationId: string,
    query: string,
    limit: number = 50
  ): Promise<Message[]> {
    if (!query.trim()) return [];

    const { data, error } = await supabase
      .from('messages')
      .select(
        `
        *,
        sender:sender_id(display_name, avatar_url)
      `
      )
      .eq('conversation_id', conversationId)
      .ilike('content', `%${query}%`)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[Messaging] Search failed:', error);
      return [];
    }

    return (data || []).map((m) => ({
      id: m.id,
      conversationId: m.conversation_id,
      senderId: m.sender_id,
      senderName: (m.sender as Record<string, unknown>)?.display_name as string,
      senderAvatar: (m.sender as Record<string, unknown>)?.avatar_url as string,
      content: m.content,
      isRead: m.is_read,
      createdAt: m.created_at,
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GROUP CHAT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a group conversation
   */
  async createGroupConversation(
    creatorId: string,
    participantIds: string[],
    name: string
  ): Promise<Conversation | null> {
    const allParticipants = [creatorId, ...participantIds.filter((id) => id !== creatorId)];

    const { data, error } = await supabase
      .from('conversations')
      .insert({
        participant_ids: allParticipants,
        name,
        is_group: true,
        created_by: creatorId,
      })
      .select()
      .maybeSingle();

    if (error) {
      console.error('[Messaging] Failed to create group:', error);
      return null;
    }

    // Create conversation_participants entries
    const participantInserts = allParticipants.map((uid) => ({
      conversation_id: data.id,
      user_id: uid,
      role: uid === creatorId ? 'admin' : 'member',
    }));

    await supabase.from('conversation_participants').insert(participantInserts);

    masterBus.emit('CONVERSATION_CREATED', {
      conversationId: data.id,
      isGroup: true,
    });

    const convs = await this.getConversations(creatorId);
    return convs.find((c) => c.id === data.id) || null;
  }

  /**
   * Add participant to group conversation
   */
  async addParticipant(conversationId: string, userId: string): Promise<boolean> {
    try {
      // Add to participant_ids array
      const { data: conv } = await supabase
        .from('conversations')
        .select('participant_ids')
        .eq('id', conversationId)
        .maybeSingle();

      if (!conv) return false;

      const ids = conv.participant_ids as string[];
      if (ids.includes(userId)) return true; // already in

      const { error } = await supabase
        .from('conversations')
        .update({ participant_ids: [...ids, userId] })
        .eq('id', conversationId);

      if (error) return false;

      // Create conversation_participants entry
      await supabase.from('conversation_participants').insert({
        conversation_id: conversationId,
        user_id: userId,
        role: 'member',
      });

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Remove participant from group conversation
   */
  async removeParticipant(conversationId: string, userId: string): Promise<boolean> {
    try {
      const { data: conv } = await supabase
        .from('conversations')
        .select('participant_ids')
        .eq('id', conversationId)
        .maybeSingle();

      if (!conv) return false;

      const ids = (conv.participant_ids as string[]).filter((id) => id !== userId);

      const { error } = await supabase
        .from('conversations')
        .update({ participant_ids: ids })
        .eq('id', conversationId);

      if (error) return false;

      await supabase
        .from('conversation_participants')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('user_id', userId);

      return true;
    } catch {
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONVERSATION PINNING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Pin a conversation for a user
   */
  async pinConversation(conversationId: string, userId: string): Promise<boolean> {
    const { error } = await supabase
      .from('conversation_participants')
      .update({ is_pinned: true })
      .eq('conversation_id', conversationId)
      .eq('user_id', userId);

    if (!error) {
      masterBus.emit('CONVERSATION_PINNED', { conversationId });
    }
    return !error;
  }

  /**
   * Unpin a conversation for a user
   */
  async unpinConversation(conversationId: string, userId: string): Promise<boolean> {
    const { error } = await supabase
      .from('conversation_participants')
      .update({ is_pinned: false })
      .eq('conversation_id', conversationId)
      .eq('user_id', userId);

    if (!error) {
      masterBus.emit('CONVERSATION_UNPINNED', { conversationId });
    }
    return !error;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MESSAGE FORWARDING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Forward a message to another conversation
   */
  async forwardMessage(
    messageId: string,
    targetConversationId: string,
    senderId: string
  ): Promise<Message | null> {
    // Get original message
    const { data: original } = await supabase
      .from('messages')
      .select('content, image_url, audio_url')
      .eq('id', messageId)
      .maybeSingle();

    if (!original) {
      console.error('[Messaging] Original message not found for forward');
      return null;
    }

    // Get receiver from target conversation
    const { data: targetConv } = await supabase
      .from('conversations')
      .select('participant_ids')
      .eq('id', targetConversationId)
      .maybeSingle();

    const receiverId =
      (targetConv?.participant_ids as string[])?.find((id) => id !== senderId) || null;

    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: targetConversationId,
        sender_id: senderId,
        receiver_id: receiverId,
        content: `↪ ${original.content || ''}`.trim(),
        image_url: original.image_url,
        audio_url: original.audio_url,
        is_forwarded: true,
      })
      .select()
      .maybeSingle();

    if (error || !data) {
      console.error('[Messaging] Forward failed:', error);
      return null;
    }

    // Update target conversation's last message
    await supabase
      .from('conversations')
      .update({
        last_message: `↪ ${(original.content || '').substring(0, 80)}`,
        last_message_time: new Date().toISOString(),
        last_message_user_id: senderId,
      })
      .eq('id', targetConversationId);

    return await this.mapMessage(data);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Q3: MESSAGE SCHEDULING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Schedule a message for future delivery (club admin announcements).
   * Stores in `scheduled_messages` table; a cron picks them up at send_at time.
   */
  async scheduleMessage(
    conversationId: string,
    senderId: string,
    content: string,
    sendAt: Date
  ): Promise<{ id: string } | null> {
    const { data, error } = await supabase
      .from('scheduled_messages')
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        content,
        send_at: sendAt.toISOString(),
        status: 'pending',
      })
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[Messaging] Schedule failed:', error);
      return null;
    }

    return data;
  }

  /**
   * Get pending scheduled messages for a conversation
   */
  async getScheduledMessages(conversationId: string): Promise<
    Array<{ id: string; content: string; sendAt: string; status: string }>
  > {
    const { data, error } = await supabase
      .from('scheduled_messages')
      .select('id, content, send_at, status')
      .eq('conversation_id', conversationId)
      .eq('status', 'pending')
      .order('send_at', { ascending: true });

    if (error) return [];
    return (data || []).map((d: any) => ({
      id: d.id,
      content: d.content,
      sendAt: d.send_at,
      status: d.status,
    }));
  }

  /**
   * Cancel a scheduled message
   */
  async cancelScheduledMessage(messageId: string): Promise<boolean> {
    const { error } = await supabase
      .from('scheduled_messages')
      .update({ status: 'cancelled' })
      .eq('id', messageId);

    return !error;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Q3: NOTIFICATION PREFERENCES (per-type muting)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get user's notification preferences from localStorage
   */
  getNotificationPreferences(): Record<string, boolean> {
    try {
      const raw = localStorage.getItem('notif_preferences');
      return raw ? JSON.parse(raw) : {
        messages: true,
        games: true,
        social: true,
        achievements: true,
        system: true,
      };
    } catch {
      return { messages: true, games: true, social: true, achievements: true, system: true };
    }
  }

  /**
   * Set user's notification preferences
   */
  setNotificationPreferences(prefs: Record<string, boolean>): void {
    localStorage.setItem('notif_preferences', JSON.stringify(prefs));
  }

  /**
   * Check if a specific notification type is muted
   */
  isNotificationTypeMuted(type: string): boolean {
    const prefs = this.getNotificationPreferences();
    return prefs[type] === false;
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

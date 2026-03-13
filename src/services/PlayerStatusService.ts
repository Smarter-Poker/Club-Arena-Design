/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  PLAYER STATUS SERVICE — Q3 Social: "Playing At" + Status Updates
 * ═══════════════════════════════════════════════════════════════════════════════
 * Manages player activity status ("Playing at Table X"), custom status messages,
 * and "Playing At" visibility for friends.
 */

import { supabase } from '../lib/supabase';
import { masterBus } from '../core/MasterBus';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface PlayerStatus {
  userId: string;
  statusText: string | null; // Custom status: "Grinding MTTs 🎯"
  playingAt: string | null; // Current table name
  playingAtTableId: string | null; // Current table ID for deep-link
  isOnline: boolean;
  lastSeen: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

class PlayerStatusServiceClass {
  private currentStatus: PlayerStatus | null = null;

  /**
   * Set the user's custom status text (e.g., "Taking a break 🌴")
   */
  async setStatusText(userId: string, text: string | null): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({ status_text: text })
      .eq('id', userId);

    if (error) {
      console.error('[PlayerStatus] setStatusText error:', error);
      return;
    }

    this.currentStatus = this.currentStatus ? { ...this.currentStatus, statusText: text } : null;
    masterBus.emit('PROFILE_UPDATED', {
      userId,
      updates: { status_text: text } as Record<string, unknown>,
    });
  }

  /**
   * Update the user's "playing at" table status
   */
  async setPlayingAt(
    userId: string,
    tableName: string | null,
    tableId: string | null
  ): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({
        current_table: tableName,
        current_table_id: tableId,
      })
      .eq('id', userId);

    if (error) {
      console.error('[PlayerStatus] setPlayingAt error:', error);
      return;
    }

    this.currentStatus = this.currentStatus
      ? { ...this.currentStatus, playingAt: tableName, playingAtTableId: tableId }
      : null;
    masterBus.emit('PROFILE_UPDATED', {
      userId,
      updates: { current_table: tableName, current_table_id: tableId } as Record<string, unknown>,
    });
  }

  /**
   * Clear the user's "playing at" status (when leaving a table)
   */
  async clearPlayingAt(userId: string): Promise<void> {
    await this.setPlayingAt(userId, null, null);
  }

  /**
   * Get a friend's current status
   */
  async getPlayerStatus(userId: string): Promise<PlayerStatus | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, status_text, current_table, current_table_id, is_online, last_seen')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      userId: data.id,
      statusText: data.status_text || null,
      playingAt: data.current_table || null,
      playingAtTableId: data.current_table_id || null,
      isOnline: data.is_online || false,
      lastSeen: data.last_seen || new Date().toISOString(),
    };
  }

  /**
   * Get the "playing at" status of all online friends
   * NOTE: Friendships are bidirectional — query BOTH directions
   */
  async getFriendsStatus(userId: string): Promise<PlayerStatus[]> {
    // Direction 1: user_id = me → friend_id references the friend
    const { data: dir1 } = await supabase
      .from('friendships')
      .select(
        `
        friend_id,
        profiles!friendships_friend_id_fkey(
          id, status_text, current_table, current_table_id, is_online, last_seen
        )
      `
      )
      .eq('user_id', userId)
      .eq('status', 'accepted');

    // Direction 2: friend_id = me → user_id references the friend
    const { data: dir2 } = await supabase
      .from('friendships')
      .select(
        `
        user_id,
        profiles!friendships_user_id_fkey(
          id, status_text, current_table, current_table_id, is_online, last_seen
        )
      `
      )
      .eq('friend_id', userId)
      .eq('status', 'accepted');

    const allFriends = [
      ...(dir1 || []).filter((f: any) => f.profiles?.is_online).map((f: any) => f.profiles),
      ...(dir2 || []).filter((f: any) => f.profiles?.is_online).map((f: any) => f.profiles),
    ];

    // Deduplicate by userId
    const seen = new Set<string>();
    return allFriends
      .filter((p: any) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      })
      .map((p: any) => ({
        userId: p.id,
        statusText: p.status_text || null,
        playingAt: p.current_table || null,
        playingAtTableId: p.current_table_id || null,
        isOnline: true,
        lastSeen: p.last_seen || new Date().toISOString(),
      }));
  }

  /**
   * Generate a shareable profile link
   */
  generateProfileLink(userId: string): string {
    const baseUrl = window.location.origin;
    return `${baseUrl}/profile/${userId}`;
  }

  /**
   * Generate a shareable profile card (for messaging or external sharing)
   */
  generateProfileCard(profile: {
    userId: string;
    username: string;
    avatarUrl?: string;
    level?: number;
  }): {
    type: 'profile_card';
    userId: string;
    username: string;
    avatarUrl: string;
    level: number;
    link: string;
  } {
    return {
      type: 'profile_card',
      userId: profile.userId,
      username: profile.username,
      avatarUrl: profile.avatarUrl || '/default-avatar.png',
      level: profile.level || 1,
      link: this.generateProfileLink(profile.userId),
    };
  }

  /**
   * Share a profile card into a conversation
   */
  async shareProfileToConversation(
    senderId: string,
    conversationId: string,
    targetUserId: string,
    targetUsername: string,
    targetAvatarUrl?: string
  ): Promise<void> {
    const card = this.generateProfileCard({
      userId: targetUserId,
      username: targetUsername,
      avatarUrl: targetAvatarUrl,
    });

    const content = `📇 Shared a contact: @${card.username}\n${card.link}`;

    // Destructure 'type' from card to avoid duplication in metadata,
    // as metadata will have its own 'type' property.
    const { type: _, ...cardData } = card;

    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        content,
        metadata: {
          type: 'contact_card', // Explicit type for the message metadata
          ...cardData, // All other properties from the card
        },
      })
      .select()
      .maybeSingle();

    if (error) {
      console.error('[PlayerStatus] shareProfileToConversation error:', error);
      return;
    }

    // Update conversation timestamp so it bubbles to top of list
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);

    // Emit bus event so conversation list updates in real-time
    if (data) {
      masterBus.emit('MESSAGE_SENT', {
        message: data as Record<string, unknown>,
        conversationId,
      });
    }
  }
}

export const playerStatusService = new PlayerStatusServiceClass();

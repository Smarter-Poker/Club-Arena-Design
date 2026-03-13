/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  SOCIAL ENHANCEMENTS SERVICE — Q3 Phase 14
 *  Kudos, Stories, Connection Strength, Social Feed, Club Online, Join Requests,
 *  Rich Push, Player Graph, Friend Online Count, Rich Text Rendering
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { supabase } from '../lib/supabase';
import { masterBus } from '../core/MasterBus';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface KudosEntry {
  id: string;
  fromUserId: string;
  toUserId: string;
  type: 'good_opponent' | 'great_player' | 'fun_table' | 'fair_play';
  createdAt: string;
}

export interface PlayerStory {
  id: string;
  userId: string;
  username: string;
  avatarUrl?: string;
  content: string;
  imageUrl?: string;
  expiresAt: string;
  createdAt: string;
  viewCount: number;
  isExpired: boolean;
}

export interface SocialFeedItem {
  id: string;
  userId: string;
  username: string;
  avatarUrl?: string;
  type: 'hand_result' | 'tournament_finish' | 'achievement' | 'level_up' | 'club_join' | 'kudos_received' | 'story';
  title: string;
  description: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface ConnectionStrength {
  sharedClubs: number;
  sharedTables: number;
  mutualFriends: number;
  totalKudos: number;
  strength: 'weak' | 'moderate' | 'strong' | 'best_friend';
}

export interface JoinRequest {
  id: string;
  clubId: string;
  clubName: string;
  userId: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

class SocialEnhancementsServiceClass {

  // ═══════════════════════════════════════════════════════════════════════════
  // KUDOS / PLAYER REPUTATION
  // ═══════════════════════════════════════════════════════════════════════════

  /** Send kudos to another player after a shared session */
  async sendKudos(fromUserId: string, toUserId: string, type: KudosEntry['type']): Promise<boolean> {
    const { error } = await supabase.from('player_kudos').insert({
      from_user_id: fromUserId,
      to_user_id: toUserId,
      type,
    });

    if (!error) {
      masterBus.emit('NOTIFICATION_RECEIVED', {
        notification: { type: 'kudos', fromUserId, toUserId, kudosType: type },
      });
    }
    return !error;
  }

  /** Get kudos count for a player */
  async getKudosCount(userId: string): Promise<Record<KudosEntry['type'], number>> {
    const { data } = await supabase
      .from('player_kudos')
      .select('type')
      .eq('to_user_id', userId);

    const counts: Record<string, number> = { good_opponent: 0, great_player: 0, fun_table: 0, fair_play: 0 };
    (data || []).forEach((k: any) => { counts[k.type] = (counts[k.type] || 0) + 1; });
    return counts as Record<KudosEntry['type'], number>;
  }

  /** Get total kudos for a player */
  async getTotalKudos(userId: string): Promise<number> {
    const { count } = await supabase
      .from('player_kudos')
      .select('id', { count: 'exact', head: true })
      .eq('to_user_id', userId);
    return count || 0;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PLAYER STORIES / STATUS UPDATES
  // ═══════════════════════════════════════════════════════════════════════════

  /** Post a story (expires after 24h) */
  async postStory(userId: string, content: string, imageUrl?: string): Promise<string | null> {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('player_stories')
      .insert({
        user_id: userId,
        content,
        image_url: imageUrl,
        expires_at: expiresAt,
      })
      .select('id')
      .single();

    return error ? null : data.id;
  }

  /** Get active stories from friends */
  async getFriendStories(userId: string): Promise<PlayerStory[]> {
    // Get friend IDs
    const { data: friendships } = await supabase
      .from('friendships')
      .select('user_id, friend_id')
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
      .eq('status', 'accepted');

    const friendIds = (friendships || []).map((f: any) =>
      f.user_id === userId ? f.friend_id : f.user_id
    );
    if (friendIds.length === 0) return [];

    const { data } = await supabase
      .from('player_stories')
      .select('*, profiles:user_id(username, avatar_url)')
      .in('user_id', friendIds)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(50);

    return (data || []).map((s: any) => ({
      id: s.id,
      userId: s.user_id,
      username: s.profiles?.username || 'Unknown',
      avatarUrl: s.profiles?.avatar_url,
      content: s.content,
      imageUrl: s.image_url,
      expiresAt: s.expires_at,
      createdAt: s.created_at,
      viewCount: s.view_count || 0,
      isExpired: new Date(s.expires_at) < new Date(),
    }));
  }

  /** View a story (increment view count) */
  async viewStory(storyId: string): Promise<void> {
    await supabase.rpc('increment_story_view', { story_id: storyId });
  }

  /** Delete own story */
  async deleteStory(storyId: string, userId: string): Promise<boolean> {
    const { error } = await supabase
      .from('player_stories')
      .delete()
      .eq('id', storyId)
      .eq('user_id', userId);
    return !error;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONNECTION STRENGTH
  // ═══════════════════════════════════════════════════════════════════════════

  /** Calculate connection strength between two players */
  async getConnectionStrength(userId: string, otherUserId: string): Promise<ConnectionStrength> {
    // Shared clubs
    const { data: myClubs } = await supabase
      .from('club_members')
      .select('club_id')
      .eq('user_id', userId);
    const { data: theirClubs } = await supabase
      .from('club_members')
      .select('club_id')
      .eq('user_id', otherUserId);

    const myClubIds = new Set((myClubs || []).map((c: any) => c.club_id));
    const sharedClubs = (theirClubs || []).filter((c: any) => myClubIds.has(c.club_id)).length;

    // Shared tables (recent 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const { count: sharedTables } = await supabase
      .from('hand_histories')
      .select('id', { count: 'exact', head: true })
      .contains('player_ids', [userId, otherUserId])
      .gte('created_at', thirtyDaysAgo);

    // Mutual friends
    const { data: myFriends } = await supabase
      .from('friendships')
      .select('user_id, friend_id')
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
      .eq('status', 'accepted');
    const { data: theirFriends } = await supabase
      .from('friendships')
      .select('user_id, friend_id')
      .or(`user_id.eq.${otherUserId},friend_id.eq.${otherUserId}`)
      .eq('status', 'accepted');

    const myFriendIds = new Set((myFriends || []).map((f: any) =>
      f.user_id === userId ? f.friend_id : f.user_id
    ));
    const mutualFriends = (theirFriends || []).filter((f: any) => {
      const theirFriendId = f.user_id === otherUserId ? f.friend_id : f.user_id;
      return myFriendIds.has(theirFriendId);
    }).length;

    // Kudos exchanged
    const { count: totalKudos } = await supabase
      .from('player_kudos')
      .select('id', { count: 'exact', head: true })
      .or(`and(from_user_id.eq.${userId},to_user_id.eq.${otherUserId}),and(from_user_id.eq.${otherUserId},to_user_id.eq.${userId})`);

    // Calculate strength tier
    const score = sharedClubs * 3 + (sharedTables || 0) + mutualFriends * 2 + (totalKudos || 0) * 2;
    let strength: ConnectionStrength['strength'] = 'weak';
    if (score >= 20) strength = 'best_friend';
    else if (score >= 10) strength = 'strong';
    else if (score >= 4) strength = 'moderate';

    return { sharedClubs, sharedTables: sharedTables || 0, mutualFriends, totalKudos: totalKudos || 0, strength };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SOCIAL FEED ENRICHMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /** Get enriched social feed for a user (friend activity) */
  async getEnrichedSocialFeed(userId: string, limit = 30): Promise<SocialFeedItem[]> {
    // Get friend IDs
    const { data: friendships } = await supabase
      .from('friendships')
      .select('user_id, friend_id')
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
      .eq('status', 'accepted');

    const friendIds = (friendships || []).map((f: any) =>
      f.user_id === userId ? f.friend_id : f.user_id
    );
    if (friendIds.length === 0) return [];

    const items: SocialFeedItem[] = [];

    // Achievements
    const { data: achievements } = await supabase
      .from('user_achievements')
      .select('*, profiles:user_id(username, avatar_url)')
      .in('user_id', friendIds)
      .order('unlocked_at', { ascending: false })
      .limit(10);

    (achievements || []).forEach((a: any) => {
      items.push({
        id: `ach-${a.id}`,
        userId: a.user_id,
        username: a.profiles?.username || 'Unknown',
        avatarUrl: a.profiles?.avatar_url,
        type: 'achievement',
        title: `${a.profiles?.username} unlocked an achievement!`,
        description: a.achievement_name || a.name || 'New achievement',
        createdAt: a.unlocked_at || a.created_at,
      });
    });

    // Tournament finishes
    const { data: tourneyResults } = await supabase
      .from('tournament_players')
      .select('*, profiles:user_id(username, avatar_url), tournaments:tournament_id(name)')
      .in('user_id', friendIds)
      .not('finish_position', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(10);

    (tourneyResults || []).forEach((t: any) => {
      if (t.finish_position <= 3) {
        items.push({
          id: `tourney-${t.id}`,
          userId: t.user_id,
          username: t.profiles?.username || 'Unknown',
          avatarUrl: t.profiles?.avatar_url,
          type: 'tournament_finish',
          title: `${t.profiles?.username} finished #${t.finish_position}!`,
          description: t.tournaments?.name || 'Tournament',
          createdAt: t.updated_at || t.created_at,
        });
      }
    });

    // Kudos received
    const { data: kudos } = await supabase
      .from('player_kudos')
      .select('*, from_profile:from_user_id(username), to_profile:to_user_id(username, avatar_url)')
      .in('to_user_id', friendIds)
      .order('created_at', { ascending: false })
      .limit(10);

    (kudos || []).forEach((k: any) => {
      items.push({
        id: `kudos-${k.id}`,
        userId: k.to_user_id,
        username: k.to_profile?.username || 'Unknown',
        avatarUrl: k.to_profile?.avatar_url,
        type: 'kudos_received',
        title: `${k.to_profile?.username} received kudos!`,
        description: `${k.from_profile?.username} gave "${k.type.replace('_', ' ')}"`,
        createdAt: k.created_at,
      });
    });

    // Sort by date and limit
    return items
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLUB MEMBER ONLINE COUNT
  // ═══════════════════════════════════════════════════════════════════════════

  /** Get count of online members for a club via Supabase Presence */
  async getClubOnlineCount(clubId: string): Promise<number> {
    const channelKey = `club-presence-${clubId}`;
    const channel = masterBus.getOrCreateChannel(channelKey);
    const state = channel.presenceState();
    let count = 0;
    Object.values(state).forEach((presences) => { count += (presences as any[]).length; });
    return count;
  }

  /** Subscribe to club presence for live online count */
  subscribeToClubPresence(
    clubId: string,
    userId: string,
    callback: (count: number) => void
  ): () => void {
    const channelKey = `club-presence-${clubId}`;
    const channel = masterBus.getOrCreateChannel(channelKey);

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      let count = 0;
      Object.values(state).forEach((presences) => { count += (presences as any[]).length; });
      callback(count);
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ user_id: userId, online_at: new Date().toISOString() });
      }
    });

    return () => { masterBus.removeRegisteredChannel(channelKey); };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // JOIN REQUEST STATUS TRACKING
  // ═══════════════════════════════════════════════════════════════════════════

  /** Get user's pending join requests */
  async getMyJoinRequests(userId: string): Promise<JoinRequest[]> {
    const { data } = await supabase
      .from('club_join_requests')
      .select('*, clubs:club_id(name)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    return (data || []).map((r: any) => ({
      id: r.id,
      clubId: r.club_id,
      clubName: r.clubs?.name || 'Unknown Club',
      userId: r.user_id,
      status: r.status,
      createdAt: r.created_at,
    }));
  }

  /** Check if user has a pending request for a specific club */
  async hasJoinRequest(userId: string, clubId: string): Promise<'pending' | 'approved' | 'rejected' | null> {
    const { data } = await supabase
      .from('club_join_requests')
      .select('status')
      .eq('user_id', userId)
      .eq('club_id', clubId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return data?.status || null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FRIEND ONLINE COUNT (for Tab Bar badge)
  // ═══════════════════════════════════════════════════════════════════════════

  /** Get real-time count of online friends (via presence state) */
  getOnlineFriendsFromPresence(friendIds: string[]): number {
    const channelKey = 'global-presence';
    try {
      const channel = masterBus.getOrCreateChannel(channelKey);
      const state = channel.presenceState();
      const onlineIds = new Set<string>();
      Object.values(state).forEach((presences) => {
        (presences as any[]).forEach((p) => onlineIds.add(p.user_id));
      });
      return friendIds.filter((id) => onlineIds.has(id)).length;
    } catch {
      return 0;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RICH PUSH NOTIFICATIONS WITH AVATAR
  // ═══════════════════════════════════════════════════════════════════════════

  /** Enhanced browser notification with avatar */
  async sendRichNotification(title: string, body: string, senderUserId?: string, url?: string): Promise<void> {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    let icon = '/favicon.ico';
    if (senderUserId) {
      const { data } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', senderUserId)
        .maybeSingle();
      if (data?.avatar_url) icon = data.avatar_url;
    }

    const notification = new Notification(title, {
      body,
      icon,
      badge: '/favicon.ico',
      tag: `notif-${Date.now()}`,
    });

    if (url) {
      notification.onclick = () => {
        window.focus();
        window.location.href = url;
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PLAYER GRAPH VISUALIZATION DATA
  // ═══════════════════════════════════════════════════════════════════════════

  /** Get player connection graph data for visualization */
  async getPlayerGraph(userId: string): Promise<{
    nodes: Array<{ id: string; label: string; avatar?: string; isCenter: boolean }>;
    edges: Array<{ from: string; to: string; strength: number }>;
  }> {
    // Get all friends
    const { data: friendships } = await supabase
      .from('friendships')
      .select('user_id, friend_id, profiles_user:user_id(username, avatar_url), profiles_friend:friend_id(username, avatar_url)')
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
      .eq('status', 'accepted')
      .limit(50);

    const nodes: Array<{ id: string; label: string; avatar?: string; isCenter: boolean }> = [];
    const edges: Array<{ from: string; to: string; strength: number }> = [];
    const nodeSet = new Set<string>();

    // Add center node (current user)
    const { data: myProfile } = await supabase
      .from('profiles')
      .select('username, avatar_url')
      .eq('id', userId)
      .maybeSingle();

    nodes.push({
      id: userId,
      label: myProfile?.username || 'You',
      avatar: myProfile?.avatar_url,
      isCenter: true,
    });
    nodeSet.add(userId);

    // Add friend nodes + edges
    (friendships || []).forEach((f: any) => {
      const friendId = f.user_id === userId ? f.friend_id : f.user_id;
      const friendProfile = f.user_id === userId ? f.profiles_friend : f.profiles_user;

      if (!nodeSet.has(friendId)) {
        nodes.push({
          id: friendId,
          label: friendProfile?.username || 'Unknown',
          avatar: friendProfile?.avatar_url,
          isCenter: false,
        });
        nodeSet.add(friendId);
      }

      edges.push({ from: userId, to: friendId, strength: 1 });
    });

    return { nodes, edges };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RICH TEXT / MARKDOWN RENDERING UTILITY
  // ═══════════════════════════════════════════════════════════════════════════

  /** Parse basic markdown-like syntax in messages */
  renderRichText(text: string): string {
    let rendered = text;
    // Bold: **text**
    rendered = rendered.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic: *text* or _text_
    rendered = rendered.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
    rendered = rendered.replace(/_(.+?)_/g, '<em>$1</em>');
    // Code: `text`
    rendered = rendered.replace(/`(.+?)`/g, '<code style="background:rgba(255,255,255,0.08);padding:1px 4px;border-radius:4px;font-family:monospace;font-size:0.85em">$1</code>');
    // Strikethrough: ~~text~~
    rendered = rendered.replace(/~~(.+?)~~/g, '<del>$1</del>');
    // Links: auto-detect URLs
    rendered = rendered.replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#00d4ff;text-decoration:underline">$1</a>'
    );
    return rendered;
  }
}

export const socialEnhancementsService = new SocialEnhancementsServiceClass();

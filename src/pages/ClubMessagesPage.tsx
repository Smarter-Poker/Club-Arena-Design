/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CLUB MESSAGES PAGE — Dedicated Club Conversations View
 * ═══════════════════════════════════════════════════════════════════════════════
 * Facebook Marketplace-style dedicated view for club messages
 * Separated from personal DMs for clean organization
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { masterBus } from '../core/MasterBus';
import { useUserStore } from '../stores/useUserStore';
import { useToast } from '../components/common/Toast';
import ClubBottomNav from '../components/club/ClubBottomNav';
import MessageThread from '../components/messaging/MessageThread';
import './ClubMessagesPage.css';
import { useVisibilityRefresh } from '../hooks/useVisibilityRefresh';

interface ClubConversation {
  id: string;
  clubId: string;
  clubName: string;
  clubLogo: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  participantCount: number;
}

export default function ClubMessagesPage() {
  const navigate = useNavigate();
  useVisibilityRefresh(() => loadClubConversations());
  const { conversationId, clubId: urlClubId } = useParams<{
    conversationId?: string;
    clubId?: string;
  }>();
  const { user } = useUserStore();
  const toast = useToast();

  const [conversations, setConversations] = useState<ClubConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(
    conversationId || null
  );
  const [userRole, setUserRole] = useState<'owner' | 'admin' | 'agent' | 'member'>('member');
  const [clubId, setClubId] = useState<string | undefined>(urlClubId);
  const [visibleConversations, setVisibleConversations] = useState<Set<string>>(new Set());

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  // Load club conversations
  const loadClubConversations = useCallback(async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      // Query conversations where user is a participant and category is 'club'
      const { data: clubConvs, error: convError } = await supabase
        .from('conversations')
        .select(
          `
                    id,
                    club_id,
                    updated_at,
                    clubs(id, name, logo_url)
                `
        )
        .contains('participant_ids', [user.id])
        .eq('category', 'club')
        .order('updated_at', { ascending: false });

      if (convError || !clubConvs) {
        console.error('Failed to load club conversations:', convError);
        setLoading(false);
        return;
      }

      // For each conversation, get last message and unread count
      const mapped: ClubConversation[] = await Promise.all(
        clubConvs.map(async (conv: any) => {
          // Get last message
          const { data: lastMsg } = await supabase
            .from('messages')
            .select('content, created_at')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          // Get unread count
          const { count: unreadCount } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', conv.id)
            .eq('receiver_id', user.id)
            .eq('is_read', false);

          return {
            id: conv.id,
            clubId: conv.club_id,
            clubName: conv.clubs?.name || 'Unknown Club',
            clubLogo: conv.clubs?.logo_url || '/default-club.png',
            lastMessage: lastMsg?.content || '',
            lastMessageTime: lastMsg?.created_at || conv.updated_at,
            unreadCount: unreadCount || 0,
            participantCount: 0,
          };
        })
      );

      setConversations(mapped);
    } catch (error) {
      console.error('Failed to load club conversations:', error);
      toast.error('Failed to load club conversations');
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    loadClubConversations();

    // Real-time subscription
    const channelKey = 'club-messages-updates';
    const channel = masterBus.getOrCreateChannel(channelKey);
    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
        },
        () => {
          loadClubConversations();
        }
      )
      .subscribe();

    return () => {
      masterBus.removeRegisteredChannel(channelKey);
    };
  }, [loadClubConversations]);

  // ── Bus Listeners: cross-page message event reactivity ──
  useEffect(() => {
    const unsubNotif = masterBus.subscribe('NOTIFICATION_READ', () => {
      loadClubConversations();
    });
    return () => {
      unsubNotif();
    };
  }, [loadClubConversations]);

  // Stagger animation for conversations
  useEffect(() => {
    if (conversations.length === 0) return;
    setVisibleConversations(new Set());
    conversations.forEach((conv, index) => {
      setTimeout(() => {
        setVisibleConversations((prev) => new Set(prev).add(conv.id));
      }, index * 60);
    });
  }, [conversations]);

  // Format relative time
  const formatTime = (dateStr: string): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString();
  };

  const handleSelect = (id: string) => {
    setSelectedConversation(id);
    if (isMobile) {
      navigate(`/messages/clubs/${id}`);
    }
  };

  const handleBack = () => {
    setSelectedConversation(null);
    if (isMobile) {
      navigate('/messages/clubs');
    }
  };

  // Mobile: Show thread if selected
  if (isMobile && selectedConversation) {
    return (
      <div className="club-messages-page full-height">
        <MessageThread conversationId={selectedConversation} onBack={handleBack} />
      </div>
    );
  }

  // Calculate total unread
  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  return (
    <div className="club-messages-page">
      {/* Summary Bar */}
      <div className="club-messages-summary">
        <span className="summary-icon">◈</span>
        <span className="summary-text">
          {conversations.length} club{conversations.length !== 1 ? 's' : ''}
          {totalUnread > 0 && ` · ${totalUnread} unread`}
        </span>
      </div>

      {/* Club Conversation List */}
      <div className="club-messages-list">
        {loading ? (
          <div className="loading-state">
            <div className="spinner" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">◈</span>
            <p>No club messages yet</p>
            <p className="hint">Join a club to start chatting!</p>
          </div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              className={`club-conversation-item ${selectedConversation === conv.id ? 'selected' : ''} ${conv.unreadCount > 0 ? 'unread' : ''} ${visibleConversations.has(conv.id) ? 'fadeInUp' : 'hidden'}`}
              style={
                visibleConversations.has(conv.id)
                  ? undefined
                  : { opacity: 0, transform: 'translateY(8px)' }
              }
              onClick={() => handleSelect(conv.id)}
            >
              {/* Club Logo */}
              <div className="club-logo-container">
                <img
                  src={conv.clubLogo}
                  alt={conv.clubName}
                  className="club-logo"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/default-club.png';
                  }}
                />
              </div>

              {/* Content */}
              <div className="club-conversation-content">
                <div className="club-conversation-header">
                  <span className="club-name">{conv.clubName}</span>
                  <span className="message-time">{formatTime(conv.lastMessageTime)}</span>
                </div>
                <div className="club-conversation-preview">
                  <span className="last-message">{conv.lastMessage || 'No messages yet'}</span>
                  {conv.unreadCount > 0 && <span className="unread-badge">{conv.unreadCount}</span>}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop: Split view with thread */}
      {!isMobile && selectedConversation && (
        <div className="club-messages-thread">
          <MessageThread conversationId={selectedConversation} onBack={handleBack} />
        </div>
      )}

      {clubId && <ClubBottomNav clubId={clubId} userRole={userRole} />}
    </div>
  );
}

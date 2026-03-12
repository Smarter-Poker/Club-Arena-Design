/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  useTableChat — Chat State & Handlers
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Extracted from TablePage.tsx to reduce monolith size.
 * Manages chat messages, mute/collapse state, RoomService integration,
 * and reaction message parsing for TableReactions.
 */

import { useState, useCallback, useRef } from 'react';
import { roomService } from '../services/RoomService';
import type { ChatMessage } from '../components/table/TableChat';

// Reaction event type (shared with TableReactions)
export interface ReactionEvent {
  id: string;
  emoji: string;
  seatIndex: number;
  timestamp: number;
}

const REACTION_MSG_REGEX = /^\[REACTION:(.+):(\d+)]$/;
const THROW_MSG_REGEX = /^\[THROW:.+:\d+]$/;
const REACTION_LIFETIME_MS = 2500;

export interface UseTableChatReturn {
  chatMessages: ChatMessage[];
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  isChatCollapsed: boolean;
  setIsChatCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  isChatMuted: boolean;
  setIsChatMuted: React.Dispatch<React.SetStateAction<boolean>>;
  handleSendChatMessage: (message: string) => void;
  // Reaction parsing
  activeReactions: ReactionEvent[];
  parseIncomingMessage: (content: string, senderId: string) => boolean;
}

export function useTableChat(
  tableId: string | undefined,
  userId: string,
  heroName: string
): UseTableChatReturn {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatCollapsed, setIsChatCollapsed] = useState(true);
  const [isChatMuted, setIsChatMuted] = useState(false);
  const [activeReactions, setActiveReactions] = useState<ReactionEvent[]>([]);
  const reactionIdRef = useRef(0);

  // Parse incoming messages — returns true if message was a special command (reaction/throw)
  const parseIncomingMessage = useCallback((content: string, _senderId: string): boolean => {
    // Check for reaction messages
    const reactionMatch = content.match(REACTION_MSG_REGEX);
    if (reactionMatch) {
      const emoji = reactionMatch[1];
      const seatIndex = parseInt(reactionMatch[2], 10);
      const reactionId = `rx_${++reactionIdRef.current}`;

      setActiveReactions((prev) => [
        ...prev,
        { id: reactionId, emoji, seatIndex, timestamp: Date.now() },
      ]);

      // Auto-remove after lifetime
      setTimeout(() => {
        setActiveReactions((prev) => prev.filter((r) => r.id !== reactionId));
      }, REACTION_LIFETIME_MS);

      return true; // Don't add to chat
    }

    // Check for throw messages (already handled by throwable system)
    if (THROW_MSG_REGEX.test(content)) {
      return true; // Don't add to chat
    }

    return false; // Normal message — add to chat
  }, []);

  const handleSendChatMessage = useCallback(
    (message: string) => {
      if (!tableId || !userId) return;

      roomService.sendChat(tableId, userId, message);

      // Optimistically add to local state
      setChatMessages((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}`,
          type: 'PLAYER' as const,
          playerId: userId,
          playerName: heroName || 'You',
          content: message,
          timestamp: new Date(),
        },
      ]);
    },
    [tableId, userId, heroName]
  );

  return {
    chatMessages,
    setChatMessages,
    isChatCollapsed,
    setIsChatCollapsed,
    isChatMuted,
    setIsChatMuted,
    handleSendChatMessage,
    activeReactions,
    parseIncomingMessage,
  };
}

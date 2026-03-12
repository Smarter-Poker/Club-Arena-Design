/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  useTableChat — Chat State & Handlers
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Extracted from TablePage.tsx to reduce monolith size.
 * Manages chat messages, mute/collapse state, and RoomService integration.
 */

import { useState, useCallback } from 'react';
import { roomService } from '../services/RoomService';
import type { ChatMessage } from '../components/table/TableChat';

export interface UseTableChatReturn {
  chatMessages: ChatMessage[];
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  isChatCollapsed: boolean;
  setIsChatCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  isChatMuted: boolean;
  setIsChatMuted: React.Dispatch<React.SetStateAction<boolean>>;
  handleSendChatMessage: (message: string) => void;
}

export function useTableChat(
  tableId: string | undefined,
  userId: string,
  heroName: string
): UseTableChatReturn {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatCollapsed, setIsChatCollapsed] = useState(true);
  const [isChatMuted, setIsChatMuted] = useState(false);

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
  };
}

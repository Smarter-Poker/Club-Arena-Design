/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  QUICK CHAT PRESETS — One-tap messages and emoji reactions at the table
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useCallback } from 'react';
import { masterBus } from '../../core/MasterBus';
import './QuickChatPresets.css';

interface QuickChatPresetsProps {
  tableId: string;
  userId: string;
  playerName?: string;
}

const PRESETS = [
  { emoji: '👏', text: 'Nice hand!' },
  { emoji: '🙏', text: 'Thank you' },
  { emoji: '😬', text: 'Unlucky' },
  { emoji: '🤝', text: 'Good game' },
  { emoji: '👋', text: 'Hello!' },
  { emoji: '😎', text: 'EZ game' },
  { emoji: '🤔', text: 'Interesting...' },
  { emoji: '🔥', text: 'On fire!' },
];

const REACTIONS = ['👍', '😂', '😮', '😢', '🤬', '🎉', '💀', '🤑'];

export const QuickChatPresets: React.FC<QuickChatPresetsProps> = ({
  tableId,
  userId,
  playerName,
}) => {
  const [showReactions, setShowReactions] = useState(false);
  const [cooldown, setCooldown] = useState<string | null>(null);

  const sendMessage = useCallback(
    (text: string) => {
      if (cooldown) return;
      masterBus.emit('TABLE_CHAT_MESSAGE', {
        tableId,
        userId,
        playerName: playerName || 'Player',
        message: text,
        type: 'preset',
      });
      // 3-second cooldown to prevent spam
      setCooldown(text);
      setTimeout(() => setCooldown(null), 3000);
    },
    [tableId, userId, playerName, cooldown]
  );

  const sendReaction = useCallback(
    (emoji: string) => {
      masterBus.emit('TABLE_REACTION', {
        tableId,
        userId,
        playerName: playerName || 'Player',
        emoji,
      });
      setShowReactions(false);
    },
    [tableId, userId, playerName]
  );

  return (
    <div className="quick-chat">
      {/* ── Preset messages ── */}
      <div className="qc-presets">
        {PRESETS.map((p) => (
          <button
            key={p.text}
            className={`qc-preset-btn ${cooldown === p.text ? 'qc-cooldown' : ''}`}
            onClick={() => sendMessage(p.text)}
            disabled={!!cooldown}
          >
            <span className="qc-emoji">{p.emoji}</span>
            <span className="qc-text">{p.text}</span>
          </button>
        ))}
      </div>

      {/* ── Reaction toggle ── */}
      <div className="qc-reaction-section">
        <button className="qc-reaction-toggle" onClick={() => setShowReactions(!showReactions)}>
          😀 React
        </button>

        {showReactions && (
          <div className="qc-reaction-strip">
            {REACTIONS.map((r) => (
              <button key={r} className="qc-reaction-btn" onClick={() => sendReaction(r)}>
                {r}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default QuickChatPresets;

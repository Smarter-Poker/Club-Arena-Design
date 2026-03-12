/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CHAT BUBBLE — Message Display (SNGINE-inspired)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Features: Sent/received styling, reactions, timestamp, long-press actions
 */

import { useState, useEffect } from 'react';
import { PlayerAvatar } from '../avatars/PlayerAvatar';
import styles from './ChatBubble.module.css';

interface Message {
  id: string;
  userId: string;
  userFullname: string;
  userPicture: string;
  content: string;
  imageUrl?: string;
  createdAt: string;
  reactions: { [emoji: string]: number };
  myReaction?: string;
}

interface ChatBubbleProps {
  message: Message;
  isCurrentUser: boolean;
  showAvatar?: boolean;
  onReact?: (messageId: string, emoji: string) => void;
  onDelete?: (messageId: string) => void;
}

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡'];

export default function ChatBubble({
  message,
  isCurrentUser,
  showAvatar = true,
  onReact,
  onDelete,
}: ChatBubbleProps) {
  const [showReactions, setShowReactions] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTimeout(() => setMounted(true), 50);
  }, []);

  const formatTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const totalReactions = Object.values(message.reactions).reduce((sum, count) => sum + count, 0);

  const handleLongPress = () => {
    setShowMenu(true);
  };

  const handleReact = (emoji: string) => {
    onReact?.(message.id, emoji);
    setShowReactions(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setShowMenu(false);
  };

  const handleDelete = () => {
    onDelete?.(message.id);
    setShowMenu(false);
  };

  return (
    <div
      className={`${styles.container} ${isCurrentUser ? styles.sent : styles.received}`}
      style={{
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0)' : 'translateY(8px)',
        transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      }}
    >
      {/* Avatar (for received messages) */}
      {!isCurrentUser && showAvatar && (
        <PlayerAvatar
          src={message.userPicture}
          name={message.userFullname}
          size="sm"
          showPresence={false}
          showLevelBadge={false}
          showXpRing={false}
          showVipRing={false}
          alt={message.userFullname}
        />
      )}

      <div className={styles.bubbleWrapper}>
        {/* Username (for group chats) */}
        {!isCurrentUser && showAvatar && (
          <span className={styles.username}>{message.userFullname}</span>
        )}

        {/* Bubble */}
        <div
          className={styles.bubble}
          onContextMenu={(e) => {
            e.preventDefault();
            handleLongPress();
          }}
          onDoubleClick={() => setShowReactions(true)}
        >
          {/* Image */}
          {message.imageUrl && (
            <div className={styles.imageContainer}>
              <img src={message.imageUrl} alt="" className={styles.image} />
            </div>
          )}

          {/* Text */}
          {message.content && <p className={styles.text}>{message.content}</p>}

          {/* Reactions Display */}
          {totalReactions > 0 && (
            <div className={styles.reactionsDisplay} onClick={() => setShowReactions(true)}>
              {Object.entries(message.reactions)
                .filter(([_, count]) => count > 0)
                .slice(0, 3)
                .map(([emoji]) => (
                  <span key={emoji} className={styles.reactionEmoji}>
                    {emoji}
                  </span>
                ))}
              <span className={styles.reactionCount}>{totalReactions}</span>
            </div>
          )}
        </div>

        {/* Timestamp */}
        <span className={styles.timestamp}>{formatTime(message.createdAt)}</span>

        {/* Reactions Picker */}
        {showReactions && (
          <>
            <div className={styles.overlay} onClick={() => setShowReactions(false)} />
            <div className={styles.reactionsPicker}>
              {REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  className={`${styles.reactionBtn} ${message.myReaction === emoji ? styles.active : ''}`}
                  onClick={() => handleReact(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Context Menu */}
        {showMenu && (
          <>
            <div className={styles.overlay} onClick={() => setShowMenu(false)} />
            <div className={styles.menu}>
              <button
                className={styles.menuItem}
                onClick={() => {
                  setShowReactions(true);
                  setShowMenu(false);
                }}
              >
                React
              </button>
              <button className={styles.menuItem} onClick={handleCopy}>
                Copy
              </button>
              {isCurrentUser && (
                <button className={`${styles.menuItem} ${styles.danger}`} onClick={handleDelete}>
                  Delete
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

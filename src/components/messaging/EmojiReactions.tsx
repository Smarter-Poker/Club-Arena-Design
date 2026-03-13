/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  EMOJI REACTIONS — Add and display emoji reactions on messages
 * ═══════════════════════════════════════════════════════════════════════════════
 * Features: Quick-react bar, reaction counts, long-press for full picker, animated pop-in
 */

import { useState, useRef, useEffect } from 'react';
import styles from './EmojiReactions.module.css';

interface Reaction {
  emoji: string;
  userId: string;
  userName: string;
  timestamp: number;
}

interface EmojiReactionsProps {
  reactions: { [emoji: string]: number };
  myReaction?: string;
  onReact: (emoji: string) => void;
  reactionDetails?: Reaction[];
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

const ALL_REACTIONS = [
  '😀',
  '😃',
  '😄',
  '😁',
  '😆',
  '😅',
  '🤣',
  '😂',
  '🙂',
  '🙃',
  '😉',
  '😊',
  '😇',
  '🥰',
  '😍',
  '🤩',
  '😘',
  '😗',
  '😚',
  '😙',
  '🥲',
  '😋',
  '😛',
  '😜',
  '😝',
  '🤑',
  '🤗',
  '🤭',
  '🤫',
  '🤔',
  '🤐',
  '🤨',
  '😐',
  '😑',
  '😶',
  '😏',
  '😒',
  '🙄',
  '😬',
  '🤥',
  '😌',
  '😔',
  '😪',
  '🤤',
  '😴',
  '😷',
  '🤒',
  '🤕',
  '🤮',
  '🤢',
  '🤮',
  '🤠',
  '🥳',
  '😎',
  '🤓',
  '🧐',
  '😕',
  '😟',
  '🙁',
  '☹️',
  '😮',
  '😯',
  '😲',
  '😳',
  '��',
  '😦',
  '😧',
  '😨',
  '😰',
  '😥',
  '😢',
  '😭',
  '😱',
  '😖',
  '😣',
  '😞',
  '😓',
  '😩',
  '😫',
  '🥱',
  '😤',
  '😡',
  '😠',
  '🤬',
  '😈',
  '👿',
  '💀',
  '☠️',
  '💩',
  '🤡',
  '👹',
  '👺',
  '👻',
  '👽',
  '👾',
  '🤖',
  '😺',
  '😸',
  '😹',
  '😻',
  '😼',
  '😽',
  '🙀',
  '😿',
  '😾',
  '🙈',
  '🙉',
  '🙊',
  '❤️',
  '🧡',
  '💛',
  '💚',
  '💙',
  '💜',
  '🖤',
  '🤍',
  '🤎',
  '💔',
  '💕',
  '💞',
  '💓',
  '💗',
  '💖',
  '💘',
  '💝',
  '💟',
  '👋',
  '🤚',
  '🖐️',
  '✋',
  '🖖',
  '👌',
  '🤌',
  '🤏',
  '✌️',
  '🤞',
  '🫰',
  '🤟',
  '🤘',
  '🤙',
  '👍',
  '👎',
  '✊',
  '👊',
];

export default function EmojiReactions({
  reactions,
  myReaction,
  onReact,
  reactionDetails = [],
}: EmojiReactionsProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [showDetailsIndex, setShowDetailsIndex] = useState<number | null>(null);
  const [animated, setAnimated] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<number>(0);

  useEffect(() => {
    setAnimated(true);
  }, []);

  const totalReactions = Object.values(reactions).reduce((sum, count) => sum + count, 0);

  const handleReact = (emoji: string) => {
    onReact(emoji);
    setShowPicker(false);
    setShowDetailsIndex(null);
  };

  const handleLongPress = () => {
    setShowPicker(true);
  };

  const handleTouchStart = () => {
    touchStartRef.current = Date.now();
    longPressRef.current = setTimeout(handleLongPress, 500);
  };

  const handleTouchEnd = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
    }
  };

  const handleMouseDown = () => {
    longPressRef.current = setTimeout(handleLongPress, 500);
  };

  const handleMouseUp = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
    }
  };

  if (totalReactions === 0) {
    return null;
  }

  // Get reactions sorted by count (descending)
  const sortedReactions = Object.entries(reactions)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Get list of who reacted to a specific emoji
  const getReactors = (emoji: string) => {
    return reactionDetails
      .filter((r) => r.emoji === emoji)
      .map((r) => r.userName)
      .join(', ');
  };

  return (
    <div
      ref={containerRef}
      className={`${styles.container} ${animated ? styles.animated : ''}`}
      style={{
        opacity: animated ? 1 : 0,
        transform: animated ? 'scale(1)' : 'scale(0.85)',
        transition: 'all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}
    >
      <div
        className={styles.reactionsRow}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {sortedReactions.map(([emoji, count], index) => (
          <button
            key={emoji}
            className={`${styles.reactionPill} ${myReaction === emoji ? styles.myReaction : ''}`}
            onClick={() => handleReact(emoji)}
            onMouseEnter={() => setShowDetailsIndex(index)}
            onMouseLeave={() => setShowDetailsIndex(null)}
            title={getReactors(emoji)}
            style={{
              animation: `${styles.popIn} 0.4s ${index * 0.05}s cubic-bezier(0.34, 1.56, 0.64, 1) both`,
            }}
          >
            <span className={styles.emoji}>{emoji}</span>
            <span className={styles.count}>{count}</span>

            {/* Reaction Details Tooltip */}
            {showDetailsIndex === index && getReactors(emoji) && (
              <div className={styles.detailsTooltip}>{getReactors(emoji)}</div>
            )}
          </button>
        ))}

        {/* Add Reaction Button */}
        <button
          className={styles.addBtn}
          onClick={() => setShowPicker(!showPicker)}
          title="Add reaction"
        >
          +
        </button>
      </div>

      {/* Full Emoji Picker */}
      {showPicker && (
        <>
          <div className={styles.pickerOverlay} onClick={() => setShowPicker(false)} />
          <div className={styles.emojiPicker}>
            <div className={styles.pickerHeader}>
              <h3>Reactions</h3>
              <button className={styles.closeBtn} onClick={() => setShowPicker(false)}>
                ✕
              </button>
            </div>

            {/* Quick Reactions */}
            <div className={styles.quickReactionsSection}>
              <div className={styles.sectionLabel}>Quick</div>
              <div className={styles.quickReactions}>
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    className={`${styles.emojiBtn} ${myReaction === emoji ? styles.active : ''}`}
                    onClick={() => handleReact(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* All Reactions Grid */}
            <div className={styles.allReactionsSection}>
              <div className={styles.sectionLabel}>All</div>
              <div className={styles.emojiGrid}>
                {ALL_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    className={`${styles.emojiBtn} ${myReaction === emoji ? styles.active : ''}`}
                    onClick={() => handleReact(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

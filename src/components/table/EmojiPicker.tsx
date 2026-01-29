/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 😀 EMOJI PICKER — VIP-Gated Table Emojis
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React, { useState } from 'react';
import { vipService, VIP_GOLD_LIMITS, FEATURE_PRICING } from '../../services/VIPService';
import { useUserStore } from '../../stores/useUserStore';
import { useToast } from '../common/Toast';
import './EmojiPicker.css';

interface EmojiPickerProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (emoji: string) => void;
    position?: { x: number; y: number };
}

const FREE_EMOJIS = ['', '', '😀', '😂', '😭', '', '', '💯', '🤔', '😱', '🙏', ''];

const VIP_EMOJIS = [
    // Poker specific
    '', '', '', '', '', '', '', '', '', '',
    // Reactions
    '🤑', '', '🥳', '😤', '🤯', '', '👻', '', '🤡', '',
    // Actions
    '', '', '', '💥', '', '', '', '💫', '', '',
    // Taunts
    '🐟', '🐠', '🐋', '🦐', '🐔', '🐷', '🐒', '🦧', '🤖', '👽'
];

export function EmojiPicker({ isOpen, onClose, onSelect, position }: EmojiPickerProps) {
    const { user } = useUserStore();
    const toast = useToast();
    const [isVIP, setIsVIP] = useState(false);
    const [loading, setLoading] = useState(true);

    React.useEffect(() => {
        const check = async () => {
            if (!user?.id) {
                setLoading(false);
                return;
            }
            const vip = await vipService.isVIP(user.id);
            setIsVIP(vip);
            setLoading(false);
        };
        if (isOpen) check();
    }, [isOpen, user?.id]);

    const handleSelect = async (emoji: string, isPremium: boolean) => {
        if (!user?.id) return;

        if (isPremium && !isVIP) {
            // Charge for premium emoji pack
            const result = await vipService.purchaseFeature(user.id, 'emoji_pack');
            if (!result.success) {
                toast.error('Insufficient diamonds');
                return;
            }
            toast.info(` ${result.charged} diamond charged for emoji`);
        }

        onSelect(emoji);
        onClose();
    };

    if (!isOpen) return null;

    const style = position ? { left: position.x, top: position.y } : {};

    return (
        <div className="emoji-picker-overlay" onClick={onClose}>
            <div className="emoji-picker" style={style} onClick={e => e.stopPropagation()}>
                <div className="emoji-picker__section">
                    <span className="emoji-picker__label">Free</span>
                    <div className="emoji-picker__grid">
                        {FREE_EMOJIS.map(emoji => (
                            <button key={emoji} onClick={() => handleSelect(emoji, false)}>
                                {emoji}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="emoji-picker__section">
                    <span className="emoji-picker__label">
                        {isVIP ? ' VIP' : `Premium (${FEATURE_PRICING.emoji_pack.cost})`}
                    </span>
                    <div className="emoji-picker__grid vip">
                        {VIP_EMOJIS.map(emoji => (
                            <button
                                key={emoji}
                                onClick={() => handleSelect(emoji, true)}
                                className={!isVIP ? 'premium' : ''}
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default EmojiPicker;

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  MESSAGE INPUT — Chat Composer (SNGINE-inspired)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Features: Auto-resize textarea, image attachment, typing indicator broadcast
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import styles from './MessageInput.module.css';
import { ImageUpload, ImagePreview } from './ImageMessage';

interface MessageInputProps {
    onSend: (text: string, imageUrl?: string) => void;
    onTyping?: (isTyping: boolean) => void;
    disabled?: boolean;
    placeholder?: string;
}

export default function MessageInput({ onSend, onTyping, disabled = false, placeholder = "Type a message..." }: MessageInputProps) {
    const [text, setText] = useState('');
    const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastTypingState = useRef(false);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
        }
    }, [text]);

    // Typing indicator
    const updateTyping = useCallback((isTyping: boolean) => {
        if (isTyping !== lastTypingState.current) {
            lastTypingState.current = isTyping;
            onTyping?.(isTyping);
        }
    }, [onTyping]);

    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setText(e.target.value);

        // Set typing = true
        updateTyping(true);

        // Clear existing timeout
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }

        // Set typing = false after 3s of inactivity
        typingTimeoutRef.current = setTimeout(() => {
            updateTyping(false);
        }, 3000);
    };

    const handleSend = () => {
        if ((!text.trim() && !attachmentPreview) || disabled) return;

        onSend(text.trim(), attachmentPreview || undefined);
        setText('');
        setAttachmentPreview(null);
        updateTyping(false);

        // Reset textarea height
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                setAttachmentPreview(event.target?.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const removeAttachment = () => {
        setAttachmentPreview(null);
    };

    return (
        <div className={styles.container}>
            {/* Attachment Preview */}
            {attachmentPreview && (
                <ImagePreview
                    imageUrl={attachmentPreview}
                    onRemove={removeAttachment}
                />
            )}

            <div className={styles.inputRow}>
                {/* Image Upload Button */}
                <ImageUpload
                    onPreview={setAttachmentPreview}
                    maxSizeMB={5}
                />

                {/* Text Input */}
                <textarea
                    ref={textareaRef}
                    className={styles.textarea}
                    value={text}
                    onChange={handleTextChange}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    disabled={disabled}
                    rows={1}
                />

                {/* Send Button */}
                <button
                    className={`${styles.sendBtn} ${(text.trim() || attachmentPreview) ? styles.active : ''}`}
                    onClick={handleSend}
                    disabled={disabled || (!text.trim() && !attachmentPreview)}
                >
                    {disabled ? '' : '➤'}
                </button>
            </div>
        </div>
    );
}

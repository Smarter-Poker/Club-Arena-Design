/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  MESSAGES PAGE — Club-Internal Messaging Hub (SNGINE-inspired)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Club-scoped messaging - NOT connected to smarter.poker social messaging
 */

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ConversationList from '../components/messaging/ConversationList';
import MessageThread from '../components/messaging/MessageThread';
import { messagingService } from '../services/MessagingService';
import PrivateChat from '../components/social/PrivateChat';
import MessagesPanel from '../components/messaging/MessagesPanel';
import MessageInput from '../components/messaging/MessageInput';
import ChatBubble from '../components/messaging/ChatBubble';
import './MessagesPage.css';

export default function MessagesPage() {
    const navigate = useNavigate();
    const { clubId, conversationId } = useParams<{ clubId: string; conversationId?: string }>();
    const [selectedConversation, setSelectedConversation] = useState<string | null>(conversationId || null);
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

    // Note: clubId is optional now - ConversationList shows both personal and club widget

    const handleSelectConversation = (id: string) => {
        setSelectedConversation(id);
        if (isMobile) {
            navigate(`/messages/${id}`);
        }
    };

    const handleBack = () => {
        setSelectedConversation(null);
        if (isMobile) {
            navigate('/messages');
        }
    };

    // Mobile: Show either list or thread
    if (isMobile) {
        if (selectedConversation || conversationId) {
            return (
                <div className="messages-page full-height">
                    <MessageThread
                        conversationId={selectedConversation || conversationId!}
                        onBack={handleBack}
                    />
                </div>
            );
        }
        return (
            <div className="messages-page">
                <div className="messages-content">
                    <ConversationList
                        clubId={clubId}
                        onSelectConversation={handleSelectConversation}
                        selectedId={selectedConversation || undefined}
                    />
                </div>
            </div>
        );
    }

    // Desktop: Split view
    return (
        <div className="messages-page">
            <div className="messages-split-view">
                <aside className="messages-sidebar">
                    <ConversationList
                        clubId={clubId}
                        onSelectConversation={handleSelectConversation}
                        selectedId={selectedConversation || undefined}
                    />
                </aside>
                <main className="messages-main">
                    {selectedConversation ? (
                        <MessageThread
                            conversationId={selectedConversation}
                            onBack={handleBack}
                        />
                    ) : (
                        <div className="messages-empty">
                            <span className="empty-icon"></span>
                            <p>Select a conversation to start chatting</p>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}

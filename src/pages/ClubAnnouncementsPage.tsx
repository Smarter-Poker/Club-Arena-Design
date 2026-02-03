/**
 *  CLUB ANNOUNCEMENTS PAGE — Live Updates
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useUserStore } from '../stores/useUserStore';
import ClubBottomNav from '../components/club/ClubBottomNav';
import { useToast } from '../components/common/Toast';
import './ClubAnnouncementsPage.css';

interface Announcement {
    id: string;
    title: string;
    content: string;
    created_at: string;
    author_name: string;
    is_pinned: boolean;
}

export default function ClubAnnouncementsPage() {
    const navigate = useNavigate();
    const { clubId } = useParams();
    const { user } = useUserStore();
    const toast = useToast();

    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);

    const [showComposer, setShowComposer] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newContent, setNewContent] = useState('');
    const [posting, setPosting] = useState(false);
    const [userRole, setUserRole] = useState<'owner' | 'admin' | 'agent' | 'member'>('member');

    useEffect(() => {
        if (clubId) {
            loadAnnouncements();

            // Real-time announcements
            const channel = supabase
                .channel('announcements-live')
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'club_announcements',
                        filter: `club_id=eq.${clubId}`,
                    },
                    (payload) => {
                        // New announcement!
                        toast.info(' New announcement posted!');
                        loadAnnouncements();
                    }
                )
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        }
    }, [clubId]);

    const loadAnnouncements = async () => {
        setLoading(true);
        try {
            // Load announcements
            const { data, error } = await supabase
                .from('club_announcements')
                .select(`
                    id,
                    title,
                    content,
                    created_at,
                    is_pinned,
                    author:profiles!club_announcements_profiles_fkey (
                        username
                    )
                `)
                .eq('club_id', clubId)
                .order('is_pinned', { ascending: false })
                .order('created_at', { ascending: false });

            if (!error && data) {
                setAnnouncements(data.map((a: any) => ({
                    id: a.id,
                    title: a.title,
                    content: a.content,
                    created_at: a.created_at,
                    author_name: a.author?.username || 'Admin',
                    is_pinned: a.is_pinned,
                })));
            }

            // Check if user is admin
            if (user?.id) {
                const { data: membership } = await supabase
                    .from('club_memberships')
                    .select('role')
                    .eq('club_id', clubId)
                    .eq('user_id', user.id)
                    .single();

                setIsAdmin(['owner', 'admin'].includes(membership?.role || ''));
            }
        } catch (error) {
            console.error('Failed to load announcements:', error);
        }
        setLoading(false);
    };

    const handlePost = async () => {
        if (!newTitle.trim() || !newContent.trim() || !clubId || !user?.id) return;

        setPosting(true);
        try {
            const { error } = await supabase
                .from('club_announcements')
                .insert({
                    club_id: clubId,
                    author_id: user.id,
                    title: newTitle.trim(),
                    content: newContent.trim(),
                    is_pinned: false,
                });

            if (!error) {
                setNewTitle('');
                setNewContent('');
                setShowComposer(false);
                loadAnnouncements();
            }
        } catch (error) {
            console.error('Failed to post announcement:', error);
        }
        setPosting(false);
    };

    const formatDate = (dateStr: string): string => {
        const date = new Date(dateStr);
        return date.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    return (
        <div className="announcements-page">

            {isAdmin && !showComposer && (
                <div className="admin-bar">
                    <button className="btn btn-primary" onClick={() => setShowComposer(true)}>
                        + New Announcement
                    </button>
                </div>
            )}

            {showComposer && (
                <div className="composer">
                    <input
                        type="text"
                        placeholder="Announcement Title..."
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        className="composer-title"
                    />
                    <textarea
                        placeholder="Write your announcement..."
                        value={newContent}
                        onChange={(e) => setNewContent(e.target.value)}
                        rows={4}
                        className="composer-content"
                    />
                    <div className="composer-actions">
                        <button className="btn btn-ghost" onClick={() => setShowComposer(false)}>
                            Cancel
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={handlePost}
                            disabled={posting || !newTitle.trim() || !newContent.trim()}
                        >
                            {posting ? 'Posting...' : 'Post'}
                        </button>
                    </div>
                </div>
            )}

            <div className="announcements-list">
                {loading ? (
                    <div className="loading-state"><div className="spinner" /></div>
                ) : announcements.length === 0 ? (
                    <div className="empty-state">
                        <span className="empty-icon">◈</span>
                        <p>No announcements yet</p>
                    </div>
                ) : (
                    announcements.map(announcement => (
                        <div key={announcement.id} className={`announcement-card ${announcement.is_pinned ? 'pinned' : ''}`}>
                            {announcement.is_pinned && <span className="pin-badge"> Pinned</span>}
                            <h3 className="announcement-title">{announcement.title}</h3>
                            <p className="announcement-content">{announcement.content}</p>
                            <div className="announcement-meta">
                                <span className="announcement-author">By {announcement.author_name}</span>
                                <span className="announcement-date">{formatDate(announcement.created_at)}</span>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {clubId && (
                <ClubBottomNav
                    clubId={clubId}
                    userRole={userRole}
                />
            )}

        </div>
    );
}

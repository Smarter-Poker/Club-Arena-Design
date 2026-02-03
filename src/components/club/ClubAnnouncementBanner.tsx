/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CLUB ANNOUNCEMENT BANNER — Important Club Messages
 * Displays pinned announcements from club admins
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE:
 * - With clubId prop:  <ClubAnnouncementBanner clubId="abc123" />
 * - Auto-detect from URL: <ClubAnnouncementBanner /> (uses :clubId from route)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import styles from './ClubAnnouncementBanner.module.css';

interface Announcement {
    id: string;
    title: string;
    message: string;
    type: 'info' | 'warning' | 'success' | 'urgent';
    createdAt: string;
    expiresAt?: string;
    createdBy: string;
    createdByName?: string;
}

interface ClubAnnouncementBannerProps {
    clubId?: string;  // Optional - will auto-detect from route if not provided
    onDismiss?: (announcementId: string) => void;
}

export default function ClubAnnouncementBanner({
    clubId: propClubId,
    onDismiss
}: ClubAnnouncementBannerProps) {
    // Auto-detect clubId from route params if not provided
    const { clubId: routeClubId } = useParams<{ clubId?: string }>();
    const clubId = propClubId || routeClubId;

    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!clubId) {
            setLoading(false);
            return;
        }
        loadAnnouncements();
        // Load dismissed from localStorage
        const stored = localStorage.getItem(`dismissed_announcements_${clubId}`);
        if (stored) {
            setDismissed(new Set(JSON.parse(stored)));
        }
    }, [clubId]);

    const loadAnnouncements = async () => {
        setLoading(true);
        try {
            const now = new Date().toISOString();
            const { data, error } = await supabase
                .from('club_announcements')
                .select(`
                    id,
                    title,
                    message,
                    type,
                    created_at,
                    expires_at,
                    created_by,
                    profiles(display_name)
                `)
                .eq('club_id', clubId)
                .eq('is_active', true)
                .or(`expires_at.is.null,expires_at.gt.${now}`)
                .order('created_at', { ascending: false })
                .limit(5);

            if (!error && data) {
                const mapped: Announcement[] = data.map((a: any) => ({
                    id: a.id,
                    title: a.title,
                    message: a.message,
                    type: a.type || 'info',
                    createdAt: a.created_at,
                    expiresAt: a.expires_at,
                    createdBy: a.created_by,
                    createdByName: a.profiles?.display_name
                }));
                setAnnouncements(mapped);
            }
        } catch (error) {
            console.error('Failed to load announcements:', error);
        }
        setLoading(false);
    };

    const dismiss = (id: string) => {
        const newDismissed = new Set(dismissed).add(id);
        setDismissed(newDismissed);
        localStorage.setItem(`dismissed_announcements_${clubId}`, JSON.stringify([...newDismissed]));
        onDismiss?.(id);
    };

    const getTypeIcon = (type: string): string => {
        switch (type) {
            case 'info': return 'i';
            case 'warning': return '!';
            case 'success': return '✓';
            case 'urgent': return '!!';
            default: return 'i';
        }
    };

    const getTypeClass = (type: string): string => {
        switch (type) {
            case 'info': return styles.info;
            case 'warning': return styles.warning;
            case 'success': return styles.success;
            case 'urgent': return styles.urgent;
            default: return '';
        }
    };

    const formatDate = (dateStr: string): string => {
        const date = new Date(dateStr);
        return date.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric'
        });
    };

    const visibleAnnouncements = announcements.filter(a => !dismissed.has(a.id));

    if (loading || visibleAnnouncements.length === 0) {
        return null;
    }

    const current = visibleAnnouncements[currentIndex % visibleAnnouncements.length];

    return (
        <div className={`${styles.banner} ${getTypeClass(current.type)}`}>
            <div className={styles.content}>
                <span className={styles.icon}>{getTypeIcon(current.type)}</span>
                <div className={styles.text}>
                    <span className={styles.title}>{current.title}</span>
                    <span className={styles.message}>{current.message}</span>
                </div>
            </div>

            <div className={styles.meta}>
                {current.createdByName && (
                    <span className={styles.author}>
                        — {current.createdByName}, {formatDate(current.createdAt)}
                    </span>
                )}
            </div>

            <div className={styles.actions}>
                {visibleAnnouncements.length > 1 && (
                    <div className={styles.pagination}>
                        <button onClick={() => setCurrentIndex(prev => prev - 1)}>‹</button>
                        <span>{(currentIndex % visibleAnnouncements.length) + 1}/{visibleAnnouncements.length}</span>
                        <button onClick={() => setCurrentIndex(prev => prev + 1)}>›</button>
                    </div>
                )}
                <button
                    className={styles.dismissBtn}
                    onClick={() => dismiss(current.id)}
                >
                    ✕
                </button>
            </div>
        </div>
    );
}

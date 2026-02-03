/**
 * ♠ CLUB ARENA — Spectator Mode
 * Watch live tables without playing
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import './SpectatorMode.css';

interface Spectator {
    id: string;
    username: string;
    avatar?: string;
    joinedAt: string;
}

interface SpectatorModeProps {
    tableId: string;
    isSpectating?: boolean;
    onJoinTable?: () => void;
    onLeave?: () => void;
}

export const SpectatorMode: React.FC<SpectatorModeProps> = ({
    tableId,
    isSpectating = true,
    onJoinTable,
    onLeave,
}) => {
    const [spectators, setSpectators] = useState<Spectator[]>([]);
    const [viewerCount, setViewerCount] = useState(0);
    const [isExpanded, setIsExpanded] = useState(false);
    const [chatEnabled, setChatEnabled] = useState(true);

    useEffect(() => {
        loadSpectators();
        subscribeToSpectators();
    }, [tableId]);

    const loadSpectators = async () => {
        const { data } = await supabase
            .from('table_spectators')
            .select('*, profiles(username, avatar_url)')
            .eq('table_id', tableId);

        if (data) {
            setSpectators(data.map((s: any) => ({
                id: s.user_id,
                username: s.profiles?.username || 'Anonymous',
                avatar: s.profiles?.avatar_url,
                joinedAt: s.created_at,
            })));
            setViewerCount(data.length);
        }
    };

    const subscribeToSpectators = () => {
        const channel = supabase
            .channel(`table-spectators-${tableId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'table_spectators',
                filter: `table_id=eq.${tableId}`,
            }, () => {
                loadSpectators();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    };

    return (
        <div className={`spectator-mode ${isSpectating ? 'active' : ''}`}>
            {/* Spectator Banner */}
            {isSpectating && (
                <div className="spectator-banner">
                    <span className="live-badge">● LIVE</span>
                    <span className="spectator-text">You are spectating</span>
                    <div className="banner-actions">
                        <button className="btn-join" onClick={onJoinTable}>
                            Join Table
                        </button>
                        <button className="btn-leave" onClick={onLeave}>
                            Leave
                        </button>
                    </div>
                </div>
            )}

            {/* Viewer Count */}
            <button
                className="viewer-count"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className="eye-icon">👁</span>
                <span>{viewerCount}</span>
            </button>

            {/* Spectator List */}
            {isExpanded && (
                <div className="spectator-list">
                    <div className="list-header">
                        <h4>Spectators ({viewerCount})</h4>
                        <button className="close-btn" onClick={() => setIsExpanded(false)}>
                            ✕
                        </button>
                    </div>
                    <div className="spectators">
                        {spectators.length === 0 ? (
                            <p className="empty">No spectators</p>
                        ) : (
                            spectators.map((s) => (
                                <div key={s.id} className="spectator-item">
                                    <div className="spectator-avatar">
                                        {s.avatar ? (
                                            <img src={s.avatar} alt={s.username} />
                                        ) : (
                                            <span>{s.username[0]}</span>
                                        )}
                                    </div>
                                    <span className="spectator-name">{s.username}</span>
                                </div>
                            ))
                        )}
                    </div>
                    <div className="list-footer">
                        <label className="chat-toggle">
                            <input
                                type="checkbox"
                                checked={chatEnabled}
                                onChange={(e) => setChatEnabled(e.target.checked)}
                            />
                            <span>Show chat</span>
                        </label>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SpectatorMode;

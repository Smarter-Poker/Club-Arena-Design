/**
 *  CLUB MEMBERS PAGE — Member Management with Live Presence
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useUserStore } from '../stores/useUserStore';
import './ClubMembersPage.css';

interface ClubMember {
    id: string;
    user_id: string;
    username: string;
    avatar_url?: string;
    role: 'owner' | 'admin' | 'agent' | 'player';
    chip_balance: number;
    joined_at: string;
    is_online: boolean;
    last_active?: string;
}

type MemberFilter = 'all' | 'online' | 'agents' | 'admins';

export default function ClubMembersPage() {
    const navigate = useNavigate();
    const { clubId } = useParams();
    const { user } = useUserStore();

    const [members, setMembers] = useState<ClubMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<MemberFilter>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (clubId) loadMembers();
    }, [clubId]);

    // Real-time presence tracking for club members
    useEffect(() => {
        if (!clubId || !user?.id) return;

        const channel = supabase.channel(`club-members-${clubId}`);

        channel
            .on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState();
                const onlineIds = new Set<string>();
                Object.values(state).forEach(presences => {
                    (presences as any[]).forEach(p => onlineIds.add(p.user_id));
                });
                setOnlineUserIds(onlineIds);
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await channel.track({ user_id: user.id, club_id: clubId });
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [clubId, user?.id]);

    const loadMembers = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('club_memberships')
                .select(`
                    id,
                    user_id,
                    role,
                    chip_balance,
                    joined_at,
                    profiles:user_id (
                        username,
                        avatar_url
                    )
                `)
                .eq('club_id', clubId)
                .eq('status', 'active');

            if (!error && data) {
                setMembers(data.map((m: any) => ({
                    id: m.id,
                    user_id: m.user_id,
                    username: m.profiles?.username || 'Unknown',
                    avatar_url: m.profiles?.avatar_url,
                    role: m.role,
                    chip_balance: m.chip_balance || 0,
                    joined_at: m.joined_at,
                    is_online: onlineUserIds.has(m.user_id),
                    last_active: undefined,
                })));
            }
        } catch (error) {
            console.error('Failed to load members:', error);
        }
        setLoading(false);
    };

    // Update member online status when presence changes
    const membersWithStatus = members.map(m => ({
        ...m,
        is_online: onlineUserIds.has(m.user_id),
    }));

    const filteredMembers = membersWithStatus.filter(m => {
        if (filter === 'online' && !m.is_online) return false;
        if (filter === 'agents' && m.role !== 'agent') return false;
        if (filter === 'admins' && !['owner', 'admin'].includes(m.role)) return false;
        if (searchQuery && !m.username.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });

    const getRoleBadge = (role: string): string => {
        switch (role) {
            case 'owner': return '';
            case 'admin': return '';
            case 'agent': return '👔';
            default: return '';
        }
    };

    const onlineCount = membersWithStatus.filter(m => m.is_online).length;

    return (
        <div className="club-members-page">
            <div className="members-summary">
                <div className="summary-stat">
                    <span className="stat-value">{members.length}</span>
                    <span className="stat-label">Total Members</span>
                </div>
                <div className="summary-stat online">
                    <span className="stat-value">{onlineCount}</span>
                    <span className="stat-label">Online Now</span>
                </div>
            </div>

            <div className="members-search">
                <input
                    type="text"
                    placeholder="Search members..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>

            <div className="members-filters">
                {(['all', 'online', 'agents', 'admins'] as MemberFilter[]).map(f => (
                    <button
                        key={f}
                        className={filter === f ? 'active' : ''}
                        onClick={() => setFilter(f)}
                    >
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                ))}
            </div>

            <div className="members-list">
                {loading ? (
                    <div className="loading-state"><div className="spinner" /></div>
                ) : filteredMembers.length === 0 ? (
                    <div className="empty-state">
                        <p>No members found</p>
                    </div>
                ) : (
                    filteredMembers.map(member => (
                        <div
                            key={member.id}
                            className="member-row"
                            onClick={() => navigate(`/profile/${member.user_id}`)}
                        >
                            <div className="member-avatar">
                                {member.avatar_url ? (
                                    <img src={member.avatar_url} alt="" />
                                ) : (
                                    <span>{member.username[0]?.toUpperCase()}</span>
                                )}
                                {member.is_online && <span className="online-dot" />}
                            </div>
                            <div className="member-info">
                                <span className="member-name">
                                    {getRoleBadge(member.role)} {member.username}
                                </span>
                                <span className="member-role">{member.role}</span>
                            </div>
                            <div className="member-balance">
                                ${member.chip_balance.toLocaleString()}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

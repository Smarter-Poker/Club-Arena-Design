/**
 *  CLUB MEMBERS PAGE — Member Management with Live Presence
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useUserStore } from '../stores/useUserStore';
import { masterBus } from '../core/MasterBus';
import { useVirtualScroll } from '../hooks/useVirtualScroll';
import ClubBottomNav from '../components/club/ClubBottomNav';
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
    const [searchParams] = useSearchParams();
    const { clubId: routeClubId } = useParams();
    const clubId = routeClubId || searchParams.get('club') || undefined;
    const { user } = useUserStore();

    const [members, setMembers] = useState<ClubMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<MemberFilter>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
    const [userRole, setUserRole] = useState<'owner' | 'admin' | 'agent' | 'member'>('member');
    const [visibleMembers, setVisibleMembers] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (clubId) loadMembers();
    }, [clubId]);

    // Stagger animation for members
    useEffect(() => {
        if (members.length === 0) return;
        setVisibleMembers(new Set());
        members.forEach((member, index) => {
            setTimeout(() => {
                setVisibleMembers(prev => new Set(prev).add(member.id));
            }, index * 60);
        });
    }, [members]);

    // Real-time club members table updates
    useEffect(() => {
        if (!clubId) return;

        const channelKey = `club-members-sync-${clubId}`;
        const channel = masterBus.getOrCreateChannel(channelKey);
        channel
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'club_members',
                    filter: `club_id=eq.${clubId}`,
                },
                () => {
                    loadMembers();
                }
            )
            .subscribe();

        return () => {
            masterBus.removeRegisteredChannel(channelKey);
        };
    }, [clubId]);

    // Real-time presence tracking for club members
    useEffect(() => {
        if (!clubId || !user?.id) return;

        const presenceKey = `club-members-${clubId}`;
        const channel = masterBus.getOrCreateChannel(presenceKey);

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
            masterBus.removeRegisteredChannel(presenceKey);
        };
    }, [clubId, user?.id]);

    const loadMembers = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('club_members')
                .select(`
                    user_id,
                    role,
                    chip_balance,
                    joined_at,
                    profiles!inner (
                        username,
                        avatar_url
                    )
                `)
                .eq('club_id', clubId)
                .not('status', 'in', '("banned","suspended")');

            if (!error && data) {
                setMembers(data.map((m: any) => ({
                    id: m.user_id,
                    user_id: m.user_id,
                    username: m.profiles?.username || 'Unknown',
                    avatar_url: m.profiles?.avatar_url,
                    role: m.role,
                    chip_balance: m.chip_balance || 0,
                    joined_at: m.joined_at,
                    is_online: onlineUserIds.has(m.user_id),
                    last_active: undefined,
                })));

                // Fetch current user's role
                if (user?.id) {
                    const { data: memberData } = await supabase
                        .from('club_members')
                        .select('role')
                        .eq('club_id', clubId)
                        .eq('user_id', user.id)
                        .single();

                    if (memberData) {
                        setUserRole(memberData.role || 'member');
                    }
                }
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

    // Virtual scrolling: only render visible members for large clubs
    const virtualScroll = useVirtualScroll(filteredMembers, { initialCount: 30, pageSize: 20 });

    const getRoleBadge = (role: string): string => {
        switch (role) {
            case 'owner': return '★';
            case 'admin': return '▲';
            case 'agent': return '●';
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

            <div className="members-list" ref={virtualScroll.containerRef}>
                {loading ? (
                    <div className="loading-state"><div className="spinner" /></div>
                ) : filteredMembers.length === 0 ? (
                    <div className="empty-state">
                        <p>No members found</p>
                    </div>
                ) : (
                    <>
                    {virtualScroll.visibleItems.map(member => (
                        <div
                            key={member.id}
                            className={`member-row ${visibleMembers.has(member.id) ? 'fadeInUp' : 'hidden'}`}
                            style={visibleMembers.has(member.id) ? undefined : { opacity: 0, transform: 'translateY(8px)' }}
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
                                {member.chip_balance.toLocaleString()}
                            </div>
                        </div>
                    ))}
                    {virtualScroll.hasMore && (
                        <div ref={virtualScroll.sentinelRef} style={{ height: 1 }} />
                    )}
                    {virtualScroll.hasMore && (
                        <div style={{ textAlign: 'center', padding: '8px', color: '#6b7a8a', fontSize: '0.7rem' }}>
                            Showing {virtualScroll.visibleCount} of {virtualScroll.totalCount}
                        </div>
                    )}
                    </>
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

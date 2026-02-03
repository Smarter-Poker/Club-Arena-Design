/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CLUB ENGINE — Club Detail Page
 * Complete club management with tables, members, settings, and finances
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import styles from './ClubDetailPage.module.css';
import ClubHome from '../components/club/ClubHome';
import CurrencyStore from '../components/club/CurrencyStore';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface ClubData {
    id: string;
    clubId: number;
    name: string;
    description: string;
    avatarUrl: string;
    isPublic: boolean;
    requiresApproval: boolean;
    memberCount: number;
    tableCount: number;
    activeTableCount: number;
    createdAt: string;
    settings: ClubSettings;
}

interface ClubSettings {
    defaultRakePercent: number;
    rakeCap: number;
    timeBankSeconds: number;
    allowStraddle: boolean;
    allowRunItTwice: boolean;
    minBuyInBB: number;
    maxBuyInBB: number;
}

interface ClubMember {
    id: string;
    username: string;
    role: 'owner' | 'admin' | 'agent' | 'member';
    chipBalance: number;
    status: 'active' | 'pending' | 'suspended';
    joinedAt: string;
    lastActive?: string;
}

interface ClubTable {
    id: string;
    name: string;
    gameVariant: string;
    stakes: string;
    currentPlayers: number;
    maxPlayers: number;
    status: 'waiting' | 'running' | 'paused';
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

const TabButton = ({
    active,
    onClick,
    icon,
    label
}: {
    active: boolean;
    onClick: () => void;
    icon: string;
    label: string;
}) => (
    <button
        className={`${styles.tab} ${active ? styles.activeTab : ''}`}
        onClick={onClick}
    >
        <span>{icon}</span>
        <span>{label}</span>
    </button>
);

const StatCard = ({ value, label, icon }: { value: string | number; label: string; icon: string }) => (
    <div className={styles.statCard}>
        <span className={styles.statIcon}>{icon}</span>
        <div className={styles.statInfo}>
            <span className={styles.statValue}>{value}</span>
            <span className={styles.statLabel}>{label}</span>
        </div>
    </div>
);

const RoleBadge = ({ role }: { role: string }) => {
    const colors: Record<string, string> = {
        owner: '#f59e0b',
        admin: '#3b82f6',
        agent: '#8b5cf6',
        member: '#6b7280',
    };
    return (
        <span className={styles.roleBadge} style={{ backgroundColor: colors[role] || colors.member }}>
            {role.toUpperCase()}
        </span>
    );
};

const StatusBadge = ({ status }: { status: string }) => {
    const colors: Record<string, string> = {
        active: '#10b981',
        pending: '#f59e0b',
        suspended: '#ef4444',
        running: '#10b981',
        waiting: '#6b7280',
        paused: '#f59e0b',
    };
    return (
        <span className={styles.statusBadge} style={{ backgroundColor: colors[status] || '#6b7280' }}>
            {status}
        </span>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from '../lib/supabase';
import { presenceService } from '../services/PresenceService';
import ClubActivityFeed from '../components/club/ClubActivityFeed';
import CreateTableModal from '../components/club/CreateTableModal';
import { MembershipService } from '../services/MembershipService';
import { ClubService } from '../services/ClubService';
import ClubAnnouncementBanner from '../components/club/ClubAnnouncementBanner';
import MissionPanel from '../components/club/MissionPanel';
import ClubStatsCards from '../components/club/ClubStatsCards';
import { useClubStore } from '../stores/useClubStore';
import MemberList from '../components/club/MemberList';
import AgentManager from '../components/club/AgentManager';
import { AgentService } from '../services/AgentService';
import type { Agent } from '../services/AgentService';
import { useToast } from '../components/common/Toast';
import { ClubsService } from '../services/ClubsService';
import DailyChallengesWidget from '../components/rewards/DailyChallengesWidget';
import ClubBottomNav from '../components/club/ClubBottomNav';

export default function ClubDetailPage() {
    const { clubId } = useParams();
    const toast = useToast();
    const [activeTab, setActiveTab] = useState<'overview' | 'tables' | 'members' | 'agents' | 'settings'>('overview');
    const [club, setClub] = useState<ClubData | null>(null);
    const [members, setMembers] = useState<ClubMember[]>([]);
    const [filteredMembers, setFilteredMembers] = useState<ClubMember[]>([]);
    const [memberSearch, setMemberSearch] = useState('');
    const [tables, setTables] = useState<ClubTable[]>([]);
    const [loading, setLoading] = useState(true);
    const [onlineCount, setOnlineCount] = useState(0);
    const [showCreateTable, setShowCreateTable] = useState(false);
    const [agents, setAgents] = useState<Agent[]>([]);
    const [agentsLoading, setAgentsLoading] = useState(false);
    const [showAgentManager, setShowAgentManager] = useState(false);
    const [savingSettings, setSavingSettings] = useState(false);
    const [editedSettings, setEditedSettings] = useState<Partial<ClubSettings>>({});
    const [showMemberMenu, setShowMemberMenu] = useState<string | null>(null);
    const [userRole, setUserRole] = useState<'owner' | 'admin' | 'agent' | 'member'>('member');

    useEffect(() => {
        loadClubData();
    }, [clubId]);

    // Filter members when search changes
    useEffect(() => {
        if (!memberSearch.trim()) {
            setFilteredMembers(members);
        } else {
            const search = memberSearch.toLowerCase();
            setFilteredMembers(members.filter(m =>
                m.username.toLowerCase().includes(search)
            ));
        }
    }, [memberSearch, members]);

    // Load agents when agents tab is selected
    useEffect(() => {
        if (activeTab === 'agents' && clubId && agents.length === 0 && !agentsLoading) {
            setAgentsLoading(true);
            AgentService.getAgents(clubId)
                .then(setAgents)
                .catch(err => console.error('Failed to load agents:', err))
                .finally(() => setAgentsLoading(false));
        }
    }, [activeTab, clubId]);

    // Real-time presence tracking
    useEffect(() => {
        if (!clubId) return;

        // Get current user ID from supabase auth
        const setupPresence = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            await presenceService.joinClub(clubId, user.id, {
                onSync: (state) => {
                    setOnlineCount(Object.keys(state).length);
                }
            });

            // Set initial count
            setOnlineCount(presenceService.getClubOnlineCount(clubId));
        };

        setupPresence();

        return () => {
            presenceService.leave(`club:${clubId}`);
        };
    }, [clubId]);

    const loadClubData = async () => {
        if (!clubId) {
            setLoading(false);
            return;
        }

        setLoading(true);

        try {
            // Load club from Supabase
            const { data: clubData, error: clubError } = await supabase
                .from('clubs')
                .select('*')
                .eq('id', clubId)
                .single();

            if (clubError || !clubData) {
                console.error('[ClubDetailPage] Failed to load club:', clubError);
                setLoading(false);
                return;
            }

            // Map to our internal format
            const mappedClub: ClubData = {
                id: clubData.id,
                clubId: clubData.club_id || 0,
                name: clubData.name,
                description: clubData.description || '',
                avatarUrl: clubData.avatar_url || '',
                isPublic: clubData.is_public ?? true,
                requiresApproval: clubData.requires_approval ?? false,
                memberCount: clubData.member_count || 0,
                tableCount: clubData.table_count || 0,
                activeTableCount: 0,
                createdAt: clubData.created_at,
                settings: {
                    defaultRakePercent: clubData.default_rake_percent || 5,
                    rakeCap: clubData.rake_cap || 3,
                    timeBankSeconds: clubData.time_bank_seconds || 30,
                    allowStraddle: clubData.allow_straddle ?? true,
                    allowRunItTwice: clubData.allow_run_it_twice ?? true,
                    minBuyInBB: clubData.min_buyin_bb || 40,
                    maxBuyInBB: clubData.max_buyin_bb || 200,
                },
            };
            setClub(mappedClub);

            // Load members
            const { data: memberData } = await supabase
                .from('club_members')
                .select('*, profiles(username, display_name)')
                .eq('club_id', clubId)
                .limit(50);

            if (memberData) {
                const mappedMembers: ClubMember[] = memberData.map((m: any) => ({
                    id: m.user_id,
                    username: m.profiles?.display_name || m.profiles?.username || 'Unknown',
                    role: m.role || 'member',
                    chipBalance: m.chip_balance || 0,
                    status: m.status || 'active',
                    joinedAt: m.created_at,
                    lastActive: m.last_active,
                }));
                setMembers(mappedMembers);

                // Determine current user's role in this club
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const currentUserMember = memberData.find((m: any) => m.user_id === user.id);
                    if (currentUserMember) {
                        setUserRole(currentUserMember.role || 'member');
                    }
                }
            }

            // Load tables
            const { data: tableData } = await supabase
                .from('tables')
                .select('*')
                .eq('club_id', clubId);

            if (tableData) {
                const mappedTables: ClubTable[] = tableData.map((t: any) => ({
                    id: t.id,
                    name: t.name || 'Table',
                    gameVariant: t.game_type || 'NLH',
                    stakes: t.stakes || '1/2',
                    currentPlayers: t.current_players || 0,
                    maxPlayers: t.max_players || 6,
                    status: t.status || 'waiting',
                }));
                setTables(mappedTables);

                // Count active tables
                const activeCount = mappedTables.filter(t => t.status === 'running').length;
                setClub(prev => prev ? { ...prev, activeTableCount: activeCount } : null);
            }

        } catch (error) {
            console.error('[ClubDetailPage] Error loading data:', error);
        } finally {
            setLoading(false);
        }
    };

    // Save settings handler
    const handleSaveSettings = async () => {
        if (!clubId || !club) return;
        setSavingSettings(true);
        try {
            const updates = {
                name: (document.getElementById('clubName') as HTMLInputElement)?.value || club.name,
                description: (document.getElementById('clubDesc') as HTMLTextAreaElement)?.value || club.description,
                is_public: (document.getElementById('clubPublic') as HTMLInputElement)?.checked ?? club.isPublic,
                requires_approval: (document.getElementById('clubApproval') as HTMLInputElement)?.checked ?? club.requiresApproval,
                default_rake_percent: Number((document.getElementById('rakePercent') as HTMLInputElement)?.value) || club.settings.defaultRakePercent,
                rake_cap: Number((document.getElementById('rakeCap') as HTMLInputElement)?.value) || club.settings.rakeCap,
                min_buyin_bb: Number((document.getElementById('minBuyin') as HTMLInputElement)?.value) || club.settings.minBuyInBB,
                max_buyin_bb: Number((document.getElementById('maxBuyin') as HTMLInputElement)?.value) || club.settings.maxBuyInBB,
                time_bank_seconds: Number((document.getElementById('timeBank') as HTMLInputElement)?.value) || club.settings.timeBankSeconds,
                allow_straddle: (document.getElementById('allowStraddle') as HTMLInputElement)?.checked ?? club.settings.allowStraddle,
                allow_run_it_twice: (document.getElementById('allowRIT') as HTMLInputElement)?.checked ?? club.settings.allowRunItTwice,
            };
            await ClubsService.updateClub(clubId, updates);
            toast.success('Settings saved successfully!');
            loadClubData(); // Reload to get fresh data
        } catch (error) {
            console.error('Failed to save settings:', error);
            toast.error('Failed to save settings');
        } finally {
            setSavingSettings(false);
        }
    };

    // Member action handlers
    const handleMemberAction = async (memberId: string, action: 'promote' | 'demote' | 'suspend' | 'remove') => {
        if (!clubId) return;
        setShowMemberMenu(null);
        try {
            switch (action) {
                case 'promote':
                    await MembershipService.updateRole(memberId, 'admin' as any);
                    toast.success('Member promoted to admin');
                    break;
                case 'demote':
                    await MembershipService.updateRole(memberId, 'member' as any);
                    toast.success('Member demoted');
                    break;
                case 'suspend':
                    await MembershipService.updateStatus(memberId, 'suspended' as any);
                    toast.success('Member suspended');
                    break;
                case 'remove':
                    await MembershipService.removeMember(memberId);
                    toast.success('Member removed');
                    break;
            }
            loadClubData();
        } catch (error) {
            toast.error(`Failed to ${action} member`);
        }
    };

    if (loading) {
        return (
            <div className={styles.loading}>
                <div className={styles.spinner} />
                <p>Loading club...</p>
            </div>
        );
    }

    if (!club) {
        return (
            <div className={styles.error}>
                <h2>Club Not Found</h2>
                <p>The club you're looking for doesn't exist.</p>
                <Link to="/clubs" className={styles.backLink}>← Back to Clubs</Link>
            </div>
        );
    }


    return (
        <div className={styles.page}>
            {/* Quick Stats */}
            <section className={styles.statsRow}>
                <StatCard value={onlineCount} label="Online Now" icon="" />
                <StatCard value={club.memberCount} label="Members" icon="" />
                <StatCard value={club.activeTableCount} label="Active Tables" icon="" />
                <StatCard value={`${club.settings.defaultRakePercent}%`} label="Rake" icon="" />
            </section>

            {/* Tab Navigation */}
            <nav className={styles.tabNav}>
                <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} icon="" label="Overview" />
                <TabButton active={activeTab === 'tables'} onClick={() => setActiveTab('tables')} icon="" label="Tables" />
                <TabButton active={activeTab === 'members'} onClick={() => setActiveTab('members')} icon="" label="Members" />
                <TabButton active={activeTab === 'agents'} onClick={() => setActiveTab('agents')} icon="️" label="Agents" />
                <TabButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon="" label="Settings" />
            </nav>

            {/* Tab Content */}
            <section className={styles.tabContent}>
                {/* Overview Tab */}
                {activeTab === 'overview' && (
                    <div className={styles.overviewGrid}>
                        {/* Active Tables */}
                        <div className={styles.card}>
                            <h3> Active Tables</h3>
                            {tables.filter(t => t.status === 'running').length === 0 ? (
                                <p className={styles.emptyText}>No active tables</p>
                            ) : (
                                <div className={styles.tableList}>
                                    {tables.filter(t => t.status === 'running').map(table => (
                                        <Link key={table.id} to={`/table/${table.id}`} className={styles.tableRow}>
                                            <span className={styles.tableName}>{table.name}</span>
                                            <span className={styles.tableVariant}>{table.gameVariant}</span>
                                            <span className={styles.tableStakes}>{table.stakes}</span>
                                            <span className={styles.tablePlayers}>{table.currentPlayers}/{table.maxPlayers}</span>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Recent Members */}
                        <div className={styles.card}>
                            <h3> Recent Members</h3>
                            <div className={styles.memberList}>
                                {members.slice(0, 5).map(member => (
                                    <div key={member.id} className={styles.memberRow}>
                                        <div className={styles.memberAvatar}>{member.username.charAt(0)}</div>
                                        <span className={styles.memberName}>{member.username}</span>
                                        <RoleBadge role={member.role} />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Club Rules */}
                        <div className={styles.card}>
                            <h3> Club Rules</h3>
                            <ul className={styles.rulesList}>
                                <li>Minimum buy-in: {club.settings.minBuyInBB} BB</li>
                                <li>Maximum buy-in: {club.settings.maxBuyInBB} BB</li>
                                <li>Rake: {club.settings.defaultRakePercent}% (capped at {club.settings.rakeCap} BB)</li>
                                <li>Straddle: {club.settings.allowStraddle ? 'Allowed' : 'Not allowed'}</li>
                                <li>Run it twice: {club.settings.allowRunItTwice ? 'Allowed' : 'Not allowed'}</li>
                            </ul>
                        </div>

                        {/* Daily Challenges */}
                        <div className={styles.card}>
                            <DailyChallengesWidget />
                        </div>

                        {/* Club Activity Feed */}
                        <div className={styles.card} style={{ gridColumn: '1 / -1' }}>
                            <h3> Recent Activity</h3>
                            {clubId && <ClubActivityFeed clubId={clubId} limit={10} />}
                        </div>
                    </div>
                )}

                {/* Tables Tab */}
                {activeTab === 'tables' && (
                    <div className={styles.tablesContainer}>
                        <div className={styles.tablesHeader}>
                            <h3>All Tables ({tables.length})</h3>
                            <button className={styles.createButton} onClick={() => setShowCreateTable(true)}>+ Create Table</button>
                        </div>
                        <div className={styles.tablesGrid}>
                            {tables.map(table => (
                                <div key={table.id} className={styles.tableCard}>
                                    <div className={styles.tableCardHeader}>
                                        <h4>{table.name}</h4>
                                        <StatusBadge status={table.status} />
                                    </div>
                                    <div className={styles.tableCardBody}>
                                        <div className={styles.tableInfo}>
                                            <span>{table.gameVariant}</span>
                                            <span>{table.stakes}</span>
                                        </div>
                                        <div className={styles.tableSeats}>
                                            {table.currentPlayers}/{table.maxPlayers} players
                                        </div>
                                    </div>
                                    <Link to={`/table/${table.id}`} className={styles.joinButton}>
                                        {table.currentPlayers < table.maxPlayers ? 'Join' : 'Watch'}
                                    </Link>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Members Tab */}
                {activeTab === 'members' && (
                    <div className={styles.membersContainer}>
                        <div className={styles.membersHeader}>
                            <h3>All Members ({filteredMembers.length})</h3>
                            <input
                                type="search"
                                placeholder="Search members..."
                                className={styles.searchInput}
                                value={memberSearch}
                                onChange={(e) => setMemberSearch(e.target.value)}
                            />
                        </div>
                        <table className={styles.membersTable}>
                            <thead>
                                <tr>
                                    <th>Player</th>
                                    <th>Role</th>
                                    <th>Balance</th>
                                    <th>Status</th>
                                    <th>Joined</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredMembers.map(member => (
                                    <tr key={member.id}>
                                        <td>
                                            <div className={styles.memberCell}>
                                                <div className={styles.memberAvatarSmall}>{member.username.charAt(0)}</div>
                                                {member.username}
                                            </div>
                                        </td>
                                        <td><RoleBadge role={member.role} /></td>
                                        <td className={styles.balanceCell}>{member.chipBalance.toLocaleString()}</td>
                                        <td><StatusBadge status={member.status} /></td>
                                        <td className={styles.dateCell}>{new Date(member.joinedAt).toLocaleDateString()}</td>
                                        <td style={{ position: 'relative' }}>
                                            <button
                                                className={styles.actionBtn}
                                                onClick={() => setShowMemberMenu(showMemberMenu === member.id ? null : member.id)}
                                            >
                                                ⋮
                                            </button>
                                            {showMemberMenu === member.id && (
                                                <div className={styles.memberMenu}>
                                                    {member.role !== 'admin' && member.role !== 'owner' && (
                                                        <button onClick={() => handleMemberAction(member.id, 'promote')}> Promote</button>
                                                    )}
                                                    {member.role === 'admin' && (
                                                        <button onClick={() => handleMemberAction(member.id, 'demote')}> Demote</button>
                                                    )}
                                                    {member.status === 'active' && member.role !== 'owner' && (
                                                        <button onClick={() => handleMemberAction(member.id, 'suspend')}>Suspend</button>
                                                    )}
                                                    {member.role !== 'owner' && (
                                                        <button onClick={() => handleMemberAction(member.id, 'remove')}>️ Remove</button>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Agents Tab */}
                {activeTab === 'agents' && (
                    <div className={styles.agentsContainer}>
                        <div className={styles.agentsHeader}>
                            <h3>️ Club Agents</h3>
                            <button className={styles.createButton} onClick={() => setShowAgentManager(true)}>
                                + Manage Agents
                            </button>
                        </div>
                        {agentsLoading ? (
                            <div className={styles.emptyState}>
                                <div className={styles.spinner} />
                                <p>Loading agents...</p>
                            </div>
                        ) : agents.length === 0 ? (
                            <div className={styles.emptyState}>
                                <p>No agents assigned to this club yet.</p>
                                <p className={styles.emptyHint}>Agents help recruit players and earn commission on rake.</p>
                                <button className={styles.createButton} onClick={() => setShowAgentManager(true)}>
                                    ️ Add First Agent
                                </button>
                            </div>
                        ) : (
                            <div className={styles.agentsList}>
                                {agents.map(agent => (
                                    <div key={agent.id} className={styles.agentCard}>
                                        <div className={styles.agentAvatar}>
                                            {agent.displayName?.charAt(0) || '?'}
                                        </div>
                                        <div className={styles.agentInfo}>
                                            <span className={styles.agentName}>{agent.displayName || 'Unknown'}</span>
                                            <span className={styles.agentRole}>{agent.role}</span>
                                        </div>
                                        <div className={styles.agentStats}>
                                            <div className={styles.agentStat}>
                                                <span className={styles.statLabel}>Players</span>
                                                <span className={styles.statValue}>{agent.totalPlayers}</span>
                                            </div>
                                            <div className={styles.agentStat}>
                                                <span className={styles.statLabel}>Commission</span>
                                                <span className={styles.statValue}>{agent.commissionRate}%</span>
                                            </div>
                                            <div className={styles.agentStat}>
                                                <span className={styles.statLabel}>Lifetime</span>
                                                <span className={styles.statValue}>${agent.lifetimeEarnings.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Settings Tab */}
                {activeTab === 'settings' && (
                    <div className={styles.settingsContainer}>
                        <div className={styles.settingsSection}>
                            <h3> General</h3>
                            <div className={styles.settingRow}>
                                <label>Club Name</label>
                                <input id="clubName" type="text" defaultValue={club.name} className={styles.textInput} />
                            </div>
                            <div className={styles.settingRow}>
                                <label>Description</label>
                                <textarea id="clubDesc" defaultValue={club.description} className={styles.textArea} rows={3} />
                            </div>
                            <div className={styles.settingRow}>
                                <label>Public Club</label>
                                <input id="clubPublic" type="checkbox" defaultChecked={club.isPublic} />
                            </div>
                            <div className={styles.settingRow}>
                                <label>Require Approval</label>
                                <input id="clubApproval" type="checkbox" defaultChecked={club.requiresApproval} />
                            </div>
                        </div>

                        <div className={styles.settingsSection}>
                            <h3> Rake Settings</h3>
                            <div className={styles.settingRow}>
                                <label>Default Rake %</label>
                                <input id="rakePercent" type="number" defaultValue={club.settings.defaultRakePercent} min={0} max={10} className={styles.numberInput} />
                            </div>
                            <div className={styles.settingRow}>
                                <label>Rake Cap (BB)</label>
                                <input id="rakeCap" type="number" defaultValue={club.settings.rakeCap} min={0} max={10} className={styles.numberInput} />
                            </div>
                        </div>

                        <div className={styles.settingsSection}>
                            <h3> Table Defaults</h3>
                            <div className={styles.settingRow}>
                                <label>Min Buy-in (BB)</label>
                                <input id="minBuyin" type="number" defaultValue={club.settings.minBuyInBB} className={styles.numberInput} />
                            </div>
                            <div className={styles.settingRow}>
                                <label>Max Buy-in (BB)</label>
                                <input id="maxBuyin" type="number" defaultValue={club.settings.maxBuyInBB} className={styles.numberInput} />
                            </div>
                            <div className={styles.settingRow}>
                                <label>Time Bank (seconds)</label>
                                <input id="timeBank" type="number" defaultValue={club.settings.timeBankSeconds} className={styles.numberInput} />
                            </div>
                            <div className={styles.settingRow}>
                                <label>Allow Straddle</label>
                                <input id="allowStraddle" type="checkbox" defaultChecked={club.settings.allowStraddle} />
                            </div>
                            <div className={styles.settingRow}>
                                <label>Allow Run It Twice</label>
                                <input id="allowRIT" type="checkbox" defaultChecked={club.settings.allowRunItTwice} />
                            </div>
                        </div>

                        <button
                            className={styles.saveButton}
                            onClick={handleSaveSettings}
                            disabled={savingSettings}
                        >
                            {savingSettings ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                )}
            </section>

            {/* Create Table Modal */}
            {showCreateTable && clubId && (
                <CreateTableModal
                    clubId={clubId}
                    onClose={() => setShowCreateTable(false)}
                    onSuccess={() => {
                        setShowCreateTable(false);
                        loadClubData();
                    }}
                />
            )}

            {/* Agent Manager - Navigate to dedicated page */}
            {showAgentManager && clubId && (
                <div className={styles.modalOverlay} onClick={() => setShowAgentManager(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h3>️ Agent Management</h3>
                            <button onClick={() => setShowAgentManager(false)}>×</button>
                        </div>
                        <div className={styles.modalContent}>
                            <p>Manage your club's agent hierarchy, create new agents, and configure commission rates.</p>
                            <Link
                                to={`/clubs/${clubId}/agents`}
                                className={styles.primaryButton}
                                onClick={() => setShowAgentManager(false)}
                            >
                                Open Agent Management
                            </Link>
                        </div>
                    </div>
                </div>
            )}

            {/* Fixed Bottom Navigation Bar */}
            {clubId && (
                <ClubBottomNav
                    clubId={clubId}
                    userRole={userRole}
                    clubName={club?.name}
                />
            )}
        </div>
    );
}

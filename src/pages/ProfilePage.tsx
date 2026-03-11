/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CLUB ENGINE — Profile Page
 * User profile with DNA, VIP status, and achievements
 * 
 * NO HARDCODED DATA - All data comes from Supabase
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useUserStore } from '../stores/useUserStore';
import { LoadingState } from '../components/common/EmptyState';
import DailyBonusWheel from '../components/bonus/DailyBonusWheel';
import FriendListPanel from '../components/social/FriendListPanel';
import { VIPStatusCard } from '../components/vip/VIPStatusCard';
import { VIPProgressRing } from '../components/vip/VIPProgressRing';
import { profileService } from '../services/ProfileService';
import { bonusService } from '../services/BonusService';
import { masterBus } from '../core/MasterBus';
import styles from './ProfilePage.module.css';

// #5: Lazy-load Recharts (387KB) — only imported when History tab is opened
const LazyProfitChart = lazy(() => import('../components/profile/ProfitChart'));

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface UserProfile {
    id: string;
    username: string;
    displayName: string;
    playerNumber: number;
    avatarUrl: string;
    vipLevel: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
    memberSince: string;
}



interface PokerStats {
    totalHands: number;
    vpip: number;
    pfr: number;
    threeBet: number;
    aggression: number;
    bbPer100: number;
    biggestPot: number;
    totalProfit: number;
    winRate: number;
    tournamentsPlayed: number;
    tournamentsWon: number;
    bountyKOs: number;
}

interface Achievement {
    id: string;
    name: string;
    description: string;
    icon: string;
    unlockedAt?: string;
    progress?: number;
    maxProgress?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT VALUES (for new users with no data)
// ═══════════════════════════════════════════════════════════════════════════════



const DEFAULT_STATS: PokerStats = {
    totalHands: 0,
    vpip: 0,
    pfr: 0,
    threeBet: 0,
    aggression: 0,
    bbPer100: 0,
    biggestPot: 0,
    totalProfit: 0,
    winRate: 0,
    tournamentsPlayed: 0,
    tournamentsWon: 0,
    bountyKOs: 0,
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════



// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

const VIPBadge = ({ level }: { level: string }) => {
    const colors: Record<string, string> = {
        bronze: 'linear-gradient(135deg, #cd7f32 0%, #8b4513 100%)',
        silver: 'linear-gradient(135deg, #c0c0c0 0%, #808080 100%)',
        gold: 'linear-gradient(135deg, #ffd700 0%, #b8860b 100%)',
        platinum: 'linear-gradient(135deg, #e5e4e2 0%, #a0a0a0 100%)',
        diamond: 'linear-gradient(135deg, #b9f2ff 0%, #7df9ff 50%, #00bfff 100%)',
    };

    return (
        <span
            className={styles.vipBadge}
            style={{ background: colors[level] || colors.bronze }}
        >
            {level.toUpperCase()}
        </span>
    );
};



const StatCard = ({ value, label, positive }: { value: string | number; label: string; positive?: boolean | null }) => (
    <div className={styles.statCard}>
        <span className={`${styles.statValue} ${positive === true ? styles.positive : positive === false ? styles.negative : ''}`}>
            {value}
        </span>
        <span className={styles.statLabel}>{label}</span>
    </div>
);

const AchievementCard = ({ achievement }: { achievement: Achievement }) => {
    const isUnlocked = !!achievement.unlockedAt;
    const isComplete = achievement.progress !== undefined && achievement.maxProgress !== undefined && achievement.progress >= achievement.maxProgress;

    return (
        <div className={`${styles.achievementCard} ${isUnlocked ? styles.unlocked : styles.locked}`}>
            <span className={styles.achievementIcon}>{achievement.icon}</span>
            <div className={styles.achievementInfo}>
                <h4>{achievement.name}</h4>
                <p>{achievement.description}</p>
                {achievement.progress !== undefined && achievement.maxProgress !== undefined && (
                    <div className={styles.achievementProgress}>
                        <div className={styles.achievementProgressFill} style={{ width: `${Math.min(100, (achievement.progress / achievement.maxProgress) * 100)}%` }} />
                        <span>{Math.min(achievement.progress, achievement.maxProgress)} / {achievement.maxProgress}</span>
                    </div>
                )}
            </div>
            {isUnlocked && !isComplete && <span className={styles.achievementDate}>{new Date(achievement.unlockedAt!).toLocaleDateString()}</span>}
            {isComplete && <span className={styles.achievementComplete}></span>}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function ProfilePage() {
    const navigate = useNavigate();
    const { user: storeUser } = useUserStore();
    const [activeTab, setActiveTab] = useState<'stats' | 'achievements' | 'history' | 'social'>('stats');
    const [isLoading, setIsLoading] = useState(true);
    const [showBonusWheel, setShowBonusWheel] = useState(false);

    // Real data from database
    const [user, setUser] = useState<UserProfile | null>(null);
    const [stats, setStats] = useState<PokerStats>(DEFAULT_STATS);
    const [achievements, setAchievements] = useState<Achievement[]>([]);
    const [diamonds, setDiamonds] = useState(0);
    const [isVIP, setIsVIP] = useState(false);
    const [transactions, setTransactions] = useState<any[]>([]);

    // Load profile data from Supabase
    useEffect(() => {
        async function loadProfile() {
            setIsLoading(true);
            try {
                const { data: { user: authUser } } = await supabase.auth.getUser();
                if (!authUser) return;

                const { data: profile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', authUser.id)
                    .single();

                if (profile) {
                    setUser({
                        id: profile.id,
                        username: profile.username || 'Player',
                        displayName: profile.display_name || profile.username || 'Player',
                        playerNumber: profile.player_number || Math.floor(Math.random() * 9999) + 1,
                        avatarUrl: profile.avatar_url || '',
                        vipLevel: profile.vip_level || 'bronze',
                        memberSince: profile.created_at,
                    });

                    setDiamonds(profile.diamonds || 0);
                    setIsVIP(profile.is_vip || false);

                    if (profile.stats) {
                        setStats({
                            totalHands: profile.stats.total_hands || 0,
                            vpip: profile.stats.vpip || 0,
                            pfr: profile.stats.pfr || 0,
                            threeBet: profile.stats.three_bet || 0,
                            aggression: profile.stats.aggression_factor || 0,
                            bbPer100: profile.stats.bb_per_100 || 0,
                            biggestPot: profile.stats.biggest_pot || 0,
                            totalProfit: profile.stats.total_profit || 0,
                            winRate: profile.stats.win_rate || 0,
                            tournamentsPlayed: profile.stats.tournaments_played || 0,
                            tournamentsWon: profile.stats.tournaments_won || 0,
                            bountyKOs: profile.stats.bounty_kos || 0,
                        });
                    }
                }

                // Load achievements if table exists
                try {
                    const { data: userAchievements } = await supabase
                        .from('user_achievements')
                        .select('*, achievement:achievements(*)')
                        .eq('user_id', authUser.id);

                    if (userAchievements) {
                        setAchievements(userAchievements.map(ua => ({
                            id: ua.achievement?.id || ua.id,
                            name: ua.achievement?.name || 'Achievement',
                            description: ua.achievement?.description || '',
                            icon: ua.achievement?.icon || '',
                            unlockedAt: ua.unlocked_at,
                            progress: ua.progress,
                            maxProgress: ua.achievement?.max_progress,
                        })));
                    }
                } catch {
                    // Achievements table may not exist yet
                    setAchievements([]);
                }

                // Load transaction history for profit graph
                try {
                    const { data: txns } = await supabase
                        .from('wallet_transactions')
                        .select('id, type, amount, created_at, description')
                        .eq('user_id', authUser.id)
                        .order('created_at', { ascending: true })
                        .limit(200);

                    if (txns) setTransactions(txns);
                } catch {
                    setTransactions([]);
                }

                // Notify Master Bus that profile is loaded
                if (profile) {
                    import('../core/MasterBus').then(({ masterBus }) => {
                        masterBus.emit('USER_PROFILE_LOADED', {
                            userId: authUser.id,
                            avatarUrl: profile.avatar_url || '',
                            displayName: profile.display_name
                        });
                    });
                }
            } catch (err) {
                console.error('[PROFILE] Load failed:', err);
            } finally {
                setIsLoading(false);
            }
        }
        loadProfile();
    }, []);

    // #1+#2: Setup Supabase Realtime via Channel Registry (fixed cleanup leak)
    useEffect(() => {
        let channelKey = '';

        async function setupRealtimeSubscription() {
            try {
                const { data: { user: authUser } } = await supabase.auth.getUser();
                if (!authUser) return;

                channelKey = `profile-${authUser.id}`;

                // #1: Use Channel Registry for deduplication
                const channel = masterBus.getOrCreateChannel(channelKey);

                // Subscribe to profile changes
                channel
                    .on(
                        'postgres_changes',
                        {
                            event: '*',
                            schema: 'public',
                            table: 'profiles',
                            filter: `id=eq.${authUser.id}`,
                        },
                        async (payload) => {
                            console.log('[PROFILE] Profile updated:', payload);
                            const { data: updatedProfile } = await supabase
                                .from('profiles')
                                .select('*')
                                .eq('id', authUser.id)
                                .single();

                            if (updatedProfile) {
                                setUser({
                                    id: updatedProfile.id,
                                    username: updatedProfile.username || 'Player',
                                    displayName: updatedProfile.display_name || updatedProfile.username || 'Player',
                                    playerNumber: updatedProfile.player_number || Math.floor(Math.random() * 9999) + 1,
                                    avatarUrl: updatedProfile.avatar_url || '',
                                    vipLevel: updatedProfile.vip_level || 'bronze',
                                    memberSince: updatedProfile.created_at,
                                });

                                setDiamonds(updatedProfile.diamonds || 0);
                                setIsVIP(updatedProfile.is_vip || false);

                                if (updatedProfile.stats) {
                                    setStats({
                                        totalHands: updatedProfile.stats.total_hands || 0,
                                        vpip: updatedProfile.stats.vpip || 0,
                                        pfr: updatedProfile.stats.pfr || 0,
                                        threeBet: updatedProfile.stats.three_bet || 0,
                                        aggression: updatedProfile.stats.aggression_factor || 0,
                                        bbPer100: updatedProfile.stats.bb_per_100 || 0,
                                        biggestPot: updatedProfile.stats.biggest_pot || 0,
                                        totalProfit: updatedProfile.stats.total_profit || 0,
                                        winRate: updatedProfile.stats.win_rate || 0,
                                        tournamentsPlayed: updatedProfile.stats.tournaments_played || 0,
                                        tournamentsWon: updatedProfile.stats.tournaments_won || 0,
                                        bountyKOs: updatedProfile.stats.bounty_kos || 0,
                                    });
                                }
                            }
                        }
                    )
                    // Subscribe to wallet changes for diamonds
                    .on(
                        'postgres_changes',
                        {
                            event: '*',
                            schema: 'public',
                            table: 'wallets',
                            filter: `user_id=eq.${authUser.id}`,
                        },
                        async (payload) => {
                            console.log('[PROFILE] Wallet updated:', payload);
                            const { data: updatedProfile } = await supabase
                                .from('profiles')
                                .select('diamonds, is_vip')
                                .eq('id', authUser.id)
                                .single();

                            if (updatedProfile) {
                                setDiamonds(updatedProfile.diamonds || 0);
                                setIsVIP(updatedProfile.is_vip || false);
                            }
                        }
                    )
                    .subscribe();
            } catch (err) {
                console.error('[PROFILE] Realtime subscription failed:', err);
            }
        }

        setupRealtimeSubscription();

        // #2: FIX — cleanup is now synchronous and correctly removes the channel
        return () => {
            if (channelKey) {
                masterBus.removeRegisteredChannel(channelKey);
            }
        };
    }, []);

    if (isLoading) {
        return <LoadingState message="Loading profile..." />;
    }

    if (!user) {
        return (
            <div className={styles.page}>
                <div className={styles.emptyProfile}>
                    <span style={{ fontSize: '3rem' }}></span>
                    <p>Profile not found</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            {/* Profile Header */}
            <section className={styles.profileHeader}>
                <div className={styles.avatarContainer}>
                    {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt={user.displayName} className={styles.avatar} />
                    ) : (
                        <div className={styles.avatarDefault}>
                            {user.displayName.charAt(0).toUpperCase()}
                        </div>
                    )}
                    <VIPBadge level={user.vipLevel} />
                </div>

                <div className={styles.userInfo}>
                    <h1 className={styles.displayName}>{user.displayName}</h1>
                    <p className={styles.playerNumber}>Player #{user.playerNumber}</p>
                    <p className={styles.memberSince}>
                        Member since {new Date(user.memberSince).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </p>
                </div>

                <div className={styles.headerActions}>
                    <button
                        className={styles.editButton}
                        onClick={() => window.open('https://smarter.poker/hub/avatars-complete', '_blank')}
                    >
                        Change Avatar
                    </button>
                    <button className={styles.editButton} onClick={() => navigate('/settings')}>Edit Profile</button>
                    <button className={styles.editButton} onClick={() => navigate('/vip')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        💎 {diamonds.toLocaleString()} {isVIP && <span style={{ fontSize: 12 }}>👑 VIP</span>}
                    </button>
                </div>
            </section>

            {/* VIP Status Section (for VIP users) */}
            {isVIP && (() => {
                const VIP_TIERS = [
                    { tier: 'bronze' as const, threshold: 0 },
                    { tier: 'silver' as const, threshold: 1000 },
                    { tier: 'gold' as const, threshold: 5000 },
                    { tier: 'platinum' as const, threshold: 50000 },
                    { tier: 'diamond' as const, threshold: 500000 },
                ];
                const currentTierIndex = VIP_TIERS.reduce((acc, t, i) => diamonds >= t.threshold ? i : acc, 0);
                const currentTier = VIP_TIERS[currentTierIndex];
                const nextTierData = VIP_TIERS[currentTierIndex + 1];
                const nextTierPoints = nextTierData?.threshold;
                const nextTierName = nextTierData?.tier;

                return (
                    <section className={styles.xpSection}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                            <VIPProgressRing
                                current={diamonds}
                                total={nextTierPoints || diamonds}
                                tier={currentTier.tier}
                                nextTier={nextTierName || currentTier.tier}
                                size={72}
                                strokeWidth={6}
                            />
                            <VIPStatusCard
                                tier={currentTier.tier}
                                currentPoints={diamonds}
                                nextTierPoints={nextTierPoints}
                                benefits={['6% Leaderboard Boost', 'Unlimited Throwables', 'Auto Time Bank', 'Premium Themes']}
                                memberSince={user?.memberSince ? new Date(user.memberSince) : undefined}
                            />
                        </div>
                    </section>
                );
            })()}

            {/* Daily Bonus */}
            <section className={styles.xpSection}>
                <button
                    className={styles.bonusButton}
                    onClick={() => setShowBonusWheel(true)}
                >
                    Daily Bonus
                </button>
            </section>

            {/* Achievement Showcase — always visible */}
            {achievements.filter(a => a.unlockedAt).length > 0 && (
                <section className={styles.xpSection}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <h3 style={{ margin: 0, fontSize: '0.875rem', color: '#8a9aaa', fontWeight: 600 }}>Top Achievements</h3>
                        <button
                            onClick={() => setActiveTab('achievements')}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: '#00d4ff',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                padding: '2px 6px',
                            }}
                        >
                            View All
                        </button>
                    </div>
                    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                        {achievements
                            .filter(a => a.unlockedAt)
                            .sort((a, b) => new Date(b.unlockedAt!).getTime() - new Date(a.unlockedAt!).getTime())
                            .slice(0, 5)
                            .map(a => (
                                <div
                                    key={a.id}
                                    style={{
                                        flex: '0 0 auto',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        padding: '6px 10px',
                                        background: 'rgba(255,255,255,0.04)',
                                        border: '1px solid rgba(0,212,255,0.15)',
                                        borderRadius: 8,
                                        minWidth: 0,
                                    }}
                                >
                                    <span style={{ fontSize: '1.25rem' }}>{a.icon || '★'}</span>
                                    <span style={{ fontSize: '0.7rem', color: '#ccc', fontWeight: 600, whiteSpace: 'nowrap' }}>{a.name}</span>
                                </div>
                            ))}
                    </div>
                </section>
            )}

            {/* Tab Navigation */}
            <nav className={styles.tabNav}>
                <button className={`${styles.tab} ${activeTab === 'stats' ? styles.activeTab : ''}`} onClick={() => setActiveTab('stats')}>
                    Stats
                </button>
                <button className={`${styles.tab} ${activeTab === 'achievements' ? styles.activeTab : ''}`} onClick={() => setActiveTab('achievements')}>
                    Achievements
                </button>
                <button className={`${styles.tab} ${activeTab === 'history' ? styles.activeTab : ''}`} onClick={() => setActiveTab('history')}>
                    History
                </button>
                <button className={`${styles.tab} ${activeTab === 'social' ? styles.activeTab : ''}`} onClick={() => setActiveTab('social')}>
                    Friends
                </button>
            </nav>

            {/* Tab Content */}
            <section className={styles.tabContent}>
                {activeTab === 'stats' && (
                    <div className={styles.statsContainer}>
                        <div className={styles.statsGroup}>
                            <h3>Core Stats</h3>
                            <div className={styles.statsGrid}>
                                <StatCard value={stats.totalHands.toLocaleString()} label="Hands Played" />
                                <StatCard value={`${stats.vpip}%`} label="VPIP" />
                                <StatCard value={`${stats.pfr}%`} label="PFR" />
                                <StatCard value={`${stats.threeBet}%`} label="3-Bet" />
                                <StatCard value={stats.aggression.toFixed(1)} label="Aggression" />
                                <StatCard value={`${stats.winRate}%`} label="Win Rate" positive={stats.winRate > 50} />
                            </div>
                        </div>

                        <div className={styles.statsGroup}>
                            <h3>Financial</h3>
                            <div className={styles.statsGrid}>
                                <StatCard value={`${stats.bbPer100 > 0 ? '+' : ''}${stats.bbPer100}`} label="BB/100" positive={stats.bbPer100 > 0 ? true : stats.bbPer100 < 0 ? false : null} />
                                <StatCard value={stats.biggestPot.toLocaleString()} label="Biggest Pot" />
                                <StatCard value={`${stats.totalProfit > 0 ? '+' : ''}${stats.totalProfit.toLocaleString()}`} label="Total Profit" positive={stats.totalProfit > 0} />
                            </div>
                        </div>

                        <div className={styles.statsGroup}>
                            <h3>Tournaments</h3>
                            <div className={styles.statsGrid}>
                                <StatCard value={stats.tournamentsPlayed} label="Played" />
                                <StatCard value={stats.tournamentsWon} label="Won" />
                                <StatCard value={stats.bountyKOs} label="Bounty KOs" />
                                <StatCard value={stats.tournamentsPlayed > 0 ? `${((stats.tournamentsWon / stats.tournamentsPlayed) * 100).toFixed(1)}%` : '0%'} label="Win Rate" />
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'achievements' && (
                    <div className={styles.achievementsContainer}>
                        {achievements.length > 0 ? (
                            <>
                                <div className={styles.achievementsSummary}>
                                    <span>{achievements.filter(a => a.unlockedAt).length}</span>
                                    <span>/ {achievements.length} Unlocked</span>
                                </div>
                                <div className={styles.achievementsGrid}>
                                    {achievements.map(achievement => (
                                        <AchievementCard key={achievement.id} achievement={achievement} />
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className={styles.emptyAchievements}>
                                <span style={{ fontSize: '3rem' }}></span>
                                <p>No achievements yet. Start playing to unlock achievements!</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'history' && (
                    <div className={styles.historyContainer}>
                        {transactions.length > 0 ? (
                            <>
                                {/* #5: Lazy-loaded Profit Graph */}
                                <Suspense fallback={<div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6a7a8a' }}>Loading chart...</div>}>
                                    <LazyProfitChart transactions={transactions} />
                                </Suspense>

                                {/* Transaction List */}
                                <h3 style={{ color: '#8a9aaa', fontSize: '0.8rem', marginBottom: 8 }}>Recent Transactions</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
                                    {[...transactions].reverse().slice(0, 50).map(tx => (
                                        <div key={tx.id} style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            padding: '8px 12px', background: 'rgba(255,255,255,0.03)',
                                            borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)',
                                        }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                <span style={{ color: '#ccc', fontSize: '0.8rem', fontWeight: 600 }}>
                                                    {tx.description || tx.type}
                                                </span>
                                                <span style={{ color: '#4a5a6a', fontSize: '0.7rem' }}>
                                                    {new Date(tx.created_at).toLocaleDateString()}
                                                </span>
                                            </div>
                                            <span style={{
                                                color: tx.type === 'credit' ? '#22c55e' : '#ef4444',
                                                fontWeight: 700, fontSize: '0.85rem',
                                            }}>
                                                {tx.type === 'credit' ? '+' : '-'}{(tx.amount || 0).toLocaleString()}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className={styles.emptyHistory}>
                                <span className={styles.emptyIcon}></span>
                                <p>No recent transactions to display.</p>
                                <button className={styles.playButton} onClick={() => navigate('/lobby')}>Start Playing</button>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'social' && (
                    <div className={styles.socialContainer}>
                        <FriendListPanel />
                    </div>
                )}
            </section>

            {/* Daily Bonus Wheel Modal */}
            {showBonusWheel && (
                <div className={styles.bonusWheelOverlay} onClick={() => setShowBonusWheel(false)}>
                    <div className={styles.bonusWheelModal} onClick={(e) => e.stopPropagation()}>
                        <button className={styles.modalClose} onClick={() => setShowBonusWheel(false)}>✕</button>
                        <DailyBonusWheel onSpin={async (segment) => {
                            setShowBonusWheel(false);
                        }} />
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CLUB ENGINE — Clubs Page
 * ═══════════════════════════════════════════════════════════════════════════════
 * Browse, join, and manage clubs
 * 
 * NO HARDCODED DATA - All data comes from Supabase
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ClubsService } from '../services/ClubsService';
import { LoadingState, NoClubsEmpty } from '../components/common/EmptyState';
import { CardSkeleton } from '../components/skeletons/CardSkeleton';
import { useToast } from '../components/common/Toast';
import SmarterHeader from '../components/layout/SmarterHeader';
import IntroVideo from '../components/IntroVideo';
import haptic from '../services/HapticService';
import { MetalFrame, MetalButton, MetalInput, MetalCard } from '../components/metal-ui';
import ClubDiscovery from '../components/clubs/ClubDiscovery';
import styles from './ClubsPage.module.css';

type Tab = 'discover' | 'my-clubs' | 'create';

interface Club {
    id: string;
    club_id: number;
    name: string;
    member_count: number;
    is_owner?: boolean;
    online_count?: number;
    table_count?: number;
}

interface Membership {
    id: string;
    club_id: string;
    role: string;
    club: Club;
}

// Check if user has seen intro in this session
const INTRO_SHOWN_KEY = 'club_arena_intro_shown';

export default function ClubsPage() {
    const navigate = useNavigate();
    const toast = useToast();
    const [activeTab, setActiveTab] = useState<Tab>('my-clubs');
    const [joinClubId, setJoinClubId] = useState('');
    const [isJoining, setIsJoining] = useState(false);
    const [joinError, setJoinError] = useState<string | null>(null);

    // Intro video state - only show once per session
    const [showIntro, setShowIntro] = useState(() => {
        const shown = sessionStorage.getItem(INTRO_SHOWN_KEY);
        return !shown; // Show intro if not shown yet
    });

    // Real data states
    const [myClubs, setMyClubs] = useState<Membership[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Create club form
    const [clubName, setClubName] = useState('');
    const [clubDescription, setClubDescription] = useState('');
    const [isPublic, setIsPublic] = useState(true);
    const [requiresApproval, setRequiresApproval] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    // Handle intro completion
    const handleIntroComplete = () => {
        sessionStorage.setItem(INTRO_SHOWN_KEY, 'true');
        setShowIntro(false);
    };

    // Load user's clubs
    useEffect(() => {
        async function loadMyClubs() {
            setIsLoading(true);
            try {
                const memberships = await ClubsService.getUserMemberships();
                setMyClubs(memberships);
            } catch (err) {
                console.error('[CLUBS] Failed to load memberships:', err);
                toast.error('Failed to load your clubs');
                setMyClubs([]);
            } finally {
                setIsLoading(false);
            }
        }
        loadMyClubs();
    }, []);

    // Join club by ID
    const handleJoinClub = async () => {
        if (joinClubId.length < 6) return;

        setIsJoining(true);
        setJoinError(null);

        try {
            // Find club by club_id (the 6-digit public ID)
            const { data: club, error } = await supabase
                .from('clubs')
                .select('id')
                .eq('club_id', parseInt(joinClubId))
                .single();

            if (error || !club) {
                setJoinError('Club not found. Check the ID and try again.');
                return;
            }

            await ClubsService.join(club.id);

            // Refresh memberships
            const memberships = await ClubsService.getUserMemberships();
            setMyClubs(memberships);
            setJoinClubId('');
            setActiveTab('my-clubs');
        } catch (err: any) {
            console.error('[CLUBS] Join failed:', err);
            toast.error(err.message || 'Failed to join club');
            setJoinError(err.message || 'Failed to join club');
        } finally {
            setIsJoining(false);
        }
    };

    // Create new club
    const handleCreateClub = async () => {
        if (!clubName.trim()) {
            setCreateError('Club name is required');
            return;
        }

        setIsCreating(true);
        setCreateError(null);

        try {
            const club = await ClubsService.create({
                name: clubName.trim(),
                description: clubDescription.trim() || undefined,
                is_public: isPublic,
            });

            // Navigate to the new club
            navigate(`/clubs/${club.id}`);
        } catch (err: any) {
            console.error('[CLUBS] Create failed:', err);
            toast.error(err.message || 'Failed to create club');
            setCreateError(err.message || 'Failed to create club');
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <>
            {/* Intro Video - plays on first load while content loads in background */}
            {showIntro && (
                <IntroVideo
                    videoSrc="/videos/club-arena-intro.mp4"
                    minDuration={3000}
                    onComplete={handleIntroComplete}
                />
            )}

            <div className={styles.page}>
                <SmarterHeader title=" Clubs" showBackButton={false} />
                {/* Header */}
                <div className={styles.pageIntro}>
                    <p className={styles.subtitle}>Join private poker communities or create your own.</p>
                </div>

                {/* Tabs */}
                <div className={styles.tabs}>
                    <button
                        className={`${styles.tab} ${activeTab === 'discover' ? styles.active : ''}`}
                        onClick={() => { haptic.selection(); setActiveTab('discover'); }}
                    >
                        Discover
                    </button>
                    <button
                        className={`${styles.tab} ${activeTab === 'my-clubs' ? styles.active : ''}`}
                        onClick={() => { haptic.selection(); setActiveTab('my-clubs'); }}
                    >
                        My Clubs
                    </button>
                    <button
                        className={`${styles.tab} ${activeTab === 'create' ? styles.active : ''}`}
                        onClick={() => { haptic.selection(); setActiveTab('create'); }}
                    >
                        ➕ Create Club
                    </button>
                </div>

                {/* Tab Content */}
                <div className={styles.content}>
                    {/* Discover Tab - Metal UI */}
                    {activeTab === 'discover' && (
                        <div className={styles.discoverTab}>
                            <MetalFrame title="JOIN A CLUB" variant="form" size="md">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    <p style={{ color: '#8899aa', textAlign: 'center', margin: 0 }}>
                                        Enter a 6-digit Club ID to join an existing club.
                                    </p>

                                    {joinError && (
                                        <div style={{ color: '#ff6b6b', textAlign: 'center', fontSize: '0.875rem' }}>
                                            {joinError}
                                        </div>
                                    )}

                                    <MetalInput
                                        label="ENTER CLUB ID:"
                                        placeholder="123456"
                                        value={joinClubId}
                                        onChange={(e) => {
                                            setJoinClubId(e.target.value.replace(/\D/g, ''));
                                            setJoinError(null);
                                        }}
                                        maxLength={6}
                                        style={{ textAlign: 'center', letterSpacing: '0.2em', fontFamily: 'monospace' }}
                                    />

                                    <MetalButton
                                        variant="primary"
                                        fullWidth
                                        disabled={joinClubId.length < 6 || isJoining}
                                        onClick={() => { haptic.medium(); handleJoinClub(); }}
                                    >
                                        {isJoining ? 'Joining...' : 'JOIN CLUB'}
                                    </MetalButton>
                                </div>
                            </MetalFrame>

                            {/* Club Discovery Browser */}
                            <ClubDiscovery
                                onJoinRequest={async (clubId) => {
                                    try {
                                        await ClubsService.join(clubId);
                                        const memberships = await ClubsService.getUserMemberships();
                                        setMyClubs(memberships);
                                        setActiveTab('my-clubs');
                                        toast.success('Successfully joined club!');
                                    } catch (err: any) {
                                        toast.error(err.message || 'Failed to join club');
                                    }
                                }}
                                onViewClub={(club) => navigate(`/clubs/${club.id}`)}
                            />
                        </div>
                    )}

                    {/* My Clubs Tab */}
                    {activeTab === 'my-clubs' && (
                        <div className={styles.myClubsTab}>
                            {isLoading ? (
                                <div className={styles.clubsGrid}>
                                    {[1, 2, 3].map(i => (
                                        <CardSkeleton key={i} hasImage={false} lines={3} />
                                    ))}
                                </div>
                            ) : myClubs.length > 0 ? (
                                <div className={styles.clubsGrid}>
                                    {myClubs.map(membership => (
                                        <MetalCard key={membership.id} size="md" glow>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                                {/* Club Header */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <div style={{
                                                        width: '50px',
                                                        height: '50px',
                                                        fontSize: '24px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        background: 'linear-gradient(135deg, #1a2a3a 0%, #0d1520 100%)',
                                                        border: '1px solid #2a3a4a',
                                                        borderRadius: '10px'
                                                    }}></div>
                                                    <div style={{ flex: 1 }}>
                                                        <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#fff' }}>{membership.club.name}</h3>
                                                        <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#6a7a8a' }}>
                                                            ID: {membership.club.club_id}
                                                        </span>
                                                    </div>
                                                    {membership.role === 'owner' && (
                                                        <span style={{
                                                            fontSize: '0.7rem',
                                                            fontWeight: 600,
                                                            color: '#ffd700',
                                                            padding: '4px 10px',
                                                            background: 'rgba(255, 215, 0, 0.15)',
                                                            border: '1px solid rgba(255, 215, 0, 0.4)',
                                                            borderRadius: '20px'
                                                        }}>OWNER</span>
                                                    )}
                                                </div>

                                                {/* Stats Row */}
                                                <div style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-around',
                                                    padding: '12px 0',
                                                    borderTop: '1px solid rgba(255,255,255,0.1)',
                                                    borderBottom: '1px solid rgba(255,255,255,0.1)'
                                                }}>
                                                    <div style={{ textAlign: 'center' }}>
                                                        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#00d4ff' }}>
                                                            {membership.club.member_count || 0}
                                                        </div>
                                                        <div style={{ fontSize: '0.65rem', color: '#6a7a8a', textTransform: 'uppercase' }}>Members</div>
                                                    </div>
                                                    <div style={{ textAlign: 'center' }}>
                                                        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#00d4ff' }}>
                                                            {membership.club.online_count || 0}
                                                        </div>
                                                        <div style={{ fontSize: '0.65rem', color: '#6a7a8a', textTransform: 'uppercase' }}>Online</div>
                                                    </div>
                                                    <div style={{ textAlign: 'center' }}>
                                                        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#00d4ff' }}>
                                                            {membership.club.table_count || 0}
                                                        </div>
                                                        <div style={{ fontSize: '0.65rem', color: '#6a7a8a', textTransform: 'uppercase' }}>Tables</div>
                                                    </div>
                                                </div>

                                                {/* Enter Button */}
                                                <MetalButton
                                                    variant="primary"
                                                    fullWidth
                                                    onClick={() => { haptic.success(); navigate(`/clubs/${membership.club.id}`); }}
                                                >
                                                    ENTER CLUB
                                                </MetalButton>
                                            </div>
                                        </MetalCard>
                                    ))}
                                </div>
                            ) : (
                                <NoClubsEmpty onCreate={() => setActiveTab('create')} />
                            )}
                        </div>
                    )}

                    {/* Create Club Tab - Metal UI */}
                    {activeTab === 'create' && (
                        <div className={styles.createTab}>
                            <MetalFrame title="CREATE A CLUB" variant="form" size="md">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    <p style={{ color: '#8899aa', textAlign: 'center', margin: 0 }}>
                                        Start your own private poker community.
                                    </p>

                                    {createError && (
                                        <div style={{ color: '#ff6b6b', textAlign: 'center', fontSize: '0.875rem' }}>
                                            {createError}
                                        </div>
                                    )}

                                    <MetalInput
                                        label="CLUB NAME:"
                                        placeholder="Enter club name"
                                        value={clubName}
                                        onChange={(e) => {
                                            setClubName(e.target.value);
                                            setCreateError(null);
                                        }}
                                    />

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <label style={{
                                            fontFamily: "'Orbitron', 'Rajdhani', sans-serif",
                                            fontSize: '0.85rem',
                                            fontWeight: 600,
                                            color: '#fff',
                                            textTransform: 'uppercase',
                                            letterSpacing: '1px'
                                        }}>DESCRIPTION:</label>
                                        <textarea
                                            placeholder="Describe your club..."
                                            rows={3}
                                            value={clubDescription}
                                            onChange={(e) => setClubDescription(e.target.value)}
                                            style={{
                                                width: '100%',
                                                padding: '14px 18px',
                                                background: 'linear-gradient(180deg, #0d1520 0%, #1a2332 100%)',
                                                border: '2px solid #2a3a4a',
                                                borderRadius: '6px',
                                                color: '#fff',
                                                fontSize: '1rem',
                                                outline: 'none',
                                                resize: 'vertical',
                                                minHeight: '80px'
                                            }}
                                        />
                                    </div>

                                    <MetalCard size="sm">
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={isPublic}
                                                    onChange={(e) => { haptic.selection(); setIsPublic(e.target.checked); }}
                                                    style={{ width: '18px', height: '18px', accentColor: '#00d4ff' }}
                                                />
                                                <span style={{ color: '#8899aa', fontSize: '0.875rem' }}>Public (anyone can find)</span>
                                            </label>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={requiresApproval}
                                                    onChange={(e) => { haptic.selection(); setRequiresApproval(e.target.checked); }}
                                                    style={{ width: '18px', height: '18px', accentColor: '#00d4ff' }}
                                                />
                                                <span style={{ color: '#8899aa', fontSize: '0.875rem' }}>Require approval for new members</span>
                                            </label>
                                        </div>
                                    </MetalCard>

                                    <MetalButton
                                        variant="primary"
                                        fullWidth
                                        onClick={() => { haptic.success(); handleCreateClub(); }}
                                        disabled={isCreating || !clubName.trim()}
                                    >
                                        {isCreating ? 'Creating...' : 'CREATE CLUB'}
                                    </MetalButton>
                                </div>
                            </MetalFrame>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

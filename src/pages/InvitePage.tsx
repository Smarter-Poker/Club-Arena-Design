/**
 * 📨 INVITE PAGE — Club Invitation
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useUserStore } from '../stores/useUserStore';
import { clubService } from '../services/ClubService';
import { MembershipService } from '../services/MembershipService';
import { useToast } from '../components/common/Toast';
import './InvitePage.css';

interface ClubInfo {
    id: string;
    name: string;
    description?: string;
    member_count: number;
    avatar_url?: string;
    is_public: boolean;
}

export default function InvitePage() {
    const navigate = useNavigate();
    const { clubId } = useParams();
    const [searchParams] = useSearchParams();
    const inviteCode = searchParams.get('code');
    const { user } = useUserStore();

    const [club, setClub] = useState<ClubInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [joining, setJoining] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [alreadyMember, setAlreadyMember] = useState(false);
    const toast = useToast();

    useEffect(() => {
        loadClubInfo();
    }, [clubId, inviteCode]);

    const loadClubInfo = async () => {
        setLoading(true);
        setError(null);
        try {
            // Find club by ID or invite code
            let clubQuery = supabase.from('clubs').select('*');

            if (inviteCode) {
                clubQuery = clubQuery.eq('invite_code', inviteCode);
            } else if (clubId) {
                clubQuery = clubQuery.eq('id', clubId);
            } else {
                setError('Invalid invitation link');
                setLoading(false);
                return;
            }

            const { data: clubData, error: clubError } = await clubQuery.single();

            if (clubError || !clubData) {
                setError('Club not found or invitation expired');
                setLoading(false);
                return;
            }

            setClub({
                id: clubData.id,
                name: clubData.name,
                description: clubData.description,
                member_count: clubData.member_count || 0,
                avatar_url: clubData.avatar_url,
                is_public: clubData.is_public,
            });

            // Check if already a member
            if (user?.id) {
                const { data: membership } = await supabase
                    .from('club_members')
                    .select('id')
                    .eq('club_id', clubData.id)
                    .eq('user_id', user.id)
                    .single();

                setAlreadyMember(!!membership);
            }
        } catch (err) {
            console.error('Failed to load club:', err);
            toast.error('Failed to load club information');
            setError('Failed to load club information');
        }
        setLoading(false);
    };

    const handleJoin = async () => {
        if (!club || !user?.id) return;

        setJoining(true);
        setError(null);
        try {
            const { error: joinError } = await supabase
                .from('club_members')
                .insert({
                    club_id: club.id,
                    user_id: user.id,
                    role: 'player',
                    status: club.is_public ? 'active' : 'pending',
                });

            if (joinError) throw joinError;

            // Update member count
            const { error: countErr } = await supabase.rpc('increment_member_count', { club_id: club.id });
            if (countErr) console.error('[InvitePage] increment_member_count failed:', countErr.message);

            toast.success(`Welcome to ${club.name}!`);
            navigate(`/clubs/${club.id}`);
        } catch (err: any) {
            console.error('Failed to join:', err);
            toast.error(err.message || 'Failed to join club');
            setError(err.message || 'Failed to join club');
        }
        setJoining(false);
    };

    if (loading) {
        return (
            <div className="invite-page">
                <div className="loading-state"><div className="spinner" /></div>
            </div>
        );
    }

    if (error || !club) {
        return (
            <div className="invite-page">
                <div className="error-state">
                    <span className="error-icon"></span>
                    <h2>Oops!</h2>
                    <p>{error || 'Invalid invitation'}</p>
                    <button className="btn btn-primary" onClick={() => navigate('/clubs')}>
                        Browse Clubs
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="invite-page">

            <div className="invite-card">
                <div className="club-avatar">
                    {club.avatar_url ? (
                        <img src={club.avatar_url} alt={club.name} />
                    ) : (
                        <span>{club.name[0]?.toUpperCase()}</span>
                    )}
                </div>

                <h1 className="club-name">{club.name}</h1>

                {club.description && (
                    <p className="club-description">{club.description}</p>
                )}

                <div className="club-stats">
                    <div className="stat">
                        <span className="stat-value">{club.member_count}</span>
                        <span className="stat-label">Members</span>
                    </div>
                </div>

                <p className="invite-message">
                    You've been invited to join this poker club!
                </p>

                {alreadyMember ? (
                    <div className="already-member">
                        <span> You're already a member!</span>
                        <button className="btn btn-primary" onClick={() => navigate(`/clubs/${club.id}`)}>
                            Enter Club
                        </button>
                    </div>
                ) : (
                    <button
                        className="btn btn-primary join-btn"
                        onClick={handleJoin}
                        disabled={joining}
                    >
                        {joining ? 'Joining...' : 'Accept Invitation'}
                    </button>
                )}
            </div>
        </div>
    );
}

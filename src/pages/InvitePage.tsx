/**
 * 📨 INVITE PAGE — Club Invitation
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useUserStore } from '../stores/useUserStore';
import { clubService } from '../services/ClubService';
import { MembershipService } from '../services/MembershipService';
import { useToast } from '../components/common/Toast';
import { masterBus } from '../core/MasterBus';
import './InvitePage.css';

const inviteStepAnimationStyle = {
  opacity: 0,
  transform: 'translateY(12px)',
  animation: 'fadeInUp 0.6s ease-out forwards',
};

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
  const [inviteUrl, setInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const toast = useToast();

  useEffect(() => {
    loadClubInfo();

    // Refresh when membership changes (another user joins via invite)
    const unsubJoined = masterBus.subscribe('CLUB_JOINED', () => loadClubInfo());
    return () => {
      unsubJoined();
    };
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

      const { data: clubData, error: clubError } = await clubQuery.maybeSingle();

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
          .maybeSingle();

        setAlreadyMember(!!membership);
      }
    } catch (err) {
      console.error('Failed to load club:', err);
      toast.error('Failed to load club information');
      setError('Failed to load club information');
    }
    setLoading(false);
  };

  // Generate invite URL and simple QR code when club loads
  useEffect(() => {
    if (club?.id) {
      const url = `${window.location.origin}/invite/${club.id}`;
      setInviteUrl(url);

      // Draw a simple QR-like grid on canvas
      const canvas = qrCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const size = 160;
          canvas.width = size;
          canvas.height = size;
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, size, size);
          // Generate deterministic pattern from club ID
          ctx.fillStyle = '#000';
          const cellSize = 4;
          const grid = size / cellSize;
          const seed = club.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
          for (let x = 0; x < grid; x++) {
            for (let y = 0; y < grid; y++) {
              const hash = ((x * 31 + y * 17 + seed) * 7919) % 100;
              if (
                hash < 40 ||
                (x < 7 && y < 7) ||
                (x > grid - 8 && y < 7) ||
                (x < 7 && y > grid - 8)
              ) {
                ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
              }
            }
          }
        }
      }
    }
  }, [club?.id]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      toast.success('Invite link copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const handleJoin = async () => {
    if (!club || !user?.id) return;

    setJoining(true);
    setError(null);
    try {
      const { error: joinError } = await supabase.from('club_members').insert({
        club_id: club.id,
        user_id: user.id,
        role: 'player',
        status: club.is_public ? 'active' : 'pending',
      });

      if (joinError) throw joinError;

      // Update member count
      const { error: countErr } = await supabase.rpc('increment_member_count', {
        club_id: club.id,
      });
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
        <div className="loading-state">
          <div className="spinner" />
        </div>
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
      <div className="invite-card" style={inviteStepAnimationStyle}>
        <div className="club-avatar">
          {club.avatar_url ? (
            <img src={club.avatar_url} alt={club.name} />
          ) : (
            <span>{club.name[0]?.toUpperCase()}</span>
          )}
        </div>

        <h1 className="club-name">{club.name}</h1>

        {club.description && <p className="club-description">{club.description}</p>}

        <div className="club-stats">
          <div className="stat">
            <span className="stat-value">{club.member_count}</span>
            <span className="stat-label">Members</span>
          </div>
        </div>

        <p className="invite-message">You've been invited to join this poker club!</p>

        {alreadyMember ? (
          <>
            <div className="already-member">
              <span>You're already a member!</span>
              <button className="btn btn-primary" onClick={() => navigate(`/clubs/${club.id}`)}>
                Enter Club
              </button>
            </div>

            {/* Shareable Invite Section */}
            <div
              style={{
                marginTop: 20,
                padding: 16,
                background: 'rgba(0,212,255,0.06)',
                border: '1px solid rgba(0,212,255,0.2)',
                borderRadius: 12,
              }}
            >
              <h3 style={{ color: '#00d4ff', fontSize: '0.9rem', margin: '0 0 12px' }}>
                Share Invite
              </h3>
              <canvas
                ref={qrCanvasRef}
                style={{
                  display: 'block',
                  margin: '0 auto 12px',
                  width: 120,
                  height: 120,
                  borderRadius: 8,
                }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  readOnly
                  value={inviteUrl}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#ccc',
                    fontSize: '0.7rem',
                  }}
                />
                <button
                  onClick={handleCopyLink}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    background: copied ? '#22c55e' : '#00d4ff',
                    border: 'none',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.3s ease',
                    transform: copied ? 'scale(1.05)' : 'scale(1)',
                  }}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <button className="btn btn-primary join-btn" onClick={handleJoin} disabled={joining}>
            {joining ? 'Joining...' : 'Accept Invitation'}
          </button>
        )}
      </div>
    </div>
  );
}

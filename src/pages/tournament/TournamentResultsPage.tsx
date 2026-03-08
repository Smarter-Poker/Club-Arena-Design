/**
 * ♠ CLUB ARENA — Tournament Results History Page
 * Shows completed tournaments with final standings, prizes, and stats.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuthUser } from '../../hooks/useAuthUser';
import './TournamentDetails.css';

interface CompletedTournament {
    id: string;
    name: string;
    variant: string;
    tournament_type: string;
    game_type: string;
    buy_in_amount: number;
    buy_in_fee: number;
    prize_pool: number;
    current_players: number;
    max_players: number | null;
    status: string;
    started_at: string | null;
    ended_at: string | null;
    is_xmtt: boolean;
    is_bounty: boolean;
    is_pko: boolean;
    is_mystery_bounty: boolean;
    spin_multiplier: number | null;
}

interface TournamentResult {
    user_id: string;
    username: string;
    position: number | null;
    prize: number;
    status: string;
    bounty_earned: number;
}

export default function TournamentResultsPage() {
    const navigate = useNavigate();
    const { user } = useAuthUser();
    const [tournaments, setTournaments] = useState<CompletedTournament[]>([]);
    const [selectedTournament, setSelectedTournament] = useState<CompletedTournament | null>(null);
    const [results, setResults] = useState<TournamentResult[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'mine'>('all');
    const [typeFilter, setTypeFilter] = useState<string>('all');

    // Load completed tournaments
    useEffect(() => {
        async function load() {
            setIsLoading(true);
            try {
                let query = supabase
                    .from('tournaments')
                    .select('*')
                    .eq('status', 'COMPLETED')
                    .order('ended_at', { ascending: false })
                    .limit(100);

                if (typeFilter !== 'all') {
                    if (typeFilter === 'xmtt') {
                        query = query.eq('is_xmtt', true);
                    } else {
                        query = query.eq('variant', typeFilter);
                    }
                }

                const { data } = await query;
                let completedList = (data || []) as CompletedTournament[];

                // If "mine" filter, only show tournaments user participated in
                if (filter === 'mine' && user?.id) {
                    const { data: myEntries } = await supabase
                        .from('tournament_players')
                        .select('tournament_id')
                        .eq('user_id', user.id);

                    const myTournamentIds = new Set((myEntries || []).map(e => e.tournament_id));
                    completedList = completedList.filter(t => myTournamentIds.has(t.id));
                }

                setTournaments(completedList);
            } catch (err) {
                console.error('Failed to load tournament results:', err);
            }
            setIsLoading(false);
        }
        load();
    }, [filter, typeFilter, user?.id]);

    // Load results for selected tournament
    useEffect(() => {
        if (!selectedTournament) {
            setResults([]);
            return;
        }

        async function loadResults() {
            const { data } = await supabase
                .from('tournament_players')
                .select('user_id, username, position, prize, status, bounty_earned')
                .eq('tournament_id', selectedTournament!.id)
                .order('position', { ascending: true, nullsFirst: false });

            setResults((data || []) as TournamentResult[]);
        }
        loadResults();
    }, [selectedTournament?.id]);

    const formatDuration = (startedAt: string | null, endedAt: string | null) => {
        if (!startedAt || !endedAt) return '—';
        const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
        const mins = Math.floor(ms / 60000);
        if (mins < 60) return `${mins}m`;
        const hrs = Math.floor(mins / 60);
        const remainMins = mins % 60;
        return `${hrs}h ${remainMins}m`;
    };

    const formatAmount = (n: number) => {
        return (Math.trunc(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const getVariantLabel = (t: CompletedTournament) => {
        if (t.is_xmtt) return 'XMTT';
        if (t.is_mystery_bounty) return 'Mystery Bounty';
        if (t.is_pko) return 'PKO';
        if (t.is_bounty) return 'Bounty';
        if (t.variant === 'spin') return 'Spin';
        if (t.variant === 'sng') return 'SNG';
        return t.variant === 'freezeout' ? 'Freezeout' : (t.variant || 'MTT');
    };

    const getMyResult = (t: CompletedTournament) => {
        if (!user?.id) return null;
        return results.find(r => r.user_id === user.id && selectedTournament?.id === t.id);
    };

    return (
        <div className="tournament-details" style={{ padding: '16px', maxWidth: '100%' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <button
                    onClick={() => navigate(-1)}
                    style={{ background: 'none', border: 'none', color: '#10b981', fontSize: '20px', cursor: 'pointer' }}
                >
                    ←
                </button>
                <h2 style={{ margin: 0, color: '#fff', fontSize: '18px' }}>Tournament Results</h2>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <button
                    onClick={() => setFilter('all')}
                    style={{
                        padding: '6px 14px', borderRadius: '16px', border: 'none', fontSize: '12px', cursor: 'pointer',
                        background: filter === 'all' ? '#10b981' : '#1e293b', color: filter === 'all' ? '#000' : '#94a3b8',
                    }}
                >All</button>
                <button
                    onClick={() => setFilter('mine')}
                    style={{
                        padding: '6px 14px', borderRadius: '16px', border: 'none', fontSize: '12px', cursor: 'pointer',
                        background: filter === 'mine' ? '#10b981' : '#1e293b', color: filter === 'mine' ? '#000' : '#94a3b8',
                    }}
                >My Results</button>

                <span style={{ width: '1px', background: '#334155', margin: '0 4px' }} />

                {['all', 'freezeout', 'bounty', 'progressive_bounty', 'mystery_bounty', 'sng', 'spin', 'xmtt'].map(t => (
                    <button
                        key={t}
                        onClick={() => setTypeFilter(t)}
                        style={{
                            padding: '6px 10px', borderRadius: '16px', border: 'none', fontSize: '11px', cursor: 'pointer',
                            background: typeFilter === t ? '#3b82f6' : '#1e293b', color: typeFilter === t ? '#fff' : '#64748b',
                        }}
                    >
                        {t === 'all' ? 'All Types' : t === 'progressive_bounty' ? 'PKO' : t === 'mystery_bounty' ? 'Mystery' : t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                ))}
            </div>

            {isLoading ? (
                <div style={{ textAlign: 'center', color: '#64748b', padding: '40px' }}>Loading results...</div>
            ) : tournaments.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#64748b', padding: '40px' }}>No completed tournaments found</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {tournaments.map(t => (
                        <div
                            key={t.id}
                            onClick={() => setSelectedTournament(selectedTournament?.id === t.id ? null : t)}
                            style={{
                                background: selectedTournament?.id === t.id ? '#1e293b' : '#0f172a',
                                border: `1px solid ${selectedTournament?.id === t.id ? '#10b981' : '#1e293b'}`,
                                borderRadius: '8px',
                                padding: '12px',
                                cursor: 'pointer',
                                transition: 'border-color 0.2s',
                            }}
                        >
                            {/* Tournament Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <div>
                                    <span style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>{t.name}</span>
                                    <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                                        <span style={{ background: '#1e293b', color: '#10b981', padding: '2px 8px', borderRadius: '10px', fontSize: '10px' }}>
                                            {getVariantLabel(t)}
                                        </span>
                                        <span style={{ background: '#1e293b', color: '#3b82f6', padding: '2px 8px', borderRadius: '10px', fontSize: '10px' }}>
                                            {t.game_type}
                                        </span>
                                        {t.spin_multiplier && (
                                            <span style={{ background: '#7c3aed', color: '#fff', padding: '2px 8px', borderRadius: '10px', fontSize: '10px' }}>
                                                {t.spin_multiplier}x
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ color: '#10b981', fontSize: '14px', fontWeight: 600 }}>
                                        {formatAmount(t.prize_pool)} Prize Pool
                                    </div>
                                    <div style={{ color: '#64748b', fontSize: '11px' }}>
                                        {t.current_players} entries · {formatDuration(t.started_at, t.ended_at)}
                                    </div>
                                </div>
                            </div>

                            <div style={{ color: '#475569', fontSize: '11px' }}>
                                Buy-in: {formatAmount(t.buy_in_amount)} + {formatAmount(t.buy_in_fee)} · Ended: {t.ended_at ? new Date(t.ended_at).toLocaleDateString() : '—'}
                            </div>

                            {/* Expanded Results */}
                            {selectedTournament?.id === t.id && results.length > 0 && (
                                <div style={{ marginTop: '12px', borderTop: '1px solid #1e293b', paddingTop: '12px' }}>
                                    <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px', fontWeight: 600 }}>
                                        Final Standings
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {results
                                            .filter(r => r.position !== null)
                                            .sort((a, b) => (a.position || 999) - (b.position || 999))
                                            .map(r => {
                                                const isMe = r.user_id === user?.id;
                                                const posColor = r.position === 1 ? '#fbbf24' : r.position === 2 ? '#94a3b8' : r.position === 3 ? '#d97706' : '#475569';
                                                return (
                                                    <div
                                                        key={r.user_id}
                                                        style={{
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                            padding: '6px 8px',
                                                            borderRadius: '6px',
                                                            background: isMe ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                                                            border: isMe ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid transparent',
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <span style={{ color: posColor, fontSize: '13px', fontWeight: 700, minWidth: '24px' }}>
                                                                #{r.position}
                                                            </span>
                                                            <span style={{ color: isMe ? '#10b981' : '#cbd5e1', fontSize: '13px' }}>
                                                                {r.username}
                                                                {isMe && <span style={{ fontSize: '10px', color: '#10b981', marginLeft: '4px' }}>(You)</span>}
                                                            </span>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                                            {r.bounty_earned > 0 && (
                                                                <span style={{ color: '#f59e0b', fontSize: '11px' }}>
                                                                    +{formatAmount(r.bounty_earned)} bounty
                                                                </span>
                                                            )}
                                                            <span style={{
                                                                color: r.prize > 0 ? '#10b981' : '#475569',
                                                                fontSize: '13px',
                                                                fontWeight: r.prize > 0 ? 600 : 400,
                                                            }}>
                                                                {r.prize > 0 ? `+${formatAmount(r.prize)}` : '—'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

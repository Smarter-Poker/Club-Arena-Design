/**
 *  BAD BEAT JACKPOT PAGE — Live Jackpot Updates
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/common/Toast';
import SmarterHeader from '../components/layout/SmarterHeader';
import ClubBottomNav from '../components/club/ClubBottomNav';
import './BadBeatJackpotPage.css';

interface JackpotInfo {
    id: string;
    club_id: string;
    current_amount: number;
    qualifying_hand: string;
    contribution_rate: number;
    last_hit_at?: string;
    last_hit_amount?: number;
    winner_share: number;
    loser_share: number;
    table_share: number;
}

interface JackpotHistory {
    id: string;
    hit_at: string;
    amount: number;
    winning_hand: string;
    losing_hand: string;
    winner_name: string;
    loser_name: string;
}

export default function BadBeatJackpotPage() {
    const navigate = useNavigate();
    const { clubId } = useParams();
    const toast = useToast();

    const [jackpot, setJackpot] = useState<JackpotInfo | null>(null);
    const [history, setHistory] = useState<JackpotHistory[]>([]);
    const [loading, setLoading] = useState(true);
    const [justUpdated, setJustUpdated] = useState(false);
    const prevAmountRef = useRef<number>(0);

    useEffect(() => {
        if (clubId) {
            loadJackpotData();

            // Real-time jackpot updates
            const channel = supabase
                .channel('jackpot-live')
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'bad_beat_jackpots',
                        filter: `club_id=eq.${clubId}`,
                    },
                    (payload) => {
                        // Jackpot updated!
                        const newData = payload.new as JackpotInfo;
                        if (newData.current_amount > prevAmountRef.current) {
                            setJustUpdated(true);
                            setTimeout(() => setJustUpdated(false), 2000);
                        }
                        prevAmountRef.current = newData.current_amount;
                        setJackpot(newData);
                    }
                )
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'bad_beat_history',
                        filter: `club_id=eq.${clubId}`,
                    },
                    (payload) => {
                        // Jackpot hit!
                        toast.success(' BAD BEAT JACKPOT HIT!');
                        loadJackpotData();
                    }
                )
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        }
    }, [clubId]);

    const loadJackpotData = async () => {
        setLoading(true);
        try {
            // Load jackpot info
            const { data: jackpotData } = await supabase
                .from('bad_beat_jackpots')
                .select('*')
                .eq('club_id', clubId)
                .single();

            if (jackpotData) {
                setJackpot(jackpotData);
                prevAmountRef.current = jackpotData.current_amount;
            }

            // Load history
            const { data: historyData } = await supabase
                .from('bad_beat_history')
                .select('*')
                .eq('club_id', clubId)
                .order('hit_at', { ascending: false })
                .limit(10);

            if (historyData) {
                setHistory(historyData);
            }
        } catch (error) {
            console.error('Failed to load jackpot:', error);
        }
        setLoading(false);
    };

    const formatDate = (dateStr: string): string => {
        return new Date(dateStr).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    };

    if (loading) {
        return (
            <div className="bbj-page">
                <SmarterHeader title=" Bad Beat Jackpot" />
                <div className="loading-state"><div className="spinner" /></div>
                {clubId && <ClubBottomNav clubId={clubId} />}
            </div>
        );
    }

    return (
        <div className="bbj-page">
            <SmarterHeader title=" Bad Beat Jackpot" />

            {/* Current Jackpot */}
            <div className="jackpot-display">
                <div className="jackpot-glow" />
                <span className="jackpot-label">Current Jackpot</span>
                <span className="jackpot-amount">
                    ${(jackpot?.current_amount || 0).toLocaleString()}
                </span>
            </div>

            {/* Info Cards */}
            <div className="jackpot-info">
                <div className="info-card">
                    <span className="info-label">Qualifying Hand</span>
                    <span className="info-value">{jackpot?.qualifying_hand || 'Quad 8s or better'}</span>
                </div>
                <div className="info-card">
                    <span className="info-label">Contribution</span>
                    <span className="info-value">{((jackpot?.contribution_rate || 0.01) * 100).toFixed(1)}% of rake</span>
                </div>
            </div>

            {/* Payout Structure */}
            <div className="payout-structure">
                <h3>Payout Structure</h3>
                <div className="payout-bars">
                    <div className="payout-bar">
                        <span className="payout-label">Loser (Bad Beat)</span>
                        <div className="bar-fill" style={{ width: `${(jackpot?.loser_share || 0.5) * 100}%` }} />
                        <span className="payout-percent">{((jackpot?.loser_share || 0.5) * 100).toFixed(0)}%</span>
                    </div>
                    <div className="payout-bar">
                        <span className="payout-label">Winner</span>
                        <div className="bar-fill" style={{ width: `${(jackpot?.winner_share || 0.25) * 100}%` }} />
                        <span className="payout-percent">{((jackpot?.winner_share || 0.25) * 100).toFixed(0)}%</span>
                    </div>
                    <div className="payout-bar">
                        <span className="payout-label">Table Share</span>
                        <div className="bar-fill" style={{ width: `${(jackpot?.table_share || 0.25) * 100}%` }} />
                        <span className="payout-percent">{((jackpot?.table_share || 0.25) * 100).toFixed(0)}%</span>
                    </div>
                </div>
            </div>

            {/* History */}
            <div className="jackpot-history">
                <h3>Recent Hits</h3>
                {history.length === 0 ? (
                    <div className="empty-state">
                        <p>No jackpot hits yet. Will you be the first?</p>
                    </div>
                ) : (
                    <div className="history-list">
                        {history.map(hit => (
                            <div key={hit.id} className="history-row">
                                <div className="hit-info">
                                    <span className="hit-date">{formatDate(hit.hit_at)}</span>
                                    <span className="hit-hands">
                                        {hit.losing_hand} beat by {hit.winning_hand}
                                    </span>
                                </div>
                                <div className="hit-amount">
                                    ${hit.amount.toLocaleString()}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Bottom Navigation */}
            {clubId && <ClubBottomNav clubId={clubId} />}
        </div>
    );
}

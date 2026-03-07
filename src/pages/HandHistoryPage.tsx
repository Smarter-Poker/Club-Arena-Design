/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  HAND HISTORY PAGE — Browse All Hands with Pagination & Export
 * ═══════════════════════════════════════════════════════════════════════════════
 * Full-page hand history browser with filters, pagination, and export
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { handHistoryService } from '../services/HandHistoryService';
import type { HandRecord } from '../services/HandHistoryService';
import { useUserStore } from '../stores/useUserStore';
import { useToast } from '../components/common/Toast';
import { exportToCSV } from '../lib/export';
import HandReplay from '../components/replay/HandReplay';
import SmarterHeader from '../components/layout/SmarterHeader';
import ReplayActions from '../components/table/ReplayActions';
import HandReplayPlayer from '../components/table/HandReplayPlayer';
import HandHistoryModal from '../components/club/HandHistoryModal';
import { ShareHand, type ShareableHand } from '../components/table/ShareHand';
import './HandHistoryPage.css';

type HistoryFilter = 'all' | 'won' | 'lost' | 'big-pots';

export default function HandHistoryPage() {
    const navigate = useNavigate();
    const { user } = useUserStore();
    const toast = useToast();
    const [hands, setHands] = useState<HandRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [filter, setFilter] = useState<HistoryFilter>('all');
    const [selectedHand, setSelectedHand] = useState<HandRecord | null>(null);
    const [showReplay, setShowReplay] = useState(false);
    const [showShare, setShowShare] = useState(false);
    const [shareHand, setShareHand] = useState<ShareableHand | null>(null);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const PAGE_SIZE = 25;

    useEffect(() => {
        if (user?.id) {
            loadHands(true);
        }
    }, [user?.id, filter]);

    const loadHands = async (reset = false, overridePage?: number) => {
        if (!user?.id) return;
        const currentPage = reset ? 1 : (overridePage ?? page);
        if (reset) {
            setLoading(true);
            setPage(1);
        } else {
            setLoadingMore(true);
        }

        try {
            const data = await handHistoryService.getPlayerHands(user.id, PAGE_SIZE * currentPage);

            // Apply filter
            let filtered = data;
            if (filter === 'won') {
                filtered = data.filter(h => {
                    const player = h.players.find(p => p.user_id === user.id);
                    return player && player.result > 0;
                });
            } else if (filter === 'lost') {
                filtered = data.filter(h => {
                    const player = h.players.find(p => p.user_id === user.id);
                    return player && player.result < 0;
                });
            } else if (filter === 'big-pots') {
                filtered = data.filter(h => h.main_pot >= 1000);
            }

            setHands(filtered);
            setHasMore(data.length >= PAGE_SIZE * currentPage);
        } catch (error) {
            console.error('Failed to load hands:', error);
            toast.error('Failed to load hand history');
        }
        setLoading(false);
        setLoadingMore(false);
    };

    const loadMore = () => {
        const nextPage = page + 1;
        setPage(nextPage);
        loadHands(false, nextPage);
    };

    // Stats summary
    const stats = useMemo(() => {
        const wins = hands.filter(h => {
            const p = h.players.find(pl => pl.user_id === user?.id);
            return p && p.result > 0;
        }).length;
        const losses = hands.filter(h => {
            const p = h.players.find(pl => pl.user_id === user?.id);
            return p && p.result < 0;
        }).length;
        const totalPL = hands.reduce((sum, h) => {
            const p = h.players.find(pl => pl.user_id === user?.id);
            return sum + (p?.result || 0);
        }, 0);
        return { wins, losses, totalPL };
    }, [hands, user?.id]);

    const handleExport = () => {
        const exportData = hands.map(h => {
            const p = h.players.find(pl => pl.user_id === user?.id);
            return {
                date: h.played_at,
                table: h.table_name,
                stakes: h.stakes,
                pot: h.main_pot,
                result: p?.result || 0,
                players: h.players.length,
            };
        });
        exportToCSV(exportData, 'hand-history.csv');
        toast.success('Hand history exported!');
    };

    const formatDate = (dateStr: string): string => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffDays === 0) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return `${diffDays} days ago`;
        }
        return date.toLocaleDateString();
    };

    const getPlayerResult = (hand: HandRecord): number => {
        const player = hand.players.find(p => p.user_id === user?.id);
        return player?.result || 0;
    };

    const openReplay = (hand: HandRecord) => {
        setSelectedHand(hand);
        setShowReplay(true);
    };

    // Send hand to Jarvis for GTO analysis
    const analyzeWithJarvis = (hand: HandRecord) => {
        // Build hand summary for analysis
        const player = hand.players.find(p => p.user_id === user?.id);
        const handSummary = {
            id: hand.id,
            table: hand.table_name,
            stakes: hand.stakes,
            pot: hand.main_pot,
            result: player?.result || 0,
            players: hand.players.length,
            playedAt: hand.played_at,
            heroCards: (player as any)?.hole_cards || (player as any)?.holeCards || 'Unknown',
        };

        // Send to World Hub personal assistant via postMessage
        if (window.parent !== window) {
            // In iframe - send to parent
            window.parent.postMessage({
                type: 'ANALYZE_HAND',
                payload: handSummary
            }, window.location.origin);
            toast.success('Hand sent to Jarvis for analysis!');
        } else {
            // Standalone - open Jarvis in new tab with hand data
            const encodedData = encodeURIComponent(JSON.stringify(handSummary));
            window.open(`https://smarter.poker/hub/jarvis?hand=${encodedData}`, '_blank');
            toast.info('Opening Jarvis analysis...');
        }
    };

    return (
        <div className="hand-history-page">
            <SmarterHeader title=" Hand History" />

            {/* Filters */}
            <div className="hh-filters">
                {(['all', 'won', 'lost', 'big-pots'] as HistoryFilter[]).map((f) => (
                    <button
                        key={f}
                        className={`filter-btn ${filter === f ? 'active' : ''}`}
                        onClick={() => setFilter(f)}
                    >
                        {f === 'all' ? 'All Hands' :
                            f === 'won' ? ' Won' :
                                f === 'lost' ? ' Lost' :
                                    ' Big Pots'}
                    </button>
                ))}
            </div>

            {/* Stats Summary */}
            {!loading && hands.length > 0 && (
                <div className="hh-summary">
                    <div className="summary-stat">
                        <span className="stat-value">{hands.length}</span>
                        <span className="stat-label">Hands</span>
                    </div>
                    <div className="summary-stat positive">
                        <span className="stat-value">{stats.wins}</span>
                        <span className="stat-label">Won</span>
                    </div>
                    <div className="summary-stat negative">
                        <span className="stat-value">{stats.losses}</span>
                        <span className="stat-label">Lost</span>
                    </div>
                    <div className={`summary-stat ${stats.totalPL >= 0 ? 'positive' : 'negative'}`}>
                        <span className="stat-value">{stats.totalPL >= 0 ? '+' : ''}{stats.totalPL.toLocaleString()}</span>
                        <span className="stat-label">P/L</span>
                    </div>
                    <button className="export-btn" onClick={handleExport}> Export</button>
                </div>
            )}

            {/* Hands List */}
            <div className="hands-list">
                {loading ? (
                    <div className="loading-state">
                        <div className="spinner" />
                        <p>Loading hands...</p>
                    </div>
                ) : hands.length === 0 ? (
                    <div className="empty-state">
                        <span className="empty-icon">♠</span>
                        <p>No hands found. Play some poker!</p>
                    </div>
                ) : (
                    hands.map((hand) => {
                        const result = getPlayerResult(hand);
                        return (
                            <div
                                key={hand.id}
                                className="hand-card"
                                onClick={() => openReplay(hand)}
                            >
                                <div className="hand-header">
                                    <span className="table-name">{hand.table_name}</span>
                                    <span className="hand-date">{formatDate(hand.played_at)}</span>
                                </div>
                                <div className="hand-body">
                                    <div className="pot-info">
                                        <span className="pot-label">Pot</span>
                                        <span className="pot-value">{hand.main_pot.toLocaleString()}</span>
                                    </div>
                                    <div className={`result-info ${result >= 0 ? 'positive' : 'negative'}`}>
                                        <span className="result-label">Result</span>
                                        <span className="result-value">
                                            {result >= 0 ? '+' : ''}{result.toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                                <div className="hand-footer">
                                    <span className="stakes">{hand.stakes}</span>
                                    <span className="players">{hand.players.length} players</span>
                                    <button className="analyze-btn" onClick={(e) => { e.stopPropagation(); analyzeWithJarvis(hand); }}>🧠 Analyze</button>
                                    <button className="share-btn" onClick={(e) => {
                                        e.stopPropagation();
                                        const winnerSeats = hand.players.filter(p => p.is_winner).map(p => p.seat);
                                        setShareHand({
                                            id: hand.id,
                                            tableName: hand.table_name,
                                            variant: (hand.game_type?.includes('PLO') ? 'PLO4' : 'NLH') as ShareableHand['variant'],
                                            stakes: hand.stakes,
                                            timestamp: new Date(hand.played_at).getTime(),
                                            buttonSeat: 0, // Default, actual info in players' positions
                                            players: hand.players.map((p, i) => ({
                                                seat: p.seat || i,
                                                name: p.username || `Player ${i + 1}`,
                                                stack: 1000, // Default stack
                                                isHero: p.user_id === user?.id,
                                                isWinner: p.is_winner,
                                            })),
                                            preflop: [],
                                            potTotal: hand.main_pot,
                                            winners: winnerSeats.map((seat) => ({ seat, amount: hand.main_pot / (winnerSeats.length || 1) })),
                                        });
                                        setShowShare(true);
                                    }}>📤 Share</button>
                                    <button className="replay-btn">▶ Replay</button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Load More Button */}
            {!loading && hasMore && hands.length > 0 && (
                <button className="load-more-btn" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? 'Loading...' : 'Load More Hands'}
                </button>
            )}

            {/* Replay Modal */}
            {showReplay && selectedHand && (
                <div className="replay-modal-overlay" onClick={() => setShowReplay(false)}>
                    <div className="replay-modal-content" onClick={(e) => e.stopPropagation()}>
                        <button className="modal-close" onClick={() => setShowReplay(false)}>✕</button>
                        <HandReplay handId={selectedHand.id} onClose={() => setShowReplay(false)} />
                    </div>
                </div>
            )}

            {/* Share Modal */}
            {showShare && shareHand && (
                <ShareHand
                    isOpen={showShare}
                    onClose={() => setShowShare(false)}
                    hand={shareHand}
                    clubName="Club Arena"
                />
            )}
        </div>
    );
}


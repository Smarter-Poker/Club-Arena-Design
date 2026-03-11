/**
 * ♠ CLUB ARENA — Hand Replayer Page
 * PokerBros-style shareable hand replay with social meta tags
 * URL: /share/hand/:handId
 */

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { handHistoryService } from '../../services/HandHistoryService';
import './HandReplayerPage.css';

const playerSeatAnimationStyle = (index: number) => ({
    opacity: 0,
    transform: 'translateY(10px)',
    animation: `fadeInUp 0.5s ease-out ${index * 70}ms forwards`,
});

interface HandAction {
    player: string;
    action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in';
    amount?: number;
    timestamp: number;
}

interface HandData {
    id: string;
    table_name: string;
    game_type: string;
    stakes: string;
    pot: number;
    community_cards: string[];
    players: {
        seat: number;
        name: string;
        avatar?: string;
        stack: number;
        cards?: string[];
        is_winner?: boolean;
    }[];
    actions: HandAction[];
    played_at: string;
    winner?: string;
}

export default function HandReplayerPage() {
    const { handId } = useParams<{ handId: string }>();
    const [hand, setHand] = useState<HandData | null>(null);
    const [loading, setLoading] = useState(true);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentStep, setCurrentStep] = useState(0);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (handId) {
            loadHand();
        }
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [handId]);

    const loadHand = async () => {
        try {
            const record = await handHistoryService.getHand(handId!);

            if (!record) {
                setHand(null);
                return;
            }

            // Map HandRecord → HandData for the replayer UI
            const winnerPlayer = record.players.find(p => p.is_winner);
            const mapped: HandData = {
                id: record.id,
                table_name: record.table_name,
                game_type: record.game_type,
                stakes: record.stakes,
                pot: record.main_pot + (record.side_pots || []).reduce((s, v) => s + v, 0),
                community_cards: (record.community_cards || []).map(c => typeof c === 'string' ? c : `${c}`),
                players: record.players.map(p => ({
                    seat: p.seat,
                    name: p.username || p.user_id.slice(0, 8),
                    avatar: p.avatar_url || undefined,
                    stack: p.result,
                    cards: p.hole_cards?.length ? p.hole_cards.map(c => typeof c === 'string' ? c : `${c}`) : undefined,
                    is_winner: p.is_winner,
                })),
                actions: record.actions.map((a, idx) => {
                    const player = record.players.find(p => p.user_id === a.player_id);
                    return {
                        player: player?.username || a.player_id.slice(0, 8),
                        action: a.action === 'all-in' ? 'all_in' : a.action as HandAction['action'],
                        amount: a.amount,
                        timestamp: idx,
                    };
                }),
                played_at: record.played_at,
                winner: winnerPlayer?.username || undefined,
            };

            setHand(mapped);
        } catch (error) {
            console.error('Failed to load hand:', error);
        } finally {
            setLoading(false);
        }
    };

    const togglePlay = () => {
        if (isPlaying) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            setIsPlaying(false);
        } else {
            setIsPlaying(true);
            intervalRef.current = setInterval(() => {
                setCurrentStep((prev) => {
                    if (hand && prev >= hand.actions.length - 1) {
                        clearInterval(intervalRef.current!);
                        setIsPlaying(false);
                        return prev;
                    }
                    return prev + 1;
                });
            }, 1500);
        }
    };

    const rewind = () => {
        setCurrentStep(0);
        setIsPlaying(false);
        if (intervalRef.current) clearInterval(intervalRef.current);
    };

    const forward = () => {
        if (hand && currentStep < hand.actions.length - 1) {
            setCurrentStep((prev) => prev + 1);
        }
    };

    const getCardDisplay = (card: string) => {
        const rank = card.slice(0, -1);
        const suit = card.slice(-1);
        const suitSymbols: Record<string, string> = { h: '♥', d: '♦', c: '♣', s: '♠' };
        const isRed = suit === 'h' || suit === 'd';
        return { rank, symbol: suitSymbols[suit] || suit, isRed };
    };

    const shareUrl = `https://smarter.poker/hub/club-arena/share/hand/${handId}`;

    if (loading) {
        return (
            <div className="hand-replayer loading">
                <div className="loader-spinner" />
                <p>Loading hand replay...</p>
            </div>
        );
    }

    if (!hand) {
        return (
            <div className="hand-replayer error">
                <h2>Hand Not Found</h2>
                <p>This hand may have expired or been removed.</p>
            </div>
        );
    }

    // Set document title for this page
    useEffect(() => {
        document.title = 'Hand Replay | Smarter.Poker';
        // Note: OG meta tags should be set server-side for proper social sharing
    }, [hand]);

    return (
        <>
            <div className="hand-replayer">
                {/* Background pattern */}
                <div className="replayer-bg" />

                {/* Sound toggle */}
                <button
                    className="sound-toggle"
                    onClick={() => setSoundEnabled(!soundEnabled)}
                >
                    {soundEnabled ? '🔊' : '🔇'}
                </button>

                {/* Table */}
                <div className="replay-table">
                    <div className="table-felt">
                        <div className="table-center">
                            <div className="game-info">
                                <span className="game-type">{hand.game_type}</span>
                                <span className="stakes">{hand.stakes}</span>
                            </div>
                            <div className="pot-display">
                                <span className="pot-label">POT</span>
                                <span className="pot-amount">{hand.pot.toLocaleString()}</span>
                            </div>
                            {/* Community cards */}
                            <div className="community-cards">
                                {hand.community_cards.map((card, idx) => {
                                    const { rank, symbol, isRed } = getCardDisplay(card);
                                    return (
                                        <div key={idx} className={`card ${isRed ? 'red' : 'black'}`}>
                                            <span className="card-rank">{rank}</span>
                                            <span className="card-suit">{symbol}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Player seats */}
                    {hand.players.map((player, idx) => (
                        <div
                            key={player.seat}
                            style={playerSeatAnimationStyle(idx)}
                            className={`player-seat seat-${player.seat} ${player.is_winner ? 'winner' : ''}`}
                        >
                            <div className="player-avatar">
                                {player.avatar || player.name.charAt(0)}
                            </div>
                            <div className="player-info-pod">
                                <span className="player-name">{player.name}</span>
                                <span className="player-stack">{player.stack.toLocaleString()}</span>
                            </div>
                            {player.cards && (
                                <div className="player-cards">
                                    {player.cards.map((card, cIdx) => {
                                        const { rank, symbol, isRed } = getCardDisplay(card);
                                        return (
                                            <div key={cIdx} className={`hole-card ${isRed ? 'red' : 'black'}`}>
                                                <span>{rank}{symbol}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            {/* Action bubble for current step */}
                            {hand.actions[currentStep]?.player === player.name && (
                                <div className="action-bubble">
                                    {(hand.actions[currentStep]?.action || '').toUpperCase()}
                                    {hand.actions[currentStep].amount &&
                                        ` ${hand.actions[currentStep].amount}`}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Playback controls */}
                <div className="playback-controls">
                    <button className="ctrl-btn" onClick={rewind}>⏮</button>
                    <button className="ctrl-btn play" onClick={togglePlay}>
                        {isPlaying ? '⏸' : '▶'}
                    </button>
                    <button className="ctrl-btn" onClick={forward}>⏭</button>
                </div>

                {/* Action timeline */}
                <div className="action-timeline">
                    {hand.actions.map((action, idx) => (
                        <div
                            key={idx}
                            className={`timeline-step ${idx <= currentStep ? 'active' : ''}`}
                        />
                    ))}
                </div>

                {/* Share button */}
                <button
                    className="share-btn"
                    onClick={() => navigator.share?.({ url: shareUrl, title: 'Check out this hand!' })}
                >
                    📤 Share
                </button>

                {/* Smarter.Poker branding */}
                <div className="replayer-branding">
                    <span>♠ Smarter.Poker</span>
                </div>
            </div>
        </>
    );
}

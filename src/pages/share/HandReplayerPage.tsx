/**
 * ♠ CLUB ARENA — Hand Replayer Page
 * PokerBros-style shareable hand replay with social meta tags
 * URL: /share/hand/:handId
 */

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { HandHistoryService } from '../../services/HandHistoryService';
import './HandReplayer.css';

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
            // In production, fetch from HandHistoryService
            // For demo, use mock data
            const mockHand: HandData = {
                id: handId || 'demo',
                table_name: 'Shark Club NLH',
                game_type: 'NLH',
                stakes: '5/10',
                pot: 1250,
                community_cards: ['Ah', 'Kd', '7s', '2c', 'Jh'],
                players: [
                    { seat: 1, name: 'SharkPlayer', stack: 2500, cards: ['As', 'Ks'], is_winner: true },
                    { seat: 2, name: 'FishBait99', stack: 1800, cards: ['Qh', 'Qd'] },
                    { seat: 3, name: 'BluffMaster', stack: 3200 },
                    { seat: 4, name: 'TightTommy', stack: 1000 },
                    { seat: 5, name: 'AggroAndy', stack: 4500 },
                    { seat: 6, name: 'NitNancy', stack: 900 },
                ],
                actions: [
                    { player: 'TightTommy', action: 'fold', timestamp: 0 },
                    { player: 'AggroAndy', action: 'raise', amount: 30, timestamp: 1 },
                    { player: 'NitNancy', action: 'fold', timestamp: 2 },
                    { player: 'SharkPlayer', action: 'call', amount: 30, timestamp: 3 },
                    { player: 'FishBait99', action: 'call', amount: 30, timestamp: 4 },
                    { player: 'BluffMaster', action: 'fold', timestamp: 5 },
                    { player: 'SharkPlayer', action: 'bet', amount: 100, timestamp: 6 },
                    { player: 'FishBait99', action: 'raise', amount: 300, timestamp: 7 },
                    { player: 'AggroAndy', action: 'fold', timestamp: 8 },
                    { player: 'SharkPlayer', action: 'all_in', amount: 2500, timestamp: 9 },
                    { player: 'FishBait99', action: 'call', amount: 1800, timestamp: 10 },
                ],
                played_at: new Date().toISOString(),
                winner: 'SharkPlayer',
            };
            setHand(mockHand);
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

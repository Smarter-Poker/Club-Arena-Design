import React, { useState, useEffect, useCallback } from 'react';
import './TournamentWinnerOverlay.css';

interface TournamentWinnerOverlayProps {
    isWinner: boolean;
    prize: number;
    tournamentName: string;
    onDismiss: () => void;
}

const TournamentWinnerOverlay: React.FC<TournamentWinnerOverlayProps> = ({
    isWinner, prize, tournamentName, onDismiss
}) => {
    const [visible, setVisible] = useState(false);
    const [particles, setParticles] = useState<Array<{ id: number; x: number; delay: number; color: string }>>([]);

    useEffect(() => {
        if (isWinner) {
            setVisible(true);
            // Generate confetti particles
            const colors = ['#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899'];
            const newParticles = Array.from({ length: 30 }, (_, i) => ({
                id: i,
                x: Math.random() * 100,
                delay: Math.random() * 2,
                color: colors[Math.floor(Math.random() * colors.length)],
            }));
            setParticles(newParticles);
        }
    }, [isWinner]);

    const handleDismiss = useCallback(() => {
        setVisible(false);
        setTimeout(onDismiss, 500);
    }, [onDismiss]);

    if (!isWinner) return null;

    return (
        <div className={`winnerOverlay ${visible ? 'visible' : ''}`} onClick={handleDismiss}>
            <div className="confettiContainer">
                {particles.map(p => (
                    <div
                        key={p.id}
                        className="confettiParticle"
                        style={{
                            left: `${p.x}%`,
                            animationDelay: `${p.delay}s`,
                            backgroundColor: p.color,
                        }}
                    />
                ))}
            </div>
            <div className="winnerContent">
                <div className="winnerTrophy">🏆</div>
                <div className="winnerTitle">CHAMPION!</div>
                <div className="winnerTournament">{tournamentName}</div>
                {prize > 0 && (
                    <div className="winnerPrize">Prize: {prize}</div>
                )}
                <button className="winnerDismissBtn" onClick={handleDismiss}>Continue</button>
            </div>
        </div>
    );
};

export default TournamentWinnerOverlay;

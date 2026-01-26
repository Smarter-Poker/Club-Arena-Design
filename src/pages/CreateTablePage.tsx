/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CREATE TABLE PAGE — Game Type Selector
 * ═══════════════════════════════════════════════════════════════════════════════
 * PokerBros-style game type selection with 7 game options:
 * - NLH (No Limit Hold'em)
 * - FLH (Fixed Limit Hold'em)
 * - 6+ (Short Deck Hold'em)
 * - OMAHA (Pot Limit Omaha)
 * - FLO (Fixed Limit Omaha)
 * - MIXED GAME (Hold'em/Omaha)
 * - OFC (Open Face Chinese Poker)
 */

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './CreateTablePage.css';

interface GameType {
    id: string;
    name: string;
    subtitle: string;
    gradient: string;
    icon: string;
    unlockLevel: number;
}

const GAME_TYPES: GameType[] = [
    {
        id: 'nlh',
        name: 'NLH',
        subtitle: 'NO LIMIT HOLD\'EM',
        gradient: 'linear-gradient(135deg, #dc2626 0%, #991b1b 50%, #7f1d1d 100%)',
        icon: '♠',
        unlockLevel: 1,
    },
    {
        id: 'flh',
        name: 'FLH',
        subtitle: 'FIXED LIMIT HOLD\'EM',
        gradient: 'linear-gradient(135deg, #b45309 0%, #92400e 50%, #78350f 100%)',
        icon: '♣',
        unlockLevel: 1,
    },
    {
        id: 'shortdeck',
        name: '6+',
        subtitle: '6+ HOLD\'EM',
        gradient: 'linear-gradient(135deg, #0d9488 0%, #0f766e 50%, #115e59 100%)',
        icon: '♦',
        unlockLevel: 1,
    },
    {
        id: 'plo',
        name: 'OMAHA',
        subtitle: 'POT LIMIT OMAHA',
        gradient: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 50%, #5b21b6 100%)',
        icon: '♥',
        unlockLevel: 1,
    },
    {
        id: 'flo',
        name: 'FLO',
        subtitle: 'FIXED LIMIT OMAHA',
        gradient: 'linear-gradient(135deg, #eab308 0%, #ca8a04 50%, #a16207 100%)',
        icon: '♠',
        unlockLevel: 1,
    },
    {
        id: 'mixed',
        name: 'MIXED GAME',
        subtitle: 'HOLD\'EM/OMAHA',
        gradient: 'linear-gradient(135deg, #db2777 0%, #be185d 50%, #9d174d 100%)',
        icon: '♣',
        unlockLevel: 1,
    },
    {
        id: 'ofc',
        name: 'OFC',
        subtitle: 'OPEN FACE CHINESE POKER',
        gradient: 'linear-gradient(135deg, #16a34a 0%, #15803d 50%, #166534 100%)',
        icon: '♦',
        unlockLevel: 1,
    },
];

export default function CreateTablePage() {
    const { clubId } = useParams<{ clubId: string }>();
    const navigate = useNavigate();
    const [userLevel] = useState(1); // TODO: Get from user profile

    const handleSelectGameType = (gameType: GameType) => {
        if (userLevel < gameType.unlockLevel) {
            // Show unlock message
            return;
        }
        // Navigate to table configuration with selected game type
        navigate(`/clubs/${clubId}/create-table/${gameType.id}`);
    };

    const handleBack = () => {
        navigate(`/clubs/${clubId}`);
    };

    return (
        <div className="create-table-page">
            {/* Back Button */}
            <button className="create-table-page__back" onClick={handleBack}>
                ‹‹
            </button>

            {/* Game Type List */}
            <div className="create-table-page__list">
                {GAME_TYPES.map((gameType, index) => (
                    <button
                        key={gameType.id}
                        className={`game-type-card ${userLevel < gameType.unlockLevel ? 'locked' : ''}`}
                        style={{
                            background: gameType.gradient,
                            animationDelay: `${index * 0.05}s`
                        }}
                        onClick={() => handleSelectGameType(gameType)}
                        disabled={userLevel < gameType.unlockLevel}
                    >
                        <div className="game-type-card__create-badge">
                            CREATE»
                        </div>
                        <div className="game-type-card__content">
                            <h2 className="game-type-card__name">{gameType.name}</h2>
                            <p className="game-type-card__subtitle">{gameType.subtitle}</p>
                        </div>
                        <div className="game-type-card__icon">
                            {/* Decorative icon area - would use actual game graphics */}
                        </div>
                    </button>
                ))}
            </div>

            {/* Table Template Button */}
            <div className="create-table-page__footer">
                <button className="template-button">
                    <span>Table Template</span>
                    <span className="template-icon">⚙</span>
                </button>
                <p className="unlock-hint">Unlock at level 1 🔒</p>
            </div>

            {/* Background */}
            <div className="create-table-page__background"></div>
        </div>
    );
}

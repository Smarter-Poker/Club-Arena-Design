import React from 'react';
import './MiniTable.css';

interface PlayerPosition {
    seat: number;
    name: string;
    stack: number;
    isHero?: boolean;
    isActive?: boolean;
}

interface MiniTableProps {
    tableId: string;
    tableName: string;
    pot: number;
    communityCards?: string[];
    players: PlayerPosition[];
    isYourTurn?: boolean;
    onClick?: () => void;
}

export const MiniTable: React.FC<MiniTableProps> = ({
    tableId,
    tableName,
    pot,
    communityCards = [],
    players,
    isYourTurn,
    onClick
}) => {
    // Simplified seat positions for mini view
    const getSeatStyle = (seat: number): React.CSSProperties => {
        const positions: Record<number, { top: string; left: string }> = {
            0: { top: '75%', left: '50%' },
            1: { top: '65%', left: '15%' },
            2: { top: '35%', left: '5%' },
            3: { top: '10%', left: '20%' },
            4: { top: '5%', left: '50%' },
            5: { top: '10%', left: '80%' },
            6: { top: '35%', left: '95%' },
            7: { top: '65%', left: '85%' },
            8: { top: '85%', left: '70%' },
        };
        return {
            top: positions[seat]?.top || '50%',
            left: positions[seat]?.left || '50%',
            transform: 'translate(-50%, -50%)',
        };
    };

    return (
        <div
            className={`mini-table ${isYourTurn ? 'your-turn' : ''}`}
            onClick={onClick}
        >
            <div className="mini-table-felt">
                {/* Players */}
                {players.map(player => (
                    <div
                        key={player.seat}
                        className={`mini-player ${player.isHero ? 'hero' : ''} ${player.isActive ? 'active' : ''}`}
                        style={getSeatStyle(player.seat)}
                    >
                        <div className="mini-avatar">
                            {player.name[0]}
                        </div>
                    </div>
                ))}

                {/* Community cards */}
                {communityCards.length > 0 && (
                    <div className="mini-board">
                        {communityCards.map((card, i) => (
                            <div key={i} className="mini-card">
                                {card}
                            </div>
                        ))}
                    </div>
                )}

                {/* Pot */}
                <div className="mini-pot">
                    {pot.toLocaleString()}
                </div>
            </div>

            <div className="mini-table-footer">
                <span className="mini-table-name">{tableName}</span>
            </div>

            {isYourTurn && (
                <div className="mini-turn-badge">!</div>
            )}
        </div>
    );
};

export default MiniTable;

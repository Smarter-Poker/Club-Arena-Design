import React, { useState } from 'react';
import './TableFeltSelector.css';

interface FeltColor {
    id: string;
    name: string;
    color: string;
    isDefault?: boolean;
    isPremium?: boolean;
}

interface TableFeltSelectorProps {
    currentFelt: string;
    onChange?: (feltId: string) => void;
}

const FELT_COLORS: FeltColor[] = [
    { id: 'classic_green', name: 'Classic Green', color: '#1a472a', isDefault: true },
    { id: 'navy', name: 'Navy Blue', color: '#1e3a5f', isDefault: true },
    { id: 'burgundy', name: 'Burgundy', color: '#6b1c1c' },
    { id: 'charcoal', name: 'Charcoal', color: '#2d3748' },
    { id: 'purple', name: 'Royal Purple', color: '#4c1d95', isPremium: true },
    { id: 'crimson', name: 'Crimson', color: '#7f1d1d', isPremium: true },
    { id: 'midnight', name: 'Midnight', color: '#0f172a', isPremium: true },
    { id: 'emerald', name: 'Emerald', color: '#064e3b', isPremium: true },
];

export const TableFeltSelector: React.FC<TableFeltSelectorProps> = ({
    currentFelt,
    onChange
}) => {
    const [selected, setSelected] = useState(currentFelt);
    const [hovered, setHovered] = useState<string | null>(null);

    const handleSelect = (felt: FeltColor) => {
        setSelected(felt.id);
        onChange?.(felt.id);
    };

    const previewColor = hovered
        ? FELT_COLORS.find(f => f.id === hovered)?.color
        : FELT_COLORS.find(f => f.id === selected)?.color;

    return (
        <div className="table-felt-selector">
            <h3>Table Felt</h3>

            <div className="felt-preview" style={{ background: previewColor }}>
                <div className="felt-table-shape">
                    <div className="felt-rail"></div>
                </div>
            </div>

            <div className="felt-options">
                {FELT_COLORS.map(felt => (
                    <button
                        key={felt.id}
                        className={`felt-option ${selected === felt.id ? 'selected' : ''}`}
                        style={{ '--felt-color': felt.color } as React.CSSProperties}
                        onClick={() => handleSelect(felt)}
                        onMouseEnter={() => setHovered(felt.id)}
                        onMouseLeave={() => setHovered(null)}
                        title={felt.name}
                    >
                        {felt.isPremium && <span className="premium-badge"></span>}
                        {selected === felt.id && <span className="check"></span>}
                    </button>
                ))}
            </div>

            <p className="selected-name">
                {FELT_COLORS.find(f => f.id === selected)?.name}
            </p>
        </div>
    );
};

export default TableFeltSelector;

import React from 'react';
import './TableSwitcher.css';

interface TableOption {
    id: string;
    name: string;
    stakes: string;
    isYourTurn: boolean;
}

interface TableSwitcherProps {
    tables: TableOption[];
    currentTableId: string;
    isOpen: boolean;
    onClose: () => void;
    onSelectTable: (tableId: string) => void;
}

export const TableSwitcher: React.FC<TableSwitcherProps> = ({
    tables,
    currentTableId,
    isOpen,
    onClose,
    onSelectTable
}) => {
    if (!isOpen) return null;

    const handleSelect = (tableId: string) => {
        onSelectTable(tableId);
        onClose();
    };

    // Keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
        if (e.key === 'Enter') {
            handleSelect(tables[index].id);
        }
    };

    return (
        <div className="table-switcher-overlay" onClick={onClose}>
            <div className="table-switcher" onClick={(e) => e.stopPropagation()}>
                <div className="switcher-header">
                    <h3>Switch Table</h3>
                    <span className="shortcut-hint">Alt + Tab</span>
                </div>

                <div className="switcher-list">
                    {tables.map((table, index) => (
                        <button
                            key={table.id}
                            className={`switcher-item ${currentTableId === table.id ? 'current' : ''} ${table.isYourTurn ? 'your-turn' : ''}`}
                            onClick={() => handleSelect(table.id)}
                            onKeyDown={(e) => handleKeyDown(e, index)}
                            autoFocus={index === 0}
                        >
                            <div className="item-number">{index + 1}</div>
                            <div className="item-info">
                                <span className="item-name">{table.name}</span>
                                <span className="item-stakes">{table.stakes}</span>
                            </div>
                            {table.isYourTurn && (
                                <span className="turn-badge">ACTION</span>
                            )}
                            {currentTableId === table.id && (
                                <span className="current-badge">●</span>
                            )}
                        </button>
                    ))}
                </div>

                <div className="switcher-footer">
                    <span>Press number to switch • Esc to close</span>
                </div>
            </div>
        </div>
    );
};

export default TableSwitcher;

import React from 'react';
import './TabBar.css';

interface TabItem {
    id: string;
    label: string;
    icon?: string;
    badge?: number;
}

interface TabBarProps {
    items: TabItem[];
    activeTab: string;
    onTabChange: (tabId: string) => void;
    position?: 'top' | 'bottom';
}

export const TabBar: React.FC<TabBarProps> = ({
    items,
    activeTab,
    onTabChange,
    position = 'bottom'
}) => {
    return (
        <nav className={`tab-bar position-${position}`}>
            {items.map(item => (
                <button
                    key={item.id}
                    className={`tab-item ${activeTab === item.id ? 'active' : ''}`}
                    onClick={() => onTabChange(item.id)}
                >
                    {item.icon && <span className="tab-icon">{item.icon}</span>}
                    <span className="tab-label">{item.label}</span>
                    {item.badge !== undefined && item.badge > 0 && (
                        <span className="tab-badge">{item.badge}</span>
                    )}
                </button>
            ))}
        </nav>
    );
};

export default TabBar;

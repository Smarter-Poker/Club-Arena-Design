import React from 'react';
import './NavItem.css';

interface NavItemProps {
    icon?: string;
    label: string;
    active?: boolean;
    onClick?: () => void;
    href?: string;
    badge?: number;
    collapsed?: boolean;
}

export const NavItem: React.FC<NavItemProps> = ({
    icon,
    label,
    active = false,
    onClick,
    href,
    badge,
    collapsed = false
}) => {
    const content = (
        <>
            {icon && <span className="nav-icon">{icon}</span>}
            {!collapsed && <span className="nav-label">{label}</span>}
            {badge !== undefined && badge > 0 && (
                <span className="nav-badge">{badge > 99 ? '99+' : badge}</span>
            )}
        </>
    );

    if (href) {
        return (
            <a
                href={href}
                className={`nav-item ${active ? 'active' : ''} ${collapsed ? 'collapsed' : ''}`}
            >
                {content}
            </a>
        );
    }

    return (
        <button
            className={`nav-item ${active ? 'active' : ''} ${collapsed ? 'collapsed' : ''}`}
            onClick={onClick}
        >
            {content}
        </button>
    );
};

export default NavItem;

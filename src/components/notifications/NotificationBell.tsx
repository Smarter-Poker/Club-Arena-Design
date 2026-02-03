import React from 'react';
import './NotificationBell.css';

interface NotificationBellProps {
    count: number;
    onClick?: () => void;
    hasUrgent?: boolean;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
    count,
    onClick,
    hasUrgent = false
}) => {
    const displayCount = count > 99 ? '99+' : count;

    return (
        <button
            className={`notification-bell ${hasUrgent ? 'urgent' : ''}`}
            onClick={onClick}
            aria-label={`${count} notifications`}
        >
            <span className="bell-icon">🔔</span>
            {count > 0 && (
                <span className="notification-badge">
                    {displayCount}
                </span>
            )}
        </button>
    );
};

export default NotificationBell;

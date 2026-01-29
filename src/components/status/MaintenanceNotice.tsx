import React from 'react';
import './MaintenanceNotice.css';

interface MaintenanceNoticeProps {
    scheduledTime?: Date;
    duration?: string;
    message?: string;
    isUrgent?: boolean;
}

export const MaintenanceNotice: React.FC<MaintenanceNoticeProps> = ({
    scheduledTime,
    duration = '30 minutes',
    message,
    isUrgent = false
}) => {
    const formatTime = (date: Date) => {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className={`maintenance-notice ${isUrgent ? 'urgent' : ''}`}>
            <span className="notice-icon">{isUrgent ? '' : '🔧'}</span>
            <div className="notice-content">
                {message || (
                    <>
                        Scheduled maintenance {scheduledTime ? `at ${formatTime(scheduledTime)}` : 'soon'}
                        {duration && <span className="duration">~{duration}</span>}
                    </>
                )}
            </div>
        </div>
    );
};

export default MaintenanceNotice;

import React, { useState } from 'react';
import './SettingsPanel.css';

type SettingsTab = 'general' | 'sound' | 'notifications' | 'privacy' | 'gameplay' | 'appearance';

interface SettingsPanelProps {
    onClose?: () => void;
    initialTab?: SettingsTab;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
    onClose,
    initialTab = 'general'
}) => {
    const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

    const tabs: { id: SettingsTab; label: string; icon: string }[] = [
        { id: 'general', label: 'General', icon: '' },
        { id: 'sound', label: 'Sound', icon: '' },
        { id: 'notifications', label: 'Notifications', icon: '' },
        { id: 'privacy', label: 'Privacy', icon: '' },
        { id: 'gameplay', label: 'Gameplay', icon: '' },
        { id: 'appearance', label: 'Appearance', icon: '' },
    ];

    return (
        <div className="settings-panel">
            <div className="settings-header">
                <h2>Settings</h2>
                {onClose && (
                    <button className="settings-close" onClick={onClose}>×</button>
                )}
            </div>

            <div className="settings-tabs">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        <span className="tab-icon">{tab.icon}</span>
                        <span className="tab-label">{tab.label}</span>
                    </button>
                ))}
            </div>

            <div className="settings-content">
                {activeTab === 'general' && (
                    <div className="settings-section">
                        <h3>General Settings</h3>
                        <div className="setting-row">
                            <label>Language</label>
                            <select defaultValue="en">
                                <option value="en">English</option>
                                <option value="es">Español</option>
                                <option value="pt">Português</option>
                                <option value="zh">中文</option>
                            </select>
                        </div>
                        <div className="setting-row">
                            <label>Currency Display</label>
                            <select defaultValue="chips">
                                <option value="chips">Chips</option>
                                <option value="bb">Big Blinds</option>
                            </select>
                        </div>
                        <div className="setting-row">
                            <label>Time Zone</label>
                            <select defaultValue="auto">
                                <option value="auto">Auto-detect</option>
                                <option value="utc">UTC</option>
                                <option value="est">Eastern</option>
                                <option value="pst">Pacific</option>
                            </select>
                        </div>
                    </div>
                )}

                {activeTab === 'sound' && (
                    <div className="settings-section">
                        <h3>Sound Settings</h3>
                        <p className="settings-placeholder">Sound settings component</p>
                    </div>
                )}

                {activeTab === 'notifications' && (
                    <div className="settings-section">
                        <h3>Notification Settings</h3>
                        <p className="settings-placeholder">Notification settings component</p>
                    </div>
                )}

                {activeTab === 'privacy' && (
                    <div className="settings-section">
                        <h3>Privacy Settings</h3>
                        <p className="settings-placeholder">Privacy settings component</p>
                    </div>
                )}

                {activeTab === 'gameplay' && (
                    <div className="settings-section">
                        <h3>Gameplay Settings</h3>
                        <p className="settings-placeholder">Gameplay settings component</p>
                    </div>
                )}

                {activeTab === 'appearance' && (
                    <div className="settings-section">
                        <h3>Appearance Settings</h3>
                        <p className="settings-placeholder">Appearance settings component</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SettingsPanel;

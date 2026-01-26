/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  TABLE SETTINGS — VIP-Gated Table Options
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Settings panel with VIP feature gating:
 * - Show Stack in BBs (VIP: free, Non-VIP: 5/session)
 * - Offline Protection (VIP Gold only)
 * - Auto Time Bank (VIP: free, Non-VIP: 10/session)
 */

import React, { useState, useEffect } from 'react';
import { vipService, FEATURE_PRICING, VIPFeature } from '../../services/VIPService';
import { useUserStore } from '../../stores/useUserStore';
import { useToast } from '../common/Toast';
import './TableSettings.css';

interface TableSettingsProps {
    isOpen: boolean;
    onClose: () => void;
    bigBlind: number;
    onSettingsChange: (settings: TableSettingsState) => void;
    currentSettings: TableSettingsState;
}

export interface TableSettingsState {
    showStackInBB: boolean;
    offlineProtection: boolean;
    autoTimeBank: boolean;
}

interface SettingToggle {
    key: keyof TableSettingsState;
    feature: VIPFeature;
    label: string;
    description: string;
    icon: string;
}

const SETTINGS: SettingToggle[] = [
    {
        key: 'showStackInBB',
        feature: 'show_stack_bb',
        label: 'Show Stack in BBs',
        description: 'Display stacks as big blind multiples',
        icon: ''
    },
    {
        key: 'offlineProtection',
        feature: 'offline_protection',
        label: 'Offline Protection',
        description: 'Auto-sit out when connection drops',
        icon: ''
    },
    {
        key: 'autoTimeBank',
        feature: 'auto_time_bank',
        label: 'Auto Time Bank',
        description: 'Automatically use time bank when timer runs low',
        icon: ''
    }
];

export function TableSettings({
    isOpen,
    onClose,
    bigBlind,
    onSettingsChange,
    currentSettings
}: TableSettingsProps) {
    const { user } = useUserStore();
    const toast = useToast();

    const [settings, setSettings] = useState<TableSettingsState>(currentSettings);
    const [featureAccess, setFeatureAccess] = useState<Record<VIPFeature, { hasAccess: boolean; isVIP: boolean; cost: number }>>({} as any);
    const [loading, setLoading] = useState(true);

    // Check VIP access for all features on mount
    useEffect(() => {
        const checkAccess = async () => {
            if (!user?.id) {
                setLoading(false);
                return;
            }

            const access: Record<string, { hasAccess: boolean; isVIP: boolean; cost: number }> = {};

            for (const setting of SETTINGS) {
                try {
                    const result = await vipService.checkFeatureAccess(user.id, setting.feature);
                    access[setting.feature] = {
                        hasAccess: result.hasAccess,
                        isVIP: result.isVIP,
                        cost: FEATURE_PRICING[setting.feature].cost
                    };
                } catch {
                    access[setting.feature] = { hasAccess: false, isVIP: false, cost: FEATURE_PRICING[setting.feature].cost };
                }
            }

            setFeatureAccess(access as any);
            setLoading(false);
        };

        if (isOpen) {
            checkAccess();
        }
    }, [isOpen, user?.id]);

    const handleToggle = async (setting: SettingToggle) => {
        if (!user?.id) {
            toast.error('Please log in');
            return;
        }

        const currentValue = settings[setting.key];
        const access = featureAccess[setting.feature];

        // If turning ON and doesn't have access, need to purchase
        if (!currentValue && !access?.hasAccess) {
            const result = await vipService.purchaseFeature(user.id, setting.feature);

            if (!result.success) {
                toast.error(result.error || 'Insufficient diamonds');
                return;
            }

            toast.info(` ${result.charged} diamonds charged for ${setting.label}`);

            // Update access state
            setFeatureAccess(prev => ({
                ...prev,
                [setting.feature]: { ...prev[setting.feature], hasAccess: true }
            }));
        }

        // Toggle the setting
        const newSettings = { ...settings, [setting.key]: !currentValue };
        setSettings(newSettings);
        onSettingsChange(newSettings);
    };

    if (!isOpen) return null;

    return (
        <div className="table-settings-overlay" onClick={onClose}>
            <div className="table-settings" onClick={e => e.stopPropagation()}>
                <div className="table-settings__header">
                    <h3> Table Settings</h3>
                    <button className="table-settings__close" onClick={onClose}>×</button>
                </div>

                <div className="table-settings__content">
                    {loading ? (
                        <div className="table-settings__loading">Loading...</div>
                    ) : (
                        SETTINGS.map(setting => {
                            const access = featureAccess[setting.feature];
                            const isEnabled = settings[setting.key];
                            const isFree = access?.isVIP || access?.hasAccess;

                            return (
                                <div
                                    key={setting.key}
                                    className={`table-settings__item ${isEnabled ? 'active' : ''}`}
                                    onClick={() => handleToggle(setting)}
                                >
                                    <div className="table-settings__item-icon">{setting.icon}</div>
                                    <div className="table-settings__item-info">
                                        <span className="table-settings__item-label">{setting.label}</span>
                                        <span className="table-settings__item-desc">{setting.description}</span>
                                    </div>
                                    <div className="table-settings__item-cost">
                                        {isFree ? (
                                            <span className="cost-free"> FREE</span>
                                        ) : (
                                            <span className="cost-diamond">{access?.cost || 0}</span>
                                        )}
                                    </div>
                                    <div className={`table-settings__toggle ${isEnabled ? 'on' : 'off'}`}>
                                        <div className="toggle-track">
                                            <div className="toggle-thumb" />
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="table-settings__footer">
                    <span className="table-settings__bb-info">
                        Current Big Blind: <strong>{bigBlind}</strong> chips
                    </span>
                </div>
            </div>
        </div>
    );
}

export default TableSettings;

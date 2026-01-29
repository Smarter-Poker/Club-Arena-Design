/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  TABLE CREATOR — Create New Cash Game Tables
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../stores/useUserStore';
import { useToast } from '../common/Toast';
import './TableCreator.css';

interface TableCreatorProps {
    clubId: string;
    isOpen: boolean;
    onClose: () => void;
    onCreate?: (tableId: string) => void;
}

interface TableConfig {
    name: string;
    gameType: 'nlh' | 'plo' | 'plo5' | 'mixed';
    stakes: string;
    maxPlayers: number;
    minBuyIn: number;
    maxBuyIn: number;
    isPrivate: boolean;
    password?: string;
    autoStart: boolean;
    runItTwice: boolean;
    insurance: boolean;
    straddle: boolean;
    antesEnabled: boolean;
}

const GAME_TYPES = [
    { value: 'nlh', label: 'No-Limit Hold\'em' },
    { value: 'plo', label: 'Pot-Limit Omaha' },
    { value: 'plo5', label: 'PLO-5' },
    { value: 'mixed', label: 'Mixed Game' }
];

const STAKES_PRESETS = [
    { value: '1/2', sb: 1, bb: 2 },
    { value: '2/5', sb: 2, bb: 5 },
    { value: '5/10', sb: 5, bb: 10 },
    { value: '10/20', sb: 10, bb: 20 },
    { value: '25/50', sb: 25, bb: 50 },
    { value: 'custom', sb: 0, bb: 0 }
];

export function TableCreator({ clubId, isOpen, onClose, onCreate }: TableCreatorProps) {
    const { user } = useUserStore();
    const toast = useToast();

    const [config, setConfig] = useState<TableConfig>({
        name: '',
        gameType: 'nlh',
        stakes: '1/2',
        maxPlayers: 9,
        minBuyIn: 40,
        maxBuyIn: 200,
        isPrivate: false,
        autoStart: true,
        runItTwice: true,
        insurance: false,
        straddle: true,
        antesEnabled: false
    });
    const [creating, setCreating] = useState(false);

    const updateConfig = (key: keyof TableConfig, value: any) => {
        setConfig(prev => ({ ...prev, [key]: value }));
    };

    const handleStakesChange = (stakes: string) => {
        const preset = STAKES_PRESETS.find(s => s.value === stakes);
        if (preset && preset.value !== 'custom') {
            setConfig(prev => ({
                ...prev,
                stakes,
                minBuyIn: preset.bb * 20,
                maxBuyIn: preset.bb * 100
            }));
        } else {
            updateConfig('stakes', stakes);
        }
    };

    const createTable = async () => {
        if (!user?.id || !config.name.trim()) {
            toast.error('Please enter a table name');
            return;
        }

        setCreating(true);
        try {
            const stakes = config.stakes.split('/');
            const { data, error } = await supabase
                .from('tables')
                .insert({
                    club_id: clubId,
                    owner_id: user.id,
                    name: config.name,
                    game_type: config.gameType,
                    small_blind: parseInt(stakes[0]) || 1,
                    big_blind: parseInt(stakes[1]) || 2,
                    max_players: config.maxPlayers,
                    min_buy_in: config.minBuyIn,
                    max_buy_in: config.maxBuyIn,
                    is_private: config.isPrivate,
                    password: config.isPrivate ? config.password : null,
                    settings: {
                        autoStart: config.autoStart,
                        runItTwice: config.runItTwice,
                        insurance: config.insurance,
                        straddle: config.straddle,
                        antesEnabled: config.antesEnabled
                    },
                    status: 'waiting'
                })
                .select()
                .single();

            if (error) throw error;

            toast.success('Table created!');
            onCreate?.(data.id);
            onClose();
        } catch (error) {
            toast.error('Failed to create table');
        }
        setCreating(false);
    };

    if (!isOpen) return null;

    return (
        <div className="table-creator-overlay" onClick={onClose}>
            <div className="table-creator" onClick={e => e.stopPropagation()}>
                <div className="table-creator__header">
                    <h3> Create Table</h3>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <div className="table-creator__form">
                    <div className="form-group">
                        <label>Table Name</label>
                        <input
                            type="text"
                            value={config.name}
                            onChange={e => updateConfig('name', e.target.value)}
                            placeholder="My Table"
                        />
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>Game Type</label>
                            <select
                                value={config.gameType}
                                onChange={e => updateConfig('gameType', e.target.value)}
                            >
                                {GAME_TYPES.map(t => (
                                    <option key={t.value} value={t.value}>{t.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Stakes</label>
                            <select
                                value={config.stakes}
                                onChange={e => handleStakesChange(e.target.value)}
                            >
                                {STAKES_PRESETS.map(s => (
                                    <option key={s.value} value={s.value}>{s.value}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>Min Buy-In</label>
                            <input
                                type="number"
                                value={config.minBuyIn}
                                onChange={e => updateConfig('minBuyIn', parseInt(e.target.value))}
                            />
                        </div>
                        <div className="form-group">
                            <label>Max Buy-In</label>
                            <input
                                type="number"
                                value={config.maxBuyIn}
                                onChange={e => updateConfig('maxBuyIn', parseInt(e.target.value))}
                            />
                        </div>
                        <div className="form-group">
                            <label>Max Players</label>
                            <select value={config.maxPlayers} onChange={e => updateConfig('maxPlayers', parseInt(e.target.value))}>
                                {[2, 4, 6, 8, 9].map(n => (
                                    <option key={n} value={n}>{n}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="form-group toggles">
                        <label className="toggle">
                            <input type="checkbox" checked={config.runItTwice} onChange={e => updateConfig('runItTwice', e.target.checked)} />
                            Run It Twice
                        </label>
                        <label className="toggle">
                            <input type="checkbox" checked={config.straddle} onChange={e => updateConfig('straddle', e.target.checked)} />
                            Straddle
                        </label>
                        <label className="toggle">
                            <input type="checkbox" checked={config.insurance} onChange={e => updateConfig('insurance', e.target.checked)} />
                            Insurance
                        </label>
                        <label className="toggle">
                            <input type="checkbox" checked={config.isPrivate} onChange={e => updateConfig('isPrivate', e.target.checked)} />
                            Private Table
                        </label>
                    </div>
                </div>

                <button
                    className="table-creator__submit"
                    onClick={createTable}
                    disabled={creating || !config.name.trim()}
                >
                    {creating ? 'Creating...' : 'Create Table'}
                </button>
            </div>
        </div>
    );
}

export default TableCreator;

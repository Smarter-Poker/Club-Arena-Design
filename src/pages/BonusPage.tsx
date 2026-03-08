/**
 *  BONUS PAGE — Daily Bonuses & Rewards
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useUserStore } from '../stores/useUserStore';
import { bonusService } from '../services/BonusService';
import { useToast } from '../components/common/Toast';
import SmarterHeader from '../components/layout/SmarterHeader';
import './BonusPage.css';

interface DailyBonus {
    day: number;
    reward: string;
    claimed: boolean;
}

interface SpecialBonus {
    id: string;
    title: string;
    description: string;
    reward: string;
    expires_at: string;
    claimed: boolean;
}

export default function BonusPage() {
    const navigate = useNavigate();
    const { user } = useUserStore();

    const [dailyBonuses, setDailyBonuses] = useState<DailyBonus[]>([]);
    const [currentDay, setCurrentDay] = useState(1);
    const [specialBonuses, setSpecialBonuses] = useState<SpecialBonus[]>([]);
    const [loading, setLoading] = useState(true);
    const [claiming, setClaiming] = useState(false);
    const toast = useToast();

    useEffect(() => {
        if (user?.id) {
            loadBonuses();

            // Real-time bonus updates
            const channel = supabase
                .channel('bonuses-live')
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'special_bonuses',
                        filter: `user_id=eq.${user.id}`,
                    },
                    () => {
                        toast.info(' New bonus available!');
                        loadBonuses();
                    }
                )
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        }
    }, [user?.id]);

    const loadBonuses = async () => {
        setLoading(true);
        try {
            // Load user's daily login streak
            const { data: profile } = await supabase
                .from('profiles')
                .select('streak_days, last_login')
                .eq('id', user?.id)
                .single();

            if (profile) {
                setCurrentDay(profile.streak_days || 1);

                // Generate daily bonuses (7-day cycle)
                const dailies: DailyBonus[] = [];
                for (let i = 1; i <= 7; i++) {
                    dailies.push({
                        day: i,
                        reward: i === 7 ? ' 100 Diamonds' : `${i * 10} Chips`,
                        claimed: i <= (profile.streak_days || 0),
                    });
                }
                setDailyBonuses(dailies);
            }

            // Load special bonuses
            const { data: specials } = await supabase
                .from('special_bonuses')
                .select('*')
                .eq('user_id', user?.id)
                .gte('expires_at', new Date().toISOString())
                .order('expires_at', { ascending: true });

            if (specials) {
                setSpecialBonuses(specials.map((b: any) => ({
                    id: b.id,
                    title: b.title,
                    description: b.description,
                    reward: b.reward,
                    expires_at: b.expires_at,
                    claimed: b.claimed,
                })));
            }
        } catch (error) {
            console.error('Failed to load bonuses:', error);
            toast.error('Failed to load bonuses');
        }
        setLoading(false);
    };

    const claimDailyBonus = async () => {
        if (claiming) return;
        setClaiming(true);
        try {
            // Update streak and claim bonus
            const { error: claimErr } = await supabase.rpc('claim_daily_bonus', { user_id: user?.id });
            if (claimErr) {
                console.error('[BonusPage] claim_daily_bonus failed:', claimErr.message);
                toast.error('Failed to claim bonus');
                setClaiming(false);
                return;
            }
            toast.success('Daily bonus claimed!');
            loadBonuses();
        } catch (error) {
            console.error('Failed to claim bonus:', error);
            toast.error('Failed to claim bonus');
        }
        setClaiming(false);
    };

    const claimSpecialBonus = async (bonusId: string) => {
        try {
            await supabase
                .from('special_bonuses')
                .update({ claimed: true })
                .eq('id', bonusId);
            toast.success('Special bonus claimed!');
            loadBonuses();
        } catch (error) {
            console.error('Failed to claim special bonus:', error);
            toast.error('Failed to claim special bonus');
        }
    };

    const getTimeRemaining = (expiresAt: string): string => {
        const diff = new Date(expiresAt).getTime() - Date.now();
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        if (hours > 24) return `${Math.floor(hours / 24)}d left`;
        if (hours > 0) return `${hours}h ${minutes}m left`;
        return `${minutes}m left`;
    };

    if (loading) {
        return (
            <div className="bonus-page">
                <SmarterHeader title=" Bonuses" />
                <div className="loading-state"><div className="spinner" /></div>
            </div>
        );
    }

    return (
        <div className="bonus-page">
            <SmarterHeader title=" Bonuses" />

            {/* Daily Login Calendar */}
            <section className="bonus-section">
                <h3>Daily Login Bonus</h3>
                <p className="section-desc">Login daily to earn rewards!</p>
                <div className="daily-calendar">
                    {dailyBonuses.map(bonus => (
                        <div
                            key={bonus.day}
                            className={`day-card ${bonus.claimed ? 'claimed' : ''} ${bonus.day === currentDay ? 'current' : ''}`}
                        >
                            <span className="day-num">Day {bonus.day}</span>
                            <span className="day-reward">{bonus.reward}</span>
                            {bonus.claimed && <span className="claimed-check"></span>}
                        </div>
                    ))}
                </div>
                <button
                    className="btn btn-primary claim-btn"
                    onClick={claimDailyBonus}
                    disabled={claiming || dailyBonuses[currentDay - 1]?.claimed}
                >
                    {claiming ? 'Claiming...' : dailyBonuses[currentDay - 1]?.claimed ? 'Already Claimed' : 'Claim Today\'s Bonus'}
                </button>
            </section>

            {/* Special Bonuses */}
            {specialBonuses.length > 0 && (
                <section className="bonus-section">
                    <h3>Special Bonuses</h3>
                    <div className="special-list">
                        {specialBonuses.map(bonus => (
                            <div key={bonus.id} className={`special-card ${bonus.claimed ? 'claimed' : ''}`}>
                                <div className="special-info">
                                    <h4>{bonus.title}</h4>
                                    <p>{bonus.description}</p>
                                    <span className="special-reward"> {bonus.reward}</span>
                                </div>
                                <div className="special-actions">
                                    <span className="special-expires">{getTimeRemaining(bonus.expires_at)}</span>
                                    {!bonus.claimed && (
                                        <button
                                            className="btn btn-sm btn-primary"
                                            onClick={() => claimSpecialBonus(bonus.id)}
                                        >
                                            Claim
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}

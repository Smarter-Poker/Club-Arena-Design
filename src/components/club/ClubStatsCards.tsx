/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CLUB STATS CARDS — Quick Overview Stats
 * Shows key metrics for club performance
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import styles from './ClubStatsCards.module.css';

interface ClubStats {
    totalMembers: number;
    onlineNow: number;
    activeTables: number;
    handsToday: number;
    rakeToday: number;
    weeklyGrowth: number;
}

interface ClubStatsCardsProps {
    clubId: string;
}

export default function ClubStatsCards({ clubId }: ClubStatsCardsProps) {
    const [stats, setStats] = useState<ClubStats>({
        totalMembers: 0,
        onlineNow: 0,
        activeTables: 0,
        handsToday: 0,
        rakeToday: 0,
        weeklyGrowth: 0
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadStats();
    }, [clubId]);

    const loadStats = async () => {
        setLoading(true);
        try {
            // Get member count
            const { count: memberCount } = await supabase
                .from('club_memberships')
                .select('id', { count: 'exact', head: true })
                .eq('club_id', clubId)
                .eq('status', 'active');

            // Get active tables
            const { count: tableCount } = await supabase
                .from('tables')
                .select('id', { count: 'exact', head: true })
                .eq('club_id', clubId)
                .eq('status', 'active');

            // Get today's stats
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const { data: todayStats } = await supabase
                .from('club_daily_stats')
                .select('hands_played, rake_collected')
                .eq('club_id', clubId)
                .gte('date', today.toISOString())
                .single();

            // Get weekly growth (compare to last week)
            const weekAgo = new Date(Date.now() - 7 * 86400000);
            const { count: newMembers } = await supabase
                .from('club_memberships')
                .select('id', { count: 'exact', head: true })
                .eq('club_id', clubId)
                .gte('created_at', weekAgo.toISOString());

            setStats({
                totalMembers: memberCount || 0,
                onlineNow: 0, // Would come from presence
                activeTables: tableCount || 0,
                handsToday: todayStats?.hands_played || 0,
                rakeToday: todayStats?.rake_collected || 0,
                weeklyGrowth: newMembers || 0
            });
        } catch (error) {
            console.error('Failed to load club stats:', error);
        }
        setLoading(false);
    };

    const formatNumber = (num: number): string => {
        if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
        if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
        return num.toLocaleString();
    };

    const formatCurrency = (num: number): string => {
        return `$${formatNumber(num)}`;
    };

    const statCards = [
        { label: 'Total Members', value: formatNumber(stats.totalMembers), icon: '', color: '#3b82f6' },
        { label: 'Online Now', value: formatNumber(stats.onlineNow), icon: '', color: '#10b981' },
        { label: 'Active Tables', value: formatNumber(stats.activeTables), icon: '', color: '#fbbf24' },
        { label: 'Hands Today', value: formatNumber(stats.handsToday), icon: '', color: '#a855f7' },
        { label: 'Rake Today', value: formatCurrency(stats.rakeToday), icon: '', color: '#f59e0b' },
        { label: 'New This Week', value: `+${stats.weeklyGrowth}`, icon: '', color: '#22c55e' },
    ];

    if (loading) {
        return (
            <div className={styles.grid}>
                {[1, 2, 3, 4, 5, 6].map(i => (
                    <div key={i} className={`${styles.card} ${styles.loading}`} />
                ))}
            </div>
        );
    }

    return (
        <div className={styles.grid}>
            {statCards.map((stat, i) => (
                <div
                    key={i}
                    className={styles.card}
                    style={{ '--accent-color': stat.color } as React.CSSProperties}
                >
                    <span className={styles.icon}>{stat.icon}</span>
                    <span className={styles.value}>{stat.value}</span>
                    <span className={styles.label}>{stat.label}</span>
                </div>
            ))}
        </div>
    );
}

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
    const [visibleItems, setVisibleItems] = useState<Set<number>>(new Set());

    // statCards moved after format function declarations (see below)

    useEffect(() => {
        loadStats();
    }, [clubId]);

    const loadStats = async () => {
        setLoading(true);
        try {
            // Get member count (all non-banned members, exclude horses)
            const { count: memberCount } = await supabase
                .from('club_members')
                .select('user_id, profiles!inner(id)', { count: 'exact', head: true })
                .eq('club_id', clubId)
                .eq('profiles.is_horse', false)
                .not('status', 'in', '("banned","suspended")');

            // Get active tables — tables use status 'running' or 'waiting', not 'active'
            const { count: tableCount } = await supabase
                .from('tables')
                .select('id', { count: 'exact', head: true })
                .eq('club_id', clubId)
                .in('status', ['running', 'waiting', 'active']);

            // Get today's stats
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            let handsToday = 0;
            let rakeToday = 0;

            // Try club_daily_stats first
            const { data: todayStats } = await supabase
                .from('club_daily_stats')
                .select('hands_played, rake_collected')
                .eq('club_id', clubId)
                .gte('date', today.toISOString())
                .single();

            if (todayStats) {
                handsToday = todayStats.hands_played || 0;
                rakeToday = todayStats.rake_collected || 0;
            }

            // Count online members — those active within last 15 minutes
            const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
            const { count: onlineCount } = await supabase
                .from('club_members')
                .select('user_id', { count: 'exact', head: true })
                .eq('club_id', clubId)
                .gte('last_active', fifteenMinAgo);

            // Get weekly growth (compare to last week)
            const weekAgo = new Date(Date.now() - 7 * 86400000);
            const { count: newMembers } = await supabase
                .from('club_members')
                .select('user_id', { count: 'exact', head: true })
                .eq('club_id', clubId)
                .gte('created_at', weekAgo.toISOString());

            setStats({
                totalMembers: memberCount || 0,
                onlineNow: onlineCount || 0,
                activeTables: tableCount || 0,
                handsToday: handsToday,
                rakeToday: rakeToday,
                weeklyGrowth: newMembers || 0
            });
        } catch (error) {
            console.error('Failed to load club stats:', error);
        }
        setLoading(false);
    };

    const formatInt = (num: number): string => {
        return Math.trunc(num).toLocaleString('en-US');
    };

    const formatChips = (num: number): string => {
        return (Math.trunc(num * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const statCards = [
        { label: 'Total Members', value: formatInt(stats.totalMembers), icon: '', color: '#3b82f6' },
        { label: 'Online Now', value: formatInt(stats.onlineNow), icon: '', color: '#10b981' },
        { label: 'Active Tables', value: formatInt(stats.activeTables), icon: '', color: '#fbbf24' },
        { label: 'Hands Today', value: formatInt(stats.handsToday), icon: '', color: '#a855f7' },
        { label: 'Rake Today', value: formatChips(stats.rakeToday), icon: '', color: '#f59e0b' },
        { label: 'New This Week', value: `+${stats.weeklyGrowth}`, icon: '', color: '#22c55e' },
    ];

    useEffect(() => {
        if (!loading) {
            statCards.forEach((_, i) => {
                setTimeout(() => setVisibleItems(prev => new Set(prev).add(i)), i * 60);
            });
        }
    }, [loading]);

    if (loading) {
        return (
            <div className={styles.grid}>
                {[1, 2, 3, 4, 5, 6].map(i => (
                    <div key={i} className={`${styles.card} ${styles.loading}`} />
                ))}
            </div>
        );
    }

    const cardsToDisplay = [
        { label: 'Total Members', value: formatInt(stats.totalMembers), icon: '', color: '#3b82f6' },
        { label: 'Online Now', value: formatInt(stats.onlineNow), icon: '', color: '#10b981' },
        { label: 'Active Tables', value: formatInt(stats.activeTables), icon: '', color: '#fbbf24' },
        { label: 'Hands Today', value: formatInt(stats.handsToday), icon: '', color: '#a855f7' },
        { label: 'Rake Today', value: formatChips(stats.rakeToday), icon: '', color: '#f59e0b' },
        { label: 'New This Week', value: `+${stats.weeklyGrowth}`, icon: '', color: '#22c55e' },
    ];

    return (
        <div className={styles.grid}>
            {cardsToDisplay.map((stat, i) => (
                <div
                    key={i}
                    className={styles.card}
                    style={{ '--accent-color': stat.color, opacity: visibleItems.has(i) ? 1 : 0, transform: visibleItems.has(i) ? 'translateY(0)' : 'translateY(8px)', transition: 'all 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)' } as React.CSSProperties}
                >
                    <span className={styles.icon}>{stat.icon}</span>
                    <span className={styles.value}>{stat.value}</span>
                    <span className={styles.label}>{stat.label}</span>
                </div>
            ))}
        </div>
    );
}

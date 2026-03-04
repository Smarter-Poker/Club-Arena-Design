/**
 *  CLUB ENGINE — Quick Actions
 * Hero section quick action buttons
 */

import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../../stores/useUserStore';
import { supabase } from '../../lib/supabase';
import { useToast } from '../common/Toast';
import styles from './QuickActions.module.css';

export default function QuickActions() {
    const navigate = useNavigate();
    const { user } = useUserStore();
    const toast = useToast();

    /**
     * Quick Seat — finds a table with open seats and navigates directly to it.
     * Prioritizes tables with more players (more action) that aren't full.
     */
    const handleQuickSeat = async () => {
        if (!user?.id) {
            toast.error('Please log in to join a table');
            navigate('/login');
            return;
        }

        try {
            // Find tables with open seats, sorted by most players (best action)
            const { data: tables, error } = await supabase
                .from('tables')
                .select('id, name, current_players, max_players')
                .eq('status', 'active')
                .gt('max_players', 0)
                .order('current_players', { ascending: false });

            if (error) throw error;

            // Find first table that isn't full
            const openTable = tables?.find(t =>
                (t.current_players || 0) < (t.max_players || 9)
            );

            if (openTable) {
                navigate(`/table/${openTable.id}`);
            } else {
                toast.error('No tables with open seats right now');
            }
        } catch (err) {
            console.error('Quick seat error:', err);
            toast.error('Failed to find an open table');
        }
    };

    /**
     * Create Table — navigates to club selection first (tables belong to clubs)
     */
    const handleCreateTable = () => {
        if (!user?.id) {
            toast.error('Please log in to create a table');
            navigate('/login');
            return;
        }
        // Navigate to clubs page — user picks a club, then creates table within it
        navigate('/clubs');
    };

    return (
        <div className={styles.actions}>
            <button className={styles.actionButton} onClick={() => navigate('/clubs')}>
                <span className={styles.actionIcon}></span>
                <span className={styles.actionLabel}>My Clubs</span>
            </button>
            <button className={styles.actionButton} onClick={handleCreateTable}>
                <span className={styles.actionIcon}>➕</span>
                <span className={styles.actionLabel}>Create Table</span>
            </button>
            <button className={`${styles.actionButton} ${styles.primary}`} onClick={handleQuickSeat}>
                <span className={styles.actionIcon}></span>
                <span className={styles.actionLabel}>Quick Seat</span>
            </button>
        </div>
    );
}

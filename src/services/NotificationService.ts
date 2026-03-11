/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  NOTIFICATION SERVICE — Push & In-App Notifications
 * Real-time notifications with Supabase subscriptions
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { supabase } from '../lib/supabase';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { masterBus } from '../core/MasterBus';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface Notification {
    id: string;
    userId: string;
    type: 'waitlist_ready' | 'table_invite' | 'club_announcement' | 'message' | 'achievement' | 'bonus' | 'settlement' | 'system';
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
    isRead: boolean;
    createdAt: string;
}

interface NotificationCallbacks {
    onNew?: (notification: Notification) => void;
    onUpdate?: (notification: Notification) => void;
    onDelete?: (notificationId: string) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class NotificationServiceClass {
    private channel: RealtimeChannel | null = null;
    private callbacks: NotificationCallbacks = {};
    private currentUserId: string | null = null;

    /**
     * Subscribe to real-time notifications for a user
     */
    async subscribe(userId: string, callbacks: NotificationCallbacks): Promise<void> {
        if (this.channel) {
            await this.unsubscribe();
        }

        this.currentUserId = userId;
        this.callbacks = callbacks;

        this.channel = supabase
            .channel(`notifications:${userId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${userId}`
                },
                (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
                    if (callbacks.onNew && payload.new) {
                        const notification = this.mapNotification(payload.new);
                        callbacks.onNew(notification);
                        this.showBrowserNotification(notification);
                        masterBus.emit('NOTIFICATION_RECEIVED', { notification: notification as unknown as Record<string, unknown> });
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${userId}`
                },
                (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
                    if (callbacks.onUpdate && payload.new) {
                        callbacks.onUpdate(this.mapNotification(payload.new));
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'DELETE',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${userId}`
                },
                (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
                    if (callbacks.onDelete && payload.old) {
                        const old = payload.old as Record<string, unknown>;
                        callbacks.onDelete(old.id as string);
                    }
                }
            )
            .subscribe();

    }

    /**
     * Unsubscribe from notifications
     */
    async unsubscribe(): Promise<void> {
        if (this.channel) {
            await supabase.removeChannel(this.channel);
            this.channel = null;
            this.currentUserId = null;
        }
    }

    /**
     * Get all notifications for a user
     */
    async getNotifications(userId: string, options?: { unreadOnly?: boolean; limit?: number }): Promise<Notification[]> {
        let query = supabase
            .from('notifications')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (options?.unreadOnly) {
            query = query.eq('is_read', false);
        }

        if (options?.limit) {
            query = query.limit(options.limit);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[Notifications] Failed to fetch:', error);
            return [];
        }

        return (data || []).map(this.mapNotification);
    }

    /**
     * Get unread count
     */
    async getUnreadCount(userId: string): Promise<number> {
        const { count, error } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('is_read', false);

        if (error) {
            console.error('[Notifications] Failed to get count:', error);
            return 0;
        }

        return count || 0;
    }

    /**
     * Mark notification as read
     */
    async markAsRead(notificationId: string): Promise<boolean> {
        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', notificationId);

        if (error) {
            console.error('[Notifications] Failed to mark as read:', error);
            return false;
        }

        masterBus.emit('NOTIFICATION_COUNT_CHANGED', {} as Record<string, unknown>);
        return true;
    }

    /**
     * Mark all notifications as read
     */
    async markAllAsRead(userId: string): Promise<boolean> {
        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', userId)
            .eq('is_read', false);

        if (error) {
            console.error('[Notifications] Failed to mark all as read:', error);
            return false;
        }

        masterBus.emit('NOTIFICATION_COUNT_CHANGED', {} as Record<string, unknown>);
        return true;
    }

    /**
     * Create a notification (for internal use or testing)
     */
    async create(notification: Omit<Notification, 'id' | 'createdAt' | 'isRead'>): Promise<Notification | null> {
        const { data, error } = await supabase
            .from('notifications')
            .insert({
                user_id: notification.userId,
                type: notification.type,
                title: notification.title,
                message: notification.message,
                metadata: notification.metadata,
                is_read: false
            })
            .select()
            .single();

        if (error) {
            console.error('[Notifications] Failed to create:', error);
            return null;
        }

        return this.mapNotification(data);
    }

    /**
     * Send waitlist ready notification
     */
    async notifyWaitlistReady(userId: string, tableName: string, tableId: string): Promise<void> {
        await this.create({
            userId,
            type: 'waitlist_ready',
            title: 'Your seat is ready!',
            message: `A seat is now available at ${tableName}`,
            metadata: { tableId }
        });
    }

    /**
     * 🏧 Notify agent when a player requests a cash-out
     */
    async notifyCashoutRequest(
        agentId: string,
        playerName: string,
        amount: number,
        clubId: string,
        cashoutId: string
    ): Promise<void> {
        await this.create({
            userId: agentId,
            type: 'settlement',
            title: '🏧 Cash-Out Request',
            message: `${playerName} requested to cash out ${amount.toLocaleString()} chips`,
            metadata: { clubId, cashoutId, playerName, amount }
        });
    }

    /**
     * Show browser notification (if permitted)
     */
    private async showBrowserNotification(notification: Notification): Promise<void> {
        if (!('Notification' in window)) return;

        if (Notification.permission === 'default') {
            await Notification.requestPermission();
        }

        if (Notification.permission === 'granted') {
            new Notification(notification.title, {
                body: notification.message,
                icon: '/favicon.ico',
                tag: notification.id
            });
        }
    }

    /**
     * Request browser notification permission
     */
    async requestPermission(): Promise<boolean> {
        if (!('Notification' in window)) return false;

        const result = await Notification.requestPermission();
        return result === 'granted';
    }

    /**
     * Map database record to Notification type
     */
    private mapNotification(data: Record<string, unknown>): Notification {
        return {
            id: data.id as string,
            userId: data.user_id as string,
            type: data.type as Notification['type'],
            title: data.title as string,
            message: data.message as string,
            metadata: data.metadata as Record<string, unknown> | undefined,
            isRead: data.is_read as boolean,
            createdAt: data.created_at as string
        };
    }
}

// Export singleton instance
export const notificationService = new NotificationServiceClass();

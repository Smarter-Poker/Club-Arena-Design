/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  useRealtimeRecovery — Auto-Reconnect for Realtime Channels
 * ═══════════════════════════════════════════════════════════════════════════════
 * Monitors realtime channel health and auto-reconnects on connection drops.
 * Wraps the MasterBus channel lifecycle with reconnection + exponential backoff.
 *
 * @example
 * useRealtimeRecovery(
 *     `club-${clubId}`,
 *     (channel) => {
 *         channel.on('postgres_changes', { event: '*', ... }, handler).subscribe();
 *     },
 *     [clubId]
 * );
 */

import { useEffect, useRef } from 'react';
import { masterBus } from '../core/MasterBus';

export function useRealtimeRecovery(
    channelKey: string,
    setupFn: (channel: ReturnType<typeof masterBus.getOrCreateChannel>) => void,
    deps: unknown[] = []
) {
    const retryCountRef = useRef(0);
    const maxRetries = 5;

    useEffect(() => {
        if (!channelKey) return;

        let cleanedUp = false;

        const connect = () => {
            if (cleanedUp) return;

            try {
                const channel = masterBus.getOrCreateChannel(channelKey);

                // Monitor channel status
                channel.subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        retryCountRef.current = 0; // Reset on success
                    } else if (
                        status === 'CHANNEL_ERROR' ||
                        status === 'TIMED_OUT'
                    ) {
                        if (retryCountRef.current < maxRetries && !cleanedUp) {
                            const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 30000);
                            console.warn(
                                `[RealtimeRecovery] Channel "${channelKey}" ${status}, retrying in ${delay}ms (attempt ${retryCountRef.current + 1}/${maxRetries})`
                            );
                            retryCountRef.current++;

                            setTimeout(() => {
                                if (!cleanedUp) {
                                    masterBus.removeRegisteredChannel(channelKey);
                                    connect();
                                }
                            }, delay);
                        }
                    }
                });

                setupFn(channel);
            } catch (err) {
                console.error(`[RealtimeRecovery] Failed to setup channel "${channelKey}":`, err);
            }
        };

        connect();

        return () => {
            cleanedUp = true;
            masterBus.removeRegisteredChannel(channelKey);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [channelKey, ...deps]);
}

export default useRealtimeRecovery;

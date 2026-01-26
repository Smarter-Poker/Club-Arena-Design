/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 📬 SEND PUSH NOTIFICATION — OneSignal Edge Function
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Sends push notifications via OneSignal REST API
 * Called by PushNotificationService.ts
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID') || '';
const ONESIGNAL_API_KEY = Deno.env.get('ONESIGNAL_API_KEY') || '';

interface NotificationPayload {
    userIds: string[];
    title: string;
    message: string;
    data?: Record<string, any>;
    url?: string;
    imageUrl?: string;
}

serve(async (req: Request) => {
    // CORS
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'authorization, content-type',
            },
        });
    }

    try {
        const payload: NotificationPayload = await req.json();
        const { userIds, title, message, data, url, imageUrl } = payload;

        if (!userIds || userIds.length === 0) {
            return new Response(
                JSON.stringify({ error: 'No user IDs provided' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        // OneSignal API request
        const oneSignalPayload = {
            app_id: ONESIGNAL_APP_ID,
            include_external_user_ids: userIds,
            headings: { en: title },
            contents: { en: message },
            data: data || {},
            ...(url && { url }),
            ...(imageUrl && { big_picture: imageUrl }),
        };

        const response = await fetch('https://onesignal.com/api/v1/notifications', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${ONESIGNAL_API_KEY}`,
            },
            body: JSON.stringify(oneSignalPayload),
        });

        const result = await response.json();

        if (!response.ok) {
            console.error('OneSignal error:', result);
            return new Response(
                JSON.stringify({ error: 'OneSignal API error', details: result }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            );
        }

        return new Response(
            JSON.stringify({ success: true, id: result.id }),
            {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            }
        );

    } catch (error) {
        console.error('Push notification error:', error);
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
});

/**
 * Schema Inspector v2 — Get column names for empty tables via insert error messages
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://kuklfnapbkmacvwxktbh.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs',
    { auth: { persistSession: false } }
);

// Tables that returned empty or had errors — need column discovery
const EMPTY_TABLES = [
    'agents', 'tournaments', 'club_announcements', 'promotions',
    'friend_requests', 'chip_transactions', 'hands', 'spin_tournaments',
    'horses', 'daily_spins', 'commission_records', 'player_stats',
    'user_achievements', 'achievements', 'promotion_enrollments',
    'promotion_leaderboards', 'settlement_periods', 'agent_settlements',
    'club_settlements', 'player_weekly_snapshots', 'bbj_pools',
    'rake_records', 'club_transactions', 'vip_feature_usage',
    'union_clubs', 'messages'
];

async function inspectEmpty() {
    for (const table of EMPTY_TABLES) {
        // Use REST API metadata endpoint
        try {
            const resp = await fetch(`https://kuklfnapbkmacvwxktbh.supabase.co/rest/v1/${table}?select=*&limit=0`, {
                headers: {
                    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs',
                    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs',
                    'Accept': 'application/json',
                    'Prefer': 'return=representation'
                }
            });

            const contentRange = resp.headers.get('content-range');
            const contentProfile = resp.headers.get('content-profile');

            // Get columns from OpenAPI spec
            const specResp = await fetch(`https://kuklfnapbkmacvwxktbh.supabase.co/rest/v1/?select`, {
                headers: {
                    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs',
                    'Accept': 'application/openapi+json'
                }
            });

            if (specResp.ok) {
                const spec = await specResp.json();
                const def = spec.definitions?.[table];
                if (def && def.properties) {
                    const cols = Object.keys(def.properties);
                    const required = def.required || [];
                    console.log(`✅ ${table}: [${cols.join(', ')}]`);
                    console.log(`   required: [${required.join(', ')}]`);
                } else {
                    console.log(`⚠️ ${table}: no definition in spec`);
                }
            }
        } catch (e) {
            console.log(`❌ ${table}: ${e.message}`);
        }
    }
}

inspectEmpty().catch(console.error);

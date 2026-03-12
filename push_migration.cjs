// Push SQL to Supabase via the PostgREST rpc endpoint
// Uses the service role key to bypass RLS
const fs = require('fs');
const https = require('https');
const url = require('url');

const SQL = fs.readFileSync('/Users/smarter.poker/Documents/club-arena/supabase/migrations/20260312005_lucky_wheel_and_missions.sql', 'utf8');
const SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs';

// Split SQL into individual statements and execute each via rpc
// Using the pg_net extension or direct SQL execution endpoint
async function executeSQL() {
  const endpoint = `${SUPABASE_URL}/rest/v1/rpc/`;
  
  // Try using the Supabase Management API instead 
  // POST to /pg/query endpoint
  const parsed = url.parse(`${SUPABASE_URL}/pg/query`);
  
  const body = JSON.stringify({ query: SQL });
  
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        console.log(`Response: ${data.substring(0, 1000)}`);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

executeSQL()
  .then(() => { console.log('SQL executed successfully'); process.exit(0); })
  .catch(e => { console.error('Failed:', e.message); process.exit(1); });

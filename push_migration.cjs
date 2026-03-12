const { Pool } = require('pg');
const fs = require('fs');

const sql = fs.readFileSync('/Users/smarter.poker/Documents/club-arena/supabase/migrations/20260312005_lucky_wheel_and_missions.sql', 'utf8');

const passwords = ['215SlalomCt!', 'Bek454545!!', 'gbpAM0n7jNBzY4Co'];

async function run() {
  for (const pw of passwords) {
    const cs = `postgresql://postgres.kuklfnapbkmacvwxktbh:${encodeURIComponent(pw)}@aws-0-us-west-2.pooler.supabase.com:5432/postgres`;
    let pool;
    try {
      pool = new Pool({ connectionString: cs, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
      const client = await pool.connect();
      const start = Date.now();
      await client.query('BEGIN');
      const res = await client.query(sql);
      await client.query('COMMIT');
      const ms = Date.now() - start;
      console.log(JSON.stringify({ success: true, ms, command: Array.isArray(res) ? res.map(r => r.command).join(', ') : res.command }, null, 2));
      client.release();
      await pool.end();
      process.exit(0);
    } catch (e) {
      if (pool) try { await pool.end(); } catch (_) {}
      if (e.message.includes('authentication') || e.message.includes('password')) {
        console.error(`Auth failed for pw ending ...${pw.slice(-3)}, trying next...`);
        continue;
      }
      console.error(JSON.stringify({ success: false, error: e.message, code: e.code, detail: e.detail }));
      process.exit(1);
    }
  }
  console.error('All passwords failed');
  process.exit(1);
}
run();

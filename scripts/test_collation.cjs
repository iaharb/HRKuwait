/* Verify CEO approval collates into HR portal leave_requests + recalcs balance. */
const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');

const URL = 'https://tjkapzlfvxgocfitusxb.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqa2Fwemxmdnhnb2NmaXR1c3hiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMjU0MjIsImV4cCI6MjA4NTcwMTQyMn0.sZVL7JE8aG8geFzC2z-_xRjMkozSQoIb1Tvohmk53c0';
const PGPW = 'SB@1963$1234';

async function asUser(email) {
  const c = createClient(URL, ANON);
  const { data, error } = await c.auth.signInWithPassword({ email, password: '12345' });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return c;
}

async function userId(c, email) {
  const { data, error } = await c.from('la_users').select('id').eq('email', email).single();
  if (error) throw new Error(`lookup ${email}: ${error.message}`);
  return data.id;
}

(async () => {
  const mohamed = await asUser('mohamed@test.com');
  const ihab = await asUser('ihab@test.com');
  const ahmed = await asUser('ahmed@test.com');
  const layla = await asUser('layla@test.com');
  const faisal = await asUser('faisal@test.com');
  const ihabId = await userId(ihab, 'ihab@test.com');

  const start = '2026-10-05', end = '2026-10-07'; // Mon-Wed
  const sub = await mohamed.rpc('la_submit_leave_request', {
    p_leave_type: 'Annual', p_start_date: start, p_end_date: end,
    p_reason: 'Collation test vacation', p_contact: 'x', p_deputy_id: ihabId
  });
  if (!sub.data?.success) throw new Error('submit: ' + JSON.stringify(sub.error || sub.data));
  const id = sub.data.id;

  await ihab.rpc('la_deputy_decision', { p_request_id: id, p_approve: true, p_note: 'ok' }).then(r => { if (r.error) throw r.error; });
  await ahmed.rpc('la_manager_decision', { p_request_id: id, p_approve: true, p_note: 'ok' }).then(r => { if (r.error) throw r.error; });
  await layla.rpc('la_hr_decision', { p_request_id: id, p_approve: true, p_note: 'ok', p_final_days: 3 }).then(r => { if (r.error) throw r.error; });
  const ceo = await faisal.rpc('la_ceo_decision', { p_request_id: id, p_approve: true, p_note: 'Approved' });
  console.log('ceo:', ceo.data);

  // Now read HR portal side via PG
  const pg = new Client({ host: 'db.tjkapzlfvxgocfitusxb.supabase.co', port: 5432, user: 'postgres', password: PGPW, database: 'postgres', ssl: { rejectUnauthorized: false } });
  await pg.connect();

  const coll = await pg.query(`SELECT lr.employee_name, lr.type, lr.status, lr.days, lr.la_request_id, lr.reason
      FROM leave_requests lr WHERE lr.la_request_id = $1`, [id]);
  console.log('\nHR portal collated row:', JSON.stringify(coll.rows[0], null, 2));

  const bal = await pg.query(`SELECT lb.leave_type, lb.entitled_days, lb.used_days FROM leave_balances lb
      JOIN employees e ON e.id=lb.employee_id WHERE e.email='mohamed@test.com' AND lb.year=2026 ORDER BY lb.leave_type`);
  console.log('\nHR portal mohamed balances after collation:');
  bal.rows.forEach(r => console.log(`  ${r.leave_type}: ${r.used_days}/${r.entitled_days}`));

  // cleanup: remove the collated row + la request, then re-sync balances from the HR portal (source of truth)
  await pg.query(`DELETE FROM leave_requests WHERE la_request_id = $1`, [id]);
  await pg.query(`DELETE FROM la_leave_requests WHERE id = $1`, [id]);
  await pg.query(`DELETE FROM la_notifications WHERE body LIKE '%2026-10-05%2026-10-07%' OR body LIKE '%2026-10-05 to 2026-10-07%'`);
  await pg.query(`SELECT la_sync_hr_balances(NULL)`);
  await pg.end();
  console.log('\ncleanup done');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
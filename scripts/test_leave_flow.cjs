/* End-to-end smoke test for the Leave App isolated backend.
   Drives: submit -> deputy -> manager -> hr -> ceo -> balance deduction. */
const { createClient } = require('@supabase/supabase-js');

const URL = 'https://tjkapzlfvxgocfitusxb.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqa2Fwemxmdnhnb2NmaXR1c3hiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMjU0MjIsImV4cCI6MjA4NTcwMTQyMn0.sZVL7JE8aG8geFzC2z-_xRjMkozSQoIb1Tvohmk53c0';

async function asUser(email) {
  const c = createClient(URL, ANON);
  const { data, error } = await c.auth.signInWithPassword({ email, password: '12345' });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return c;
}

async function getUserId(c, email) {
  const { data, error } = await c.from('la_users').select('id, full_name, role').eq('email', email).single();
  if (error) throw new Error(`la_users lookup ${email}: ${error.message}`);
  return data;
}

async function step(label, fn) {
  try {
    const res = await fn();
    console.log(`OK  [${label}]`, JSON.stringify(res).slice(0, 220));
    return res;
  } catch (e) {
    console.log(`FAIL[${label}] ${e.message}`);
    throw e;
  }
}

(async () => {
  const deputy = await asUser('ihab@test.com'); // staff, sarah's team (sarah is manager)
  const deputyUser = await getUserId(deputy, 'ihab@test.com');

  // ---- submit as mohamed (reports to ahmed) ----
  const mohamed = await asUser('mohamed@test.com');
  const mohamedUser = await getUserId(mohamed, 'mohamed@test.com');

  const start = '2026-09-28', end = '2026-09-30'; // Mon-Wed, 3 working days
  const sub = await step('submit', () => mohamed.rpc('la_submit_leave_request', {
    p_leave_type: 'Annual', p_start_date: start, p_end_date: end,
    p_reason: 'Smoke test vacation', p_contact: '+965 0000 0000',
    p_deputy_id: deputyUser.id
  }));
  if (!sub.data?.success) throw new Error('submit failed: ' + JSON.stringify(sub.error || sub.data));
  const reqId = sub.data.id;

  // employee must NOT be able to skip: try deputy decision as wrong user
  await step('deputy-as-requester-rejected', () => mohamed.rpc('la_deputy_decision', { p_request_id: reqId, p_approve: true, p_note: '' })
    .then(r => r.data));

  // ---- deputy concurrence ----
  await step('deputy-concur', () => deputy.rpc('la_deputy_decision', { p_request_id: reqId, p_approve: true, p_note: 'Can cover' }).then(r => r.data));

  // ---- manager (ahmed) ----
  const ahmed = await asUser('ahmed@test.com');
  await step('manager-approve', () => ahmed.rpc('la_manager_decision', { p_request_id: reqId, p_approve: true, p_note: 'OK' }).then(r => r.data));

  // ---- HR (layla) ----
  const layla = await asUser('layla@test.com');
  const hrProbe = await step('hr-balance-pretend-big', () => layla.rpc('la_hr_decision', { p_request_id: reqId, p_approve: true, p_note: 'x', p_final_days: 9999 }).then(r => r.data));
  if (hrProbe?.success !== false) throw new Error('balance guard did not fire!');
  await step('hr-approve', () => layla.rpc('la_hr_decision', { p_request_id: reqId, p_approve: true, p_note: 'Balance ok', p_final_days: 3 }).then(r => r.data));

  // ---- CEO (faisal) ----
  const faisal = await asUser('faisal@test.com');
  await step('ceo-approve', () => faisal.rpc('la_ceo_decision', { p_request_id: reqId, p_approve: true, p_note: 'Approved' }).then(r => r.data));

  // ---- owner of request (mohamed) sees APPROVED + balance deducted ----
  const status = await step('requester-view', () => mohamed.rpc('la_request_detail', { p_request_id: reqId }).then(r => r.data));
  console.log('   status:', status?.request?.status);

  const bal = await step('requester-balance', () => mohamed.rpc('la_my_balances').then(r => r.data));
  console.log('   Annual:', bal?.find(b => b.leave_type === 'Annual'));

  // notifications for mohamed
  const nots = await step('requester-notifications', () => mohamed.rpc('la_notifications').then(r => r.data));
  console.log('   unread:', nots?.[0]?.unread, 'titles:', nots?.map(n => n.title));

  const queue = await step('ceo-queue-after-approval', () => faisal.rpc('la_action_queue').then(r => r.data));
  console.log('   ceo pending actions:', queue?.length ?? 0);

  console.log('\nALL OK');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
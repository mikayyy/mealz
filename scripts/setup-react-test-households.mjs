#!/usr/bin/env node
// Synthetic fixtures only. No migrations, real-household edits, AI, or email.
import { createRequire } from 'node:module';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile, writeFile, chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const PROJECT = 'zyqlarqlzmmcitgiqyqm';
const URL = `https://${PROJECT}.supabase.co`;
const stateFile = new globalThis.URL('../.env.react-test-households.json', import.meta.url);
const args = process.argv.slice(2);
if (args.some(arg => !['--apply', '--existing-backend'].includes(arg))) {
  throw new Error('Usage: node scripts/setup-react-test-households.mjs [--apply --existing-backend]');
}
if (!args.includes('--apply')) {
  console.log(JSON.stringify({ mode: 'dry-run', project: PROJECT,
    creates: '3 synthetic Auth accounts, 2 households, 2 complete saved weeks',
    changesSchema: false, sendsEmail: false, callsAI: false,
    privateState: '.env.react-test-households.json' }, null, 2));
  process.exit(0);
}
if (!args.includes('--existing-backend')) throw new Error('Explicit --existing-backend acknowledgment required.');
if (process.env.SUPABASE_URL && process.env.SUPABASE_URL.replace(/\/$/, '') !== URL) {
  throw new Error('Unexpected project URL. Refusing to write.');
}
const secret = process.env.SUPABASE_SECRET_KEY;
const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!secret?.startsWith('sb_secret_') || !publicKey) {
  throw new Error('Provide the existing project server secret and publishable key through environment variables, never command arguments. No data was created.');
}
const require = createRequire(new globalThis.URL('../frontend/package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) } };
const admin = createClient(URL, secret, options);
function checked(result, label) {
  if (result.error) throw new Error(`${label} failed (${result.error.code || result.error.status || 'service error'}). Private checkpoints were retained; do not start another fixture set.`);
  return result.data;
}
let state;
try { state = JSON.parse(await readFile(stateFile, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (!state) {
  const run = randomUUID();
  const date = new Date(); date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  state = { version: 1, project: PROJECT, run, weekStart: date.toISOString().slice(0, 10),
    accounts: ['owner-a', 'member-a', 'owner-b'].map(role => ({ role,
      email: `mealz-react-${role}-${run}@example.invalid`, password: randomBytes(32).toString('base64url') })),
    homes: ['A', 'B'].map(label => ({ label, name: `React acceptance ${label} ${run.slice(0, 8)}`,
      inviteHash: randomBytes(32).toString('hex'), profileId: randomUUID(), planId: randomUUID(),
      mealId: randomUUID(), ingredientId: randomUUID(), stepId: randomUUID(), groceryId: randomUUID() })) };
  // Exclusive creation refuses accidental overwrite of a previous fixture run.
  await writeFile(stateFile, JSON.stringify(state, null, 2), { mode: 0o600, flag: 'wx' });
}
if (state.version !== 1 || state.project !== PROJECT || !state.run ||
    state.accounts?.length !== 3 || state.homes?.length !== 2) throw new Error('Unexpected private fixture state.');
await chmod(stateFile, 0o600);
const checkpoint = () => writeFile(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
for (const account of state.accounts) {
  if (!account.email.endsWith(`-${state.run}@example.invalid`)) throw new Error('Not a synthetic fixture account.');
  if (!account.id) {
    // A lost response must never lead to an unreviewed second account creation.
    if (account.creationStarted) throw new Error('Ambiguous Auth creation. Review the recorded synthetic email before continuing.');
    account.creationStarted = true; await checkpoint();
    const data = checked(await admin.auth.admin.createUser({ email: account.email,
      password: account.password, email_confirm: true,
      app_metadata: { mealz_react_acceptance: state.run } }), 'Synthetic account creation');
    account.id = data.user.id; await checkpoint();
  }
  const user = checked(await admin.auth.admin.getUserById(account.id), 'Synthetic account identity').user;
  if (user.email !== account.email || user.app_metadata?.mealz_react_acceptance !== state.run) {
    throw new Error('Account does not belong to this fixture run.');
  }
}
for (const home of state.homes) {
  const owner = state.accounts.find(a => a.role === `owner-${home.label.toLowerCase()}`);
  const memberships = checked(await admin.from('household_members').select('household_id,role').eq('user_id', owner.id), 'Fixture membership');
  if (!memberships.length) {
    const result = checked(await admin.rpc('mealz_manage_household', { p_user_id: owner.id,
      p_action: 'create', p_name: home.name, p_hash: home.inviteHash, p_hint: home.inviteHash.slice(-4) }), 'Fixture household creation');
    if (result.error) throw new Error('Household creation refused.');
    home.id = result.household.id; await checkpoint();
  } else {
    if (memberships.length !== 1 || memberships[0].role !== 'owner') throw new Error('Unexpected fixture ownership.');
    home.id = memberships[0].household_id;
  }
  const actual = checked(await admin.from('households').select('id,name,created_by').eq('id', home.id).single(), 'Fixture household identity');
  if (actual.name !== home.name || actual.created_by !== owner.id) throw new Error('Refusing to modify a non-fixture household.');
  await checkpoint();
  checked(await admin.from('profiles').upsert({ id: home.profileId, household_id: home.id,
    owner_user_id: owner.id, profile_key: 'default', adults: 2, children: 0, household_size: 2 }), 'Fixture profile');
  checked(await admin.from('weekly_plans').upsert({ id: home.planId, household_id: home.id,
    owner_user_id: owner.id, week_start: state.weekStart, household_size: 2,
    cooking_days: ['Monday'], equipment: [], status: 'active', notes: `Synthetic React fixture ${state.run}` }), 'Fixture week');
  checked(await admin.from('meals').upsert({ id: home.mealId, weekly_plan_id: home.planId,
    meal_key: `react-acceptance-${home.label.toLowerCase()}`, day: 'Monday',
    title: `React acceptance dinner ${home.label}`, description: 'Synthetic test recipe',
    servings: 2, total_minutes: 15, difficulty: 'Easy', tags: [], sort_order: 0 }), 'Fixture meal');
  checked(await admin.from('ingredients').upsert({ id: home.ingredientId, meal_id: home.mealId,
    name: 'carrot', quantity: 2, unit: 'whole', category: 'Produce', optional: false }), 'Fixture ingredient');
  checked(await admin.from('recipe_steps').upsert({ id: home.stepId, meal_id: home.mealId,
    step_number: 1, instruction: 'Prepare the synthetic test ingredients.' }), 'Fixture recipe step');
  checked(await admin.from('grocery_items').upsert({ id: home.groceryId, weekly_plan_id: home.planId,
    name: 'carrot', quantity: 2, unit: 'whole', category: 'Produce', checked: false,
    needed_this_week: false, source: 'generated', source_key: 'carrot::count',
    user_modified: false, deleted: false }), 'Fixture grocery');
}
const member = state.accounts.find(a => a.role === 'member-a');
const membership = checked(await admin.from('household_members').select('household_id').eq('user_id', member.id), 'Member fixture lookup');
if (!membership.length) {
  const result = checked(await admin.rpc('mealz_manage_household', { p_user_id: member.id,
    p_action: 'join', p_hash: state.homes[0].inviteHash, p_hint: state.homes[0].inviteHash.slice(-4) }), 'Fixture member join');
  if (result.error) throw new Error('Fixture member join refused.');
} else if (membership.length !== 1 || membership[0].household_id !== state.homes[0].id) throw new Error('Unexpected fixture member household.');
// Real password sign-in and RLS: use user tokens, never the admin client.
for (const account of state.accounts) {
  const client = createClient(URL, publicKey, options);
  checked(await client.auth.signInWithPassword({ email: account.email, password: account.password }), 'Fixture password sign-in');
  try {
    const own = state.homes[account.role === 'owner-b' ? 1 : 0];
    const other = state.homes[account.role === 'owner-b' ? 0 : 1];
    const rows = checked(await client.from('weekly_plans').select('id,household_id'), 'User-scoped weeks');
    if (rows.length !== 1 || rows[0].id !== own.planId || rows[0].household_id !== own.id) throw new Error('Household read isolation failed.');
    const hidden = checked(await client.from('grocery_items').select('id').eq('weekly_plan_id', other.planId), 'Cross-household grocery probe');
    if (hidden.length) throw new Error('Cross-household groceries were visible.');
  } finally { await client.auth.signOut({ scope: 'local' }); }
}
state.verifiedAt = new Date().toISOString(); await checkpoint();
console.log(JSON.stringify({ project: PROJECT, createdOrReusedAccounts: 3, households: 2,
  realAuthAndReadIsolation: 'passed', weekStart: state.weekStart,
  privateState: fileURLToPath(stateFile), hostedBrowserAcceptance: 'pending' }, null, 2));

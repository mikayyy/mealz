import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const api=readFileSync(new URL('../api/quick-login.js',import.meta.url),'utf8');
const client=readFileSync(new URL('../auth-client.js',import.meta.url),'utf8');
const migration=readFileSync(new URL('../migrations/2026-09-21_trusted_device_login.sql',import.meta.url),'utf8');

test('quick login requires a remembered device token plus a four digit PIN',()=>{
  assert.match(api,/TOKEN_BYTES=32/);
  assert.match(api,/device_token_hash/);
  assert.match(api,/PIN_RE=\/\^\\d\{4\}\$\//);
  assert.match(api,/scryptSync/);
  assert.match(api,/timingSafeEqual/);
});

test('quick login attempts are server-side rate limited',()=>{
  assert.match(api,/enforceRateLimit/);
  assert.match(api,/quick-login:/);
  assert.match(api,/,5,60\)/);
});

test('trusted device records are service-only and never browser-readable',()=>{
  assert.match(migration,/enable row level security/);
  assert.match(migration,/revoke all on public\.mealz_trusted_devices from public, anon, authenticated/);
  assert.doesNotMatch(migration,/grant select.*mealz_trusted_devices.*authenticated/i);
});

test('unlock issues a fresh Supabase session token rather than storing browser sessions',()=>{
  assert.match(api,/\/auth\/v1\/admin\/generate_link/);
  assert.match(api,/hashed_token/);
  assert.match(client,/auth\.verifyOtp\(\{token_hash:data\.tokenHash,type:'email'\}\)/);
  assert.doesNotMatch(client,/refresh_token.*localStorage/);
});

test('remembered account picker is local-only and has no global user enumeration call',()=>{
  assert.match(client,/localStorage\.getItem\(QUICK_KEY\)/);
  assert.match(client,/remembered-list/);
  assert.doesNotMatch(client,/admin\/users|listUsers|\/api\/users/);
});

test('quick-login setup and revocation require a verified signed-in user',()=>{
  assert.match(api,/\['setup','unlock','revoke'\]\.includes\(action\)/);
  assert.match(api,/const auth=await requireUser\(req\)/);
  assert.match(api,/action==='revoke'/);
  assert.ok(api.indexOf('const auth=await requireUser(req)')<api.indexOf("const pin=String(req.body?.pin||'')"));
});

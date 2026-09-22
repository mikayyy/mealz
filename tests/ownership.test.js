import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const supabase=readFileSync(new URL('../api/_lib/supabase.ts',import.meta.url),'utf8');
const auth=readFileSync(new URL('../api/_lib/auth.ts',import.meta.url),'utf8');
const plan=readFileSync(new URL('../api/plan.ts',import.meta.url),'utf8');
const profile=readFileSync(new URL('../api/profile.ts',import.meta.url),'utf8');
const weeks=readFileSync(new URL('../api/weeks.ts',import.meta.url),'utf8');
const migration=readFileSync(new URL('../migrations/2026-09-15_user_ownership_rls.sql',import.meta.url),'utf8');

test('verified auth exposes the bearer token only after user verification',()=>{
  assert.match(auth,/return \{id:user\.id,email:user\.email\|\|null,token,mode:'authenticated'\}/);
});

test('user-scoped database requests use publishable key plus bearer token',()=>{
  assert.match(supabase,/Authorization:`Bearer \$\{token\}`/);
  assert.match(supabase,/apikey:key/);
  assert.doesNotMatch(supabase,/db:owned.*:sb/);
  assert.match(supabase,/dataDb/);
});

test('core user data APIs select an authenticated data scope',()=>{
  for(const [name,source] of [['plan',plan],['profile',profile],['weeks',weeks]]){
    assert.match(source,/dataDb\(auth\)/,name);
  }
  assert.match(plan,/planRow\.owner_user_id=userId/);
});

test('ownership migration covers parent and child tables with RLS',()=>{
  assert.match(migration,/weekly_plans add column if not exists owner_user_id/);
  assert.match(migration,/profiles add column if not exists owner_user_id/);
  for(const table of ['profiles','weekly_plans','meals','ingredients','recipe_steps','grocery_items']){
    assert.match(migration,new RegExp(`alter table ${table} enable row level security`),table);
  }
  assert.match(migration,/p\.owner_user_id = auth\.uid\(\)/);
  assert.match(migration,/owner_user_id = auth\.uid\(\)/);
});

test('migration refuses to guess ownership when legacy data and multiple users exist',()=>{
  assert.match(migration,/ownership migration stopped: found unowned data/);
  assert.match(migration,/auth_user_count = 1/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync(new URL('../migrations/2026-09-15_households.sql',import.meta.url),'utf8');
const compatibilityMigration=readFileSync(new URL('../migrations/2026-09-16_household_compatibility.sql',import.meta.url),'utf8');
const supabase=readFileSync(new URL('../api/_lib/supabase.ts',import.meta.url),'utf8');
const plan=readFileSync(new URL('../api/plan.ts',import.meta.url),'utf8');
const profileStore=readFileSync(new URL('../api/_lib/profile-store.ts',import.meta.url),'utf8');
const householdApi=readFileSync(new URL('../api/household.ts',import.meta.url),'utf8');
const prep=readFileSync(new URL('../api/prep-next-week.ts',import.meta.url),'utf8');

test('household migration converts v0.16 user ownership without orphaning data',()=>{
  assert.match(migration,/create table if not exists households/);
  assert.match(migration,/create table if not exists household_members/);
  assert.match(migration,/update profiles set household_id = h where owner_user_id = r\.owner_user_id/);
  assert.match(migration,/update weekly_plans set household_id = h where owner_user_id = r\.owner_user_id/);
  assert.match(migration,/unassigned profile or weekly plan rows remain/);
});

test('household ownership removes v0.16 owner NOT NULL constraint',()=>{
  assert.match(migration,/profiles alter column owner_user_id drop not null/);
  assert.match(migration,/weekly_plans alter column owner_user_id drop not null/);
  assert.match(compatibilityMigration,/profiles alter column owner_user_id drop not null/);
  assert.match(compatibilityMigration,/weekly_plans alter column owner_user_id drop not null/);
});

test('RLS follows household membership rather than original user ownership',()=>{
  assert.match(migration,/profiles_household_all/);
  assert.match(migration,/weekly_plans_household_all/);
  assert.match(migration,/hm\.user_id = auth\.uid\(\)/);
  assert.match(migration,/drop policy if exists profiles_owner_all/);
  assert.match(migration,/drop policy if exists weekly_plans_owner_all/);
});

test('authenticated data scope resolves the signed-in users household',()=>{
  assert.match(supabase,/householdSchemaReady/);
  assert.match(supabase,/household_members\?select=household_id,role/);
  assert.match(supabase,/householdId:membership\.household_id/);
});

test('new profile and plan writes carry household identity and tolerate pre-hotfix schema',()=>{
  assert.match(profileStore,/row\.household_id=householdId/);
  assert.match(profileStore,/row\.owner_user_id=userId/);
  assert.match(plan,/planRow\.household_id=householdId/);
  assert.match(plan,/planRow\.owner_user_id=userId/);
  assert.match(plan,/not linked to a household yet/);
});

test('household API creates secure human-friendly join codes and hashes them',()=>{
  assert.match(householdApi,/crypto\.createHash\('sha256'\)/);
  assert.match(householdApi,/action==='create'/);
  assert.match(householdApi,/action==='join'/);
  assert.match(householdApi,/rpc\/mealz_manage_household/);
});

test('Friday preparation groups work by household after migration',()=>{
  assert.match(prep,/householdSchemaReady/);
  assert.match(prep,/household_id/);
  assert.match(prep,/prepared_households/);
});

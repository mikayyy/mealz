/**
 * tests/migration-manifest.test.js
 *
 * Validates the migration manifest against the actual files on disk, and runs
 * a subset of the structural checks that also appear in migrate-validate.js.
 * These run in the standard `pnpm test` suite (PGlite, no live credentials).
 *
 * Separate from the standalone validate script so CI can distinguish a
 * manifest-order failure (caught here) from a structural migration failure
 * (caught by migrate-validate.js).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import {
  MIGRATIONS,
  REQUIRED_TABLES,
  REQUIRED_COLUMNS,
  REQUIRED_INDEXES,
  REQUIRED_FUNCTIONS,
} from '../migrations/manifest.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'migrations');

function readMigration(filename) {
  const sql = readFileSync(join(migrationsDir, filename), 'utf8');
  return sql
    .replace(/create extension if not exists pgcrypto\s*;/gi, '')
    .replace(/\bnot valid\b/gi, '')
    .replace(/alter table[^;]+validate constraint[^;]+;/gi, '')
    .replace(/perform pg_advisory_xact_lock\([^)]+\)\s*;/gi, '-- advisory lock omitted');
}

async function makeDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema if not exists auth;
    create table if not exists auth.users (
      id uuid primary key,
      created_at timestamptz not null default now()
    );
    create or replace function auth.uid()
    returns uuid language sql stable as
    $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    grant usage on schema public, auth to authenticated, anon, service_role;
    create table if not exists public.weekly_plans (
      id uuid primary key default gen_random_uuid(),
      owner_user_id uuid,
      week_start date,
      status text,
      notes text,
      household_size integer,
      equipment text[],
      created_at timestamptz not null default now()
    );
    create table if not exists public.meals (
      id uuid primary key default gen_random_uuid(),
      weekly_plan_id uuid references public.weekly_plans(id) on delete cascade
    );
    create table if not exists public.ingredients (
      id uuid primary key default gen_random_uuid(),
      meal_id uuid references public.meals(id) on delete cascade
    );
    create table if not exists public.recipe_steps (
      id uuid primary key default gen_random_uuid(),
      meal_id uuid references public.meals(id) on delete cascade
    );
    create table if not exists public.grocery_items (
      id uuid primary key default gen_random_uuid(),
      weekly_plan_id uuid references public.weekly_plans(id) on delete cascade,
      name text not null default '',
      quantity numeric,
      unit text,
      category text not null default 'Other',
      checked boolean not null default false,
      created_at timestamptz not null default now()
    );
  `);
  return db;
}

test('migration manifest: all listed files exist on disk', () => {
  for (const filename of MIGRATIONS) {
    const filepath = join(migrationsDir, filename);
    assert.ok(existsSync(filepath), `migration file missing: ${filename}`);
  }
});

test('migration manifest: no duplicate entries', () => {
  const seen = new Set();
  for (const filename of MIGRATIONS) {
    assert.ok(!seen.has(filename), `duplicate manifest entry: ${filename}`);
    seen.add(filename);
  }
});

test('migration manifest: manifest.js is a valid ES module with expected exports', async () => {
  const mod = await import('../migrations/manifest.js');
  assert.ok(Array.isArray(mod.MIGRATIONS), 'MIGRATIONS must be an array');
  assert.ok(mod.MIGRATIONS.length >= 8, 'at least 8 migrations expected');
  assert.ok(Array.isArray(mod.REQUIRED_TABLES));
  assert.ok(typeof mod.REQUIRED_COLUMNS === 'object');
  assert.ok(Array.isArray(mod.REQUIRED_INDEXES));
  assert.ok(Array.isArray(mod.REQUIRED_FUNCTIONS));
});

test('migration manifest: all migrations apply in order without errors', async () => {
  const db = await makeDb();
  try {
    for (const filename of MIGRATIONS) {
      await db.exec(readMigration(filename));
    }
  } finally {
    await db.close();
  }
});

test('migration manifest: required tables present after full migration set', async () => {
  const db = await makeDb();
  try {
    for (const filename of MIGRATIONS) {
      await db.exec(readMigration(filename));
    }
    const { rows } = await db.query(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    const present = new Set(rows.map((r) => r.table_name));
    for (const t of REQUIRED_TABLES) {
      assert.ok(present.has(t), `required table missing: ${t}`);
    }
  } finally {
    await db.close();
  }
});

test('migration manifest: required columns present after full migration set', async () => {
  const db = await makeDb();
  try {
    for (const filename of MIGRATIONS) {
      await db.exec(readMigration(filename));
    }
    const { rows } = await db.query(
      `select table_name, column_name
       from information_schema.columns
       where table_schema = 'public'`,
    );
    const present = {};
    for (const { table_name, column_name } of rows) {
      if (!present[table_name]) present[table_name] = new Set();
      present[table_name].add(column_name);
    }
    for (const [table, cols] of Object.entries(REQUIRED_COLUMNS)) {
      for (const col of cols) {
        assert.ok(present[table]?.has(col), `required column missing: ${table}.${col}`);
      }
    }
  } finally {
    await db.close();
  }
});

test('migration manifest: required indexes present after full migration set', async () => {
  const db = await makeDb();
  try {
    for (const filename of MIGRATIONS) {
      await db.exec(readMigration(filename));
    }
    const { rows } = await db.query(
      `select indexname from pg_indexes where schemaname = 'public'`,
    );
    const present = new Set(rows.map((r) => r.indexname));
    for (const idx of REQUIRED_INDEXES) {
      assert.ok(present.has(idx), `required index missing: ${idx}`);
    }
  } finally {
    await db.close();
  }
});

test('migration manifest: required functions present after full migration set', async () => {
  const db = await makeDb();
  try {
    for (const filename of MIGRATIONS) {
      await db.exec(readMigration(filename));
    }
    const { rows } = await db.query(
      `select routine_name from information_schema.routines
       where routine_schema = 'public' and routine_type = 'FUNCTION'`,
    );
    const present = new Set(rows.map((r) => r.routine_name));
    for (const fn of REQUIRED_FUNCTIONS) {
      assert.ok(present.has(fn), `required function missing: ${fn}`);
    }
  } finally {
    await db.close();
  }
});

test('migration manifest: RLS enabled on all required tables', async () => {
  const db = await makeDb();
  try {
    for (const filename of MIGRATIONS) {
      await db.exec(readMigration(filename));
    }
    const { rows } = await db.query(
      `select relname from pg_class
       where relnamespace = 'public'::regnamespace and relrowsecurity = true`,
    );
    const enabled = new Set(rows.map((r) => r.relname));
    for (const t of REQUIRED_TABLES) {
      assert.ok(enabled.has(t), `RLS not enabled on: ${t}`);
    }
  } finally {
    await db.close();
  }
});

test('migration manifest: authenticated role has CRUD on data tables but not operational tables', async () => {
  const db = await makeDb();
  try {
    for (const filename of MIGRATIONS) {
      await db.exec(readMigration(filename));
    }
    const dataTables = ['profiles', 'weekly_plans', 'meals', 'ingredients', 'recipe_steps', 'grocery_items'];
    for (const t of dataTables) {
      const { rows } = await db.query(
        `select has_table_privilege('authenticated', $1, 'select,insert,update,delete') as ok`,
        [t],
      );
      assert.ok(rows[0].ok, `authenticated missing CRUD on ${t}`);
    }
    for (const t of ['mealz_rate_limits', 'mealz_trusted_devices']) {
      const { rows } = await db.query(
        `select has_table_privilege('authenticated', $1, 'select') as ok`,
        [t],
      );
      assert.ok(!rows[0].ok, `authenticated should not be able to select ${t}`);
    }
  } finally {
    await db.close();
  }
});

test('migration manifest: anon role has no access to any data table', async () => {
  const db = await makeDb();
  try {
    for (const filename of MIGRATIONS) {
      await db.exec(readMigration(filename));
    }
    const dataTables = ['profiles', 'weekly_plans', 'meals', 'ingredients', 'recipe_steps', 'grocery_items'];
    for (const t of dataTables) {
      const { rows } = await db.query(
        `select has_table_privilege('anon', $1, 'select') as ok`,
        [t],
      );
      assert.ok(!rows[0].ok, `anon should not be able to select ${t}`);
    }
  } finally {
    await db.close();
  }
});

test('migration manifest: hardened RLS policies use (select auth.uid()) form', async () => {
  const db = await makeDb();
  try {
    for (const filename of MIGRATIONS) {
      await db.exec(readMigration(filename));
    }
    const { rows } = await db.query(
      `select policyname, qual, with_check from pg_policies where schemaname = 'public'`,
    );
    assert.ok(rows.length >= 8, `expected at least 8 policies, got ${rows.length}`);
    const unhardened = [];
    for (const row of rows) {
      const combined = String(row.qual || '') + String(row.with_check || '');
      if (combined.includes('auth.uid()')) {
        const hardened = combined.includes('( SELECT auth.uid()') || combined.includes('(SELECT auth.uid()');
        if (!hardened) unhardened.push(row.policyname);
      }
    }
    assert.deepEqual(unhardened, [], `policies using plain auth.uid() (not hardened): ${unhardened.join(', ')}`);
  } finally {
    await db.close();
  }
});

test('migration manifest: key migrations are idempotent', async () => {
  const db = await makeDb();
  try {
    // Apply full set first
    for (const filename of MIGRATIONS) {
      await db.exec(readMigration(filename));
    }
    // Then re-apply the three that must be idempotent
    const idempotent = [
      '2026-09-17_account_security.sql',
      '20260921194345_supabase_hardening_v0202.sql',
      '20260921212102_editable_groceries_v0210.sql',
    ];
    for (const filename of idempotent) {
      await assert.doesNotReject(
        db.exec(readMigration(filename)),
        `${filename} should be idempotent`,
      );
    }
  } finally {
    await db.close();
  }
});

test('migration manifest: trusted-device cleanup fires on auth user deletion', async () => {
  const userId = '00000000-0000-4000-0000-000000000099';
  const db = await makeDb();
  try {
    for (const filename of MIGRATIONS) {
      await db.exec(readMigration(filename));
    }
    // Grant the test superuser INSERT on trusted devices so we can seed a row
    // without going through the service_role path (PGlite privilege model).
    await db.exec('grant insert on public.mealz_trusted_devices to public');
    await db.query('insert into auth.users(id) values($1)', [userId]);
    await db.query(
      `insert into mealz_trusted_devices(user_id,email,label,device_token_hash,pin_salt,pin_hash)
       values($1,'cleanup@test.com','Browser','tok-cascade','salt','pin-hash')`,
      [userId],
    );
    // Verify the row exists before deletion
    const before = await db.query(
      'select count(*)::int as n from mealz_trusted_devices where user_id=$1',
      [userId],
    );
    assert.equal(before.rows[0].n, 1, 'trusted device should exist before user deletion');
    // Delete the auth user — ON DELETE CASCADE should remove the device
    await db.query('delete from auth.users where id=$1', [userId]);
    const { rows } = await db.query(
      'select count(*)::int as n from mealz_trusted_devices where user_id=$1',
      [userId],
    );
    assert.equal(rows[0].n, 0, 'trusted device should be deleted when auth user is removed');
  } finally {
    await db.close();
  }
});

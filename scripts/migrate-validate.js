#!/usr/bin/env node
/**
 * scripts/migrate-validate.js
 *
 * Validates that all migrations in the canonical manifest apply cleanly and
 * leave the required schema in place. Uses an in-process PGlite database
 * (Postgres-compatible) so no live credentials are needed.
 *
 * Usage:  node scripts/migrate-validate.js
 * Or:     pnpm migration:validate
 *
 * Exit 0 = all checks pass.
 * Exit 1 = one or more failures.
 *
 * PGlite limitations handled here:
 *  - `create extension if not exists pgcrypto` — stripped (PGlite has
 *    gen_random_uuid() built-in via pgcrypto; the extension DDL errors).
 *  - `not valid` constraint qualifier on ALTER TABLE ADD CONSTRAINT — stripped
 *    (PGlite validates immediately, which is correct behaviour for tests).
 *  - `validate constraint` — stripped (redundant once the above is handled).
 *  - pg_advisory_xact_lock — stubbed (no-op in single-connection test context).
 */

import { readFileSync } from 'node:fs';
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
  return adaptForPGlite(sql);
}

/**
 * Strip/replace SQL constructs that PGlite cannot handle or that are
 * redundant in the single-connection test context.
 */
function adaptForPGlite(sql) {
  return sql
    // PGlite has gen_random_uuid() built in; the extension itself errors.
    .replace(/create extension if not exists pgcrypto\s*;/gi, '-- pgcrypto extension omitted for PGlite')
    // PGlite validates constraints immediately; NOT VALID is not supported.
    .replace(/\bnot valid\b/gi, '')
    // VALIDATE CONSTRAINT is a no-op once NOT VALID is removed.
    .replace(/alter table[^;]+validate constraint[^;]+;/gi, '')
    // Advisory locks are single-connection no-ops in the test context.
    .replace(/perform pg_advisory_xact_lock\([^)]+\)\s*;/gi, '-- pg_advisory_xact_lock omitted');
}

let failures = 0;
let passes = 0;

function pass(msg) { console.log(`ok  : ${msg}`); passes++; }
function fail(msg) { console.error(`FAIL: ${msg}`); failures++; }

async function bootstrap(db) {
  // Reproduce the Supabase-specific schema that migrations expect:
  // roles, auth schema, auth.uid() function, and the prototype tables.
  // Note: PGlite does not support CREATE ROLE IF NOT EXISTS.
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

    -- Prototype tables that pre-date the first migration.
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
    -- Note: profiles is NOT created here because 2026-09-14_profiles.sql
    -- creates it with its full schema via CREATE TABLE IF NOT EXISTS.
    -- Pre-creating a minimal version would cause the migration's ALTER TABLE
    -- ADD COLUMN statements to fail.
  `);
}

async function checkRequiredTables(db) {
  const { rows } = await db.query(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'`,
  );
  const present = new Set(rows.map((r) => r.table_name));
  for (const t of REQUIRED_TABLES) {
    if (present.has(t)) {
      pass(`table public.${t} exists`);
    } else {
      fail(`table public.${t} is missing`);
    }
  }
}

async function checkRequiredColumns(db) {
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
      if (present[table]?.has(col)) {
        pass(`column ${table}.${col} exists`);
      } else {
        fail(`column ${table}.${col} is missing`);
      }
    }
  }
}

async function checkRequiredIndexes(db) {
  const { rows } = await db.query(
    `select indexname from pg_indexes where schemaname = 'public'`,
  );
  const present = new Set(rows.map((r) => r.indexname));
  for (const idx of REQUIRED_INDEXES) {
    if (present.has(idx)) {
      pass(`index ${idx} exists`);
    } else {
      fail(`index ${idx} is missing`);
    }
  }
}

async function checkRequiredFunctions(db) {
  const { rows } = await db.query(
    `select routine_name from information_schema.routines
     where routine_schema = 'public' and routine_type = 'FUNCTION'`,
  );
  const present = new Set(rows.map((r) => r.routine_name));
  for (const fn of REQUIRED_FUNCTIONS) {
    if (present.has(fn)) {
      pass(`function ${fn} exists`);
    } else {
      fail(`function ${fn} is missing`);
    }
  }
}

async function checkRLSEnabled(db) {
  const rlsTables = [
    'profiles', 'households', 'household_members',
    'weekly_plans', 'meals', 'ingredients', 'recipe_steps',
    'grocery_items', 'mealz_rate_limits', 'mealz_trusted_devices',
  ];
  const { rows } = await db.query(
    `select relname from pg_class where relnamespace = 'public'::regnamespace and relrowsecurity = true`,
  );
  const enabled = new Set(rows.map((r) => r.relname));
  for (const t of rlsTables) {
    if (enabled.has(t)) {
      pass(`RLS enabled on ${t}`);
    } else {
      fail(`RLS not enabled on ${t}`);
    }
  }
}

async function checkGrants(db) {
  // authenticated should have CRUD on data tables but not on rate limits or devices
  const dataTables = ['profiles', 'weekly_plans', 'meals', 'ingredients', 'recipe_steps', 'grocery_items'];
  const deniedTables = ['mealz_rate_limits', 'mealz_trusted_devices'];
  for (const t of dataTables) {
    try {
      const { rows } = await db.query(
        `select has_table_privilege('authenticated', $1, 'select,insert,update,delete') as ok`,
        [t],
      );
      if (rows[0].ok) {
        pass(`authenticated has CRUD on ${t}`);
      } else {
        fail(`authenticated is missing CRUD on ${t}`);
      }
    } catch (err) {
      fail(`grant check for ${t}: ${err.message}`);
    }
  }
  for (const t of deniedTables) {
    try {
      const { rows } = await db.query(
        `select has_table_privilege('authenticated', $1, 'select') as ok`,
        [t],
      );
      if (!rows[0].ok) {
        pass(`authenticated cannot select ${t} (correctly denied)`);
      } else {
        fail(`authenticated can select ${t} but should be denied`);
      }
    } catch (err) {
      fail(`grant check for ${t}: ${err.message}`);
    }
  }
  // anon should have no access to data tables
  for (const t of dataTables) {
    try {
      const { rows } = await db.query(
        `select has_table_privilege('anon', $1, 'select') as ok`,
        [t],
      );
      if (!rows[0].ok) {
        pass(`anon cannot select ${t} (correctly denied)`);
      } else {
        fail(`anon can select ${t} but should be denied`);
      }
    } catch (err) {
      fail(`grant check for ${t}: ${err.message}`);
    }
  }
}

async function checkPolicies(db) {
  const { rows } = await db.query(
    `select schemaname, tablename, policyname, qual, with_check
     from pg_policies where schemaname = 'public'`,
  );
  // Verify the hardened policies use (select auth.uid()) not plain auth.uid()
  let hardenedCount = 0;
  let unhardened = [];
  for (const row of rows) {
    const qual = String(row.qual || '');
    const wc = String(row.with_check || '');
    const combined = qual + wc;
    if (combined.includes('auth.uid()')) {
      // Could be hardened ( SELECT auth.uid() ) or plain auth.uid()
      if (combined.includes('( SELECT auth.uid()') || combined.includes('(SELECT auth.uid()')) {
        hardenedCount++;
      } else if (combined.trim().length > 0) {
        unhardened.push(row.policyname);
      }
    }
  }
  if (rows.length >= 8) {
    pass(`${rows.length} RLS policies defined`);
  } else {
    fail(`only ${rows.length} RLS policies — expected at least 8`);
  }
  if (unhardened.length === 0) {
    pass('all policies use hardened (select auth.uid()) form');
  } else {
    fail(`policies using plain auth.uid() (not hardened): ${unhardened.join(', ')}`);
  }
}

async function checkIdempotency(db) {
  // Reapply the two most complex migrations that are documented as idempotent
  const idempotentMigrations = [
    '2026-09-17_account_security.sql',
    '20260921194345_supabase_hardening_v0202.sql',
    '20260921212102_editable_groceries_v0210.sql',
  ];
  for (const filename of idempotentMigrations) {
    try {
      await db.exec(readMigration(filename));
      pass(`idempotent reapplication of ${filename}`);
    } catch (err) {
      fail(`${filename} is not idempotent: ${err.message}`);
    }
  }
}

async function main() {
  console.log('Mealz migration validation\n');
  const db = new PGlite();
  try {
    // ── 1. Bootstrap the Supabase-equivalent schema ──────────────────────────
    await bootstrap(db);
    pass('bootstrap: Supabase auth/roles fixture created');

    // ── 2. Apply migrations in manifest order ────────────────────────────────
    console.log(`\nApplying ${MIGRATIONS.length} migrations in manifest order:`);
    for (const filename of MIGRATIONS) {
      try {
        await db.exec(readMigration(filename));
        pass(`applied ${filename}`);
      } catch (err) {
        fail(`applying ${filename}: ${err.message}`);
        // Abort on first migration failure — later ones will cascade.
        break;
      }
    }

    // ── 3. Verify required schema ────────────────────────────────────────────
    console.log('\nVerifying required tables:');
    await checkRequiredTables(db);

    console.log('\nVerifying required columns:');
    await checkRequiredColumns(db);

    console.log('\nVerifying required indexes:');
    await checkRequiredIndexes(db);

    console.log('\nVerifying required functions:');
    await checkRequiredFunctions(db);

    console.log('\nVerifying RLS is enabled:');
    await checkRLSEnabled(db);

    console.log('\nVerifying grants:');
    await checkGrants(db);

    console.log('\nVerifying RLS policies:');
    await checkPolicies(db);

    // ── 4. Idempotency check ─────────────────────────────────────────────────
    console.log('\nVerifying idempotent reapplication:');
    await checkIdempotency(db);

  } finally {
    await db.close();
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(60)}`);
  const total = passes + failures;
  if (failures === 0) {
    console.log(`Migration validation passed: ${passes}/${total} checks ok.`);
    process.exit(0);
  } else {
    console.error(`Migration validation FAILED: ${failures}/${total} checks failed.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

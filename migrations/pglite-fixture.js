/**
 * migrations/pglite-fixture.js
 *
 * Shared PGlite fixture for migration validation (tests and scripts).
 * Centralises the SQL adaptations and bootstrap schema so they exist
 * in exactly one place instead of being duplicated in migrate-validate.js
 * and migration-manifest.test.js.
 */

export function adaptForPGlite(sql) {
  return sql
    .replace(/create extension if not exists pgcrypto\s*;/gi, '-- pgcrypto extension omitted for PGlite')
    .replace(/\bnot valid\b/gi, '')
    .replace(/alter table[^;]+validate constraint[^;]+;/gi, '')
    .replace(/perform pg_advisory_xact_lock\([^)]+\)\s*;/gi, '-- pg_advisory_xact_lock omitted');
}

export async function makeDb() {
  const { PGlite } = await import('@electric-sql/pglite');
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

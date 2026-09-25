/**
 * migrations/manifest.js
 *
 * Canonical ordered list of all Mealz SQL migrations.
 * Every new migration must be appended here in the order it should be applied.
 * The validate script and CI both use this as the single source of truth.
 *
 * Rules:
 *  - Never reorder entries.
 *  - Never remove an entry that has been applied to production.
 *  - Always append new migrations at the end.
 *  - Filenames here must exactly match the filenames in migrations/.
 */

export const MIGRATIONS = [
  // v0.13 — dedicated profiles table (prototype data migration)
  '2026-09-14_profiles.sql',

  // v0.16 — user ownership and RLS
  '2026-09-15_user_ownership_rls.sql',

  // v0.16.1 — household model (households + household_members + shared RLS)
  '2026-09-15_households.sql',

  // v0.16.2 — drop legacy owner_user_id NOT NULL for household-owned inserts
  '2026-09-16_household_compatibility.sql',

  // v0.17 — account security (rate limits + mealz_manage_household RPC)
  '2026-09-17_account_security.sql',

  // v0.20.0 — trusted-device quick login
  '2026-09-21_trusted_device_login.sql',

  // v0.20.2 — Supabase access hardening (narrow grants, optimised RLS, indexes)
  '20260921194345_supabase_hardening_v0202.sql',

  // v0.21.0 — editable grocery lists (source, source_key, deleted, user_modified)
  '20260921212102_editable_groceries_v0210.sql',

  // v0.22.0 — explicit weekly sundry intent and legacy salt/pepper backfill
  '20260924161500_sundry_intent_v0220.sql',
];

/**
 * Required state after the full migration set has been applied.
 * Used by the preflight check to fail closed when the schema is incomplete.
 */
export const REQUIRED_TABLES = [
  'profiles',
  'households',
  'household_members',
  'weekly_plans',
  'meals',
  'ingredients',
  'recipe_steps',
  'grocery_items',
  'mealz_rate_limits',
  'mealz_trusted_devices',
];

export const REQUIRED_COLUMNS = {
  profiles: ['id', 'household_id', 'profile_key', 'adults', 'children'],
  weekly_plans: ['id', 'household_id', 'week_start'],
  meals: ['id', 'weekly_plan_id'],
  grocery_items: ['id', 'weekly_plan_id', 'source', 'source_key', 'deleted', 'user_modified', 'needed_this_week'],
  households: ['id', 'name', 'created_by', 'join_code_hash'],
  household_members: ['household_id', 'user_id', 'role'],
  mealz_trusted_devices: ['id', 'user_id', 'device_token_hash', 'pin_hash'],
  mealz_rate_limits: ['bucket_key', 'window_start', 'hits'],
};

export const REQUIRED_INDEXES = [
  'households_created_by_idx',
  'profiles_household_profile_key_idx',
  'weekly_plans_household_week_idx',
  'mealz_trusted_devices_user_idx',
  'grocery_items_generated_source_key_unique',
  'grocery_items_plan_visible_idx',
];

export const REQUIRED_FUNCTIONS = [
  'mealz_take_rate_limit',
  'mealz_manage_household',
];

#!/usr/bin/env node
/**
 * scripts/migrate-live.js
 *
 * Live schema gate: verifies that the required migration state has been
 * applied to a live Supabase database. Read-only by construction — uses
 * SELECT probes only, never writes.
 *
 * Usage:  node scripts/migrate-live.js
 * Or:     pnpm migration:live
 *
 * Exits 0 if all required objects are present, or if no credentials are
 * configured (skips gracefully). Exits 1 if any required object is missing.
 */

import {
  REQUIRED_TABLES,
  REQUIRED_COLUMNS,
} from '../migrations/manifest.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log('skipped: no credentials');
  process.exit(0);
}

async function probe(path) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseKey,
    },
  });
  return res.status;
}

async function main() {
  const failures = [];

  for (const table of REQUIRED_TABLES) {
    const status = await probe(`${table}?select=id&limit=0`);
    if (status !== 200) failures.push(`table ${table} (HTTP ${status})`);
  }

  for (const [table, cols] of Object.entries(REQUIRED_COLUMNS)) {
    for (const col of cols) {
      const status = await probe(`${table}?select=${col}&limit=0`);
      if (status !== 200) failures.push(`column ${table}.${col} (HTTP ${status})`);
    }
  }

  if (failures.length === 0) {
    console.log('All required schema objects present.');
    process.exit(0);
  } else {
    console.error('Live schema probes failed:');
    for (const m of failures) {
      console.error(`  - ${m}`);
    }
    console.error('');
    console.error('Check credentials and apply any missing migrations in the Supabase SQL Editor, then re-run.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

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

import { SCHEMA_PROBES } from '../migrations/manifest.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  if (process.argv.includes('--require-credentials')) {
    console.error('FAIL: authenticated schema preflight requires SUPABASE_URL and SUPABASE_SECRET_KEY.');
    process.exit(1);
  }
  console.log('skipped: no credentials');
  process.exit(0);
}

async function probe(path) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method: 'GET',
    signal: AbortSignal.timeout(8000),
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseKey,
    },
  });
  return res.status;
}

async function main() {
  const failures = [];

  for (const {path, label} of SCHEMA_PROBES) {
    const status = await probe(path);
    if (status !== 200) failures.push(`${label} (HTTP ${status})`);
  }

  if (failures.length === 0) {
    console.log('Required table/column probes passed. Verify RPC grants, RLS and acceptance flows separately.');
    process.exit(0);
  } else {
    console.error('Live schema probes failed:');
    for (const m of failures) {
      console.error(`  - ${m}`);
    }
    console.error('');
    console.error('Check credentials and the coordinated migration rollout before retrying. This gate does not apply migrations.');
    process.exit(1);
  }
}

main().catch(() => {
  console.error('Live schema preflight failed due to a transport error or timeout.');
  process.exit(1);
});

#!/usr/bin/env node
/**
 * scripts/migrate-apply.js
 *
 * Apply helper: emits the ordered migration SQL from the manifest to stdout.
 * Intended usage: run this, copy the output, paste into Supabase SQL Editor,
 * run it, then confirm with `pnpm migration:live`.
 *
 * Does not execute SQL itself. Needs no credentials. Cannot modify the database.
 *
 * Usage:  node scripts/migrate-apply.js
 * Or:     pnpm migration:apply
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MIGRATIONS } from '../migrations/manifest.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'migrations');

function main() {
  const sqlParts = [];
  console.log(`mealz migration apply: ${MIGRATIONS.length} migrations in order:`);
  console.log('');
  for (const filename of MIGRATIONS) {
    console.log(`  ${filename}`);
    const sql = readFileSync(join(migrationsDir, filename), 'utf8');
    sqlParts.push(sql);
  }
  console.log('');
  console.log('── SQL ─────────────────────────────────────────────────────────────');
  console.log('');
  console.log(sqlParts.join('\n\n'));
  console.log('');
  console.log('── end of SQL ──────────────────────────────────────────────────────');
  console.log('');
  console.log('Copy the SQL above and paste it into the Supabase SQL Editor.');
  console.log('Then run: pnpm migration:live');
}

main();

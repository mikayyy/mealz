#!/usr/bin/env node
/**
 * release-check.js
 *
 * Verifies that the canonical product version in package.json is reflected
 * consistently in index.html (HTML title) and README.md (current-release
 * heading). Run before tagging a release.
 *
 * Usage: node scripts/release-check.js
 * Or:    pnpm release:check
 *
 * Exit 0 = all checks pass.
 * Exit 1 = one or more mismatches found.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

const pkg = JSON.parse(read('package.json'));
const version = pkg.version;
if (!version) {
  console.error('ERROR: package.json has no "version" field.');
  process.exit(1);
}

let failures = 0;

function fail(message) {
  console.error(`FAIL: ${message}`);
  failures++;
}

function pass(message) {
  console.log(`ok  : ${message}`);
}

// ── 1. index.html title must contain the version ────────────────────────────
const html = read('index.html');
const titleMatch = html.match(/<title>([^<]+)<\/title>/);
if (!titleMatch) {
  fail('index.html has no <title> element.');
} else {
  const title = titleMatch[1];
  if (title.includes(version)) {
    pass(`index.html title "${title}" contains v${version}`);
  } else {
    fail(`index.html title is "${title}" but package.json version is ${version}`);
  }
}

// ── 2. README.md current-release section must reference the version ──────────
const readme = read('README.md');
// Match the bold version at the start of the Current release section
if (readme.includes(`**v${version}**`)) {
  pass(`README.md "Current release" references v${version}`);
} else {
  fail(`README.md does not contain "**v${version}**" — update the "Current release" section`);
}

// ── 3. CHANGELOG.md must have an entry for the version ───────────────────────
const changelog = read('CHANGELOG.md');
if (changelog.includes(`## v${version}`)) {
  pass(`CHANGELOG.md has an entry for v${version}`);
} else {
  fail(`CHANGELOG.md has no "## v${version}" entry`);
}

// ── 4. index.html must use a pinned Supabase SDK version (no bare @2) ────────
if (html.includes('@supabase/supabase-js@2"') || html.includes('@supabase/supabase-js@2\'')) {
  fail('index.html loads @supabase/supabase-js@2 without a patch version — pin to an exact version like @2.x.y');
} else {
  // Check it has a pinned version pattern like @2.116.0
  const sdkMatch = html.match(/@supabase\/supabase-js@(\d+\.\d+\.\d+)/);
  if (sdkMatch) {
    pass(`index.html pins @supabase/supabase-js@${sdkMatch[1]}`);
  } else {
    fail('index.html does not include a pinned @supabase/supabase-js version');
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
if (failures === 0) {
  console.log(`Release check passed for v${version}. All ${4} checks ok.`);
  process.exit(0);
} else {
  console.error(`Release check FAILED: ${failures} of 4 check(s) failed.`);
  process.exit(1);
}

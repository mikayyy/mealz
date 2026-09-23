#!/usr/bin/env node
// Script to establish error baseline for @ts-nocheck files
// For each file, temporarily remove @ts-nocheck and check all 7 files together

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'fs';
import { join } from 'path';

const browserFiles = [
  'account-client.js',
  'app.js',
  'auth-client.js',
  'client-foundation.js',
  'grocery-order.js',
  'navigation-polish.js',
  'weeks.js'
];

const results = [];

function runTscWithNocheckRemoved(targetFile) {
  // Create temp copies with @ts-nocheck removed from target file
  const tempDir = '.tsc-temp';
  
  // Clean and create temp dir
  if (existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
  mkdirSync(tempDir, { recursive: true });
  
  for (const file of browserFiles) {
    let content = readFileSync(file, 'utf8');
    if (file === targetFile) {
      // Remove @ts-nocheck comment
      content = content.replace(/^\/\/ @ts-nocheck --.*\n/, '');
    }
    writeFileSync(join(tempDir, file), content);
  }
  
  // Copy globals.d.ts
  cpSync('types/browser-globals.d.ts', join(tempDir, 'browser-globals.d.ts'));
  
  // Run tsc on all files in temp dir
  try {
    const output = execSync(
      `npx tsc --ignoreConfig --noEmit --checkJs --allowJs --strict false --moduleResolution Bundler --module Preserve --target ES2022 --lib ES2022,DOM,DOM.Iterable --esModuleInterop --forceConsistentCasingInFileNames --skipLibCheck false --types node ${join(tempDir, 'browser-globals.d.ts')} ${browserFiles.map(f => join(tempDir, f)).join(' ')} 2>&1`,
      { encoding: 'utf8', stdio: 'pipe', timeout: 30000 }
    );
    return { errors: output.trim() ? output.trim().split('\n') : [], count: output.trim() ? output.trim().split('\n').length : 0 };
  } catch (e) {
    const output = e.stdout?.toString() || e.stderr?.toString() || e.message;
    return { errors: output.trim() ? output.trim().split('\n') : [], count: output.trim() ? output.trim().split('\n').length : 0 };
  }
}

function categorizeErrors(errors) {
  const categories = {
    'Global-script resolution': 0,
    'DOM element narrowing': 0,
    'Inferred property mismatches': 0,
    'Module/import resolution': 0,
    'Other': 0
  };

  for (const error of errors) {
    if (error.includes('Cannot find name') || error.includes('Cannot find namespace') || (error.includes('Property') && error.includes('does not exist on type'))) {
      categories['Global-script resolution']++;
    } else if (error.includes('HTMLElement') || error.includes('Element') || error.includes('querySelector') || error.includes('document') || error.includes('Node') || error.includes('EventTarget')) {
      categories['DOM element narrowing']++;
    } else if (error.includes('Type') && error.includes('is not assignable') || error.includes('implicitly has') || (error.includes('Property') && error.includes('does not exist') && !error.includes('on type'))) {
      categories['Inferred property mismatches']++;
    } else if (error.includes('module') || error.includes('import') || error.includes('export') || error.includes('require')) {
      categories['Module/import resolution']++;
    } else {
      categories['Other']++;
    }
  }

  return categories;
}

console.log('=== T1: Establish error baseline for @ts-nocheck files ===\n');

for (const file of browserFiles) {
  console.log(`Checking ${file} (with @ts-nocheck removed)...`);
  const result = runTscWithNocheckRemoved(file);
  
  // Filter errors to only those from the target file
  const fileErrors = result.errors.filter(e => e.includes(file));
  const categories = categorizeErrors(fileErrors);
  const count = fileErrors.length;
  
  console.log(`  Errors in ${file}: ${count}`);
  for (const [cat, c] of Object.entries(categories)) {
    if (c > 0) console.log(`    ${cat}: ${c}`);
  }
  if (count > 0) {
    for (const err of fileErrors) {
      console.log(`    ${err}`);
    }
  }
  
  results.push({ file, count, categories, errors: fileErrors });
  console.log('');
}

// Print summary
console.log('=== SUMMARY ===\n');
console.log('| File | Total Errors | Global-Script | DOM Narrowing | Property Mismatches | Module/Import | Other |');
console.log('|------|-------------|---------------|---------------|---------------------|---------------|-------|');
for (const r of results) {
  console.log(`| ${r.file} | ${r.count} | ${r.categories['Global-script resolution']} | ${r.categories['DOM element narrowing']} | ${r.categories['Inferred property mismatches']} | ${r.categories['Module/import resolution']} | ${r.categories['Other']} |`);
}

// Save detailed results
writeFileSync('tsc-error-baseline.json', JSON.stringify(results, null, 2));
console.log('\nDetailed results saved to tsc-error-baseline.json');
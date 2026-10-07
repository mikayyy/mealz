import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('authenticated preflight fails rather than skipping missing credentials',()=>{
  const env={...process.env};delete env.SUPABASE_URL;delete env.SUPABASE_SECRET_KEY;
  const result=spawnSync(process.execPath,['scripts/migrate-live.js','--require-credentials'],{env,encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stderr,/requires SUPABASE_URL/);
});
test('optional developer preflight explicitly skips without credentials',()=>{
  const env={...process.env};delete env.SUPABASE_URL;delete env.SUPABASE_SECRET_KEY;
  const result=spawnSync(process.execPath,['scripts/migrate-live.js'],{env,encoding:'utf8'});
  assert.equal(result.status,0);assert.match(result.stdout,/skipped: no credentials/);
});

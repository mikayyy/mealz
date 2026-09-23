import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bearerToken} from '../api/_lib/auth.js';

const authClient=readFileSync(new URL('../auth-client.js',import.meta.url),'utf8');

test('bearer token parsing accepts standard Authorization headers',()=>{
  assert.equal(bearerToken({headers:{authorization:'Bearer abc.123'}}),'abc.123');
  assert.equal(bearerToken({headers:{authorization:'bearer token-value'}}),'token-value');
  assert.equal(bearerToken({headers:{}}),'');
});

test('browser auth bootstrap loads before the application client',()=>{
  const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(index,/supabase-js@2/);
  assert.ok(index.indexOf('/auth-client.js')<index.indexOf('/app.js'));
  assert.match(index,/class="brand"[^>]*aria-label="mealz"[^>]*>meal<span class="brand-z"/);
});

test('auth bootstrap has a bounded config wait',()=>{
  assert.match(authClient,/setTimeout\(\(\)=>controller\.abort\(\),5000\)/);
  assert.match(authClient,/signal:controller\.signal/);
});

test('authenticated API interception never waits indefinitely for a future login',()=>{
  assert.doesNotMatch(authClient,/sessionReady/);
  assert.match(authClient,/if\(!auth\.session\)/);
  assert.match(authClient,/return authResponse\(\)/);
});

test('user-facing APIs require verified sessions when auth is configured',()=>{
  const files=['generate-ideas.js','expand-meals.js','swap-meal.js','plan.js','profile.js','weeks.js','pregenerated-ideas.js','feedback.js'];
  for(const file of files){
    const source=readFileSync(new URL(`../api/${file}`,import.meta.url),'utf8');
    assert.match(source,/requireUser\(req\)/,file);
  }
});

test('auth config never exposes the server secret key',()=>{
  const source=readFileSync(new URL('../api/auth-config.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/SUPABASE_SECRET_KEY/);
  assert.match(source,/publicAuthConfig/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const styles=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const auth=readFileSync(new URL('../auth.css',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const weeks=readFileSync(new URL('../weeks.js',import.meta.url),'utf8');
const account=readFileSync(new URL('../account-client.js',import.meta.url),'utf8');
const authClient=readFileSync(new URL('../auth-client.js',import.meta.url),'utf8');
const foundation=readFileSync(new URL('../client-foundation.js',import.meta.url),'utf8');

test('v0.19 uses the approved neutral palette and Inter',()=>{
  assert.match(styles,/--bg:#F7F6F2/);
  assert.match(styles,/--ink:#171717/);
  assert.match(styles,/--signal:#E85D04/);
  assert.match(styles,/font-family:Inter/);
  assert.match(index,/fonts\.googleapis\.com\/css2\?family=Inter/);
  assert.doesNotMatch(styles,/#1f6f5c|#eaf4ef|Georgia/);
});

test('signal orange is not the primary action color',()=>{
  const primary=styles.match(/\.primary\{([^}]*)\}/)?.[1]||'';
  assert.match(primary,/background:var\(--ink\)/);
  assert.doesNotMatch(primary,/--signal/);
  assert.match(styles,/\.status--success[^\{]*\{[^}]*var\(--signal\)/s);
});

test('brand geometry stays flat and sharp',()=>{
  assert.doesNotMatch(styles,/border-radius:(?:[1-9]|999)/);
  assert.doesNotMatch(auth,/border-radius:(?:[1-9]|999)/);
  assert.doesNotMatch(auth,/box-shadow:(?!none)/);
});

test('controlled product UI contains no emoji',()=>{
  const source=[app,weeks,account,authClient,foundation].join('\n');
  const emoji=/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  assert.equal(emoji.test(source),false);
});

test('wordmark and tagline use the approved treatment',()=>{
  assert.match(index,/aria-label="mealz"/);
  assert.match(index,/brand-z/);
  assert.match(index,/already sorted\./);
  assert.match(authClient,/already sorted\./);
  assert.match(styles,/\.brand-z\{[^}]*var\(--ink\)[^}]*transparent[^}]*var\(--ink\)/);
  assert.match(styles,/-webkit-text-fill-color:transparent/);
  assert.doesNotMatch(styles,/\.brand-z\{[^}]*currentColor/);
});

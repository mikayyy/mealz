import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../client-foundation.js',import.meta.url),'utf8');

test('planning conflict observer does not rerender warnings on every DOM mutation',()=>{
  assert.match(source,/let lastUseUpInput=null/);
  assert.match(source,/if\(input===lastUseUpInput\)return/);
  assert.match(source,/syncNewPlanningScreen\(\)/);
  assert.doesNotMatch(source,/if\(document\.querySelector\('#useUp'\)\)renderUseUpConflict\(\)/);
});

test('conflict warning rendering is idempotent',()=>{
  assert.match(source,/if\(existing\?\.outerHTML===markup\)return/);
  assert.match(source,/if\(!conflicts\.length\)\{existing\?\.remove\(\);return\}/);
});

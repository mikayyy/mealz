import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../api/plan.js',import.meta.url),'utf8');

test('grocery mutations are scoped by both item and weekly plan IDs',()=>{
  assert.match(source,/grocery_items\?id=eq\.\$\{enc\(itemId\)\}&weekly_plan_id=eq\.\$\{enc\(planId\)\}/);
  assert.match(source,/action==='toggle'/);
  assert.match(source,/user_modified:true/);
  assert.match(source,/deleted:true/);
});

test('saved grocery rows are authoritative and hidden deletion markers stay internal',()=>{
  assert.match(source,/deleted=eq\.false/);
  assert.match(source,/shopping\.reconcileGroceries\(priorGroceries,meals\)/);
  assert.doesNotMatch(source,/name=eq\.\$\{enc\(name\)\}/);
});

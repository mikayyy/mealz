import test from 'node:test';
import assert from 'node:assert/strict';

test('plan route exports the atomic handler under the application runtime',async()=>{
  const module=await import('../api/plan.ts');assert.equal(typeof module.default,'function');
});
// Mutation behavior is exercised by plan-save.test.js and the real Postgres
// functions in transactional-plan.test.js rather than source-pattern checks.

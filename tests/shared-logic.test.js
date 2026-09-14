const test=require('node:test');
const assert=require('node:assert/strict');
const logic=require('../shared-logic.js');

test('idea count scales with cooking days',()=>{
  assert.equal(logic.ideaCountForDays(1),6);
  assert.equal(logic.ideaCountForDays(4),6);
  assert.equal(logic.ideaCountForDays(5),7);
  assert.equal(logic.ideaCountForDays(7),9);
});

test('week starts are Monday through Sunday aware',()=>{
  assert.equal(logic.currentWeekStart(new Date(2026,8,14,12)), '2026-09-14');
  assert.equal(logic.currentWeekStart(new Date(2026,8,20,12)), '2026-09-14');
  assert.equal(logic.nextWeekStart(new Date(2026,8,20,12)), '2026-09-21');
});

test('day sorting is canonical Monday to Sunday',()=>{
  assert.deepEqual(logic.sortDays(['Friday','Monday','Wednesday']),['Monday','Wednesday','Friday']);
});

test('grocery names normalize common plurals',()=>{
  assert.equal(logic.normalizeIngredientName('Limes'),'lime');
  assert.equal(logic.normalizeIngredientName('berries'),'berry');
  assert.equal(logic.groceryKey({category:'Produce',name:'Limes',unit:'whole'}),'Produce::lime::whole');
});

test('salt and pepper remain pantry staples',()=>{
  assert.equal(logic.isPantryStaple('kosher salt'),true);
  assert.equal(logic.isPantryStaple('black pepper'),true);
  assert.equal(logic.isPantryStaple('paprika'),false);
});

test('pescatarian conflict detection catches steak but not salmon',()=>{
  const steak=logic.householdUseUpConflicts('T-bone steak',['Pescatarian']);
  const salmon=logic.householdUseUpConflicts('salmon',['Pescatarian']);
  assert.equal(steak.length,1);
  assert.equal(steak[0].preference,'Pescatarian');
  assert.equal(salmon.length,0);
});

test('vegan conflict detection catches dairy and eggs',()=>{
  const conflicts=logic.householdUseUpConflicts('eggs, yogurt and spinach',['Vegan']);
  assert.equal(conflicts.length,1);
  assert.ok(conflicts[0].matches.includes('eggs'));
  assert.ok(conflicts[0].matches.includes('yogurt'));
});

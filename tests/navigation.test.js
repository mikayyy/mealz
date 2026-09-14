import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const weeks=readFileSync(new URL('../weeks.js',import.meta.url),'utf8');
const navigationPolish=readFileSync(new URL('../navigation-polish.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('week navigation sets context before using already-hydrated data',()=>{
  const hydrate=weeks.slice(weeks.indexOf('async function hydrateWeek'),weeks.indexOf('function cancelTransientNavigation'));
  assert.match(hydrate,/selectedWeekStart=start/);
  assert.ok(hydrate.indexOf('selectedWeekStart=start')<hydrate.indexOf('s.viewWeekStart===start'));
});

test('all durable sub-screens have a route back toward Weeks',()=>{
  assert.match(weeks,/profile=function\(\)\{baseProfileView\(\);addProfileBack\(\)\}/);
  assert.match(weeks,/ideaPicker=function\(\)\{baseIdeaPicker\(\);addWeekContext\(\)\}/);
  assert.match(weeks,/meals=function\(\)\{activeSwapEpoch=null;baseMealsView\(\);addWeekContext\(\)\}/);
  assert.match(weeks,/groceries=function\(\)\{activeSwapEpoch=null;baseGroceriesView\(\);addWeekContext\(\)\}/);
  assert.match(weeks,/recipe=function\(id\).*addWeekContext\(\)/);
});

test('meals and groceries expose reciprocal week-preserving switches',()=>{
  assert.match(navigationPolish,/label:'Groceries'.*action:\(\)=>groceries\(\)/s);
  assert.match(navigationPolish,/label:'Meals'.*action:\(\)=>meals\(\)/s);
  assert.match(navigationPolish,/weekParts\('Meals'\)/);
  assert.match(navigationPolish,/weekParts\('Groceries'\)/);
});

test('cancelled swap requests cannot navigate forward again later',()=>{
  assert.match(weeks,/activeSwapEpoch=null/);
  assert.match(weeks,/showSwapChoices=function\(original,alts\)\{if\(activeSwapEpoch==null\)return;/);
});

test('the Mealz wordmark is a persistent dashboard escape hatch',()=>{
  assert.match(weeks,/aria-label','Go to weeks dashboard'/);
  assert.match(weeks,/brandHome\.onclick=backToWeeks/);
});

test('legacy bottom navigation stays removed',()=>{
  assert.doesNotMatch(index,/class="bottom-nav"/);
});

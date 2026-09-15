import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const weeks=readFileSync(new URL('../weeks.js',import.meta.url),'utf8');
const navigationPolish=readFileSync(new URL('../navigation-polish.js',import.meta.url),'utf8');
const polish=readFileSync(new URL('../polish.css',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('week navigation sets context before using already-hydrated data',()=>{
  const hydrate=weeks.slice(weeks.indexOf('async function hydrateWeek'),weeks.indexOf('function cancelTransientNavigation'));
  assert.match(hydrate,/selectedWeekStart=start/);
  assert.ok(hydrate.indexOf('selectedWeekStart=start')<hydrate.indexOf('s.viewWeekStart===start'));
});

test('dashboard actions use one delegated handler that survives child rerenders',()=>{
  assert.match(weeks,/app\.addEventListener\('click'/);
  assert.match(weeks,/closest\?\.\('\[data-week-action\]'\)/);
  assert.match(weeks,/app\.dataset\.weekActionsWired==='true'/);
  assert.match(weeks,/handleWeekAction\(button\)/);
  assert.doesNotMatch(weeks,/querySelectorAll\('\[data-week-action\]'\)\.forEach\(b=>b\.onclick/);
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

test('recipe screen relies on interactive hierarchy instead of a redundant back button',()=>{
  assert.match(navigationPolish,/app\.querySelector\('#back'\)\?\.remove\(\)/);
  assert.match(navigationPolish,/weekParts\('Meals',\{sectionAction:\(\)=>meals\(\)\}\)/);
  assert.doesNotMatch(navigationPolish,/Back to meals/);
});

test('non-page breadcrumb context is visually distinct from links and current page',()=>{
  assert.match(navigationPolish,/kind:'context'/);
  assert.match(polish,/\.breadcrumb-context\{/);
  assert.match(polish,/\.breadcrumb-current\{/);
  assert.match(polish,/\.breadcrumb-link\{/);
});

test('meal ideas preserve Plan as an interactive parent in the hierarchy',()=>{
  assert.match(navigationPolish,/planningParts\('Meal Ideas'\)/);
  assert.match(navigationPolish,/\{label:'Plan',action:current==='Plan'\?null:plan\}/);
});

test('cancelled swap requests cannot navigate forward again later',()=>{
  assert.match(weeks,/activeSwapEpoch=null/);
  assert.match(weeks,/showSwapChoices=function\(original,alts\)\{if\(activeSwapEpoch==null\)return;/);
});

test('the wordmark remains a persistent dashboard escape hatch',()=>{
  assert.match(weeks,/aria-label','Go to weeks dashboard'/);
  assert.match(weeks,/brandHome\.onclick=backToWeeks/);
});

test('legacy bottom navigation stays removed',()=>{assert.doesNotMatch(index,/class="bottom-nav"/)});

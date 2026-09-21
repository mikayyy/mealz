import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../client-foundation.js',import.meta.url),'utf8');
const introText='set the preferences mealz should remember from week to week.';

// Model childList delivery explicitly: setting Element.textContent replaces its
// text child even when the string is unchanged. Bound delivery so a regression
// fails instead of starving the test runner's event loop like the browser did.
function foundationHarness(initialHeading='your weeks'){
  let callback,observing=false,pending=false,writes=0;
  const nodes=new Map();
  const app={querySelector:selector=>nodes.get(selector)||null};
  const mutate=()=>{if(observing)pending=true};
  function element(text,subtle=false){
    return {
      get textContent(){return text},
      set textContent(value){text=value;writes++;mutate()},
      classList:{contains:name=>subtle&&name==='subtle'}
    };
  }
  function mount(headingText){
    nodes.clear();
    const heading=element(headingText);
    const intro=element('set the preferences mealz should remember from week to week.',true);
    const button=element('save profile');
    heading.nextElementSibling=intro;
    nodes.set('h1',heading);
    if(headingText==='Household'||headingText==='profile')nodes.set('#profileDone',button);
    mutate();
    return {heading,intro,button};
  }
  function settle(){
    let deliveries=0;
    while(pending&&deliveries<10){pending=false;deliveries++;callback()}
    assert.equal(pending,false,'Profile observer must settle rather than schedule itself forever');
  }
  const initial=mount(initialHeading);
  runInNewContext(source,{
    MealzLogic:{},
    document:{querySelector:selector=>selector==='#app'?app:null,addEventListener(){}},
    MutationObserver:class {
      constructor(fn){callback=fn}
      observe(target,options){
        assert.equal(target,app);
        assert.equal(options.childList,true);
        assert.equal(options.subtree,true);
        observing=true;
      }
    },
    requestAnimationFrame:fn=>fn(),window:{scrollTo(){}},
  });
  return {initial,mount,settle,mutate,nodes,element,get writes(){return writes}};
}

function assertProfile(screen){
  assert.equal(screen.heading.textContent,'profile');
  assert.equal(screen.intro.textContent,introText);
  assert.equal(screen.button.textContent,'save profile');
}

test('opening Profile and rerendering preferences settles the observer',()=>{
  const h=foundationHarness();
  h.settle();
  for(let i=0;i<3;i++){
    const screen=h.mount('Household');
    h.settle();
    assertProfile(screen);
    const writes=h.writes;
    // Breadcrumbs or other unrelated DOM updates must not rewrite Profile text.
    for(let j=0;j<3;j++){h.mutate();h.settle()}
    assert.equal(h.writes,writes);
    h.mount('your weeks');
    h.settle();
  }
});

test('Profile already mounted at startup also settles',()=>{
  const h=foundationHarness('profile');
  h.settle();
  assertProfile(h.initial);
});

test('later text changes are normalized without overriding save progress',()=>{
  const h=foundationHarness('Household');
  h.settle();
  h.initial.intro.textContent='Outdated introduction';
  h.initial.button.textContent='saving…';
  h.settle();
  assert.equal(h.initial.intro.textContent,introText);
  assert.equal(h.initial.button.textContent,'saving…');
  const summary=h.element('Household');
  h.nodes.set('.household-summary h2',summary);
  h.mutate();h.settle();
  assert.equal(summary.textContent,'profile');
});

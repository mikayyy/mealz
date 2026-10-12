import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';

const sdk=`window.supabase={createClient:()=>({auth:{onAuthStateChange(){},async getSession(){return {data:{session:{user:{id:'save@test.com',email:'save@test.com'},access_token:'token'}}}},async signOut(){return {error:null}}}})};`;
const weekStart='2026-10-05';
const meal={id:'dinner',day:'Monday',title:'Saved dinner',servings:4,total_minutes:20,tags:[],ingredients:[{name:'rice',quantity:1,unit:'cup',category:'Pantry'}],steps:['Cook rice.']};

// Run the shipped browser scripts against a controlled API, including account
// boot and localStorage. Only the external services are substituted.
async function fixture(){
  const browser=await chromium.launch({headless:true,...(process.env.MEALZ_CHROME_PATH?{executablePath:process.env.MEALZ_CHROME_PATH}:{})});
  const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(5000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let revision=1,cloudMeal=structuredClone(meal);
  /** @type {(body: any) => Promise<any>} */
  let post=async()=>({status:200,json:result()});
  /** @type {(path: string,body: any) => Promise<any>} */
  let generation=async()=>({status:500,json:{error:'Generation unavailable'}});
  const requests=[],generationRequests=[];
  function result(){return {planId:'00000000-0000-4000-8000-000000000001',revision,plan:{id:'00000000-0000-4000-8000-000000000001',revision,week_start:weekStart,cooking_days:['Monday']},meals:[cloudMeal],groceryItems:[]}}
  await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.hostname==='cdn.jsdelivr.net')return route.fulfill({contentType:'text/javascript',body:sdk});
    if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
    if(url.hostname==='fonts.gstatic.com')return route.fulfill({status:204,body:''});
    assert.equal(url.hostname,'mealz.test');
    if(url.pathname.startsWith('/api/')){
      if(url.pathname==='/api/auth-config')return route.fulfill({json:{enabled:true,supabaseUrl:'https://auth.test',publishableKey:'public'}});
      if(url.pathname==='/api/household')return route.fulfill({json:{linked:true,household:{id:'home',name:'Home',role:'owner'},role:'owner'}});
      if(url.pathname==='/api/profile')return route.fulfill({json:{profile:{adults:2,children:2,dietTags:[],equipment:[]}}});
      if(url.pathname==='/api/pregenerated-ideas')return route.fulfill({json:{ideas:[]}});
      if(url.pathname==='/api/weeks')return route.fulfill({json:{current:{weekStart,mealCount:1,meals:[cloudMeal]},next:null,past:[]}});
      if(['/api/generate-ideas','/api/expand-meals','/api/swap-meal'].includes(url.pathname)){
        const body=req.postDataJSON();generationRequests.push({path:url.pathname,body});
        return route.fulfill(await generation(url.pathname,body));
      }
      if(url.pathname==='/api/plan'){
        if(req.method()==='GET')return route.fulfill({json:result()});
        const body=req.postDataJSON();requests.push(body);return route.fulfill(await post(body));
      }
      throw new Error(`Unexpected API ${url.pathname}`);
    }
    const file=url.pathname==='/'?'index.html':url.pathname.slice(1);
    return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html',body:readFileSync(new URL('../../'+file,import.meta.url))});
  });
  async function boot(){await page.goto('https://mealz.test');await page.locator('[data-week-action="edit-profile"]').waitFor()}
  async function draft(){await page.evaluate(start=>{selectedWeekStart=start;s.viewWeekStart=start;s.meals[0].title='My draft';s.days=['Monday'];view('meals')},weekStart)}
  return {page,requests,generationRequests,errors,boot,draft,result,setPost(fn){post=fn},setGeneration(fn){generation=fn},setCloud(title,rev){cloudMeal={...cloudMeal,title};revision=rev},async close(){await context.close();await browser.close()}};
}

test('lost save response survives reload and retries the same key without generating recipes',async()=>{
  const f=await fixture();
  try{
    f.setPost(async body=>{
      if(f.requests.length===1){f.setCloud(body.meals[0].title,5);return {status:500,json:{error:'Response was lost'}}}
      return {json:{...f.result(),replayed:true}};
    });
    await f.boot();await f.draft();
    await f.page.evaluate(async()=>{try{await syncPlan()}catch{}view('meals')});
    await f.page.getByRole('button',{name:'save draft',exact:true}).waitFor();
    const first=f.requests[0];assert.equal(first.expectedRevision,1);
    await f.page.reload();await f.page.locator('[data-week-action="edit-profile"]').waitFor();
    assert.equal(f.requests.length,1,'reload must not submit cached data automatically');
    await f.page.evaluate(()=>view('meals'));
    await f.page.getByRole('button',{name:'save draft',exact:true}).click();
    await f.page.waitForFunction(()=>!s.pendingPlanSave);
    assert.equal(f.requests.length,2);assert.equal(f.requests[1].requestKey,first.requestKey);assert.equal(f.requests[1].expectedRevision,1);
    assert.deepEqual(await f.page.evaluate(()=>({title:s.meals[0].title,revision:s.weekRevisions['2026-10-05']})),{title:'My draft',revision:5});
    assert.deepEqual(f.errors,[]);
  }finally{await f.close()}
});

test('conflict retains the draft and requires loading and review before a new save',async()=>{
  const f=await fixture();
  try{
    f.setPost(async body=>{
      if(f.requests.length===1){f.setCloud('Household member dinner',3);return {status:409,json:{error:'Someone changed this week.',code:'WEEK_CONFLICT'}}}
      f.setCloud(body.meals[0].title,7);return {json:f.result()};
    });
    await f.boot();await f.draft();
    await f.page.evaluate(async()=>{try{await syncPlan()}catch{}view('meals')});
    await f.page.getByRole('button',{name:'load saved week',exact:true}).click();
    await f.page.getByRole('button',{name:'review your draft',exact:true}).waitFor();
    assert.equal(await f.page.evaluate(()=>s.meals[0].title),'Household member dinner');assert.equal(f.requests.length,1);
    await f.page.getByRole('button',{name:'review your draft',exact:true}).click();
    assert.equal(await f.page.evaluate(()=>s.meals[0].title),'My draft');
    await f.page.getByRole('button',{name:'save draft',exact:true}).click();
    await f.page.waitForFunction(()=>!s.pendingPlanSave);
    assert.equal(f.requests[1].expectedRevision,3);assert.notEqual(f.requests[1].requestKey,f.requests[0].requestKey);
    assert.deepEqual(f.errors,[]);
  }finally{await f.close()}
});

test('late save responses cannot replace another account or selected week',async()=>{
  for(const change of ['account','week']){
    const f=await fixture();let release;
    const gate=new Promise(resolve=>{release=resolve});
    try{
      f.setPost(async()=>{await gate;return {json:{...f.result(),planId:'late-plan'}}});
      await f.boot();await f.draft();
      await f.page.evaluate(()=>{globalThis.pendingTestSave=syncPlan()});
      await f.page.waitForFunction(()=>!!s.pendingPlanSave);
      await f.page.evaluate(change=>{if(change==='account')storageKey='mealz:different:home';else selectedWeekStart='2026-10-12';s.planId='current-plan'},change);
      release();
      assert.deepEqual(await f.page.evaluate(async()=>await globalThis.pendingTestSave),{ignored:true});
      assert.equal(await f.page.evaluate(()=>s.planId),'current-plan');assert.deepEqual(f.errors,[]);
    }finally{release();await f.close()}
  }
});

async function prepareBuild(f){
  await f.page.evaluate(start=>{
    selectedWeekStart=start;s.viewWeekStart=start;weeklyDraft={days:['Monday'],useUp:'rice',notes:'quick dinner'};
    s.ideas=[{id:'chosen',title:'New dinner',description:'Dinner',total_minutes:20}];s.selectedIdeas=['chosen'];ideaPicker();
  },weekStart);
}

test('generation failure leaves the previous saved week intact and can retry the selection',async()=>{
  const f=await fixture();
  try{
    await f.boot();await prepareBuild(f);
    const before=await f.page.evaluate(()=>({planId:s.planId,meals:s.meals,days:s.days,notes:s.notes,groceryItems:s.groceryItems}));
    f.setGeneration(async()=>({status:504,json:{error:'Generation took too long. Your saved week is unchanged.',code:'GENERATION_TIMEOUT'}}));
    await f.page.evaluate(()=>buildSelectedWeek());await f.page.getByRole('button',{name:'try again',exact:true}).waitFor();
    assert.deepEqual(await f.page.evaluate(()=>({planId:s.planId,meals:s.meals,days:s.days,notes:s.notes,groceryItems:s.groceryItems})),before);
    assert.equal(f.requests.length,0);assert.deepEqual(await f.page.evaluate(()=>s.selectedIdeas),['chosen']);
    f.setGeneration(async()=>({json:{meals:[{...meal,id:'new-meal',title:'New dinner'}]}}));
    f.setPost(async body=>{f.setCloud(body.meals[0].title,6);return {json:f.result()}});
    await f.page.getByRole('button',{name:'try again',exact:true}).click();await f.page.waitForFunction(()=>s.meals[0]?.title==='New dinner'&&!s.pendingPlanSave);
    assert.equal(f.generationRequests.length,2);assert.equal(f.requests.length,1);assert.equal(f.requests[0].expectedRevision,1);assert.deepEqual(f.errors,[]);
  }finally{await f.close()}
});

test('late generation success or failure cannot save or repaint after leaving the flow',async()=>{
  for(const change of ['account','week','dashboard','cancel'])for(const success of [true,false]){
    const f=await fixture();let release;
    const gate=new Promise(resolve=>{release=resolve});
    try{
      f.setGeneration(async()=>{await gate;return success?{json:{meals:[{...meal,title:'Late generated dinner'}]}}:{status:504,json:{error:'Late timeout'}}});
      await f.boot();await prepareBuild(f);
      await f.page.evaluate(()=>{globalThis.pendingGenerationTest=buildSelectedWeek()});
      await f.page.locator('#cancelBuild').waitFor();
      if(change==='dashboard')await f.page.locator('.brand').click();
      else if(change==='cancel')await f.page.getByRole('button',{name:'back to ideas',exact:false}).click();
      else await f.page.evaluate(change=>{if(change==='account')storageKey='mealz:other:home';else selectedWeekStart='2026-10-12';document.querySelector('#app').innerHTML='<h1>New view</h1>'},change);
      release();await f.page.evaluate(async()=>await globalThis.pendingGenerationTest);
      assert.equal(f.requests.length,0);assert.equal(await f.page.evaluate(()=>s.meals[0].title),'Saved dinner');
      assert.ok(!(await f.page.locator('#app').innerText()).includes('Could not build this week'));
      assert.deepEqual(f.errors,[]);
    }finally{release();await f.close()}
  }
});

test('duplicate build clicks share one request and incomplete batches are not saved',async()=>{
  const f=await fixture();let release;
  const gate=new Promise(resolve=>{release=resolve});
  try{
    f.setGeneration(async()=>{await gate;return {json:{meals:[]}}});
    await f.boot();await prepareBuild(f);
    await f.page.evaluate(()=>{globalThis.pendingGenerationTest=buildSelectedWeek();buildSelectedWeek()});
    await f.page.locator('#cancelBuild').waitFor();release();await f.page.evaluate(async()=>await globalThis.pendingGenerationTest);
    assert.equal(f.generationRequests.length,1);assert.equal(f.requests.length,0);assert.equal(await f.page.evaluate(()=>s.meals[0].title),'Saved dinner');
    await f.page.getByRole('button',{name:'try again',exact:true}).waitFor();assert.deepEqual(f.errors,[]);
  }finally{release();await f.close()}
});

test('canceling ideas or swap generation keeps the destination view after a late error',async()=>{
  for(const mode of ['ideas','swap']){
    const f=await fixture();let release;
    const gate=new Promise(resolve=>{release=resolve});
    try{
      f.setGeneration(async()=>{await gate;return {status:504,json:{error:'Late generation timeout'}}});
      await f.boot();await prepareBuild(f);
      await f.page.evaluate(mode=>{globalThis.pendingGenerationTest=mode==='ideas'?refreshMealIdeas():swapMeal('dinner')},mode);
      await f.page.locator('.swap-loading').waitFor();await f.page.locator('.brand').click();
      release();await f.page.evaluate(async()=>await globalThis.pendingGenerationTest);
      assert.equal(f.requests.length,0);assert.equal(f.generationRequests.length,1);
      assert.equal(await f.page.locator('#app h1').innerText(),'your weeks');assert.deepEqual(f.errors,[]);
    }finally{release();await f.close()}
  }
});

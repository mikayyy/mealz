import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import expand from '../api/expand-meals.js';
import ideas from '../api/generate-ideas.js';
import swap from '../api/swap-meal.js';
import {callOpenAIWithRetry,retryAfterMs} from '../api/_lib/openai.js';
import {RequestBudget} from '../api/_lib/deadline.js';
import {generationHandler} from '../api/_lib/generation-handler.js';

const meal={id:'recipe',day:'Monday',title:'Rice dinner',emoji:'🍚',description:'Dinner',servings:4,total_minutes:20,difficulty:'Easy',tags:[],kid_note:null,ingredients:[{name:'rice',quantity:1,unit:'cup',category:'Pantry',optional:false}],steps:['Cook rice.']};
const body={days:['Monday'],householdSize:4,adults:2,children:2,equipment:[],dietTags:[],selectedIdeas:[{id:'dinner',title:'Rice dinner'}]};
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers});
const generated=data=>json({status:'completed',output_text:JSON.stringify(data)});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const telemetry={event(){},finish(){},fail(){}};

function setup(t){
  t.mock.timers.enable({apis:['Date','setTimeout'],now:Date.UTC(2026,9,5)});
  for(const [key,value] of Object.entries({OPENAI_API_KEY:'test-ai',SUPABASE_URL:'https://generation.invalid',SUPABASE_PUBLISHABLE_KEY:'public',SUPABASE_SECRET_KEY:'secret'})){
    const previous=process.env[key];process.env[key]=value;t.after(()=>{if(previous===undefined)delete process.env[key];else process.env[key]=previous});
  }
  const events=[];t.mock.method(console,'log',value=>events.push(JSON.parse(value)));
  const requests=[];
  /** @type {(url: URL,options: any) => Promise<any>} */
  let intercept=async()=>null;
  t.mock.method(globalThis,'fetch',async(input,options={})=>{
    const url=new URL(String(input));requests.push({url,options});
    const override=await intercept(url,options);if(override)return override;
    if(url.pathname==='/auth/v1/user')return json({id:'user'});
    if(url.pathname.endsWith('/household_members'))return json([{household_id:'home',role:'member'}]);
    if(url.pathname.endsWith('/mealz_take_rate_limit'))return json({allowed:true});
    if(url.pathname.endsWith('/meals'))return json([]);
    if(url.hostname==='api.openai.com')return generated({meal});
    assert.fail(`Unexpected request ${url}`);
  });
  const req=Object.assign(new EventEmitter(),{method:'POST',headers:{authorization:'Bearer token'},body:structuredClone(body)});
  const res=Object.assign(new EventEmitter(),{code:0,data:null,writableEnded:false,count:0,headers:{},setHeader(key,value){this.headers[key]=value},status(code){this.code=code;return this},json(data){this.data=data;this.count++;this.writableEnded=true}});
  return {req,res,requests,events,setIntercept(fn){intercept=fn},ai(){return requests.filter(x=>x.url.hostname==='api.openai.com')}};
}

test('generation routes share a deadline and never write partial saved weeks',async t=>{
  await t.test('seven recipes return together and use only user-scoped membership access',async t=>{
    const f=setup(t);f.req.body.days=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];f.req.body.selectedIdeas=f.req.body.days.map(day=>({id:`dinner-${day}`,title:`Dinner ${day}`}));
    await expand(f.req,f.res);
    assert.equal(f.res.code,200);assert.equal(f.res.data.meals.length,7);assert.deepEqual(f.res.data.meals.map(x=>x.day),f.req.body.days);
    assert.equal(new Set(f.res.data.meals.map(x=>x.id)).size,7);assert.equal(f.ai().length,7);
    const membership=f.requests.find(x=>x.url.pathname.endsWith('/household_members'));
    assert.equal(membership.options.headers.Authorization,'Bearer token');assert.equal(membership.options.headers.apikey,'public');
    assert.ok(f.requests.every(x=>!x.url.pathname.endsWith('/weekly_plans')));
    assert.ok(f.events.every(x=>x.request_id===f.res.headers['X-Request-Id']));
  });
  await t.test('one transient failure retries only that recipe and respects Retry-After',async t=>{
    const f=setup(t);f.req.body.days=['Monday','Tuesday'];f.req.body.selectedIdeas=[{id:'first',title:'First'},{id:'second',title:'Second'}];
    let failed=false;
    f.setIntercept(async(url,options)=>{
      if(url.hostname!=='api.openai.com')return null;
      if(JSON.parse(options.body).input.includes('Selected meal: First')&&!failed){failed=true;return json({error:{type:'server_error'}},503,{'Retry-After':'2'})}
      return generated({meal});
    });
    const pending=expand(f.req,f.res);await flush();assert.equal(f.ai().length,2);
    t.mock.timers.tick(1999);await flush();assert.equal(f.ai().length,2);
    t.mock.timers.tick(1);await pending;
    assert.equal(f.ai().length,3);assert.equal(f.res.code,200);assert.equal(f.res.data.meals.length,2);
  });
  await t.test('slow first pass cannot start another 45-second pass',async t=>{
    const f=setup(t);f.setIntercept(async url=>url.hostname==='api.openai.com'?new Promise(()=>{}):null);
    const pending=expand(f.req,f.res);await flush();assert.equal(f.ai().length,1);
    t.mock.timers.tick(35000);await flush();assert.equal(f.ai()[0].options.signal.aborted,true);
    t.mock.timers.tick(500);await flush();assert.equal(f.ai().length,2);
    t.mock.timers.tick(13500);await pending;
    assert.equal(f.res.code,502);assert.equal(f.res.data.code,'GENERATION_FAILED');assert.equal(f.res.count,1);
    assert.ok(f.ai().every(x=>x.options.signal.aborted));assert.ok(!f.res.data.meals);
    t.mock.timers.tick(100000);await flush();assert.equal(f.ai().length,2);assert.equal(f.res.count,1);
  });
  await t.test('slow prerequisites consume the shared budget and prevent a late retry',async t=>{
    const f=setup(t);
    f.setIntercept(async url=>{
      if(url.pathname==='/auth/v1/user')await new Promise(resolve=>setTimeout(resolve,7000));
      if(url.pathname.endsWith('/household_members'))await new Promise(resolve=>setTimeout(resolve,11000));
      if(url.pathname.endsWith('/mealz_take_rate_limit'))await new Promise(resolve=>setTimeout(resolve,11000));
      if(url.hostname==='api.openai.com')return new Promise(()=>{});
      return null;
    });
    const pending=expand(f.req,f.res);await flush();
    for(const ms of [7000,11000,11000]){t.mock.timers.tick(ms);await flush()}
    assert.equal(f.ai().length,1);t.mock.timers.tick(20000);await pending;
    assert.equal(f.res.code,502);assert.equal(f.ai().length,1);assert.ok(f.events.some(x=>x.event==='generation_retry_skipped'));
  });
  await t.test('deadline bounds even a transport that ignores abort and sends only one response',async t=>{
    const f=setup(t);let resolve;
    const work=generationHandler('test-deadline',async(req,budget)=>{
      await budget.stage('ignored_transport',telemetry,()=>new Promise(r=>{resolve=r}));return {unexpected:'late'};
    });
    const pending=work(f.req,f.res);await flush();t.mock.timers.tick(50000);await pending;
    assert.equal(f.res.code,504);assert.equal(f.res.data.code,'GENERATION_TIMEOUT');assert.equal(f.res.count,1);
    resolve();await flush();assert.equal(f.res.count,1);
  });
  await t.test('disconnect aborts all in-flight recipes without responding or retrying',async t=>{
    const f=setup(t);f.setIntercept(async url=>url.hostname==='api.openai.com'?new Promise(()=>{}):null);
    const pending=expand(f.req,f.res);await flush();f.req.emit('aborted');await pending;
    assert.equal(f.res.count,0);assert.ok(f.ai()[0].options.signal.aborted);
    t.mock.timers.tick(100000);await flush();assert.equal(f.ai().length,1);
  });
  for(const denied of ['session','membership','limiter'])await t.test(`${denied} denial preserves its status without any AI request`,async t=>{
    const f=setup(t);f.setIntercept(async url=>{
      if(denied==='session'&&url.pathname==='/auth/v1/user')return json({},401);
      if(denied==='membership'&&url.pathname.endsWith('/household_members'))return json([]);
      if(denied==='limiter'&&url.pathname.endsWith('/mealz_take_rate_limit'))return json({allowed:false,retry_after:900});
      return null;
    });
    await expand(f.req,f.res);assert.equal(f.res.code,denied==='session'?401:denied==='membership'?403:429);assert.equal(f.ai().length,0);
    if(denied==='limiter')assert.equal(f.res.headers['Retry-After'],'900');
  });
  await t.test('response-body parsing is also cancellable and bounded',async t=>{
    const f=setup(t);f.setIntercept(async url=>url.hostname==='api.openai.com'?{ok:true,status:200,headers:new Headers(),json:()=>new Promise(()=>{})}:null);
    const pending=expand(f.req,f.res);await flush();t.mock.timers.tick(35000);await flush();t.mock.timers.tick(500);await flush();t.mock.timers.tick(13500);await pending;
    assert.equal(f.res.code,502);assert.equal(f.ai().length,2);assert.ok(f.ai().every(x=>x.options.signal.aborted));
  });
  for(const [label,response] of [
    ['invalid provider request',json({error:{message:'secret household note'}},400)],
    ['quota limit',json({error:{code:'insufficient_quota',type:'insufficient_quota'}},429)],
    ['output token limit',json({status:'incomplete',incomplete_details:{reason:'max_output_tokens'}})],
    ['invalid structured JSON',json({status:'completed',output_text:'broken'})],
    ['malformed provider output envelope',json({status:'completed',output:'invalid'})],
    ['empty recipe',generated({meal:{...meal,steps:[]}})]
  ])await t.test(`${label} is not retried or returned as a partial batch`,async t=>{
    const f=setup(t);f.setIntercept(async url=>url.hostname==='api.openai.com'?response:null);
    await expand(f.req,f.res);assert.equal(f.res.code,502);assert.equal(f.ai().length,1);assert.ok(!f.res.data.meals);
    assert.ok(!JSON.stringify(f.events).includes('secret household note'));assert.ok(!JSON.stringify(f.res.data).includes('secret household note'));
  });
  await t.test('upstream retry delay that cannot fit is skipped',async t=>{
    const f=setup(t);f.setIntercept(async url=>url.hostname==='api.openai.com'?json({error:{type:'rate_limit_error'}},429,{'Retry-After':'60'}):null);
    await expand(f.req,f.res);assert.equal(f.ai().length,1);assert.equal(f.res.code,502);
  });
  for(const route of [ideas,swap])await t.test(`other generation route ${route===ideas?'ideas':'swap'} also uses the shared timeout`,async t=>{
    const f=setup(t);f.req.body.meal=meal;f.setIntercept(async url=>url.hostname==='api.openai.com'?new Promise(()=>{}):null);
    const pending=route(f.req,f.res);await flush();t.mock.timers.tick(35000);await flush();t.mock.timers.tick(500);await flush();t.mock.timers.tick(13500);await pending;
    assert.equal(f.res.code,502);assert.equal(f.ai().length,2);
  });
  await t.test('invalid bounded inputs are rejected before database limiter and AI work',async t=>{
    for(const [i,change] of [{notes:'x'.repeat(4001)},{householdSize:0},{days:['Monday','Monday']},{selectedIdeas:[{title:'x'.repeat(201)}]},{equipment:Array(31).fill('Oven')}].entries())await t.test(`invalid payload ${i+1}`,async t=>{
      const f=setup(t);Object.assign(f.req.body,change);await expand(f.req,f.res);assert.equal(f.res.code,400);assert.equal(f.ai().length,0);assert.equal(f.requests.length,1);
    });
  });
});

test('retry dates, network failures and cancellation use the bounded policy',async t=>{
  assert.equal(retryAfterMs('2'),2000);assert.equal(retryAfterMs('bad'),0);assert.equal(retryAfterMs(new Date(Date.now()+5000).toUTCString())>3000,true);
  await t.test('network failure can retry once',async t=>{
    const f=setup(t);let calls=0;
    f.setIntercept(async()=>{if(++calls===1)throw new TypeError('fetch failed');return generated({ok:true})});
    const budget=new RequestBudget();t.after(()=>budget.dispose());
    const pending=callOpenAIWithRetry({prompt:'test',telemetry},budget);await flush();t.mock.timers.tick(500);
    assert.deepEqual(await pending,{ok:true});assert.equal(calls,2);
  });
  await t.test('canceling a scheduled retry prevents the second request',async t=>{
    const f=setup(t);f.setIntercept(async()=>json({error:{}},503));
    const budget=new RequestBudget();t.after(()=>budget.dispose());
    const pending=callOpenAIWithRetry({prompt:'test',telemetry},budget);const rejected=assert.rejects(pending,/generation-cancelled/);
    await flush();budget.cancel();await rejected;t.mock.timers.tick(10000);await flush();assert.equal(f.ai().length,1);
  });
});

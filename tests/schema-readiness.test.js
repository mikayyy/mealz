import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MIGRATIONS,REQUIRED_COLUMNS} from '../migrations/manifest.js';
import {makeDb,adaptForPGlite} from '../migrations/pglite-fixture.js';
import {householdSchemaReady} from '../api/_lib/supabase.js';
import prepareNextWeek from '../api/prep-next-week.js';

let clockBase=100000;
function configure(t){
  for(const [key,value] of Object.entries({SUPABASE_URL:'https://schema-readiness.invalid',SUPABASE_SECRET_KEY:'test-secret',OPENAI_API_KEY:'test-ai',CRON_SECRET:'test-cron'})){
    const previous=process.env[key];process.env[key]=value;
    t.after(()=>{if(previous===undefined)delete process.env[key];else process.env[key]=previous});
  }
  // Start each case beyond the previous cache TTL without sleeping.
  clockBase+=60000;
  let now=clockBase;
  t.mock.method(Date,'now',()=>now);
  return {advance(ms){now+=ms}};
}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});

test('runtime schema readiness follows the real migrated schema',async t=>{
  const db=await makeDb();
  const columns=new Map();
  try{
    for(const filename of MIGRATIONS)await db.exec(adaptForPGlite(readFileSync(new URL('../migrations/'+filename,import.meta.url),'utf8')));
    const {rows}=await db.query("select table_name,column_name from information_schema.columns where table_schema='public'");
    for(const row of rows){if(!columns.has(row.table_name))columns.set(row.table_name,new Set());columns.get(row.table_name).add(row.column_name)}
  }finally{await db.close()}
  assert.equal(columns.get('household_members').has('id'),false);
  assert.equal(columns.get('mealz_rate_limits').has('id'),false);

  // Emulate PostgREST's validation using actual PGlite schema metadata.
  function probeResponse(input){
    const url=new URL(String(input)),table=url.pathname.split('/').at(-1),selected=url.searchParams.get('select');
    if(!columns.has(table))return json({message:'Missing table'},404);
    if(selected!=='*'&&!columns.get(table).has(selected))return json({message:'Missing column'},400);
    assert.equal(url.searchParams.get('limit'),'0','schema probes must not return household data');
    return json([]);
  }

  await t.test('valid tables with non-id keys pass and cache expires after 30 seconds',async t=>{
    const clock=configure(t),calls=[];
    t.mock.method(globalThis,'fetch',async(input,options)=>{
      assert.equal(options.method||'GET','GET');
      assert.equal(options.headers.apikey,'test-secret');
      calls.push(String(input));return probeResponse(input);
    });
    assert.equal(await householdSchemaReady(),true);
    const firstCount=calls.length;
    assert.ok(firstCount>Object.values(REQUIRED_COLUMNS).flat().length);
    assert.equal(await householdSchemaReady(),true);
    assert.equal(calls.length,firstCount);
    clock.advance(30000);
    assert.equal(await householdSchemaReady(),true);
    assert.equal(calls.length,firstCount*2);
  });

  await t.test('missing columns fail closed and cached failure is retried after expiry',async t=>{
    const clock=configure(t);let broken=true,calls=0;
    t.mock.method(globalThis,'fetch',async input=>{
      calls++;
      const url=new URL(String(input));
      if(broken&&url.pathname.endsWith('/grocery_items')&&url.searchParams.get('select')==='needed_this_week')return json({message:'Missing purchase-intent column'},400);
      return probeResponse(input);
    });
    assert.equal(await householdSchemaReady(),false);
    const failedCount=calls;broken=false;
    assert.equal(await householdSchemaReady(),false);
    assert.equal(calls,failedCount);
    clock.advance(30000);
    assert.equal(await householdSchemaReady(),true);
    assert.ok(calls>failedCount);
  });

  for(const failure of ['missing-table','credentials','network']){
    await t.test(`${failure} fails closed without throwing`,async t=>{
      configure(t);
      t.mock.method(globalThis,'fetch',async()=>{
        if(failure==='network')throw new Error('Connection failed');
        return json({message:failure},failure==='credentials'?401:404);
      });
      assert.equal(await householdSchemaReady(),false);
    });
  }

  await t.test('scheduled preparation reaches a household after valid schema checks',async t=>{
    configure(t);let generations=0;
    t.mock.method(globalThis,'fetch',async(input,options={})=>{
      const url=new URL(String(input));
      if(url.hostname==='api.openai.com'){
        generations++;
        return json({status:'completed',output_text:JSON.stringify({ideas:Array.from({length:6},(_,i)=>({id:`idea-${i}`,title:`Dinner ${i}`,description:'A dinner idea',protein:'beans',total_minutes:20,tags:[]}))})});
      }
      if(url.searchParams.get('limit')==='0')return probeResponse(input);
      const table=url.pathname.split('/').at(-1),method=options.method||'GET';
      assert.equal(options.headers.apikey,'test-secret');
      if(table==='profiles')return json([{id:'profile-a',household_id:'home-a',owner_user_id:'user-a',adults:2,children:0,household_size:2,diet_tags:[],equipment:[]}]);
      if(table==='weekly_plans'&&method==='GET')return json([]);
      if(table==='weekly_plans'&&method==='DELETE')return json([]);
      if(table==='weekly_plans'&&method==='POST'){
        const row=JSON.parse(options.body)[0];assert.equal(row.household_id,'home-a');return json([{id:'prepared-plan'}]);
      }
      if(table==='meals'&&method==='POST'){
        const rows=JSON.parse(options.body);assert.equal(rows.length,6);assert.ok(rows.every(row=>row.weekly_plan_id==='prepared-plan'));return json([]);
      }
      assert.fail(`Unexpected preparation request: ${method} ${url.pathname}${url.search}`);
    });
    const response={code:null,data:null,status(code){this.code=code;return this},json(data){this.data=data}};
    await prepareNextWeek({method:'GET',headers:{authorization:'Bearer test-cron'}},response);
    assert.equal(response.code,200);
    assert.equal(response.data.prepared,1);
    assert.equal(generations,1);
  });
});

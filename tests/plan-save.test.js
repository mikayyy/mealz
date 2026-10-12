import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/plan.js';

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const body=()=>({weekStart:'2026-10-05',householdSize:4,days:['Monday'],equipment:[],expectedRevision:7,requestKey:id(9),meals:[{id:'dinner',day:'Monday',title:'Rice bowl',ingredients:[{name:'rice',quantity:1,unit:'cup',category:'Pantry'}],steps:['Cook rice.']}]});
function fixture(t,{rpcStatus=200,rpcCode='',revision=7}={}){
  for(const [key,value] of Object.entries({SUPABASE_URL:'https://plan-api.invalid',SUPABASE_PUBLISHABLE_KEY:'test-public',SUPABASE_SECRET_KEY:'test-secret'})){
    const previous=process.env[key];process.env[key]=value;t.after(()=>{if(previous===undefined)delete process.env[key];else process.env[key]=previous});
  }
  const calls=[];
  t.mock.method(globalThis,'fetch',async(input,options={})=>{
    const url=new URL(String(input));let data=/** @type {unknown} */([]);
    if(url.pathname==='/auth/v1/user')data={id:id(1)};
    else{
      assert.equal(options.headers.apikey,'test-public');assert.equal(options.headers.Authorization,'Bearer user-token');
      calls.push({table:url.pathname.split('/').at(-1),method:options.method||'GET',body:options.body?JSON.parse(options.body):null});
      if(url.pathname.endsWith('/household_members'))data=[{household_id:id(2),role:'member'}];
      else if(url.pathname.endsWith('/weekly_plans'))data=[{id:id(3),revision}];
      else if(url.pathname.endsWith('/grocery_items'))data=[{id:id(4),name:'rice',quantity:1,unit:'cup',category:'Pantry',source:'generated',source_key:'rice::volume',checked:true,needed_this_week:true}];
      else if(url.pathname.includes('/rpc/')){
        if(rpcStatus!==200)return new Response(JSON.stringify({code:rpcCode,message:'Injected RPC rejection'}),{status:rpcStatus});
        data={planId:id(3),revision:8,groceryItems:[],replayed:false,item:{id:id(4)},plan:{id:id(3)}};
      }else assert.fail(`Unexpected database request: ${url.pathname}`);
    }
    return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
  });
  const res={code:null,data:null,setHeader(){},status(code){this.code=code;return this},json(data){this.data=data}};
  return {calls,res,run:(value=/** @type {Record<string,unknown>} */(body()),method='POST')=>handler({method,headers:{authorization:'Bearer user-token'},body:value,query:{week_start:'2026-10-05'}},res)};
}

test('save uses one user-scoped atomic RPC and preserves reconciled intent and IDs',async t=>{
  const f=fixture(t);await f.run();assert.equal(f.res.code,200);
  const writes=f.calls.filter(call=>call.method!=='GET');assert.equal(writes.length,1);
  assert.equal(writes[0].table,'mealz_save_week');assert.equal(writes[0].body.p_household,id(2));
  const row=writes[0].body.p_payload.groceries[0];assert.equal(row.id,id(4));assert.equal(row.checked,true);assert.equal(row.needed_this_week,true);
  assert.equal(writes[0].body.p_payload.snapshot_revision,7);
});
test('a stale snapshot is sent for the database to reject or replay',async t=>{
  const f=fixture(t,{revision:8,rpcStatus:409,rpcCode:'PT409'});await f.run();
  assert.equal(f.res.code,409);assert.equal(f.res.data.code,'WEEK_CONFLICT');
  const rpc=f.calls.find(call=>call.table==='mealz_save_week');assert.equal(rpc.body.p_expected_revision,7);assert.equal(rpc.body.p_payload.snapshot_revision,8);
});
test('a missing migration fails closed without fallback REST writes',async t=>{
  const f=fixture(t,{rpcStatus:404,rpcCode:'PGRST202'});await f.run();assert.equal(f.res.code,503);assert.equal(f.res.data.code,'SAVE_UNAVAILABLE');
  assert.ok(f.calls.every(call=>call.method==='GET'||call.table==='mealz_save_week'));
});
test('RPC failure never causes compensating deletion of any plan',async t=>{
  const f=fixture(t,{rpcStatus:500});await f.run();assert.equal(f.res.code,500);assert.ok(f.calls.every(call=>call.method!=='DELETE'));
});
test('invalid saves are rejected before any plan mutation',async t=>{
  for(const [name,change] of /** @type {Array<[string,Record<string,unknown>]>} */([['non-Monday',{weekStart:'2026-10-06'}],['invalid date',{weekStart:'2026-02-30'}],['missing revision',{expectedRevision:undefined}],['invalid key',{requestKey:'bad'}],['unbounded notes',{notes:'x'.repeat(4001)}],['duplicate days',{days:['Monday','Monday']}],['negative ingredient',{meals:[{...body().meals[0],ingredients:[{name:'rice',quantity:-1}]}]}]])){
    await t.test(name,async t=>{const f=fixture(t);await f.run({...body(),...change});assert.equal(f.res.code,400);assert.ok(f.calls.every(call=>call.method==='GET'))});
  }
});
test('plan hydration obtains one consistent graph/revision snapshot',async t=>{
  const f=fixture(t);await f.run({},'GET');assert.equal(f.res.code,200);
  assert.equal(f.calls.filter(call=>call.table==='mealz_week_result').length,1);
  assert.equal(f.res.data.revision,8);
});

test('save rejects ambiguous normalized meal keys before database writes',async t=>{
  for(const [firstId,secondId] of [['dinner','dinner'],['dinner',' dinner '],['meal-2',null]]){
    await t.test(`${firstId} / ${secondId}`,async t=>{
      const f=fixture(t),input=body();input.days=['Monday','Tuesday'];
      input.meals=[{...input.meals[0],id:firstId},{...input.meals[0],id:secondId,day:'Tuesday'}];
      await f.run(input);
      assert.equal(f.res.code,400);assert.equal(f.res.data.code,'INVALID_PLAN');
      assert.match(f.res.data.error,/unique identifier/);
      assert.ok(f.calls.every(call=>call.method==='GET'));
    });
  }
});

test('grocery actions use revision-checked RPCs with both plan and item identity',async t=>{
  for(const [method,payload,action] of /** @type {Array<[string,Record<string,unknown>,string]>} */([
    ['PATCH',{action:'toggle',checked:true},'toggle'],['PATCH',{action:'set_needed',needed:false},'set_needed'],
    ['PATCH',{name:'rice for dinner',quantity:2,unit:'cups',category:'Pantry'},'edit'],
    ['PUT',{name:'cumin',quantity:null,category:'Pantry'},'add'],['DELETE',{},'delete']
  ]))await t.test(action,async t=>{
    const f=fixture(t);await f.run({planId:id(3),itemId:id(4),expectedRevision:7,...payload},method);
    assert.equal(f.res.code,method==='PUT'?201:200);
    const rpc=f.calls.find(call=>call.table==='mealz_mutate_grocery');
    assert.equal(rpc.body.p_plan,id(3));assert.equal(rpc.body.p_item,action==='add'?null:id(4));assert.equal(rpc.body.p_expected_revision,7);assert.equal(rpc.body.p_action,action);
    if(action==='add')assert.equal(rpc.body.p_fields.needed_this_week,true);
    if(action==='set_needed')assert.equal(rpc.body.p_fields.needed_this_week,false);
  });
});
test('grocery revisions and booleans are validated before writing',async t=>{
  for(const change of [{expectedRevision:undefined},{checked:'true'},{planId:'bad'},{action:'unknown'}])await t.test(JSON.stringify(change),async t=>{
    const f=fixture(t);await f.run({planId:id(3),itemId:id(4),expectedRevision:7,action:'toggle',checked:true,...change},'PATCH');
    assert.equal(f.res.code,400);assert.ok(f.calls.every(call=>call.method==='GET'));
  });
});

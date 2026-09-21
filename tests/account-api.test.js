import test from 'node:test';
import assert from 'node:assert/strict';
import {requireUser} from '../api/_lib/auth.js';
import {dataDb} from '../api/_lib/supabase.js';
import {enforceRateLimit} from '../api/_lib/rate-limit.js';
import household,{normalizeCode} from '../api/household.js';
import {preferenceContext} from '../api/generate-ideas.js';
import {validCookingDays} from '../api/_lib/validation.js';

function env(t){
  for(const [key,value] of Object.entries({SUPABASE_URL:'https://database.test',SUPABASE_PUBLISHABLE_KEY:'public-key',SUPABASE_SECRET_KEY:'server-key'})){
    const old=process.env[key];process.env[key]=value;
    t.after(()=>{if(old===undefined)delete process.env[key];else process.env[key]=old});
  }
}
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
test('authentication never permits legacy access when configuration or credentials are missing',async t=>{
  env(t);
  await assert.rejects(requireUser({headers:{}}),{status:401});
  delete process.env.SUPABASE_URL;
  await assert.rejects(requireUser({headers:{authorization:'Bearer anything'}}),{status:503});
});
test('household scope uses the user token; database failure never falls back to service credentials',async t=>{
  env(t);const calls=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    calls.push(url);assert.equal(options.headers.apikey,'public-key');assert.equal(options.headers.Authorization,'Bearer user-a');
    if(String(url).includes('household_members'))return json([{household_id:'home-a',role:'member'}]);
    return json([{title:'A meal',tags:['Make again']}]);
  });
  const scope=await dataDb({id:'a',token:'user-a'});
  assert.equal(scope.householdId,'home-a');
  assert.deepEqual(await preferenceContext(scope.db),{recent:['A meal'],favorites:['A meal']});
  assert.equal(calls.length,2);
  t.mock.method(globalThis,'fetch',async()=>{throw new Error('database unavailable')});
  await assert.rejects(dataDb({id:'a',token:'user-a'}),/database unavailable/);
});
test('an authenticated account without a household cannot access meal endpoints',async t=>{
  env(t);t.mock.method(globalThis,'fetch',async()=>json([]));
  await assert.rejects(dataDb({id:'a',token:'user-a'}),{status:403});
  await assert.rejects(dataDb(null),{status:401});
});
test('household creation uses verified identity and never sends the raw invitation code to storage',async t=>{
  env(t);let mutation;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(String(url).endsWith('/auth/v1/user'))return json({id:'verified-user'});
    if(String(url).endsWith('/rpc/mealz_take_rate_limit'))return json({allowed:true});
    assert.ok(String(url).endsWith('/rpc/mealz_manage_household'));
    mutation=JSON.parse(options.body);
    return json({household:{id:'h',name:'Family'},role:'owner'});
  });
  const res={setHeader(){},status(code){this.code=code;return this},json(data){this.data=data}};
  await household({method:'POST',headers:{authorization:'Bearer valid'},body:{action:'create',name:'Family',userId:'forged-user'}},res);
  assert.equal(res.code,201);assert.equal(mutation.p_user_id,'verified-user');
  assert.match(mutation.p_hash,/^[a-f0-9]{64}$/);assert.match(res.data.joinCode,/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.ok(!JSON.stringify(mutation).includes(res.data.joinCode));
});
test('rate limiter fails closed and returns a retry interval when exhausted',async t=>{
  env(t);t.mock.method(globalThis,'fetch',async()=>json({allowed:false,retry_after:45}));
  await assert.rejects(enforceRateLimit('household:a',10),error=>/** @type {any} */(error).status===429&&/** @type {any} */(error).retryAfter===45);
  t.mock.method(globalThis,'fetch',async()=>{throw new Error('missing RPC')});
  await assert.rejects(enforceRateLimit('household:a',10),{status:503});
});
test('code normalization and recipe fan-out are bounded',()=>{
  assert.equal(normalizeCode(' abcd-2345 '),'ABCD2345');
  assert.equal(validCookingDays(['Monday','Friday']),true);
  assert.equal(validCookingDays(['Monday','Monday']),false);
  assert.equal(validCookingDays(Array(1000).fill('Monday')),false);
  assert.equal(validCookingDays(['not-a-day']),false);
});

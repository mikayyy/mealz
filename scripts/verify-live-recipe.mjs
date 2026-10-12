import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';

// One authorized recipe test. Never start a production database or change a plan.
const repo=fileURLToPath(new URL('../',import.meta.url));
const directory=join(repo,'.local');
const keyFile=join(directory,'openai-config-read.json');
const marker=join(directory,'real-ai-test-consumed.json');
const {configureLocalEnvironment}=await import(pathToFileURL(join(repo,'scripts/local-supabase-lib.mjs')));
const local=configureLocalEnvironment();
const owner=JSON.parse(readFileSync(join(directory,'test-accounts.json'),'utf8')).find(account=>account.label==='owner');
const originalFetch=globalThis.fetch,originalLog=console.log;
const events=[],runId=randomUUID();let attempts=0;
const response=()=>({headers:{},code:0,data:null,setHeader(name,value){this.headers[name]=value},status(code){this.code=code;return this},json(data){this.data=data;return this}});
try {
  // This is a real local password session, not a fabricated production identity.
  const login=await originalFetch(local.url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:local.publicKey,'Content-Type':'application/json'},body:JSON.stringify({email:owner.email,password:owner.password}),signal:AbortSignal.timeout(8000)});
  assert.equal(login.status,200,'Local test account cannot sign in');
  const session=await login.json();
  if(!process.argv.includes('--run')) {
    originalLog(JSON.stringify({ready:true,localAuthentication:true,model:'gpt-5.6-luna',maxProviderAttempts:2,maxOutputTokensPerAttempt:3500,generationDeadlineMs:50000,aiRequestsMade:0,credentialAvailable:existsSync(keyFile)}));
  } else {
    if(existsSync(marker))throw new Error('The paid test has already been attempted; review its evidence before authorizing another.');
    const configuration=JSON.parse(readFileSync(keyFile,'utf8'));
    if(typeof configuration.value!=='string'||!configuration.value.startsWith('sk-'))throw new Error('A readable authorized OpenAI key is required.');
    process.env.OPENAI_API_KEY=configuration.value;
    process.env.OPENAI_MODEL='gpt-5.6-luna';
    globalThis.fetch=async(input,options={})=>{
      const url=new URL(String(input));
      if(url.origin===local.url)return originalFetch(input,options);
      assert.equal(url.href,'https://api.openai.com/v1/responses','Only local Supabase and the Responses API are allowed');
      const payload=JSON.parse(String(options.body));
      assert.equal(payload.model,'gpt-5.6-luna');assert.ok(payload.max_output_tokens<=3500);assert.equal(payload.store,false);
      if(attempts>=2)throw new Error('Provider attempt limit exceeded');
      if(attempts===0)writeFileSync(marker,JSON.stringify({runId,startedAt:new Date().toISOString(),maxAttempts:2}),{flag:'wx'});
      attempts++;
      return originalFetch(input,options);
    };
    console.log=value=>{try{const event=JSON.parse(value);events.push(event)}catch{}};
    const {default:plan}=await import(pathToFileURL(join(repo,'api/plan.ts')));
    const {default:expand}=await import(pathToFileURL(join(repo,'api/expand-meals.ts')));
    const readPlan=async()=>{const res=response();await plan({method:'GET',headers:{authorization:`Bearer ${session.access_token}`},query:{week_start:'2026-10-12'}},res);assert.equal(res.code,200);return res.data};
    const before=await readPlan(),res=response(),started=performance.now();
    await expand({method:'POST',headers:{authorization:`Bearer ${session.access_token}`},body:{days:['Monday'],householdSize:4,adults:2,children:2,dietTags:[],equipment:['Stovetop'],notes:'A practical family dinner in about 30 minutes.',useUp:'',selectedIdeas:[{id:'live-test-chicken',title:'Chicken and vegetable rice bowls',description:'Chicken, rice, broccoli, and carrots with a simple lemon sauce.'}]}},res);
    const elapsedMs=Math.round(performance.now()-started);
    const after=await readPlan();assert.deepEqual(after,before,'Generation changed the saved test week');
    const result={status:res.code,elapsedMs,requestId:res.headers['X-Request-Id'],providerAttempts:attempts,model:'gpt-5.6-luna',savedWeekUnchanged:true,events,response:res.data};
    writeFileSync(join(directory,'real-ai-test-result.json'),JSON.stringify(result,null,2));
    assert.equal(res.code,200,'Real generation failed; inspect the local result before any more paid requests');
    assert.equal(res.data.meals.length,1);const meal=res.data.meals[0];assert.equal(meal.servings,4);assert.equal(meal.day,'Monday');assert.ok(meal.ingredients.length&&meal.steps.length);
    assert.ok(meal.ingredients.every(item=>!/\b(beef|pork|bacon|ham|mushrooms?)\b/i.test(item.name)),'Recipe conflicts with the requested ingredient restrictions');
    originalLog(JSON.stringify({result:'passed',elapsedMs,providerAttempts:attempts,requestId:result.requestId,servings:meal.servings,ingredientCount:meal.ingredients.length,stepCount:meal.steps.length,savedWeekUnchanged:true}));
  }
} finally {
  globalThis.fetch=originalFetch;console.log=originalLog;delete process.env.OPENAI_API_KEY;
  // Credential cleanup applies on success and failure. Evidence contains no key.
  if(existsSync(keyFile))unlinkSync(keyFile);
}
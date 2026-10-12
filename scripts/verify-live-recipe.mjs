import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';

// Bounded, single-use recipe or seven-day test against the local database.
const repo=fileURLToPath(new URL('../',import.meta.url));
const directory=join(repo,'.local');
const keyFile=join(directory,'openai-config-read.json');
const weekMode=process.argv.includes('--week');
const days=weekMode?['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']:['Monday'];
const ideas=[
  {id:'live-test-chicken',title:'Chicken and vegetable rice bowls',description:'Chicken, rice, broccoli, and carrots with a simple lemon sauce.'},
  {id:'live-test-turkey',title:'Turkey and bean skillet',description:'Ground turkey, kidney beans, tomatoes, and spinach cooked in a skillet.'},
  {id:'live-test-fish',title:'Lemon fish with couscous',description:'White fish cooked on the stovetop with couscous and peas.'},
  {id:'live-test-tofu',title:'Tofu noodle stir fry',description:'Tofu, noodles, cabbage, and carrots with a mild ginger sauce.'},
  {id:'live-test-lentils',title:'Red lentil curry',description:'Red lentils, coconut milk, tomatoes, and spinach served with rice.'},
  {id:'live-test-eggs',title:'Egg and vegetable fried rice',description:'Eggs, rice, peas, and carrots cooked in a skillet.'},
  {id:'live-test-beans',title:'Chickpea and tomato pasta',description:'Pasta with chickpeas, tomatoes, and zucchini.'}
].slice(0,days.length);
const maxAttempts=days.length*2;
const artifactPrefix=weekMode?'real-ai-week-test':'real-ai-test';
const marker=join(directory,artifactPrefix+'-consumed.json');
const attemptsByDay=new Map();
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
    originalLog(JSON.stringify({ready:true,localAuthentication:true,model:'gpt-5.6-luna',recipeCount:days.length,maxProviderAttempts:maxAttempts,maxAttemptsPerRecipe:2,maxOutputTokensPerAttempt:3500,generationDeadlineMs:50000,aiRequestsMade:0,credentialAvailable:existsSync(keyFile)}));
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
      const assignedDay=/Assigned day: ([A-Za-z]+)\./.exec(payload.input)?.[1];
      assert.ok(days.includes(assignedDay),'Only the authorized days are allowed');
      const dayAttempts=attemptsByDay.get(assignedDay)||0;
      if(dayAttempts>=2||attempts>=maxAttempts)throw new Error('Provider attempt limit exceeded');
      attemptsByDay.set(assignedDay,dayAttempts+1);
      if(attempts===0)writeFileSync(marker,JSON.stringify({runId,startedAt:new Date().toISOString(),maxAttempts,recipeCount:days.length}),{flag:'wx'});
      attempts++;
      return originalFetch(input,options);
    };
    console.log=value=>{try{const event=JSON.parse(value);events.push(event)}catch{}};
    const {default:plan}=await import(pathToFileURL(join(repo,'api/plan.ts')));
    const {default:expand}=await import(pathToFileURL(join(repo,'api/expand-meals.ts')));
    const readPlan=async()=>{const res=response();await plan({method:'GET',headers:{authorization:`Bearer ${session.access_token}`},query:{week_start:'2026-10-12'}},res);assert.equal(res.code,200);return res.data};
    const before=await readPlan(),res=response(),started=performance.now();
    await expand({method:'POST',headers:{authorization:`Bearer ${session.access_token}`},body:{days,householdSize:4,adults:2,children:2,dietTags:[],equipment:['Stovetop'],notes:'A practical family dinner in about 30 minutes.',useUp:'',selectedIdeas:ideas}},res);
    const elapsedMs=Math.round(performance.now()-started);
    const after=await readPlan();assert.deepEqual(after,before,'Generation changed the saved test week');
    const result={status:res.code,elapsedMs,requestId:res.headers['X-Request-Id'],providerAttempts:attempts,attemptsByDay:Object.fromEntries(attemptsByDay),recipeCount:days.length,model:'gpt-5.6-luna',savedWeekUnchanged:true,events,response:res.data};
    writeFileSync(join(directory,artifactPrefix+'-result.json'),JSON.stringify(result,null,2));
    assert.equal(res.code,200,'Real generation failed; inspect the local result before any more paid requests');
    assert.equal(res.data.meals.length,days.length);
    assert.deepEqual(res.data.meals.map(meal=>meal.day).sort(),[...days].sort());
    assert.equal(new Set(res.data.meals.map(meal=>meal.id)).size,days.length,'Recipe IDs must be unique');
    assert.ok(elapsedMs<50000,'Generation exceeded the shared deadline');
    for(const meal of res.data.meals){
      assert.equal(meal.servings,4);assert.ok(meal.ingredients.length&&meal.steps.length);
      assert.ok(meal.ingredients.every(item=>!/\b(beef|pork|bacon|ham|mushrooms?)\b/i.test(item.name)),'Recipe conflicts with the requested ingredient restrictions');
    }
    originalLog(JSON.stringify({result:'passed',elapsedMs,providerAttempts:attempts,attemptsByDay:result.attemptsByDay,requestId:result.requestId,recipeCount:days.length,servingsPerRecipe:4,savedWeekUnchanged:true}));
  }
} finally {
  globalThis.fetch=originalFetch;console.log=originalLog;delete process.env.OPENAI_API_KEY;
  // Credential cleanup applies on success and failure. Evidence contains no key.
  if(existsSync(keyFile))unlinkSync(keyFile);
}
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {localEnvironment} from './local-supabase-lib.mjs';
import {startLocalServer} from './local-server.mjs';

const local=localEnvironment(),checks=[];
const root='http://127.0.0.1:3000';
const server=await startLocalServer();
let browser;
const authRequest=async(path,body,key=local.publicKey)=>{
  const response=await fetch(local.url+'/auth/v1/'+path,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();assert.ok(response.ok,`Local Auth ${path} failed (${response.status})`);return data;
};
const api=async(path,token,body,method=body?'POST':'GET')=>{
  const response=await fetch(root+'/api/'+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json()};
};
try {
  const suffix=randomBytes(4).toString('hex'),accounts=[];
  const mailbox=`confirm-${suffix}`,signupEmail=`${mailbox}@mealz.local`,signupPassword=`Local-only!${randomBytes(18).toString('hex')}`;
  const signup=await authRequest('signup',{email:signupEmail,password:signupPassword});
  assert.ok(!signup.access_token,'new signup must require email confirmation');
  let confirmation;
  for(let attempt=0;attempt<30&&!confirmation;attempt++) {
    const mail=await fetch('http://127.0.0.1:54324/api/v1/messages');
    if(mail.ok){
      const inbox=await mail.json();
      const header=inbox.messages?.find(message=>message.To?.some(recipient=>recipient.Address===signupEmail));
      if(header){
        const response=await fetch(`http://127.0.0.1:54324/api/v1/message/${header.ID}`);
        const message=await response.json(),text=message.HTML||message.Text||'';
        confirmation=text.match(/https?:\/\/[^\s"<>]+\/auth\/v1\/verify\?[^\s"<>]+/)?.[0]?.replaceAll('&amp;','&');
      }
    }
    if(!confirmation)await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(confirmation,'confirmation email did not reach the local inbox');
  assert.equal(new URL(confirmation).origin,local.url,'confirmation may only contact local Auth');
  const verified=await fetch(confirmation,{redirect:'manual'});assert.ok([302,303].includes(verified.status));
  const confirmedSession=await authRequest('token?grant_type=password',{email:signupEmail,password:signupPassword});assert.ok(confirmedSession.access_token);
  checks.push('real signup delivers a local confirmation email and allows sign-in after confirmation');
  for(const label of ['owner','member','other']) {
    const email=`${label}-${suffix}@mealz.local`,password=`Local-only!${randomBytes(18).toString('hex')}`;
    const user=await authRequest('admin/users',{email,password,email_confirm:true},local.secretKey);
    const session=await authRequest('token?grant_type=password',{email,password});
    assert.equal(session.user.id,user.id);accounts.push({label,email,password,id:user.id,token:session.access_token});
  }
  const [owner,member,other]=accounts;
  writeFileSync(new URL('../.local/test-accounts.json',import.meta.url),JSON.stringify(accounts.map(({token,...account})=>account),null,2));
  writeFileSync(new URL('../.local/owner-login.txt',import.meta.url),`Mealz local test account\nApp: ${root}\nEmail: ${owner.email}\nPassword: ${owner.password}\n\nThese credentials work only in your local test database. Choose "not now" if quick login is offered.\n`);
  checks.push('three synthetic accounts sign in through real Supabase Auth');
  const home=await api('household',owner.token,{action:'create',name:'Local acceptance family'});
  assert.equal(home.status,201);assert.ok(home.data.joinCode);
  const joined=await api('household',member.token,{action:'join',code:home.data.joinCode});assert.equal(joined.status,200);
  assert.equal((await api('household',other.token,{action:'create',name:'Isolated test family'})).status,201);
  checks.push('real household creation, invitation joining and separate-household setup');
  const profile=await api('profile',owner.token,{adults:2,children:2,dietTags:[],equipment:['Stovetop']});assert.equal(profile.status,200);
  checks.push('real profile save and household membership access');
  const days=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const meals=days.map((day,i)=>({id:`local-${i}`,day,title:`Local ${day} dinner`,servings:4,total_minutes:20,tags:[],ingredients:[{name:'rice',quantity:1,unit:'cup',category:'Pantry'}],steps:['Cook rice.','Serve dinner.']}));
  const body={weekStart:'2026-10-12',householdSize:4,days,equipment:['Stovetop'],useUp:'',notes:'Synthetic local acceptance',meals,requestKey:randomUUID(),expectedRevision:0};
  const first=await api('plan',owner.token,body);assert.equal(first.status,200);assert.equal(first.data.meals.length,7);
  assert.ok(first.data.meals.every(meal=>meal.ingredients.length===1&&meal.steps.length===2));
  assert.equal(first.data.groceryItems[0].quantity,7);
  checks.push('seven-day API save through real Auth and PostgREST commits the complete graph');
  const replay=await api('plan',owner.token,body);assert.equal(replay.status,200);assert.equal(replay.data.replayed,true);assert.equal(replay.data.planId,first.data.planId);
  checks.push('committed retry replays without duplicate writes through real PostgREST');
  const stale=await api('plan',member.token,{...body,requestKey:randomUUID()});assert.equal(stale.status,409);assert.equal(stale.data.code,'WEEK_CONFLICT');
  checks.push('second household member gets a real HTTP 409 for a stale save');
  const edited=await api('plan',member.token,{planId:first.data.planId,itemId:first.data.groceryItems[0].id,expectedRevision:first.data.revision,action:'set_needed',needed:true},'PATCH');assert.equal(edited.status,200);
  const checked=await api('plan',member.token,{planId:first.data.planId,itemId:first.data.groceryItems[0].id,expectedRevision:edited.data.revision,action:'toggle',checked:true},'PATCH');assert.equal(checked.status,200);
  const rebuilt=await api('plan',owner.token,{...body,expectedRevision:checked.data.revision,requestKey:randomUUID()});assert.equal(rebuilt.status,200);
  assert.equal(rebuilt.data.groceryItems[0].id,first.data.groceryItems[0].id);assert.equal(rebuilt.data.groceryItems[0].checked,true);assert.equal(rebuilt.data.groceryItems[0].needed_this_week,true);
  checks.push('same-week rebuilding preserves real grocery identity, checks and sundry intent');
  const isolated=await api('plan?week_start=2026-10-12',other.token);assert.equal(isolated.status,200);assert.equal(isolated.data.plan,null);
  const denied=await api('plan',other.token,{planId:first.data.planId,itemId:first.data.groceryItems[0].id,expectedRevision:rebuilt.data.revision,action:'toggle',checked:false},'PATCH');assert.equal(denied.status,403);
  const hidden=await fetch(local.url+`/rest/v1/weekly_plans?select=id&id=eq.${first.data.planId}`,{headers:{apikey:local.publicKey,Authorization:`Bearer ${other.token}`}});assert.equal(hidden.status,200);assert.deepEqual(await hidden.json(),[]);
  checks.push('API and direct PostgREST calls enforce cross-household isolation');
  assert.equal((await api('plan',null)).status,401);
  const pieces=owner.token.split('.');pieces[2]='invalid-signature';
  assert.equal((await api('plan',pieces.join('.'))).status,401);
  checks.push('real Auth rejects absent and invalidly signed sessions');
  // Use the actual Supabase browser SDK, UI and API: no API or Auth mocks.
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(root);await page.locator('#mealzAuthEmail').fill(owner.email);await page.locator('#mealzAuthPassword').fill(owner.password);
  await page.locator('#mealzAuthForm button[type=submit]').click();
  await page.waitForFunction(()=>window.MealzAuth?.user);
  // First full sign-in offers optional quick login. Complete the ordinary
  // "not now" path instead of assuming authentication removes every gate.
  await page.locator('#quickSetupSkip').click();
  await page.waitForFunction(()=>window.MealzAuth?.user&&document.querySelector('#mealzAuthGate')===null);
  await page.reload();await page.waitForFunction(()=>window.MealzAuth?.user&&document.querySelector('#mealzAuthGate')===null);
  assert.equal(await page.evaluate(()=>window.MealzAuth.user.email),owner.email);
  await page.locator('[data-week="2026-10-12"][data-week-action="view-groceries"]').click();
  const disclosure=page.locator('.grocery-sundries');if(!await disclosure.evaluate(element=>element.open))await disclosure.locator('summary').click();
  const checkbox=page.getByRole('checkbox',{name:'purchased rice'});
  const mutation=page.waitForResponse(response=>response.url().endsWith('/api/plan')&&response.request().method()==='PATCH');
  await checkbox.uncheck();assert.equal((await mutation).status(),200);
  await page.reload();await page.locator('[data-week="2026-10-12"][data-week-action="view-groceries"]').click();
  const restored=page.locator('.grocery-sundries');if(!await restored.evaluate(element=>element.open))await restored.locator('summary').click();
  assert.equal(await page.getByRole('checkbox',{name:'purchased rice'}).isChecked(),false);
  checks.push('mobile grocery checkbox writes through real services and persists after reload');
  assert.deepEqual(errors,[]);await page.screenshot({path:fileURLToPath(new URL('../.local/local-signed-in.png',import.meta.url)),fullPage:true});
  checks.push('mobile browser signs in through the real SDK and restores its session after reload');
  const output={verifiedOn:'2026-10-11',result:'passed',checks,aiCalls:0,productionContacted:false};
  writeFileSync(new URL('../.local/supabase-acceptance.json',import.meta.url),JSON.stringify(output,null,2));
  console.log(JSON.stringify(output));
} finally {
  await browser?.close();await new Promise(resolve=>server.close(resolve));
}

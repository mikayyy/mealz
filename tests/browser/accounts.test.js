import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';

// External auth and API boundaries are mocked; all shipped client scripts run.
const sdk=`window.supabase={createClient:()=>{
  let callback=()=>{};
  const session=()=>JSON.parse(localStorage.getItem('test-session')||'null');
  const emit=(event,value)=>{localStorage.setItem('test-session',JSON.stringify(value));callback(event,value)};
  window.testAuthEvent=emit;
  return {auth:{
    onAuthStateChange(fn){callback=fn},
    async getSession(){if(location.hash.includes('type=recovery'))callback('PASSWORD_RECOVERY',session());return {data:{session:session()}}},
    async signInWithPassword({email,password}){if(!password||password==='wrong')return {error:{message:'Invalid login credentials'}};const value={user:{id:email,email},access_token:email,refresh_token:'refresh-'+email};emit('SIGNED_IN',value);return {data:{session:value}}},
    async verifyOtp({token_hash}){const email=String(token_hash||'').replace(/^quick:/,'');const value={user:{id:email,email},access_token:email,refresh_token:'refresh-'+email};emit('SIGNED_IN',value);return {data:{session:value},error:null}},
    async signUp({password}){return password?{data:{session:null}}:{error:{message:'Password missing'}}},
    async resetPasswordForEmail({}){return {data:{}}},
    async updateUser({password}){if(!password)return {error:{message:'Password missing'}};return {data:{user:session().user}}},
    async signOut(){emit('SIGNED_OUT',null);return {error:null}}
  }};
}};`;

async function revealPassword(page,value){
  const input=page.locator('#mealzAuthPassword');
  assert.equal(await input.getAttribute('type'),'password');
  await input.fill(value);
  const before=await page.locator('#mealzAuthMessage').textContent();
  await page.getByRole('button',{name:'show password',exact:true}).click();
  assert.equal(await input.getAttribute('type'),'text');
  assert.equal(await input.inputValue(),value);
  await page.getByRole('button',{name:'hide password',exact:true}).press('Space');
  assert.equal(await input.getAttribute('type'),'password');
  await page.getByRole('button',{name:'show password',exact:true}).press('Enter');
  assert.equal(await input.getAttribute('type'),'text');
  assert.equal(await input.inputValue(),value);
  assert.equal(await page.locator('#mealzAuthMessage').textContent(),before,'Reveal must not submit the form');
}

test('account browser flows',async t=>{
  const browser=await chromium.launch({headless:true,...(process.env.MEALZ_CHROME_PATH?{executablePath:process.env.MEALZ_CHROME_PATH}:{})});
  try{
    async function fixture(user=null){
      const context=await browser.newContext({viewport:{width:390,height:844}});
      const page=await context.newPage();page.setDefaultTimeout(5000);
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      const homes=new Map([['existing@test.com',{id:'existing',name:'Existing family',role:'owner'}]]);
      const profiles=new Map([['existing',{adults:3,children:2,dietTags:['Vegan'],equipment:['Oven']}]]);
      const requests=[];const quickDevices=new Map();let quickSeq=0;let failConfig=false,failSave=false,failHome=false,expireSession=false,failWeeksOnce=false,planData=null;
      if(user)await context.addInitScript(user=>{
        if(!sessionStorage.getItem('seeded')){
          localStorage.setItem('test-session',JSON.stringify({user:{id:user,email:user},access_token:user}));
          localStorage.setItem('mealz',JSON.stringify({adults:19,meals:[{title:'Previous account private meal'}]}));
          sessionStorage.setItem('seeded','true');
        }
      },user);
      await page.route('**/*',async route=>{
        const request=route.request(),url=new URL(request.url());
        if(url.hostname==='cdn.jsdelivr.net')return route.fulfill({contentType:'text/javascript',body:sdk});
        if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
        if(url.hostname==='fonts.gstatic.com')return route.fulfill({status:204,body:''});
        assert.equal(url.hostname,'mealz.test');
        if(url.pathname.startsWith('/api/')){
          if(url.pathname==='/api/auth-config')return route.fulfill({status:failConfig?503:200,json:{enabled:true,supabaseUrl:'https://auth.test',publishableKey:'public'}});
          const who=request.headers().authorization?.replace('Bearer ','');
          if(url.pathname==='/api/quick-login'){
            const body=request.postDataJSON();
            if(body.action==='setup'){
              assert.ok(who,'Quick-login setup must carry a session token');
              const deviceToken='device-'+(++quickSeq)+'-'+who;
              quickDevices.set(deviceToken,{userId:who,email:who,label:body.label,pin:body.pin});
              return route.fulfill({status:201,json:{ok:true,userId:who,email:who,label:body.label,deviceToken}});
            }
            if(body.action==='unlock'){
              const device=quickDevices.get(body.deviceToken);
              if(!device||device.pin!==body.pin)return route.fulfill({status:401,json:{error:'That code did not work.'}});
              return route.fulfill({json:{ok:true,tokenHash:'quick:'+device.email,label:device.label,email:device.email}});
            }
            if(body.action==='revoke'){
              assert.ok(who,'Quick-login revoke must carry a session token');
              quickDevices.delete(body.deviceToken);return route.fulfill({json:{ok:true}});
            }
          }
          assert.ok(who,'API calls must carry a session token');requests.push({path:url.pathname,who,method:request.method()});
          if(expireSession)return route.fulfill({status:401,json:{error:'Session expired'}});
          let data={},home=homes.get(who);
          if(url.pathname==='/api/household'){
            if(failHome)return route.fulfill({status:503,json:{error:'Temporarily unavailable'}});
            if(request.method()==='GET')data=home?{linked:true,household:home,role:home.role,needsProfile:!profiles.has(home.id)}:{linked:false};
            else {
              const body=request.postDataJSON();
              if(body.action==='join'){
                if(body.code!=='JOIN-2345')return route.fulfill({status:404,json:{error:'That household code was not found.'}});
                home={...homes.get('existing@test.com'),role:'member'};homes.set(who,home);data={household:home};
              }else if(body.action==='create'){
                home={id:who,name:body.name,role:'owner'};homes.set(who,home);data={household:home,joinCode:'ABCD-2345'};
              }else data={joinCode:'NEWC-2345'};
            }
          }else if(url.pathname==='/api/profile'){
            assert.ok(home,'No meal data requested before household resolution');
            if(request.method()==='POST'){
              if(failSave)return route.fulfill({status:503,json:{error:'Please try saving again.'}});
              profiles.set(home.id,request.postDataJSON());
            }
            data={profile:profiles.get(home.id)||null};
          }else if(url.pathname==='/api/plan'&&request.method()==='GET')data=planData||{plan:null,meals:[],groceryItems:[]};
          else if(url.pathname==='/api/weeks'){
            if(failWeeksOnce){failWeeksOnce=false;return route.fulfill({status:503,json:{error:'Temporary cloud interruption'}})}
            data={current:null,next:null,past:[]};
          }
          return route.fulfill({json:data});
        }
        const file=url.pathname==='/'?'index.html':url.pathname.slice(1);
        return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html',body:readFileSync(new URL('../../'+file,import.meta.url))});
      });
      return {page,context,requests,profiles,errors,set failConfig(v){failConfig=v},set failSave(v){failSave=v},set failHome(v){failHome=v},set expireSession(v){expireSession=v},set failWeeksOnce(v){failWeeksOnce=v},set planData(v){planData=v},async close(){assert.deepEqual(errors,[]);await context.close()}};
    }
    await t.test('existing members bypass onboarding; profile edits, failed saves, invitation and sign-out work',async()=>{
      const f=await fixture('existing@test.com'),p=f.page;
      await p.goto('http://mealz.test');
      const brand=await p.locator('.brand-z').first().evaluate(element=>{const style=getComputedStyle(element),rect=element.getBoundingClientRect();return {background:style.backgroundImage,width:rect.width,height:rect.height,label:element.parentElement?.getAttribute('aria-label')}});
      assert.match(brand.label,/^mealz\b/);
      assert.ok(brand.width>0&&brand.height>0);
      assert.match(brand.background,/linear-gradient\([^)]*rgb\(23, 23, 23\)/);
      await p.locator('[data-week-action="edit-profile"]').click();
      assert.equal(await p.locator('.counter-value').first().textContent(),'3');
      await p.locator('#adultPlus').click();
      f.failSave=true;await p.locator('#profileDone').click();await p.locator('#profileSaveError').waitFor();
      assert.equal(await p.locator('#app h1').textContent(),'profile');
      f.failSave=false;await p.locator('#profileDone').click();await p.locator('[data-week-action="edit-profile"]').waitFor();
      assert.equal(f.profiles.get('existing').adults,4);
      await p.locator('#accountSettings').click();p.on('dialog',dialog=>dialog.accept());await p.locator('#replaceInvite').click();await p.locator('.invite-code').waitFor();
      assert.equal(await p.locator('.invite-code').textContent(),'NEWC-2345');
      await p.locator('#signOut').click();await p.locator('#mealzAuthEmail').waitFor();
      assert.equal(await p.locator('#app').textContent(),'');
      await f.close();
    });
    await t.test('a transient sync failure clears after recovery and never enters durable state',async()=>{
      const f=await fixture('existing@test.com'),p=f.page;
      f.planData={plan:{id:'plan-1',cooking_days:['Monday'],use_up:'',notes:''},meals:[{id:'meal-1',day:'Monday',title:'Tomato pasta',ingredients:[{name:'diced tomatoes',quantity:2,unit:'cans',category:'Pantry'}],steps:['Cook.']}],groceryItems:[{id:'grocery-1',name:'tomatoes',quantity:2,unit:'cans',category:'Pantry',checked:false}]};
      f.failWeeksOnce=true;
      await p.goto('http://mealz.test');
      await p.getByText('Cloud sync delayed.',{exact:true}).waitFor();
      await p.evaluate(()=>view('groceries'));
      await p.getByText('2 cans tomatoes',{exact:true}).waitFor();
      const stored=await p.evaluate(()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(key=>key.startsWith('mealz:existing@test.com:')))||'{}'));
      assert.equal(stored.syncError,undefined);
      assert.equal(stored.meals[0].title,'Tomato pasta');
      assert.equal(stored.groceryItems[0].name,'tomatoes');
      await p.evaluate(async()=>{await loadWeeksOverview(true);await dashboard()});
      assert.equal(await p.getByText('Cloud sync delayed.',{exact:true}).count(),0);
      await p.reload();
      await p.locator('[data-week-action="edit-profile"]').waitFor();
      assert.equal(await p.getByText('Cloud sync delayed.',{exact:true}).count(),0);
      await p.evaluate(()=>view('groceries'));
      await p.getByText('2 cans tomatoes',{exact:true}).waitFor();
      await f.close();
    });
    await t.test('new household goes to Profile and never imports another account’s cached data',async()=>{
      const f=await fixture('new@test.com'),p=f.page;
      await p.goto('http://mealz.test');await p.locator('#createHousehold').click();
      assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
      if(process.env.MEALZ_SCREENSHOT_DIR)await p.screenshot({path:process.env.MEALZ_SCREENSHOT_DIR+'/household-create.png',fullPage:true});
      await p.locator('#householdInput').fill('New family');await p.locator('#householdForm button').click();
      await p.locator('#profileDone').waitFor();assert.equal(await p.locator('.counter-value').first().textContent(),'3');
      assert.equal(await p.locator('.invite-code').textContent(),'ABCD-2345');
      assert.ok(!await p.locator('#app').textContent().then(s=>s.includes('Previous account')));
      assert.equal(await p.evaluate(()=>localStorage.getItem('mealz')),null);
      await p.locator('#profileDone').click();await p.locator('[data-week-action="edit-profile"]').waitFor();
      await p.reload();await p.locator('[data-week-action="edit-profile"]').waitFor();
      await f.close();
    });
    await t.test('join validates a code, loads the shared Profile, and cannot expose owner controls',async()=>{
      const f=await fixture('joiner@test.com'),p=f.page;
      await p.goto('http://mealz.test');await p.locator('#joinHousehold').click();
      await p.locator('#householdInput').fill('BAD-CODE');await p.locator('#householdForm button').click();
      await p.getByText('That household code was not found.',{exact:true}).waitFor();
      await p.locator('#householdInput').fill('JOIN-2345');await p.locator('#householdForm button').click();
      await p.locator('[data-week-action="edit-profile"]').click();
      assert.equal(await p.locator('[data-tag="Vegan"]').getAttribute('class'),'preference-btn selected');
      await p.locator('#accountSettings').click();assert.equal(await p.locator('#replaceInvite').count(),0);
      assert.ok(!f.requests.some(r=>r.path==='/api/profile'&&r.method==='POST'));
      await f.close();
    });
    await t.test('password sign-in, signup confirmation, and reset request states',async()=>{
      const f=await fixture(),p=f.page;await p.goto('http://mealz.test');
      await p.locator('[data-mode="signup"]').click();await p.locator('#mealzAuthEmail').fill('new@test.com');await revealPassword(p,'long-password');await p.locator('form button[type="submit"]').click();
      await p.getByText('check your email to confirm your account, then return here to sign in.',{exact:true}).waitFor();assert.equal(f.requests.length,0);
      await p.locator('[data-mode="signin"]').click();await p.locator('[data-mode="reset"]').click();await p.locator('#mealzAuthEmail').fill('existing@test.com');await p.locator('form button[type="submit"]').click();
      await p.getByText('if an account exists for that email, a reset link is on its way.',{exact:true}).waitFor();
      await p.locator('[data-mode="signin"]').click();await p.locator('#mealzAuthEmail').fill('existing@test.com');await p.locator('#mealzAuthPassword').fill('wrong');await p.locator('form button[type="submit"]').click();await p.getByText('Invalid login credentials',{exact:true}).waitFor();
      await p.locator('#mealzAuthPassword').fill('long-password');await p.locator('form button[type="submit"]').click();await p.locator('#quickSetupSkip').waitFor();await p.locator('#quickSetupSkip').click();await p.locator('[data-week-action="edit-profile"]').waitFor();
      await f.close();
    });
    await t.test('trusted-device quick login remembers only local accounts and unlocks with a PIN',async()=>{
      const f=await fixture(),p=f.page;await p.goto('http://mealz.test');
      await p.locator('#mealzAuthEmail').fill('existing@test.com');await p.locator('#mealzAuthPassword').fill('long-password');await p.locator('form button[type="submit"]').click();
      await p.locator('#quickSetupForm').waitFor();await p.locator('#quickLabel').fill('Michael');await p.locator('#quickSetupPin').fill('2468');await p.locator('#quickConfirmPin').fill('2468');await p.locator('#quickSetupForm button[type="submit"]').click();
      await p.locator('#mealzAuthGate').waitFor({state:'detached'});
      await p.locator('[data-week-action="edit-profile"]').waitFor();
      const stored=await p.evaluate(()=>localStorage.getItem('mealz:quick-login:v1'));
      assert.ok(stored.includes('Michael'));assert.ok(!stored.includes('2468'));
      await p.locator('#signOut').click();await p.getByText('Michael',{exact:true}).waitFor();
      assert.equal(await p.locator('.remembered-account').count(),1);
      await p.getByText('Michael',{exact:true}).click();await p.locator('#quickPin').fill('0000');await p.locator('#quickPinForm button').click();await p.getByText('That code did not work.',{exact:true}).waitFor();
      await p.locator('#quickPin').fill('2468');await p.locator('#quickPinForm button').click();await p.locator('[data-week-action="edit-profile"]').waitFor();
      await p.locator('#accountSettings').click();await p.locator('#forgetQuickLogin').click();
      await p.locator('#forgetQuickLogin').waitFor({state:'detached'});
      assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('mealz:quick-login:v1')||'[]').length),0);
      await f.close();
    });
    await t.test('recovery is shown before meal loading and password update resumes the same household',async()=>{
      const f=await fixture('existing@test.com'),p=f.page;
      await p.goto('http://mealz.test/?reset=1#type=recovery');await revealPassword(p,'replacement-password');
      assert.equal(f.requests.length,0);await p.locator('form button[type="submit"]').click();await p.locator('[data-week-action="edit-profile"]').waitFor();
      assert.equal(new URL(p.url()).search,'');await f.close();
    });
    await t.test('account password changes support reveal and reopen hidden',async()=>{
      const f=await fixture('existing@test.com'),p=f.page;
      await p.goto('http://mealz.test');await p.locator('[data-week-action="edit-profile"]').waitFor();
      await p.locator('#accountSettings').click();await p.locator('#setPassword').click();
      await revealPassword(p,'new-account-password');
      if(process.env.MEALZ_SCREENSHOT_DIR)await p.screenshot({path:process.env.MEALZ_SCREENSHOT_DIR+'/password-reveal.png',fullPage:true});
      await p.locator('form button[type="submit"]').click();
      await p.locator('[data-week-action="edit-profile"]').waitFor();
      await p.locator('#accountSettings').click();await p.locator('#setPassword').click();
      assert.equal(await p.locator('#mealzAuthPassword').getAttribute('type'),'password');
      assert.equal(await p.locator('#mealzAuthPassword').inputValue(),'');
      await f.close();
    });
    await t.test('account switches clear the old view and token refresh does not rerender edits',async()=>{
      const f=await fixture('existing@test.com'),p=f.page;
      await p.goto('http://mealz.test');await p.locator('[data-week-action="edit-profile"]').click();
      await p.evaluate(()=>/** @type {any} */(window).testAuthEvent('TOKEN_REFRESHED',{user:{id:'existing@test.com',email:'existing@test.com'},access_token:'existing@test.com'}));
      await p.locator('#adultPlus').click();assert.equal(await p.locator('.counter-value').first().textContent(),'4');
      await p.evaluate(()=>/** @type {any} */(window).testAuthEvent('SIGNED_IN',{user:{id:'other@test.com',email:'other@test.com'},access_token:'other@test.com'}));
      await p.locator('#createHousehold').waitFor();assert.equal(await p.locator('#profileDone').count(),0);
      await f.close();
    });
    await t.test('configuration and household failures stay closed with retry controls',async()=>{
      const f=await fixture('existing@test.com'),p=f.page;f.failConfig=true;
      await p.goto('http://mealz.test');await p.locator('#authRetry').waitFor();assert.equal(f.requests.length,0);
      f.failConfig=false;f.failHome=true;await p.locator('#authRetry').click();await p.locator('#retryHousehold').waitFor();
      assert.ok(!f.requests.some(r=>r.path==='/api/profile'));
      f.failHome=false;await p.locator('#retryHousehold').click();await p.locator('[data-week-action="edit-profile"]').waitFor();await f.close();
    });
    await t.test('expired API session hides private data and requests sign-in',async()=>{
      const f=await fixture('existing@test.com'),p=f.page;
      await p.goto('http://mealz.test');await p.locator('[data-week-action="edit-profile"]').click();
      f.expireSession=true;await p.locator('#profileDone').click();await p.locator('#mealzAuthEmail').waitFor();
      assert.equal(await p.locator('#app').getAttribute('inert'),'');
      assert.equal(await p.locator('.counter-value').count(),0);
      assert.equal(await p.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('mealz:')).length),0);
      await f.close();
    });
  }finally{await browser.close()}
});

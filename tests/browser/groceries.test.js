import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';

const sdk=`window.supabase={createClient:()=>({auth:{
  onAuthStateChange(){},
  async getSession(){return {data:{session:{user:{id:'shopper@test.com',email:'shopper@test.com'},access_token:'shopper@test.com'}}}},
  async signOut(){return {error:null}}
}})}};`;

test('saved grocery list supports toggle, add, edit, and delete without changing recipes',async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.MEALZ_CHROME_PATH?{executablePath:process.env.MEALZ_CHROME_PATH}:{})});
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
  page.setDefaultTimeout(5000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const weekStart='2026-09-21',plan={id:'plan-1',week_start:weekStart,cooking_days:['Monday'],use_up:null,notes:null};
  const meals=[{id:'meal-1',day:'Monday',title:'Tomato pasta',description:'A fast pasta.',servings:4,total_minutes:20,difficulty:'Easy',tags:[],kid_note:null,ingredients:[{name:'Diced tomatoes',quantity:2,unit:'cans',category:'Pantry',optional:false}],steps:['Cook the pasta.']}];
  let groceries=[{id:'g-1',weekly_plan_id:plan.id,name:'tomato',quantity:2,unit:'cans',category:'Pantry',checked:false,source:'generated',source_key:'tomato::cans',user_modified:false,deleted:false}];
  const requests=[];
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.hostname==='cdn.jsdelivr.net')return route.fulfill({contentType:'text/javascript',body:sdk});
    if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
    if(url.hostname==='fonts.gstatic.com')return route.fulfill({status:204,body:''});
    assert.equal(url.hostname,'mealz.test');
    if(url.pathname.startsWith('/api/')){
      if(url.pathname==='/api/auth-config')return route.fulfill({json:{enabled:true,supabaseUrl:'https://auth.test',publishableKey:'public'}});
      if(url.pathname==='/api/household')return route.fulfill({json:{linked:true,household:{id:'home-1',name:'Test home',role:'owner'},role:'owner'}});
      if(url.pathname==='/api/profile')return route.fulfill({json:{profile:{adults:2,children:2,dietTags:[],equipment:[]}}});
      if(url.pathname==='/api/pregenerated-ideas')return route.fulfill({json:{ideas:[]}});
      if(url.pathname==='/api/weeks')return route.fulfill({json:{current:{weekStart,mealCount:1,meals},next:null,past:[]}});
      if(url.pathname==='/api/plan'){
        requests.push({method:request.method(),body:request.postDataJSON?.()});
        if(request.method()==='GET')return route.fulfill({json:{plan,meals,groceryItems:groceries.filter(item=>!item.deleted)}});
        const body=request.postDataJSON();
        if(request.method()==='PUT'){
          const item={...body,id:'g-2',weekly_plan_id:plan.id,checked:false,source:'manual',source_key:null,user_modified:true,deleted:false};groceries.push(item);return route.fulfill({status:201,json:{item}});
        }
        if(request.method()==='PATCH'){
          const index=groceries.findIndex(item=>item.id===body.itemId);groceries[index]={...groceries[index],...(body.action==='toggle'?{checked:body.checked}:{name:body.name,quantity:body.quantity,unit:body.unit,category:body.category,user_modified:true})};return route.fulfill({json:{item:groceries[index]}});
        }
        if(request.method()==='DELETE'){groceries.find(item=>item.id===body.itemId).deleted=true;return route.fulfill({json:{ok:true}})}
      }
      return route.fulfill({json:{}});
    }
    const file=url.pathname==='/'?'index.html':url.pathname.slice(1);
    return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html',body:readFileSync(new URL('../../'+file,import.meta.url))});
  });
  try{
    await page.goto('http://mealz.test');
    await page.locator('#app h1').waitFor();
    await page.evaluate(()=>view('groceries'));
    await page.getByText('2 cans tomato',{exact:true}).waitFor();
    await page.locator('[data-grocery-action="toggle"]').check();
    assert.equal(requests.at(-1).body.itemId,'g-1');
    await page.locator('[data-grocery-action="edit"]').click();
    await page.locator('.grocery-edit-form input[name="name"]').fill('tomatoes for salsa');
    await page.locator('.grocery-edit-form button[type="submit"]').click();
    await page.getByText('2 cans tomatoes for salsa',{exact:true}).waitFor();
    await page.locator('[data-grocery-action="show-add"]').click();
    await page.locator('.grocery-add-form input[name="name"]').fill('sparkling water');
    await page.locator('.grocery-add-form input[name="quantity"]').fill('2');
    await page.locator('.grocery-add-form input[name="unit"]').fill('packs');
    await page.locator('.grocery-add-form select[name="category"]').selectOption({label:'Other'});
    await page.locator('.grocery-add-form button[type="submit"]').click();
    await page.getByText('2 packs sparkling water',{exact:true}).waitFor();
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('.grocery-item').filter({hasText:'sparkling water'}).locator('[data-grocery-action="delete"]').click();
    await page.getByText('2 packs sparkling water',{exact:true}).waitFor({state:'detached'});
    await page.evaluate(()=>view('meals'));
    await page.locator('.view-recipe').click();
    assert.match(await page.locator('.recipe-list').textContent(),/2 cans Diced tomatoes/);
    assert.deepEqual(errors,[]);
  }finally{await context.close();await browser.close()}
});

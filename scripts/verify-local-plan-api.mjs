import assert from 'node:assert/strict';
import handler from '../api/plan.ts';

/**
 * Runs the shipped API handler, reconciliation and SQL RPCs together.
 * Only Auth and the PostgREST transport are substituted; SQL runs under the
 * authenticated role with each fixture user's claim. No external fetch exists.
 */
export async function verifyLocalPlanApi({admin,member,secondMember,id}) {
  const previousFetch=globalThis.fetch;
  const keys=['SUPABASE_URL','SUPABASE_SECRET_KEY','SUPABASE_PUBLISHABLE_KEY'];
  const previousEnv=keys.map(key=>process.env[key]);
  process.env.SUPABASE_URL='https://mealz-local-fixture.invalid';
  process.env.SUPABASE_SECRET_KEY='local-unused-service-key';
  process.env.SUPABASE_PUBLISHABLE_KEY='local-public-key';
  const checks=[];
  const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  const equalFilter=(url,key)=>{
    const value=url.searchParams.get(key);
    if(value===null)return null;
    assert.ok(value.startsWith('eq.'),'only fixture equality filters are supported');
    return value.slice(3);
  };
  globalThis.fetch=async(input,options={})=>{
    const url=new URL(String(input));
    assert.equal(url.origin,'https://mealz-local-fixture.invalid','external requests are forbidden');
    const headers=new Headers(options.headers),token=headers.get('Authorization');
    const actor=token==='Bearer local-owner'?id(1):token==='Bearer local-member'?id(3):null;
    if(url.pathname==='/auth/v1/user')return actor?json({id:actor}):json({message:'Expired fixture session'},401);
    assert.ok(actor,'database requests must have a user token');
    assert.equal(headers.get('apikey'),'local-public-key','service-key fallback is forbidden');
    const client=actor===id(1)?member:secondMember;
    const params=options.body?JSON.parse(String(options.body)):{};
    try {
      let result;
      if(url.pathname==='/rest/v1/household_members') {
        result=(await client.query('select household_id,role from household_members where user_id=$1 limit 1',[equalFilter(url,'user_id')])).rows;
      } else if(url.pathname==='/rest/v1/weekly_plans') {
        result=(await client.query("select id,revision from weekly_plans where status='active' and ($1::uuid is null or household_id=$1) and ($2::date is null or week_start=$2) order by week_start desc,created_at desc",[equalFilter(url,'household_id'),equalFilter(url,'week_start')])).rows;
      } else if(url.pathname==='/rest/v1/grocery_items') {
        result=(await client.query('select * from grocery_items where weekly_plan_id=$1 order by created_at asc',[equalFilter(url,'weekly_plan_id')])).rows;
      } else if(url.pathname==='/rest/v1/rpc/mealz_save_week') {
        result=(await client.query('select mealz_save_week($1,$2,$3,$4,$5::jsonb) as result',[params.p_household,params.p_week,params.p_expected_revision,params.p_request_key,JSON.stringify(params.p_payload)])).rows[0].result;
      } else if(url.pathname==='/rest/v1/rpc/mealz_week_result') {
        result=(await client.query('select mealz_week_result($1,$2) as result',[params.p_plan,params.p_replayed])).rows[0].result;
      } else if(url.pathname==='/rest/v1/rpc/mealz_mutate_grocery') {
        result=(await client.query('select mealz_mutate_grocery($1,$2,$3,$4,$5::jsonb) as result',[params.p_plan,params.p_item,params.p_expected_revision,params.p_action,JSON.stringify(params.p_fields)])).rows[0].result;
      } else assert.fail(`Unexpected fixture transport: ${url.pathname}`);
      return json(result);
    } catch(error) {
      const status=/^PT\d{3}$/.test(error.code||'')?Number(error.code.slice(2)):error.code==='42501'?403:500;
      return json({code:error.code,message:error.message},status);
    }
  };
  const call=async(method,body={},token='local-owner')=>{
    const res={code:null,data:null,setHeader(){},status(code){this.code=code;return this},json(data){this.data=data;return this}};
    await handler({method,headers:token?{authorization:`Bearer ${token}`}:{},body,query:{week_start:'2026-10-12'}},res);
    return res;
  };
  const days=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const meals=days.map((day,i)=>({id:`day-${i}`,day,title:`Dinner ${day}`,servings:4,total_minutes:20,tags:[],ingredients:[{name:'rice',quantity:1,unit:'cup',category:'Pantry'}],steps:[`Cook dinner for ${day}.`]}));
  const body={weekStart:'2026-10-12',householdSize:4,days,equipment:[],useUp:'',notes:'',meals,expectedRevision:0,requestKey:id(100)};
  try {
    const first=await call('POST',body);
    assert.equal(first.code,200);assert.equal(first.data.meals.length,7);
    assert.ok(first.data.meals.every(meal=>meal.ingredients.length===1&&meal.steps.length===1));
    assert.equal(first.data.groceryItems.length,1);assert.equal(first.data.groceryItems[0].quantity,7);
    checks.push('real API seven-day save commits complete recipes and consolidated groceries');
    const replay=await call('POST',body);
    assert.equal(replay.code,200);assert.equal(replay.data.replayed,true);assert.equal(replay.data.planId,first.data.planId);
    checks.push('real API lost-response retry replays without duplication');
    const second=await call('POST',{...body,requestKey:id(101)},'local-member');
    assert.equal(second.code,409);assert.equal(second.data.code,'WEEK_CONFLICT');
    checks.push('second member stale save returns HTTP 409');
    const planId=first.data.planId,itemId=first.data.groceryItems[0].id;
    let revision=first.data.revision;
    for(const fields of [{action:'set_needed',needed:true},{action:'toggle',checked:true}]){
      const mutation=await call('PATCH',{planId,itemId,expectedRevision:revision,...fields});
      assert.equal(mutation.code,200);revision=mutation.data.revision;
    }
    const manual=await call('PUT',{planId,expectedRevision:revision,name:'oranges',quantity:4,unit:'each',category:'Produce'});
    assert.equal(manual.code,201);revision=manual.data.revision;
    const rebuild=await call('POST',{...body,requestKey:id(102),expectedRevision:revision});
    assert.equal(rebuild.code,200);assert.equal(rebuild.data.planId,planId);
    const rice=rebuild.data.groceryItems.find(item=>item.id===itemId);
    assert.ok(rice.checked&&rice.needed_this_week);
    assert.ok(rebuild.data.groceryItems.some(item=>item.id===manual.data.item.id&&item.name==='oranges'));
    checks.push('real API rebuild preserves grocery identities, manual items, checks and sundry intent');
    const before=(await call('GET')).data;
    // Inject a real database failure after old recipe rows have been replaced.
    await admin.query("create function local_reject_step() returns trigger language plpgsql as $$ begin if new.instruction='LOCAL_FAULT' then raise exception 'Local injected step failure'; end if; return new; end $$; create trigger local_reject_step before insert on recipe_steps for each row execute function local_reject_step()");
    const broken=structuredClone(body);broken.meals[3].steps=['LOCAL_FAULT'];broken.expectedRevision=before.revision;broken.requestKey=id(103);
    const failed=await call('POST',broken);
    assert.equal(failed.code,500);assert.deepEqual((await call('GET')).data,before);
    assert.equal((await admin.query('select count(*)::int n from mealz_plan_save_receipts where request_key=$1',[id(103)])).rows[0].n,0);
    await admin.query('drop trigger local_reject_step on recipe_steps; drop function local_reject_step()');
    checks.push('real API failed recipe replacement rolls back graph, revision and receipt');
    assert.equal((await call('GET',{},null)).code,401);
    assert.equal((await call('GET',{},'expired-token')).code,401);
    checks.push('real API rejects absent and expired fixture sessions');
    // A second household has data, but each member session sees only its own.
    await admin.query('insert into auth.users(id) values($1)',[id(110)]);
    await admin.query('insert into households(id,name,created_by) values($1,$2,$3)',[id(111),'Isolated home',id(110)]);
    await admin.query("insert into household_members(household_id,user_id,role) values($1,$2,'owner')",[id(111),id(110)]);
    await admin.query("insert into weekly_plans(id,household_id,week_start,status) values($1,$2,'2026-10-12','active')",[id(112),id(111)]);
    assert.equal((await call('GET')).data.planId,planId);
    assert.equal((await member.query('select id from weekly_plans where household_id=$1',[id(111)])).rows.length,0);
    await assert.rejects(()=>member.query('select mealz_save_week($1,$2,0,$3,$4::jsonb)',[id(111),'2026-10-12',id(113),JSON.stringify({householdSize:4,days,equipment:[],meals,groceries:[],snapshot_revision:0})]),error=>error.code==='PT403');
    checks.push('second household data hidden by real RLS and cross-household RPC denied');
    return checks;
  } finally {
    globalThis.fetch=previousFetch;
    keys.forEach((key,i)=>{if(previousEnv[i]===undefined)delete process.env[key];else process.env[key]=previousEnv[i]});
  }
}

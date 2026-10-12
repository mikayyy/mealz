import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MIGRATIONS} from '../migrations/manifest.js';
import {makeDb,adaptForPGlite} from '../migrations/pglite-fixture.js';
import shopping from '../shopping-logic.js';

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const user=id(1),other=id(2),home=id(3),otherHome=id(4);
const migration='20261006015243_transactional_week_saves.sql';
/** @type {import('../types.js').Meal[]} */
const meals=[{id:'dinner',day:'Monday',title:'Rice bowl',description:'Dinner',emoji:'🍚',servings:4,total_minutes:20,difficulty:'Easy',tags:[],kid_note:null,ingredients:[{name:'white rice',quantity:1,unit:'cup',category:'Pantry',optional:false}],steps:['Cook rice.','Serve.']}];
const codeError=code=>error=>error instanceof Error&&'code' in error&&error.code===code;
const payload=(revision=0)=>({householdSize:4,days:['Monday'],equipment:[],useUp:'',notes:'',meals,groceries:shopping.reconcileGroceries([],meals,{preserveIds:true}),snapshot_revision:revision});

test('transactional week save and grocery revision invariants',async t=>{
  const db=await makeDb();
  try{
    for(const name of MIGRATIONS)await db.exec(adaptForPGlite(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8')));
    // Upgrade scripts must be repeatable without resetting revisions or data.
    await db.exec(adaptForPGlite(readFileSync(new URL('../migrations/'+migration,import.meta.url),'utf8')));
    await db.query('insert into auth.users(id) values($1),($2)',[user,other]);
    await db.query('insert into households(id,name,created_by) values($1,$2,$3),($4,$5,$6)',[home,'A',user,otherHome,'B',other]);
    await db.query("insert into household_members(household_id,user_id,role) values($1,$2,'owner'),($3,$4,'owner')",[home,user,otherHome,other]);
    async function asUser(actor,fn){
      await db.exec('set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);
      try{return await fn()}finally{await db.exec('reset role')}
    }
    const save=(key,revision,data=payload(revision),actor=user,household=home)=>asUser(actor,async()=>
      (await db.query('select mealz_save_week($1,$2,$3,$4,$5::jsonb) as result',[household,'2026-10-05',revision,id(key),JSON.stringify(data)])).rows[0].result);
    let first;
    await t.test('first save commits a complete graph and receipt',async()=>{
      first=await save(10,0);
      assert.equal(first.meals.length,1);assert.deepEqual(first.meals[0].steps,meals[0].steps);
      assert.equal(first.groceryItems.length,1);assert.ok(first.revision>0);
      assert.equal((await db.query('select count(*)::int n from mealz_plan_save_receipts')).rows[0].n,1);
    });
    await t.test('lost-response retry replays without any duplicate write',async()=>{
      const replay=await save(10,0);
      assert.equal(replay.replayed,true);assert.equal(replay.planId,first.planId);assert.equal(replay.revision,first.revision);
      assert.equal((await db.query("select count(*)::int n from weekly_plans where status='active'")).rows[0].n,1);
    });
    await t.test('same key with changed payload is rejected',async()=>{
      await assert.rejects(()=>save(10,0,{...payload(),notes:'changed'}),codeError('PT409'));
    });
    await t.test('stale second writer cannot replace the committed first save',async()=>{
      await assert.rejects(()=>save(11,0),codeError('PT409'));
    });
    await t.test('RPC and receipt RLS deny another household and anonymous callers',async()=>{
      const grants=(await db.query("select has_table_privilege('service_role','mealz_plan_save_receipts','select') as service_probe,has_table_privilege('anon','mealz_plan_save_receipts','select') as anonymous_read,has_table_privilege('authenticated','mealz_plan_save_receipts','update') as user_rewrite")).rows[0];
      assert.deepEqual(grants,{service_probe:true,anonymous_read:false,user_rewrite:false});
      await assert.rejects(()=>save(12,first.revision,payload(first.revision),other),codeError('PT403'));
      await asUser(other,async()=>assert.equal((await db.query('select * from mealz_plan_save_receipts')).rows.length,0));
      await db.exec('set role anon');
      try{await assert.rejects(()=>db.query('select mealz_save_week($1,$2,0,$3,$4::jsonb)',[home,'2026-10-05',id(13),JSON.stringify(payload())]),codeError('42501'))}
      finally{await db.exec('reset role')}
    });
    await t.test('grocery mutation changes revision and conflicts a stale rebuild',async()=>{
      const before=first.revision;
      const result=await asUser(user,async()=> (await db.query('select mealz_mutate_grocery($1,$2,$3,$4,$5::jsonb) as result',[first.planId,first.groceryItems[0].id,before,'set_needed',JSON.stringify({needed_this_week:true})])).rows[0].result);
      assert.ok(result.revision>before);assert.equal(result.item.needed_this_week,true);
      await assert.rejects(()=>save(14,before,payload(before)),codeError('PT409'));
      first={...first,revision:result.revision,groceryItems:[result.item]};
    });
    await t.test('rebuild preserves plan/grocery identity and purchase intent',async()=>{
      const data={...payload(first.revision),groceries:shopping.reconcileGroceries(first.groceryItems,meals,{preserveIds:true})};
      const rebuilt=await save(15,first.revision,data);
      assert.equal(rebuilt.planId,first.planId);assert.equal(rebuilt.groceryItems[0].id,first.groceryItems[0].id);
      assert.equal(rebuilt.groceryItems[0].needed_this_week,true);first=rebuilt;
    });
    await t.test('meal feedback changes the revision and rejects stale feedback',async()=>{
      const before=first.revision;
      const update=revision=>asUser(user,async()=> (await db.query('select mealz_set_feedback($1,$2,$3,$4) as result',[first.planId,'dinner',revision,true])).rows[0].result);
      const result=await update(before);
      assert.ok(result.revision>before);assert.deepEqual(result.tags,['Make again']);
      await assert.rejects(()=>update(before),codeError('PT409'));
      first=await asUser(user,async()=> (await db.query('select mealz_week_result($1,false) as result',[first.planId])).rows[0].result);
    });
    await t.test('failure after replacing recipes rolls back the complete graph and receipt',async()=>{
      const before=await db.query('select mealz_week_result($1,false) as result',[first.planId]);
      const bad={...payload(first.revision),groceries:[{...payload().groceries[0],source:'invalid-source'}]};
      await assert.rejects(()=>save(16,first.revision,bad),codeError('23514'));
      const after=await db.query('select mealz_week_result($1,false) as result',[first.planId]);
      assert.deepEqual(after.rows,before.rows);
      assert.equal((await db.query('select count(*)::int n from mealz_plan_save_receipts where request_key=$1',[id(16)])).rows[0].n,0);
    });
    await t.test('failed first save leaves no partial new week',async()=>{
      const bad={...payload(),groceries:[{...payload().groceries[0],source:'invalid-source'}]};
      await assert.rejects(()=>asUser(other,()=>db.query('select mealz_save_week($1,$2,0,$3,$4::jsonb)',[otherHome,'2026-10-05',id(17),JSON.stringify(bad)])),codeError('23514'));
      assert.equal((await db.query('select count(*)::int n from weekly_plans where household_id=$1',[otherHome])).rows[0].n,0);
    });
    await t.test('prepared-cache cleanup failure rolls back rather than erasing either plan',async()=>{
      const idea=(await db.query("insert into weekly_plans(household_id,week_start,status) values($1,'2026-10-05','ideas') returning id",[home])).rows[0].id;
      await db.exec("create function block_ideas_delete() returns trigger language plpgsql as $$begin if old.status='ideas' then raise exception 'injected cleanup failure'; end if; return old; end$$; create trigger block_ideas_delete before delete on weekly_plans for each row execute function block_ideas_delete()");
      const before=(await db.query('select mealz_week_result($1,false) as result',[first.planId])).rows;
      const data={...payload(first.revision),groceries:shopping.reconcileGroceries(first.groceryItems,meals,{preserveIds:true})};
      await assert.rejects(()=>save(18,first.revision,data),/injected cleanup failure/);
      assert.deepEqual((await db.query('select mealz_week_result($1,false) as result',[first.planId])).rows,before);
      assert.equal((await db.query('select id from weekly_plans where id=$1',[idea])).rows.length,1);
      await db.exec('drop trigger block_ideas_delete on weekly_plans; drop function block_ideas_delete()');
    });
    await t.test('manual additions, household edits and deletion markers survive rebuilding',async()=>{
      const mutate=async(item,action,fields)=>{
        const result=await asUser(user,async()=> (await db.query('select mealz_mutate_grocery($1,$2,$3,$4,$5::jsonb) as result',[first.planId,item,first.revision,action,JSON.stringify(fields)])).rows[0].result);
        first.revision=result.revision;return result.item;
      };
      const manual=await mutate(null,'add',{name:'sparkling water',quantity:2,unit:'packs',category:'Other'});
      const rice=await mutate(first.groceryItems[0].id,'edit',{name:'rice for lunches',quantity:3,unit:'cups',category:'Pantry'});
      let prior=(await db.query('select * from grocery_items where weekly_plan_id=$1',[first.planId])).rows;
      first=await save(21,first.revision,{...payload(first.revision),groceries:shopping.reconcileGroceries(prior,meals,{preserveIds:true})});
      assert.equal(first.groceryItems.find(x=>x.id===manual.id).name,'sparkling water');
      assert.equal(first.groceryItems.find(x=>x.id===rice.id).quantity,3);
      assert.equal(first.groceryItems.find(x=>x.id===rice.id).name,'rice for lunches');
      await mutate(rice.id,'delete',{});
      prior=(await db.query('select * from grocery_items where weekly_plan_id=$1',[first.planId])).rows;
      first=await save(22,first.revision,{...payload(first.revision),groceries:shopping.reconcileGroceries(prior,meals,{preserveIds:true})});
      assert.ok(first.groceryItems.every(x=>x.id!==rice.id));
      assert.equal((await db.query('select deleted from grocery_items where id=$1',[rice.id])).rows[0].deleted,true);
      assert.equal(first.groceryItems.find(x=>x.id===manual.id).name,'sparkling water');
      assert.deepEqual(first.meals[0].ingredients,meals[0].ingredients);
    });
    await t.test('two queued writers with one revision yield one success and one conflict',async()=>{
      // PGlite serializes connections. This verifies stale-writer semantics;
      // real multi-session advisory-lock verification is a separate check.
      await asUser(user,async()=>{
        // Like the API, reconcile all stored rows, including hidden deletion markers.
        const prior=(await db.query('select * from grocery_items where weekly_plan_id=$1',[first.planId])).rows;
        const data={...payload(first.revision),groceries:shopping.reconcileGroceries(prior,meals,{preserveIds:true})};
        const query=key=>db.query('select mealz_save_week($1,$2,$3,$4,$5::jsonb) as result',[home,'2026-10-05',first.revision,id(key),JSON.stringify(data)]);
        const results=await Promise.allSettled([query(19),query(20)]);
        assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
        assert.equal(results.filter(x=>x.status==='rejected'&&x.reason.code==='PT409').length,1);
      });
    });
    await t.test('migration refuses duplicate active weeks without deleting them',async()=>{
      await db.exec('drop index weekly_plans_active_household_week_unique');
      await db.query("insert into weekly_plans(household_id,week_start,status) values($1,'2026-10-05','active')",[home]);
      const before=(await db.query("select id from weekly_plans where status='active'")).rows;
      await assert.rejects(()=>db.exec(adaptForPGlite(readFileSync(new URL('../migrations/'+migration,import.meta.url),'utf8'))),/Resolve duplicate/);
      await db.exec('rollback');
      assert.deepEqual((await db.query("select id from weekly_plans where status='active'")).rows,before);
    });
  }finally{await db.close()}
});

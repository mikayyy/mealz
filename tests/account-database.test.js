import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const userA='00000000-0000-4000-8000-000000000001';
const userB='00000000-0000-4000-8000-000000000002';
const userC='00000000-0000-4000-8000-000000000003';
const hashA='a'.repeat(64),hashB='b'.repeat(64),hashC='c'.repeat(64);
const sql=name=>readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8');

test('Postgres household security, transactions, and distributed rate limits',async t=>{
  const db=new PGlite();
  try{
    // Reproduce the pre-household schema and Supabase roles locally; never use
    // production credentials. gen_random_uuid is built into this Postgres.
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to authenticated,anon,service_role;
      insert into auth.users values ('${userA}'),('${userB}'),('${userC}');
      create table profiles(id uuid primary key default gen_random_uuid(),owner_user_id uuid,profile_key text);
      create table weekly_plans(id uuid primary key default gen_random_uuid(),owner_user_id uuid,week_start date);
      create table meals(id uuid primary key default gen_random_uuid(),weekly_plan_id uuid references weekly_plans(id));
      create table ingredients(id uuid primary key default gen_random_uuid(),meal_id uuid references meals(id));
      create table recipe_steps(id uuid primary key default gen_random_uuid(),meal_id uuid references meals(id));
      create table grocery_items(id uuid primary key default gen_random_uuid(),weekly_plan_id uuid references weekly_plans(id));
    `);
    await db.exec(sql('2026-09-15_households.sql').replace('create extension if not exists pgcrypto;',''));
    await db.exec(sql('2026-09-17_account_security.sql'));
    // Migration can be safely reapplied.
    await db.exec(sql('2026-09-17_account_security.sql'));
    async function manage(user,action,name,hash){
      await db.exec('set role service_role');
      try{return (await db.query('select mealz_manage_household($1,$2,$3,$4,$5) as result',[user,action,name,hash,'ABCD'])).rows[0].result}
      finally{await db.exec('reset role')}
    }
    const a=await manage(userA,'create','Family A',hashA);
    const b=await manage(userB,'create','Family B',hashB);
    const homeA=a.household.id,homeB=b.household.id;
    const ids={};
    for(const [suffix,home,user] of [['a',homeA,userA],['b',homeB,userB]]){
      ids[`profiles${suffix}`]=(await db.query("insert into profiles(owner_user_id,profile_key,household_id) values($1,'default',$2) returning id",[user,home])).rows[0].id;
      ids[`weekly_plans${suffix}`]=(await db.query("insert into weekly_plans(owner_user_id,week_start,household_id) values($1,'2026-09-21',$2) returning id",[user,home])).rows[0].id;
      ids[`meals${suffix}`]=(await db.query('insert into meals(weekly_plan_id) values($1) returning id',[ids[`weekly_plans${suffix}`]])).rows[0].id;
      for(const table of ['ingredients','recipe_steps','grocery_items']){
        const foreign=table==='grocery_items'?'weekly_plan_id':'meal_id';
        const parent=table==='grocery_items'?'weekly_plans':'meals';
        ids[table+suffix]=(await db.query(`insert into ${table}(${foreign}) values($1) returning id`,[ids[parent+suffix]])).rows[0].id;
      }
    }
    async function asUser(user,fn){
      await db.exec('set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
      try{return await fn()}finally{await db.exec('reset role')}
    }
    await t.test('reapplying the security migration preserves existing household data',async()=>{
      await db.exec(sql('2026-09-17_account_security.sql'));
      assert.equal((await db.query('select count(*)::int as n from profiles')).rows[0].n,2);
      assert.equal((await db.query('select count(*)::int as n from household_members')).rows[0].n,2);
      assert.equal((await manage(userA,'create','Duplicate',hashC)).status,409);
    });
    await t.test('separate households cannot read, update, delete, insert, or reparent each other’s data',async()=>{
      await asUser(userA,async()=>{
        for(const table of ['profiles','weekly_plans','meals','ingredients','recipe_steps','grocery_items']){
          const rows=(await db.query(`select id from ${table}`)).rows;
          assert.deepEqual(rows.map(x=>x.id),[ids[table+'a']],table);
          assert.equal((await db.query(`update ${table} set id=id where id=$1 returning id`,[ids[table+'b']])).rows.length,0,table);
          assert.equal((await db.query(`delete from ${table} where id=$1 returning id`,[ids[table+'b']])).rows.length,0,table);
          const foreign=['profiles','weekly_plans'].includes(table)?'household_id':table==='meals'||table==='grocery_items'?'weekly_plan_id':'meal_id';
          const other=foreign==='household_id'?homeB:foreign==='weekly_plan_id'?ids.weekly_plansb:ids.mealsb;
          await assert.rejects(db.query(`insert into ${table}(${foreign}) values($1)`,[other]),/row-level security/);
          await assert.rejects(db.query(`update ${table} set ${foreign}=$1 where id=$2`,[other,ids[table+'a']]),/row-level security/);
        }
      });
    });
    await t.test('membership and invitations cannot be forged through browser database access',async()=>{
      await asUser(userA,async()=>{
        await assert.rejects(db.query('insert into household_members(household_id,user_id,role) values($1,$2,\'owner\')',[homeB,userC]),/permission denied/);
        await assert.rejects(db.query('update households set join_code_hash=$1 where id=$2',[hashC,homeA]),/permission denied/);
        await assert.rejects(db.query('select join_code_hash from households'),/permission denied/);
        await assert.rejects(db.query('select mealz_manage_household($1,\'join\',null,$2,null)',[userA,hashB]),/permission denied/);
        await assert.rejects(db.query("select mealz_take_rate_limit('test',1,60)"),/permission denied/);
      });
      await db.exec('set role anon');
      await assert.rejects(db.query('select * from profiles'),/permission denied/);
      await db.exec('reset role');
    });
    await t.test('joining shares data, cannot double-join, and only owners rotate codes',async()=>{
      assert.equal((await manage(userC,'join',null,hashC)).status,404);
      assert.equal((await manage(userC,'join',null,hashA)).household.id,homeA);
      assert.equal((await manage(userC,'join',null,hashB)).status,409);
      assert.equal((await manage(userC,'rotate',null,hashC)).status,403);
      await asUser(userC,async()=>assert.deepEqual((await db.query('select id from weekly_plans')).rows.map(x=>x.id),[ids.weekly_plansa]));
      assert.equal((await manage(userA,'rotate',null,hashC)).household.id,homeA);
      assert.equal((await db.query('select count(*)::int as n from households where join_code_hash=$1',[hashA])).rows[0].n,0);
    });
    await t.test('failed household creation leaves no orphan household',async()=>{
      await assert.rejects(manage('00000000-0000-4000-8000-000000000099','create','Missing user',hashA),/foreign key/);
      assert.equal((await db.query('select count(*)::int as n from households')).rows[0].n,2);
    });
    await t.test('rate limits persist across calls and reset after their window',async()=>{
      await db.exec('set role service_role');
      const take=async key=>(await db.query('select mealz_take_rate_limit($1,2,60) as r',[key])).rows[0].r;
      assert.equal((await take('join:a')).allowed,true);
      assert.equal((await take('join:a')).allowed,true);
      const denied=await take('join:a');assert.equal(denied.allowed,false);assert.ok(denied.retry_after>0);
      assert.equal((await take('join:b')).allowed,true);
      await db.exec('reset role');
      await db.exec("update mealz_rate_limits set window_start=now()-interval '2 minutes'");
      await db.exec('set role service_role');assert.equal((await take('join:a')).allowed,true);await db.exec('reset role');
    });
  }finally{await db.close()}
});

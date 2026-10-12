// Optional local verification using an isolated, temporary Postgres cluster.
// Install embedded-postgres in a tools directory and set MEALZ_PG_TOOLS.
// Run with node --import tsx for the real plan API integration below.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdtempSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:net';
import {BOOTSTRAP_SQL} from '../migrations/pglite-fixture.js';
import {MIGRATIONS} from '../migrations/manifest.js';
import shopping from '../shopping-logic.js';

if(!process.env.MEALZ_PG_TOOLS)throw new Error('Set MEALZ_PG_TOOLS to the isolated directory containing embedded-postgres.');
const require=createRequire(join(resolve(process.env.MEALZ_PG_TOOLS),'package.json'));
const {default:EmbeddedPostgres}=await import(pathToFileURL(require.resolve('embedded-postgres')).href);
const reservation=createServer();
await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
const port=reservation.address().port;
await new Promise(resolve=>reservation.close(resolve));
const databaseDir=mkdtempSync(join(tmpdir(),'mealz-concurrency-'));
// Keep the disposable files for inspection. Do not perform computed-path deletion.
const server=new EmbeddedPostgres({databaseDir,port,user:'postgres',password:randomBytes(24).toString('hex'),persistent:true,postgresFlags:['-h','127.0.0.1'],onLog(){},onError(){}});
const clients=[];
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
try{
  await server.initialise();await server.start();
  const admin=server.getPgClient('postgres','127.0.0.1');clients.push(admin);await admin.connect();
  await admin.query(BOOTSTRAP_SQL);
  const candidateMigration=MIGRATIONS.at(-1);
  for(const migration of MIGRATIONS.slice(0,-1))await admin.query(readFileSync(new URL('../migrations/'+migration,import.meta.url),'utf8'));
  await admin.query('insert into auth.users(id) values($1),($2)',[id(1),id(3)]);
  await admin.query('insert into households(id,name,created_by) values($1,$2,$3)',[id(2),'Concurrency fixture',id(1)]);
  await admin.query("insert into household_members(household_id,user_id,role) values($1,$2,'owner')",[id(2),id(1)]);
  await admin.query("insert into household_members(household_id,user_id,role) values($1,$2,'member')",[id(2),id(3)]);
  // Upgrade a populated v0.22 fixture, rather than only a blank installation.
  await admin.query("insert into weekly_plans(id,household_id,week_start,status) values($1,$2,'2026-09-28','active')",[id(90),id(2)]);
  await admin.query("insert into meals(id,weekly_plan_id,meal_key,day,title,servings) values($1,$2,'legacy','Monday','Existing dinner',4)",[id(91),id(90)]);
  await admin.query("insert into recipe_steps(meal_id,step_number,instruction) values($1,1,'Preserve this recipe.')",[id(91)]);
  await admin.query("insert into grocery_items(id,weekly_plan_id,name,category,source,checked,needed_this_week) values($1,$2,'rice','Pantry','manual',true,true)",[id(92),id(90)]);
  const oldRows=(await admin.query('select * from grocery_items where id=$1',[id(92)])).rows;
  const migrationSql=readFileSync(new URL('../migrations/'+candidateMigration,import.meta.url),'utf8');
  await admin.query(migrationSql);
  const upgraded=(await admin.query('select mealz_week_result($1,false) as result',[id(90)])).rows[0].result;
  assert.equal(upgraded.meals[0].title,'Existing dinner');
  assert.deepEqual(upgraded.meals[0].steps,['Preserve this recipe.']);
  assert.deepEqual((await admin.query('select * from grocery_items where id=$1',[id(92)])).rows,oldRows);
  await admin.query(migrationSql);
  assert.deepEqual((await admin.query('select mealz_week_result($1,false) as result',[id(90)])).rows[0].result,upgraded);
  for(let i=0;i<2;i++){
    const client=server.getPgClient('postgres','127.0.0.1');clients.push(client);await client.connect();
    await client.query('set role authenticated');await client.query("select set_config('request.jwt.claim.sub',$1,false)",[id(i===0?1:3)]);
    await client.query("set statement_timeout='10s'");
  }
  const [a,b]=clients.slice(1);
  const meals=[{id:'dinner',day:'Monday',title:'Rice bowl',servings:4,total_minutes:20,tags:[],ingredients:[{name:'rice',quantity:1,unit:'cup',category:'Pantry'}],steps:['Cook rice.']}];
  const payload=revision=>({householdSize:4,days:['Monday'],equipment:[],useUp:'',notes:'',meals,groceries:shopping.reconcileGroceries([],meals,{preserveIds:true}),snapshot_revision:revision});
  const save=(client,key,revision,data=payload(revision))=>client.query('select mealz_save_week($1,$2,$3,$4,$5::jsonb) as result',[id(2),'2026-10-05',revision,id(key),JSON.stringify(data)]);
  // Hold writer A's transaction open so B must wait on the actual advisory lock.
  await a.query('begin');
  const first=(await save(a,10,0)).rows[0].result;
  let settled=false;
  const second=save(b,11,0).then(value=>{settled=true;return {value}},error=>{settled=true;return {error}});
  // Confirm waiting from pg_stat_activity, rather than relying on a fixed sleep.
  let waiting=false;
  for(let i=0;i<100&&!waiting;i++){
    const {rows}=await admin.query("select wait_event_type,wait_event from pg_stat_activity where pid=$1",[b.processID]);
    waiting=rows[0]?.wait_event_type==='Lock'&&rows[0]?.wait_event==='advisory';
    if(!waiting)await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.equal(waiting,true,'writer B did not wait on the household/week advisory lock');
  assert.equal(settled,false);
  await a.query('commit');
  assert.equal((await second).error?.code,'PT409');
  assert.equal((await admin.query("select count(*)::int n from weekly_plans where status='active' and week_start='2026-10-05'")).rows[0].n,1);
  const replay=(await save(a,10,0)).rows[0].result;
  assert.equal(replay.replayed,true);assert.equal(replay.planId,first.planId);

  // Shopping and rebuilding use the same lock and revision boundary.
  await a.query('begin');
  const edited=(await a.query('select mealz_mutate_grocery($1,$2,$3,$4,$5::jsonb) as result',[first.planId,first.groceryItems[0].id,first.revision,'toggle',JSON.stringify({checked:true})])).rows[0].result;
  const stale=save(b,12,first.revision).then(value=>({value}),error=>({error}));
  await a.query('commit');
  assert.equal((await stale).error?.code,'PT409');
  const current=(await admin.query('select mealz_week_result($1,false) as result',[first.planId])).rows[0].result;
  assert.equal(current.groceryItems[0].checked,true);assert.equal(current.revision,edited.revision);
  const {verifyLocalPlanApi}=await import('./verify-local-plan-api.mjs');
  const apiChecks=await verifyLocalPlanApi({admin,member:a,secondMember:b,id});
  console.log(JSON.stringify({postgres:(await admin.query('show server_version')).rows[0].server_version,checks:['populated v0.22 upgrade preserves recipes and groceries','migration reapplication preserves data and revisions','real advisory-lock waiting','concurrent first-save conflict','one authoritative active week','idempotent replay','grocery/rebuild conflict preserves check',...apiChecks],result:'passed',databaseDir}));
}finally{
  await Promise.allSettled(clients.map(client=>client.end()));
  await server.stop();
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {makeDb,adaptForPGlite} from '../migrations/pglite-fixture.js';
import {MIGRATIONS} from '../migrations/manifest.js';

const require=createRequire(import.meta.url);
const {cleanGroceryName,grocerySourceKey,consolidateGroceries}=require('../shopping-logic.js');
const migration='20260924161500_sundry_intent_v0220.sql';
const sql=name=>adaptForPGlite(readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

test('sundry migration backfills only missing active generated source keys and preserves edits',async()=>{
  const db=await makeDb();
  try{
    for(const name of MIGRATIONS.slice(0,-1))await db.exec(sql(name));
    await db.query('insert into auth.users(id) values ($1)',[id(1)]);
    await db.query('insert into households(id,name,created_by) values ($1,$2,$3)',[id(2),'Home',id(1)]);
    for(const [number,status] of [[3,'active'],[4,'active'],[5,'ideas']]){
      await db.query('insert into weekly_plans(id,household_id,week_start,status) values ($1,$2,$3,$4)',[id(number),id(2),'2026-09-21',status]);
      await db.query('insert into meals(id,weekly_plan_id) values ($1,$2)',[id(Number(number)+10),id(number)]);
    }
    await db.query('insert into meals(id,weekly_plan_id) values ($1,$2)',[id(16),id(3)]);
    /** @type {Array<[number,string,number|null,string|null,import('../types.js').GroceryCategory,boolean]>} */
    const ingredients=[
      [13,'Freshly ground black pepper (to taste)',1,'teaspoon','Pantry',false],
      [13,'ground black pepper, for serving',2,'tsp.','Other',false],
      [16,'ground black pepper',1,'tsp','Pantry',false],
      [13,'sea salt',1,'tbsp','Pantry',false],
      [13,'sea salt',2,'tsp','Pantry',false],
      [13,'table salt',null,null,'Pantry',false],
      [13,'table salt',1,null,'Pantry',false],
      [13,'kosher salt',3,'pinches','Pantry',false],
      [13,'Salt',2,'oz','Pantry',false],
      [13,'salt',8,'oz','Pantry',false],
      [13,'salt',1.005,'tsp','Pantry',false],
      [13,'black pepper',2,'each','Pantry',false],
      [13,'pepper',1,null,'Pantry',false],
      [13,'pepper',null,'tsp','Pantry',false],
      [13,'pepper',1,'tsp','Pantry',true],
      [13,'beans',4,'cup','Pantry',false],
      [14,'salt',2,'tbsp','Pantry',false],
      [14,'pepper',1,'tsp','Pantry',false],
      [14,'sea salt',3,'tsp','Pantry',false],
      [14,'kosher salt',1,'tsp','Pantry',false],
      [14,'ground black pepper',1,'cup','Pantry',false],
      [15,'salt',5,'tsp','Pantry',false]
    ];
    for(const [index,[meal,name,quantity,unit,category,optional]] of ingredients.entries()){
      await db.query(`insert into ingredients(id,meal_id,name,quantity,unit,category,optional)
        values($1,$2,$3,$4,$5,$6,$7)`,[id(100+index),id(meal),name,quantity,unit,category,optional]);
    }
    const existing=[
      [4,'salt','salt::volume','generated',false,true,true,1,'tsp'],
      [4,'pepper','pepper::volume','generated',true,true,true,1,'tsp'],
      [4,'sea salt',null,'generated',true,false,false,3,'tsp'],
      [4,'kosher salt','kosher salt::volume','manual',false,true,true,8,'tsp']
    ];
    for(const [index,[plan,name,key,source,deleted,checked,modified,quantity,unit]] of existing.entries()){
      await db.query(`insert into grocery_items(id,weekly_plan_id,name,source_key,source,deleted,checked,user_modified,quantity,unit)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id(200+index),id(plan),name,key,source,deleted,checked,modified,quantity,unit]);
    }
    await db.exec(sql(migration));
    await db.exec(sql(migration));
    const {rows}=await db.query(`select weekly_plan_id,name,quantity,unit,category,source,source_key,needed_this_week,
      deleted,checked,user_modified from grocery_items order by weekly_plan_id,source_key nulls first,id`);
    assert.ok(rows.every(row=>row.needed_this_week===false));
    const byKey=new Map(rows.filter(row=>row.weekly_plan_id===id(3)).map(row=>[row.source_key,row]));
    assert.equal(byKey.size,9);
    const expected=consolidateGroceries([{ingredients:ingredients.filter(row=>row[0]===13||row[0]===16)
      .map(([,name,quantity,unit,category,optional])=>({name,quantity,unit,category,optional}))}]);
    for(const item of expected.filter(item=>byKey.has(item.source_key))){
      const actual=byKey.get(item.source_key);
      assert.deepEqual({name:actual.name,quantity:actual.quantity===null?null:Number(actual.quantity),unit:actual.unit,
        category:actual.category,source_key:actual.source_key},item);
    }
    for(const row of byKey.values()){
      assert.equal(row.source_key,grocerySourceKey({name:row.name,unit:row.unit}));
      assert.equal(row.needed_this_week,false);
      assert.equal(row.checked,false);
      assert.equal(row.deleted,false);
      assert.equal(row.user_modified,false);
    }
    assert.deepEqual([Number(byKey.get('ground black pepper::volume').quantity),byKey.get('ground black pepper::volume').unit],[1.33,'tbsp']);
    assert.deepEqual([Number(byKey.get('sea salt::volume').quantity),byKey.get('sea salt::volume').unit],[1.67,'tbsp']);
    assert.deepEqual([byKey.get('table salt::unspecified').quantity,byKey.get('table salt::unspecified').unit],[null,null]);
    assert.deepEqual([byKey.get('pepper::volume').quantity,byKey.get('pepper::volume').unit],[null,'volume']);
    assert.deepEqual([Number(byKey.get('salt::weight').quantity),byKey.get('salt::weight').unit],[10,'oz']);
    assert.deepEqual([Number(byKey.get('salt::volume').quantity),byKey.get('salt::volume').unit],[Math.round(1.005*100)/100,'tsp']);
    assert.deepEqual([Number(byKey.get('black pepper::count').quantity),byKey.get('black pepper::count').unit],[2,'whole']);
    assert.deepEqual([Number(byKey.get('kosher salt::pinches').quantity),byKey.get('kosher salt::pinches').unit],[3,'pinches']);
    assert.equal(byKey.get('ground black pepper::volume').category,'Pantry');
    assert.equal(rows.filter(row=>row.weekly_plan_id===id(4)&&row.source==='generated').length,5);
    assert.equal(rows.filter(row=>row.weekly_plan_id===id(4)&&row.source==='manual').length,1);
    assert.equal(rows.filter(row=>row.weekly_plan_id===id(5)).length,0);
    assert.equal(rows.find(row=>row.weekly_plan_id===id(4)&&row.source_key==='salt::volume').deleted,false);
    assert.equal(rows.find(row=>row.weekly_plan_id===id(4)&&row.source_key==='salt::volume').checked,true);
    assert.equal(rows.find(row=>row.weekly_plan_id===id(4)&&row.source_key==='pepper::volume').deleted,true);
    assert.equal(rows.find(row=>row.weekly_plan_id===id(4)&&row.source_key===null).deleted,true);
    assert.equal(rows.find(row=>row.weekly_plan_id===id(4)&&row.source_key==='kosher salt::volume').source,'manual');
    assert.equal(rows.length,15);
    const original=await db.query('select name from ingredients order by id');
    assert.deepEqual(original.rows.map(row=>row.name),ingredients.map(row=>row[1]));
    assert.equal(cleanGroceryName(ingredients[0][1]),'ground black pepper');
  }finally{await db.close()}
});

test('purchase intent writes remain scoped to the selected plan and authenticated household',async()=>{
  const db=await makeDb();
  try{
    for(const name of MIGRATIONS)await db.exec(sql(name));
    await db.query('insert into auth.users(id) values ($1),($2)',[id(1),id(2)]);
    await db.query('insert into households(id,name,created_by) values ($1,$2,$3),($4,$5,$6)',[id(3),'Home A',id(1),id(4),'Home B',id(2)]);
    await db.query("insert into household_members(household_id,user_id,role) values ($1,$2,'owner'),($3,$4,'owner')",[id(3),id(1),id(4),id(2)]);
    /** @type {Array<[number,number,string]>} */
    const plans=[[5,3,'2026-09-21'],[6,3,'2026-09-28'],[7,4,'2026-09-21']];
    for(const [plan,home,week] of plans){
      await db.query("insert into weekly_plans(id,household_id,week_start,status) values($1,$2,$3,'active')",[id(plan),id(home),week]);
      await db.query("insert into grocery_items(id,weekly_plan_id,name,checked) values($1,$2,'rice',true)",[id(plan+10),id(plan)]);
    }
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(1)]);
    const update=(item,plan,needed)=>db.query(`update grocery_items set needed_this_week=$1,checked=case when $1 then checked else false end
      where id=$2 and weekly_plan_id=$3 and deleted=false returning needed_this_week,checked`,[needed,id(item),id(plan)]);
    assert.deepEqual((await update(15,5,true)).rows,[{needed_this_week:true,checked:true}]);
    assert.deepEqual((await update(15,6,false)).rows,[]);
    assert.deepEqual((await update(17,7,true)).rows,[]);
    assert.deepEqual((await update(15,5,false)).rows,[{needed_this_week:false,checked:false}]);
    assert.deepEqual((await update(16,6,true)).rows,[{needed_this_week:true,checked:true}]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(2)]);
    assert.deepEqual((await update(15,5,true)).rows,[]);
    assert.deepEqual((await update(17,7,true)).rows,[{needed_this_week:true,checked:true}]);
  }finally{await db.close()}
});

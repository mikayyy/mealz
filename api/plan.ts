import {dataDb,enc,supabaseConfigured} from './_lib/supabase.js';
import {startTelemetry} from './_lib/telemetry.js';
import {requireUser,respondAuthError} from './_lib/auth.js';
import shopping from '../shopping-logic.js';
const GROCERY_CATEGORIES=new Set(['Produce','Meat & Seafood','Dairy & Eggs','Frozen','Bakery','Pantry','Other']);
const boundedText=(value,label,{required=false,max=120}={})=>{const text=String(value??'').trim();if(required&&!text)throw new Error(`${label} is required.`);if(text.length>max)throw new Error(`${label} is too long.`);return text};
const groceryQuantity=value=>{if(value===null||value===undefined||value==='')return null;const number=Number(value);if(!Number.isFinite(number)||number<0||number>100000)throw new Error('Quantity must be a positive number.');return number};
const groceryFields=body=>{const category=boundedText(body.category,'Category',{required:true,max:40});if(!GROCERY_CATEGORIES.has(category))throw new Error('Choose a valid grocery category.');return {name:boundedText(body.name,'Item name',{required:true}),quantity:groceryQuantity(body.quantity),unit:boundedText(body.unit,'Unit',{max:40})||null,category}};
async function readPlan(weekStart,db){let q='weekly_plans?select=*&status=eq.active&order=week_start.desc,created_at.desc&limit=1';if(weekStart)q=`weekly_plans?select=*&status=eq.active&week_start=eq.${enc(weekStart)}&order=created_at.desc&limit=1`;const plans=await db(q);if(!plans?.length)return null;const plan=plans[0],meals=await db(`meals?select=*&weekly_plan_id=eq.${enc(plan.id)}&order=sort_order.asc`);const ids=meals.map(m=>m.id);let ingredients=[],steps=[];if(ids.length){const list=`(${ids.join(',')})`;[ingredients,steps]=await Promise.all([db(`ingredients?select=*&meal_id=in.${enc(list)}`),db(`recipe_steps?select=*&meal_id=in.${enc(list)}&order=step_number.asc`)])}const groceryItems=await db(`grocery_items?select=*&weekly_plan_id=eq.${enc(plan.id)}&deleted=eq.false&order=category.asc,name.asc`);const hydrated=meals.map(m=>({...m,id:m.meal_key||m.id,ingredients:ingredients.filter(i=>i.meal_id===m.id).map(i=>({name:i.name,quantity:i.quantity==null?null:Number(i.quantity),unit:i.unit,category:i.category,optional:i.optional})),steps:steps.filter(x=>x.meal_id===m.id).sort((a,b)=>a.step_number-b.step_number).map(x=>x.instruction)}));return {plan,meals:hydrated,groceryItems}}
async function savePlan(body,{db,owned,userId,household=false,householdId=null}){
  const {weekStart,householdSize,days,equipment,useUp,notes,meals}=body;
  if(!weekStart||!Array.isArray(meals)||!meals.length)throw new Error('Missing week or meals.');
  if(household&&!householdId)throw new Error('Your account is not linked to a household yet.');
  const priorPlans=await db(`weekly_plans?select=id&week_start=eq.${enc(weekStart)}&status=eq.active&order=created_at.desc`);
  let priorGroceries=[];
  if(priorPlans?.length)priorGroceries=await db(`grocery_items?select=*&weekly_plan_id=eq.${enc(priorPlans[0].id)}&order=created_at.asc`);
  let newPlanId=null;
  try{
    const planRow: Record<string, any>={week_start:weekStart,household_size:householdSize||5,cooking_days:days||[],equipment:equipment||[],use_up:useUp||null,notes:notes||null,status:'active'};
    if(household&&householdId){planRow.household_id=householdId;if(userId)planRow.owner_user_id=userId}
    else if(owned&&userId)planRow.owner_user_id=userId;
    const plans=await db('weekly_plans',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([planRow])});
    const plan=plans[0];newPlanId=plan.id;
    const mealRows=(meals||[]).map((m,i)=>({weekly_plan_id:plan.id,meal_key:m.id||`meal-${i+1}`,day:m.day||'',title:m.title||'Untitled meal',description:m.description||null,emoji:m.emoji||null,servings:m.servings||householdSize||5,total_minutes:m.total_minutes||null,difficulty:m.difficulty||null,tags:m.tags||[],kid_note:m.kid_note||null,sort_order:i}));
    const savedMeals=await db('meals',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(mealRows)});
    const ing=[],stepRows=[];
    savedMeals.forEach((row,i)=>{const src=meals[i];for(const x of src.ingredients||[])ing.push({meal_id:row.id,name:x.name,quantity:typeof x.quantity==='number'?x.quantity:null,unit:x.unit||null,category:x.category||'Other',optional:!!x.optional});(src.steps||[]).forEach((instruction,j)=>stepRows.push({meal_id:row.id,step_number:j+1,instruction}))});
    const groceries=shopping.reconcileGroceries(priorGroceries,meals).map(i=>({...i,weekly_plan_id:plan.id,updated_at:new Date().toISOString()}));
    const jobs=[];
    if(ing.length)jobs.push(db('ingredients',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(ing)}));
    if(stepRows.length)jobs.push(db('recipe_steps',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(stepRows)}));
    let groceryPromise=Promise.resolve([]);if(groceries.length){groceryPromise=db('grocery_items',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(groceries)});jobs.push(groceryPromise)}
    await Promise.all(jobs);const groceryItems=await groceryPromise;
    const oldIds=(priorPlans||[]).map(x=>x.id).filter(id=>id&&id!==plan.id);if(oldIds.length){const list=`(${oldIds.join(',')})`;await db(`weekly_plans?id=in.${enc(list)}`,{method:'DELETE',headers:{Prefer:'return=minimal'}})}
    await db(`weekly_plans?week_start=eq.${enc(weekStart)}&status=eq.ideas`,{method:'DELETE',headers:{Prefer:'return=minimal'}});
    return {planId:plan.id,groceryItems};
  }catch(error){if(newPlanId){try{await db(`weekly_plans?id=eq.${enc(newPlanId)}`,{method:'DELETE',headers:{Prefer:'return=minimal'}})}catch{}}throw error}
}
async function updateGrocery(body,db){
  const {planId,itemId}=body;if(typeof planId!=='string'||!planId.trim()||typeof itemId!=='string'||!itemId.trim())throw new Error('Missing grocery item information.');
  if(body.action==='set_needed'&&typeof body.needed!=='boolean')throw new Error('Needed must be true or false.');
  const changes=body.action==='set_needed'
    ?{needed_this_week:body.needed,...(body.needed?{}:{checked:false}),updated_at:new Date().toISOString()}
    :body.action==='toggle'?{checked:!!body.checked,updated_at:new Date().toISOString()}
    :{...groceryFields(body),user_modified:true,deleted:false,updated_at:new Date().toISOString()};
  const rows=await db(`grocery_items?id=eq.${enc(itemId)}&weekly_plan_id=eq.${enc(planId)}&deleted=eq.false`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(changes)});
  if(!rows?.length)throw new Error('Grocery item was not found.');return {item:rows[0]};
}
async function addGrocery(body,db){
  const {planId}=body;if(!planId)throw new Error('Missing weekly plan information.');
  const fields=groceryFields(body);
  const rows=await db('grocery_items',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([{...fields,weekly_plan_id:planId,checked:false,needed_this_week:shopping.isSundry(fields.name),source:'manual',source_key:null,user_modified:true,deleted:false}])});
  return {item:rows[0]};
}
async function deleteGrocery(body,db){
  const {planId,itemId}=body;if(!planId||!itemId)throw new Error('Missing grocery item information.');
  const rows=await db(`grocery_items?id=eq.${enc(itemId)}&weekly_plan_id=eq.${enc(planId)}&deleted=eq.false`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({deleted:true,updated_at:new Date().toISOString()})});
  if(!rows?.length)throw new Error('Grocery item was not found.');return {ok:true};
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const telemetry=startTelemetry('plan',{method:req.method});
  if(!supabaseConfigured()){telemetry.finish(500,{reason:'supabase_not_configured'});return res.status(500).json({error:'Supabase is not configured. Add SUPABASE_URL and SUPABASE_SECRET_KEY in Vercel, then redeploy.'})}
  try{
    const auth=await requireUser(req);telemetry.event('auth',{mode:auth.mode});
    const {db,owned,household,householdId,householdRole}=await dataDb(auth);telemetry.event('data_scope',{owned,household,household_role:householdRole||null});
    if(req.method==='GET'){
      const weekStart=req.query?.week_start||null;if(!weekStart)telemetry.event('implicit_week_lookup',{note:'legacy compatibility fallback'});
      const data=await readPlan(weekStart,db);telemetry.finish(200,{week_start:weekStart||data?.plan?.week_start||null,explicit_week:!!weekStart,owned,household});return res.status(200).json(data||{plan:null,meals:[],groceryItems:[]});
    }
    if(req.method==='POST'){const result=await savePlan(req.body||{},{db,owned,userId:auth.id,household,householdId});telemetry.finish(200,{week_start:req.body?.weekStart||null,meal_count:req.body?.meals?.length||0,replace_strategy:'create_then_swap',owned,household});return res.status(200).json(result)}
    if(req.method==='PATCH'){const result=await updateGrocery(req.body||{},db);telemetry.finish(200,{operation:req.body?.action==='toggle'?'grocery_checked':req.body?.action==='set_needed'?'grocery_needed':'grocery_updated',owned,household});return res.status(200).json(result)}
    if(req.method==='PUT'){const result=await addGrocery(req.body||{},db);telemetry.finish(201,{operation:'grocery_added',owned,household});return res.status(201).json(result)}
    if(req.method==='DELETE'){const result=await deleteGrocery(req.body||{},db);telemetry.finish(200,{operation:'grocery_deleted',owned,household});return res.status(200).json(result)}
    telemetry.finish(405);return res.status(405).json({error:'Method not allowed'});
  }catch(e){
    if(respondAuthError(res,e)){telemetry.finish(e.status||401,{reason:'auth'});return}
    telemetry.fail(e);return res.status(500).json({error:e.message||'mealz could not sync with Supabase.'});
  }
}

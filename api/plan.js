import {dataDb,enc,supabaseConfigured} from './_lib/supabase.js';
import {startTelemetry} from './_lib/telemetry.js';
import {requireUser,respondAuthError} from './_lib/auth.js';

const groceryKey=i=>`${i.category||'Other'}::${String(i.name).toLowerCase()}::${i.unit||''}`;
function groceryData(meals){const map=new Map;for(const m of meals||[])for(const i of m.ingredients||[]){if(i.optional)continue;const category=i.category||'Other',unit=i.unit||'',key=`${category}::${String(i.name).toLowerCase()}::${unit}`,e=map.get(key);if(e&&typeof i.quantity==='number'&&typeof e.quantity==='number')e.quantity+=i.quantity;else if(!e)map.set(key,{name:i.name,quantity:typeof i.quantity==='number'?i.quantity:null,unit:i.unit||null,category})}return [...map.values()]}
async function readPlan(weekStart,db){let q='weekly_plans?select=*&status=eq.active&order=week_start.desc,created_at.desc&limit=1';if(weekStart)q=`weekly_plans?select=*&status=eq.active&week_start=eq.${enc(weekStart)}&order=created_at.desc&limit=1`;const plans=await db(q);if(!plans?.length)return null;const plan=plans[0],meals=await db(`meals?select=*&weekly_plan_id=eq.${enc(plan.id)}&order=sort_order.asc`);const ids=meals.map(m=>m.id);let ingredients=[],steps=[];if(ids.length){const list=`(${ids.join(',')})`;[ingredients,steps]=await Promise.all([db(`ingredients?select=*&meal_id=in.${enc(list)}`),db(`recipe_steps?select=*&meal_id=in.${enc(list)}&order=step_number.asc`)])}const groceryItems=await db(`grocery_items?select=*&weekly_plan_id=eq.${enc(plan.id)}&order=category.asc,name.asc`);const hydrated=meals.map(m=>({...m,id:m.meal_key||m.id,ingredients:ingredients.filter(i=>i.meal_id===m.id).map(i=>({name:i.name,quantity:i.quantity==null?null:Number(i.quantity),unit:i.unit,category:i.category,optional:i.optional})),steps:steps.filter(x=>x.meal_id===m.id).sort((a,b)=>a.step_number-b.step_number).map(x=>x.instruction)}));return {plan,meals:hydrated,groceryItems}}
async function savePlan(body,{db,owned,userId,household=false,householdId=null}){
  const {weekStart,householdSize,days,equipment,useUp,notes,meals}=body;
  if(!weekStart||!Array.isArray(meals)||!meals.length)throw new Error('Missing week or meals.');
  if(household&&!householdId)throw new Error('Your account is not linked to a household yet.');
  const priorPlans=await db(`weekly_plans?select=id&week_start=eq.${enc(weekStart)}&status=eq.active&order=created_at.desc`);
  const checkedMap=new Map();
  if(priorPlans?.length){const lists=await Promise.all(priorPlans.map(prior=>db(`grocery_items?select=name,unit,category,checked&weekly_plan_id=eq.${enc(prior.id)}`)));for(const priorGroceries of lists)for(const item of priorGroceries||[])if(item.checked)checkedMap.set(groceryKey(item),true)}
  let newPlanId=null;
  try{
    const planRow={week_start:weekStart,household_size:householdSize||5,cooking_days:days||[],equipment:equipment||[],use_up:useUp||null,notes:notes||null,status:'active'};
    if(household&&householdId){planRow.household_id=householdId;if(userId)planRow.owner_user_id=userId}
    else if(owned&&userId)planRow.owner_user_id=userId;
    const plans=await db('weekly_plans',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([planRow])});
    const plan=plans[0];newPlanId=plan.id;
    const mealRows=(meals||[]).map((m,i)=>({weekly_plan_id:plan.id,meal_key:m.id||`meal-${i+1}`,day:m.day||'',title:m.title||'Untitled meal',description:m.description||null,emoji:m.emoji||null,servings:m.servings||householdSize||5,total_minutes:m.total_minutes||null,difficulty:m.difficulty||null,tags:m.tags||[],kid_note:m.kid_note||null,sort_order:i}));
    const savedMeals=await db('meals',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(mealRows)});
    const ing=[],stepRows=[];
    savedMeals.forEach((row,i)=>{const src=meals[i];for(const x of src.ingredients||[])ing.push({meal_id:row.id,name:x.name,quantity:typeof x.quantity==='number'?x.quantity:null,unit:x.unit||null,category:x.category||'Other',optional:!!x.optional});(src.steps||[]).forEach((instruction,j)=>stepRows.push({meal_id:row.id,step_number:j+1,instruction}))});
    const groceries=groceryData(meals).map(i=>({...i,weekly_plan_id:plan.id,checked:checkedMap.get(groceryKey(i))===true}));
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
async function updateGrocery(body,db){const {planId,name,unit,category,checked}=body;if(!planId||!name)throw new Error('Missing grocery item information.');const parts=[`weekly_plan_id=eq.${enc(planId)}`,`name=eq.${enc(name)}`,`category=eq.${enc(category||'Other')}`,unit?`unit=eq.${enc(unit)}`:'unit=is.null'];await db(`grocery_items?${parts.join('&')}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({checked:!!checked})});return {ok:true}}

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
    if(req.method==='PATCH'){const result=await updateGrocery(req.body||{},db);telemetry.finish(200,{operation:'grocery_checked',owned,household});return res.status(200).json(result)}
    telemetry.finish(405);return res.status(405).json({error:'Method not allowed'});
  }catch(e){
    if(respondAuthError(res,e)){telemetry.finish(e.status||401,{reason:'auth'});return}
    telemetry.fail(e);return res.status(500).json({error:e.message||'mealz could not sync with Supabase.'});
  }
}

import shopping from '../../shopping-logic.js';
import {enc} from './supabase.js';
import {validCookingDays} from './validation.js';
import type {GroceryCategory} from '../../types.js';

export class PlanRequestError extends Error{
  status=400;
}
const text=(value: unknown,label: string,max: number,required=false)=>{
  if(value!=null&&typeof value!=='string')throw new PlanRequestError(`${label} must be text.`);
  const result=String(value??'').trim();
  if(result.length>max||(required&&!result))throw new PlanRequestError(`${label} is invalid.`);
  return result;
};
const number=(value: unknown,label: string,max: number,min=0)=>{
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new PlanRequestError(`${label} is invalid.`);
  return value;
};
const integer=(value: unknown,label: string,max: number,min=0)=>{
  const result=number(value,label,max,min);
  if(!Number.isInteger(result))throw new PlanRequestError(`${label} must be a whole number.`);
  return result;
};
const list=(value: unknown,label: string,max: number)=>{
  if(!Array.isArray(value)||value.length>max)throw new PlanRequestError(`${label} is invalid.`);
  return value;
};
const categories=new Set(['Produce','Meat & Seafood','Dairy & Eggs','Frozen','Bakery','Pantry','Other']);

export function validateSave(body: any){
  const weekStart=text(body.weekStart,'Week',10,true);
  const date=new Date(`${weekStart}T00:00:00Z`);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==weekStart||date.getUTCDay()!==1)throw new PlanRequestError('Choose a valid Monday week.');
  if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)throw new PlanRequestError('Reload the saved week before saving.');
  if(typeof body.requestKey!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.requestKey))throw new PlanRequestError('A valid save retry key is required.');
  const householdSize=number(body.householdSize,'Household size',40,1);
  if(!Number.isInteger(householdSize)||!validCookingDays(body.days))throw new PlanRequestError('Choose valid household details and cooking days.');
  const meals=list(body.meals,'Meals',7);
  if(!meals.length||meals.length!==body.days.length||new Set(meals.map(m=>m?.day)).size!==meals.length||meals.some(m=>!body.days.includes(m?.day)))throw new PlanRequestError('Choose one meal for each cooking day.');
  // Feedback identifies a saved recipe by its key. Normalize keys before
  // checking so whitespace and generated fallback IDs cannot hide duplicates.
  const mealKeys=meals.map((meal,index)=>text(meal.id||`meal-${index+1}`,'Meal key',100,true));
  if(new Set(mealKeys).size!==mealKeys.length)throw new PlanRequestError('Each meal must have a unique identifier.');
  const payload={householdSize,days:body.days,equipment:list(body.equipment||[],'Equipment',30).map(x=>text(x,'Equipment',100,true)),useUp:text(body.useUp,'Ingredients to use up',2000),notes:text(body.notes,'Notes',4000),meals:meals.map((m,i)=>({
    id:mealKeys[i],day:m.day,title:text(m.title,'Meal title',200,true),description:text(m.description,'Description',2000)||null,
    emoji:text(m.emoji,'Emoji',30)||null,servings:integer(m.servings??householdSize,'Servings',40,1),total_minutes:m.total_minutes==null?null:integer(m.total_minutes,'Cooking time',1440),
    difficulty:text(m.difficulty,'Difficulty',60)||null,tags:list(m.tags||[],'Tags',30).map(x=>text(x,'Tag',100)),kid_note:text(m.kid_note,'Child note',2000)||null,
    ingredients:list(m.ingredients||[],'Ingredients',100).map(x=>{
      const category=text(x.category||'Other','Category',40) as GroceryCategory;if(!categories.has(category))throw new PlanRequestError('Choose a valid ingredient category.');
      return {name:text(x.name,'Ingredient',120,true),quantity:x.quantity==null?null:number(x.quantity,'Ingredient quantity',100000),unit:text(x.unit,'Unit',40)||null,category,optional:!!x.optional};
    }),steps:list(m.steps||[],'Recipe steps',100).map(x=>text(x,'Recipe step',2000,true))
  }))};
  if(JSON.stringify(payload).length>500000)throw new PlanRequestError('This week is too large to save.');
  return {weekStart,expectedRevision:body.expectedRevision,requestKey:body.requestKey,payload};
}

export async function savePlan(body: any,{db,householdId}: {db: Function;householdId: string}){
  const {weekStart,expectedRevision,requestKey,payload}=validateSave(body);
  const plans=await db(`weekly_plans?select=id,revision&household_id=eq.${enc(householdId)}&week_start=eq.${enc(weekStart)}&status=eq.active&order=created_at.desc`);
  const current=plans?.[0];
  const priorGroceries=current?await db(`grocery_items?select=*&weekly_plan_id=eq.${enc(current.id)}&order=created_at.asc`):[];
  const groceries=shopping.reconcileGroceries(priorGroceries,payload.meals,{preserveIds:true});
  // The snapshot used to reconcile must match the caller's revision. A stale
  // revision still reaches the RPC so a previously committed retry can replay.
  const result=await db('rpc/mealz_save_week',{method:'POST',body:JSON.stringify({p_household:householdId,p_week:weekStart,p_expected_revision:expectedRevision,p_request_key:requestKey,p_payload:{...payload,groceries,snapshot_revision:current?.revision||0}})});
  return result;
}

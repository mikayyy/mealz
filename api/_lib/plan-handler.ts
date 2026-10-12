import {dataDb,enc,supabaseConfigured,DatabaseError} from './supabase.js';
import {startTelemetry} from './telemetry.js';
import {requireUser,respondAuthError} from './auth.js';
import {savePlan,PlanRequestError} from './plan-save.js';
import shopping from '../../shopping-logic.js';

const categories=new Set(['Produce','Meat & Seafood','Dairy & Eggs','Frozen','Bakery','Pantry','Other']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function boundedText(value,label,max=120,required=false){
  if(value!=null&&typeof value!=='string')throw new PlanRequestError(`${label} must be text.`);
  const result=String(value??'').trim();
  if(result.length>max||(required&&!result))throw new PlanRequestError(`${label} is invalid.`);
  return result;
}
function groceryFields(body){
  const category=boundedText(body.category,'Category',40,true);
  if(!categories.has(category))throw new PlanRequestError('Choose a valid grocery category.');
  let quantity=null;
  if(body.quantity!=null&&body.quantity!==''){
    quantity=Number(body.quantity);
    if(!Number.isFinite(quantity)||quantity<0||quantity>100000)throw new PlanRequestError('Quantity must be a positive number.');
  }
  return {name:boundedText(body.name,'Item name',120,true),quantity,unit:boundedText(body.unit,'Unit',40)||null,category};
}
async function readPlan(weekStart,db){
  let query='weekly_plans?select=id&status=eq.active&order=week_start.desc,created_at.desc&limit=1';
  if(weekStart)query=`weekly_plans?select=id&status=eq.active&week_start=eq.${enc(weekStart)}&order=created_at.desc&limit=1`;
  const plans=await db(query);
  if(!plans?.length)return {plan:null,meals:[],groceryItems:[]};
  // Return the complete graph and revision from one database snapshot.
  return await db('rpc/mealz_week_result',{method:'POST',body:JSON.stringify({p_plan:plans[0].id,p_replayed:false})})||{plan:null,meals:[],groceryItems:[]};
}
async function mutateGrocery(body,db,method){
  if(typeof body.planId!=='string'||!uuid.test(body.planId)||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<1)throw new PlanRequestError('Reload the saved week before editing groceries.');
  const action=method==='PUT'?'add':method==='DELETE'?'delete':body.action||'edit';
  if(!['add','delete','edit','toggle','set_needed'].includes(action))throw new PlanRequestError('Unknown grocery action.');
  if(action!=='add'&&(typeof body.itemId!=='string'||!uuid.test(body.itemId)))throw new PlanRequestError('Missing grocery item information.');
  let fields={};
  if(action==='set_needed'){
    if(typeof body.needed!=='boolean')throw new PlanRequestError('Needed must be true or false.');
    fields={needed_this_week:body.needed};
  }else if(action==='toggle'){
    if(typeof body.checked!=='boolean')throw new PlanRequestError('Checked must be true or false.');
    fields={checked:body.checked};
  }else if(action==='edit'||action==='add'){
    fields=groceryFields(body);
    if(action==='add')fields={...fields,needed_this_week:shopping.isSundry(body.name)};
  }
  return db('rpc/mealz_mutate_grocery',{method:'POST',body:JSON.stringify({p_plan:body.planId,p_item:action==='add'?null:body.itemId,p_expected_revision:body.expectedRevision,p_action:action,p_fields:fields})});
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const telemetry=startTelemetry('plan',{method:req.method});
  if(!supabaseConfigured())return res.status(503).json({error:'Cloud saving is not configured.'});
  try{
    const auth=await requireUser(req);
    const {db,householdId}=await dataDb(auth);
    if(req.method==='GET'){
      const data=await readPlan(req.query?.week_start||null,db);
      telemetry.finish(200,{explicit_week:!!req.query?.week_start});
      return res.status(200).json(data);
    }
    if(req.method==='POST'){
      const result=await savePlan(req.body||{},{db,householdId});
      telemetry.finish(200,{replace_strategy:'transaction',replayed:!!result.replayed});
      return res.status(200).json(result);
    }
    if(['PATCH','PUT','DELETE'].includes(req.method)){
      const result=await mutateGrocery(req.body||{},db,req.method);
      telemetry.finish(req.method==='PUT'?201:200,{operation:'grocery_mutation'});
      return res.status(req.method==='PUT'?201:200).json(result);
    }
    return res.status(405).json({error:'Method not allowed'});
  }catch(error){
    if(respondAuthError(res,error))return;
    if(error instanceof PlanRequestError)return res.status(400).json({error:error.message,code:'INVALID_PLAN'});
    if(error instanceof DatabaseError&&error.status===409){
      telemetry.finish(409,{reason:'revision_conflict'});
      return res.status(409).json({error:error.message,code:'WEEK_CONFLICT'});
    }
    if(error instanceof DatabaseError&&['PGRST202','42703','42P01'].includes(error.code)){
      telemetry.finish(503,{reason:'save_schema_unavailable'});
      return res.status(503).json({error:'Cloud saving is temporarily unavailable. Your draft is still on this device.',code:'SAVE_UNAVAILABLE'});
    }
    telemetry.fail(error);
    return res.status(error instanceof DatabaseError&&[400,403,404].includes(error.status)?error.status:500).json({error:error.message||'Mealz could not save this week.'});
  }
}

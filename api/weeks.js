import {dataDb,enc,supabaseConfigured} from './_lib/supabase.js';
import {startTelemetry} from './_lib/telemetry.js';
import {requireUser,respondAuthError} from './_lib/auth.js';

function summary(plan,meals){return {id:plan.id,weekStart:plan.week_start,householdSize:plan.household_size,cookingDays:plan.cooking_days||[],useUp:plan.use_up||'',notes:plan.notes||'',mealCount:meals.length,meals:meals.map(m=>({id:m.meal_key||m.id,day:m.day,title:m.title,emoji:m.emoji,total_minutes:m.total_minutes})),createdAt:plan.created_at,updatedAt:plan.updated_at}}

export default async function handler(req,res){
  const telemetry=startTelemetry('weeks');
  if(req.method!=='GET'){telemetry.finish(405);return res.status(405).json({error:'Method not allowed'})}
  if(!supabaseConfigured()){telemetry.finish(500,{reason:'supabase_not_configured'});return res.status(500).json({error:'Supabase is not configured.'})}
  try{
    const auth=await requireUser(req);telemetry.event('auth',{mode:auth.mode});
    const {db,owned}=await dataDb(auth);telemetry.event('data_scope',{owned});
    const currentStart=String(req.query?.current_start||''),nextStart=String(req.query?.next_start||'');
    if(!currentStart||!nextStart){telemetry.finish(400,{reason:'missing_week_identity'});return res.status(400).json({error:'current_start and next_start are required.'})}
    const plans=await db('weekly_plans?select=*&status=eq.active&order=week_start.desc,created_at.desc&limit=24');
    const dedup=[];const seen=new Set();for(const p of plans||[]){if(seen.has(p.week_start))continue;seen.add(p.week_start);dedup.push(p)}
    const ids=dedup.map(p=>p.id);let meals=[];if(ids.length){const list=`(${ids.join(',')})`;meals=await db(`meals?select=id,weekly_plan_id,meal_key,day,title,emoji,total_minutes,sort_order&weekly_plan_id=in.${enc(list)}&order=sort_order.asc`)}
    const summaries=dedup.map(p=>summary(p,(meals||[]).filter(m=>m.weekly_plan_id===p.id)));
    const current=summaries.find(w=>w.weekStart===currentStart)||null,next=summaries.find(w=>w.weekStart===nextStart)||null,past=summaries.filter(w=>w.weekStart<currentStart).slice(0,8);
    telemetry.finish(200,{weeks:summaries.length,past_weeks:past.length,owned});return res.status(200).json({current,next,past});
  }catch(e){
    if(respondAuthError(res,e)){telemetry.finish(e.status||401,{reason:'auth'});return}
    telemetry.fail(e);return res.status(500).json({error:e.message||'Could not load weeks.'});
  }
}

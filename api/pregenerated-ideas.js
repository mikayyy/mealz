import {dataDb,enc,supabaseConfigured} from './_lib/supabase.js';
import {startTelemetry} from './_lib/telemetry.js';
import {requireUser,respondAuthError} from './_lib/auth.js';

export default async function handler(req,res){
  const telemetry=startTelemetry('pregenerated-ideas');
  if(req.method!=='GET'){telemetry.finish(405);return res.status(405).json({error:'Method not allowed'})}
  if(!supabaseConfigured()){telemetry.finish(500,{reason:'supabase_not_configured'});return res.status(500).json({error:'Supabase is not configured.'})}
  try{
    const auth=await requireUser(req);telemetry.event('auth',{mode:auth.mode});
    const {db,owned}=await dataDb(auth);telemetry.event('data_scope',{owned});
    const weekStart=req.query?.week_start;
    if(!weekStart){telemetry.finish(400,{reason:'missing_week_identity'});return res.status(400).json({error:'week_start is required'})}
    const plans=await db(`weekly_plans?select=*&week_start=eq.${enc(weekStart)}&status=eq.ideas&order=created_at.desc&limit=1`);
    if(!plans?.length){telemetry.finish(200,{week_start:weekStart,idea_count:0,owned});return res.status(200).json({weekStart,ideas:[]})}
    const rows=await db(`meals?select=*&weekly_plan_id=eq.${enc(plans[0].id)}&order=sort_order.asc`);
    const ideas=(rows||[]).map(x=>{const tags=Array.isArray(x.tags)?x.tags:[];const proteinTag=tags.find(t=>String(t).startsWith('Protein:'));return {id:x.meal_key||x.id,title:x.title,emoji:x.emoji||'🍽️',description:x.description||'',total_minutes:x.total_minutes||30,protein:proteinTag?proteinTag.slice(8):'',tags:tags.filter(t=>!String(t).startsWith('Protein:'))}});
    telemetry.finish(200,{week_start:weekStart,idea_count:ideas.length,owned});return res.status(200).json({weekStart,ideas,ideaCount:ideas.length,defaults:{days:plans[0].cooking_days||[],householdSize:plans[0].household_size||5,equipment:plans[0].equipment||[]}});
  }catch(e){
    if(respondAuthError(res,e)){telemetry.finish(e.status||401,{reason:'auth'});return}
    telemetry.fail(e);return res.status(500).json({error:e.message||'Could not load prepared ideas.'});
  }
}

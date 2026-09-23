import {callOpenAIJson} from './_lib/openai.js';
import {ideasSchema} from './_lib/schemas.js';
import {sb,enc,supabaseConfigured,householdSchemaReady} from './_lib/supabase.js';
import {dietaryInstruction,equipmentInstruction,kidInstruction} from './_lib/profile.js';
import {startTelemetry} from './_lib/telemetry.js';

function nextMonday(){const d=new Date();const day=d.getUTCDay();let add=(8-day)%7;if(add===0)add=7;d.setUTCDate(d.getUTCDate()+add);return d.toISOString().slice(0,10)}
function ideaCountForDays(n){return n>=5?Math.min(9,n+2):6}
/** @param {{householdId: unknown, ownerId?: unknown}} scope */
function scopeClause({householdId}){if(!householdId)throw new Error('Household scope is required.');return `&household_id=eq.${enc(householdId)}`}
function profileFromRow(row){if(!row)return null;return {adults:Number(row.adults||0),children:Number(row.children||0),householdSize:Number(row.household_size||5),dietTags:Array.isArray(row.diet_tags)?row.diet_tags:[],equipment:Array.isArray(row.equipment)?row.equipment:[]}}

async function prepareOne({householdId,ownerId=null,profile=null,profileSource='profiles',weekStart,telemetry}){
  const clause=scopeClause({householdId,ownerId});
  const recentPlans=await sb(`weekly_plans?select=*&status=eq.active${clause}&order=week_start.desc,created_at.desc&limit=12`);
  const p=recentPlans?.[0]||{};
  const householdSize=Number(profile?.householdSize||p.household_size||5);
  const adults=Number(profile?.adults||0),children=Number(profile?.children||0);
  const dietTags=Array.isArray(profile?.dietTags)?profile.dietTags:[];
  const days=Array.isArray(p.cooking_days)&&p.cooking_days.length?p.cooking_days:['Monday','Thursday','Friday'];
  const ideaCount=ideaCountForDays(days.length);
  const existing=await sb(`weekly_plans?select=id&week_start=eq.${enc(weekStart)}&status=eq.ideas${clause}&limit=1`);
  if(existing?.length){
    const rows=await sb(`meals?select=id&weekly_plan_id=eq.${enc(existing[0].id)}`);
    if(rows?.length>=ideaCount)return {prepared:false,reason:'already-ready',count:rows.length};
  }
  const equipment=profile&&Array.isArray(profile.equipment)?profile.equipment:(Array.isArray(p.equipment)?p.equipment:[]);
  const planIds=(recentPlans||[]).map(x=>x.id).filter(Boolean);
  let recentMeals=[];
  if(planIds.length){const list=`(${planIds.join(',')})`;recentMeals=await sb(`meals?select=title,tags,day&weekly_plan_id=in.${enc(list)}&day=neq.Idea&order=created_at.desc&limit=30`)}
  const recent=[],favorites=[];
  for(const x of recentMeals||[]){if(x.title&&!recent.includes(x.title))recent.push(x.title);if(x.title&&Array.isArray(x.tags)&&x.tags.includes('Make again')&&!favorites.includes(x.title))favorites.push(x.title)}
  const dietary=dietaryInstruction(dietTags),equipmentText=equipmentInstruction(equipment),kidContext=kidInstruction(children);
  const prompt=`You are the proactive meal-idea engine for mealz. Prepare exactly ${ideaCount} distinct, practical dinner ideas for next week. These are lightweight ideas only, not recipes. Household size: ${householdSize} (${adults} adults, ${children} children). ${kidContext} Typical cooking days: ${days.join(', ')}. ${equipmentText} ${dietary} Primary store is Trader Joe's; Wegmans is backup. Unless dietary preferences require otherwise, prefer chicken, turkey, fish, shrimp, tofu, beans, lentils and eggs. Never use beef or pork. Avoid mushrooms when practical. Vary proteins, cuisines and cooking methods. Favor some ingredient overlap without making meals repetitive. Recent meals: ${recent.slice(0,18).join(', ')||'none'}. Avoid direct repeats when practical. Meals marked MAKE AGAIN: ${favorites.slice(0,12).join(', ')||'none yet'}. Treat favorites as strong taste signals and generate related cuisines, flavors, formats, or fresh variations without merely repeating them. Keep descriptions concise and tags useful.`;
  const data=await callOpenAIJson({prompt,schema:ideasSchema(ideaCount),schemaName:'mealz_prepared_ideas',schemaDescription:`Exactly ${ideaCount} lightweight dinner ideas for next week.`,timeoutMs:45000,reasoningEffort:'low',maxOutputTokens:2500,telemetry});
  const ideas=data.ideas;
  await sb(`weekly_plans?week_start=eq.${enc(weekStart)}&status=eq.ideas${clause}`,{method:'DELETE',headers:{Prefer:'return=minimal'}});
  const planRow={week_start:weekStart,household_size:householdSize,cooking_days:days,equipment,use_up:null,notes:null,status:'ideas'};
  if(householdId){planRow.household_id=householdId;if(ownerId)planRow.owner_user_id=ownerId}else if(ownerId)planRow.owner_user_id=ownerId;
  const plans=await sb('weekly_plans',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([planRow])});
  const plan=plans[0];
  const rows=ideas.map((x,i)=>({weekly_plan_id:plan.id,meal_key:x.id||`idea-${i+1}`,day:'Idea',title:x.title||'Dinner idea',description:x.description||null,emoji:x.emoji||'🍽️',servings:householdSize,total_minutes:Number(x.total_minutes||30),difficulty:null,tags:[`Protein:${x.protein||''}`,...(Array.isArray(x.tags)?x.tags.slice(0,3):[])],kid_note:null,sort_order:i}));
  await sb('meals',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(rows)});
  return {prepared:true,count:ideaCount,profileApplied:!!profile,profileSource};
}

export default async function handler(req,res){
  const telemetry=startTelemetry('prep-next-week');
  if(req.method!=='GET'){telemetry.finish(405);return res.status(405).json({error:'Method not allowed'})}
  if(!process.env.CRON_SECRET){telemetry.finish(503,{reason:'cron_secret_missing'});return res.status(503).json({error:'CRON_SECRET is not configured.'})}
  if(req.headers.authorization!==`Bearer ${process.env.CRON_SECRET}`){telemetry.finish(401);return res.status(401).json({error:'Unauthorized'})}
  if(!supabaseConfigured()||!process.env.OPENAI_API_KEY){telemetry.finish(500,{reason:'services_not_configured'});return res.status(500).json({error:'mealz services are not configured.'})}
  try{
    const weekStart=nextMonday();
    if(await householdSchemaReady()){
      const rows=await sb('profiles?select=id,household_id,owner_user_id,adults,children,household_size,diet_tags,equipment&order=created_at.asc');
      const results=[];
      for(const row of rows||[]){if(!row.household_id)continue;const result=await prepareOne({householdId:row.household_id,ownerId:row.owner_user_id||null,profile:profileFromRow(row),profileSource:'profiles',weekStart,telemetry});results.push({householdId:row.household_id,...result})}
      telemetry.finish(200,{week_start:weekStart,households:results.length,prepared_households:results.filter(x=>x.prepared).length,household_scope:true});
      return res.status(200).json({ok:true,weekStart,households:results.length,prepared:results.filter(x=>x.prepared).length,results});
    }
    return res.status(503).json({error:'Household schema is unavailable. No preparation was performed.'});
  }catch(e){
    telemetry.fail(e);
    const message=e?.message==='openai-timeout'?'Friday meal prep took too long.':e?.message==='openai-output-limit'?'Friday meal prep ran out of output space.':e.message||'Could not prepare next week.';
    return res.status(500).json({error:message});
  }
}

import {callOpenAIJson} from './_lib/openai.js';
import {ideasSchema} from './_lib/schemas.js';
import {sb,supabaseConfigured} from './_lib/supabase.js';
import {dietaryInstruction,equipmentInstruction,kidInstruction} from './_lib/profile.js';
import {startTelemetry} from './_lib/telemetry.js';

async function preferenceContext(){
  if(!supabaseConfigured())return {recent:[],favorites:[]};
  try{
    const rows=await sb('meals?select=title,tags,day&day=neq.Idea&order=created_at.desc&limit=30');
    const recent=[],favorites=[];
    for(const x of rows||[]){
      if(x.title&&!recent.includes(x.title))recent.push(x.title);
      if(x.title&&Array.isArray(x.tags)&&x.tags.includes('Make again')&&!favorites.includes(x.title))favorites.push(x.title);
    }
    return {recent:recent.slice(0,18),favorites:favorites.slice(0,12)};
  }catch{return {recent:[],favorites:[]}}
}

export default async function handler(req,res){
  const telemetry=startTelemetry('generate-ideas');
  if(req.method!=='POST'){telemetry.finish(405);return res.status(405).json({error:'Method not allowed'})}
  if(!process.env.OPENAI_API_KEY){telemetry.finish(500,{reason:'openai_not_configured'});return res.status(500).json({error:'Mealz AI is not configured.'})}
  try{
    const {days,householdSize,adults,children,dietTags,equipment,useUp,notes}=req.body||{};
    if(!Array.isArray(days)||!days.length){telemetry.finish(400,{reason:'missing_days'});return res.status(400).json({error:'Choose at least one cooking day.'})}
    const requested=Number(req.body?.ideaCount||6),ideaCount=Math.max(6,Math.min(9,Number.isFinite(requested)?Math.round(requested):6));
    const pref=await preferenceContext();
    const dietary=dietaryInstruction(dietTags);
    const equipmentText=equipmentInstruction(equipment);
    const kidContext=kidInstruction(children);
    const prompt=`You are the meal-idea engine for Mealz. Generate exactly ${ideaCount} distinct, practical dinner ideas from which a household will choose ${days.length}. These are lightweight ideas only, not full recipes. Household size: ${householdSize||5} (${adults||0} adults, ${children||0} children). ${kidContext} Cooking days: ${days.join(', ')}. Ingredients to use when sensible: ${useUp||'none'}. ${equipmentText} Notes: ${notes||'none'}. ${dietary} Primary store is Trader Joe's; Wegmans is backup. Unless dietary preferences above require otherwise, prefer chicken, turkey, fish, shrimp, tofu, beans, lentils and eggs. Never use beef or pork. Avoid mushrooms when practical. Make options varied across proteins, cuisines, and cooking methods. Favor useful ingredient overlap across the set without making meals repetitive. Recent meals already planned: ${pref.recent.join(', ')||'none yet'}. Avoid direct repeats unless the notes explicitly request one. Meals marked MAKE AGAIN: ${pref.favorites.join(', ')||'none yet'}. Treat favorites as taste signals by borrowing cuisines, flavors, formats, or cooking styles without simply repeating titles. Keep descriptions concise and tags useful.`;
    const data=await callOpenAIJson({
      prompt,
      schema:ideasSchema(ideaCount),
      schemaName:'mealz_meal_ideas',
      schemaDescription:`Exactly ${ideaCount} lightweight dinner ideas.`,
      timeoutMs:45000,
      reasoningEffort:'low',
      maxOutputTokens:2500,
      telemetry
    });
    const ideas=data.ideas.map((x,i)=>({id:x.id||`idea-${Date.now()}-${i}`,title:x.title||'Dinner idea',emoji:x.emoji||'🍽️',description:x.description||'',total_minutes:Number(x.total_minutes||30),protein:x.protein||'',tags:Array.isArray(x.tags)?x.tags.slice(0,3):[]}));
    telemetry.finish(200,{idea_count:ideas.length,retries:0});
    return res.status(200).json({ideas,ideaCount});
  }catch(e){
    telemetry.fail(e);
    const message=e?.message==='openai-timeout'?'Meal idea generation took too long. Please try again.':e?.message==='openai-output-limit'?'Mealz ran out of room while creating ideas. Please try again.':e.message||'Mealz could not generate meal ideas.';
    return res.status(502).json({error:message});
  }
}

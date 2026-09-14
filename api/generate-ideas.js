import {callOpenAIJson} from './_lib/openai.js';
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
    const prompt=`You are the meal-idea engine for Mealz. Generate exactly ${ideaCount} distinct, practical dinner ideas from which a household will choose ${days.length}. Do NOT generate recipes, ingredient quantities, grocery lists, or instructions yet. Household size: ${householdSize||5} (${adults||0} adults, ${children||0} children). ${kidContext} Cooking days: ${days.join(', ')}. Ingredients to use when sensible: ${useUp||'none'}. ${equipmentText} Notes: ${notes||'none'}. ${dietary} Primary store is Trader Joe's; Wegmans is backup. Unless dietary preferences above require otherwise, prefer chicken, turkey, fish, shrimp, tofu, beans, lentils and eggs. Never use beef or pork. Avoid mushrooms when practical. Make options varied across proteins, cuisines, and cooking methods. Favor ideas with some useful ingredient overlap across the set without making them repetitive. Recent meals the household has already planned: ${pref.recent.join(', ')||'none yet'}. Avoid direct repeats from that recent list unless the current notes explicitly ask for one. Meals explicitly marked MAKE AGAIN: ${pref.favorites.join(', ')||'none yet'}. Treat favorites as strong taste signals: borrow their cuisines, flavors, formats, or cooking styles and occasionally offer a fresh variation, but do not simply repeat favorite titles every week. Return ONLY valid JSON exactly shaped like {"ideas":[{"id":"unique-slug","title":"Meal title","emoji":"🍽️","description":"one concise sentence","total_minutes":30,"protein":"Turkey","tags":["Kid friendly","Skillet"]}]}. Exactly ${ideaCount} ideas.`;
    let data,retries=0;
    try{data=await callOpenAIJson({prompt,timeoutMs:45000,telemetry})}
    catch(first){
      if(first?.message!=='invalid-json')throw first;
      retries=1;
      telemetry.event('retry',{reason:'invalid_json'});
      data=await callOpenAIJson({prompt:prompt+'\nImportant: Your prior response could not be parsed. Return raw JSON only with no markdown or commentary.',timeoutMs:45000,telemetry});
    }
    if(!Array.isArray(data.ideas))throw new Error('Meal ideas came back in an unexpected format. Please try again.');
    const ideas=data.ideas.slice(0,ideaCount).map((x,i)=>({id:x.id||`idea-${Date.now()}-${i}`,title:x.title||'Dinner idea',emoji:x.emoji||'🍽️',description:x.description||'',total_minutes:Number(x.total_minutes||30),protein:x.protein||'',tags:Array.isArray(x.tags)?x.tags.slice(0,3):[]}));
    if(ideas.length<ideaCount)throw new Error(`Mealz did not receive all ${ideaCount} ideas. Please try again.`);
    telemetry.finish(200,{idea_count:ideas.length,retries});
    return res.status(200).json({ideas,ideaCount});
  }catch(e){
    telemetry.fail(e);
    const message=e?.message==='openai-timeout'?'Meal idea generation took too long. Please try again.':e.message||'Mealz could not generate meal ideas.';
    return res.status(502).json({error:message});
  }
}

import {callOpenAIJson} from './_lib/openai.js';
import {recipeSchema} from './_lib/schemas.js';
import {dietaryInstruction,equipmentInstruction,kidInstruction} from './_lib/profile.js';
import {startTelemetry} from './_lib/telemetry.js';
import {requireUser,respondAuthError} from './_lib/auth.js';
import {dataDb} from './_lib/supabase.js';
import {enforceRateLimit} from './_lib/rate-limit.js';
import {validCookingDays} from './_lib/validation.js';

function friendlyError(error){
  const message=String(error?.message||error||'');
  if(message==='openai-timeout')return 'Recipe generation took too long. Please try again.';
  if(message==='openai-output-limit')return 'Mealz ran out of room while building a recipe. Please try again.';
  if(message==='structured-output-invalid'||message==='openai-empty-response'||message==='openai-incomplete')return 'Mealz received an incomplete recipe response. Please try again.';
  if(/string did not match the expected pattern/i.test(message))return 'The recipe request hit a temporary connection error. Please try again.';
  return message||'Mealz could not build the selected recipes.';
}

async function buildOne({day,idea,householdSize,adults,children,dietTags,equipment,useUp,notes,telemetry,retry=false}){
  const dietary=dietaryInstruction(dietTags);
  const equipmentText=equipmentInstruction(equipment);
  const kid=kidInstruction(children);
  const prompt=`You are the recipe-building engine for Mealz. Expand this already-selected dinner concept into one complete practical weeknight recipe without changing its core identity. Assigned day: ${day}. Selected meal: ${idea.title}. Description: ${idea.description||''}. Household size: ${householdSize||5} (${adults||0} adults, ${children||0} children). ${kid} ${equipmentText} Ingredients to use when sensible: ${useUp||'none'}. Notes: ${notes||'none'}. ${dietary} Primary store is Trader Joe's; Wegmans is backup. Never use beef or pork. Avoid mushrooms when practical. Scale to exactly ${householdSize||5} servings. Use only these grocery categories: Produce, Meat & Seafood, Dairy & Eggs, Frozen, Bakery, Pantry, Other. Ingredient quantity must be a number or null. Keep ingredients practical and instructions concise but complete. The day must be ${day}.${retry?' This is a retry after a failed generation, so prioritize a complete, concise recipe.':''}`;
  const data=await callOpenAIJson({prompt,schema:recipeSchema,schemaName:'mealz_recipe',schemaDescription:'One complete Mealz dinner recipe.',timeoutMs:45000,reasoningEffort:'low',maxOutputTokens:3500,telemetry});
  const m=data?.meal;
  return {...m,id:m.id||idea.id||`meal-${day.toLowerCase()}`,day,title:m.title||idea.title||'Dinner',emoji:m.emoji||idea.emoji||'🍽️',description:m.description||idea.description||'',servings:Number(m.servings||householdSize||5),total_minutes:Number(m.total_minutes||idea.total_minutes||30),ingredients:Array.isArray(m.ingredients)?m.ingredients:[],steps:Array.isArray(m.steps)?m.steps:[],tags:Array.isArray(m.tags)?m.tags:[]};
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const telemetry=startTelemetry('expand-meals');
  if(req.method!=='POST'){telemetry.finish(405);return res.status(405).json({error:'Method not allowed'})}
  if(!process.env.OPENAI_API_KEY){telemetry.finish(500,{reason:'openai_not_configured'});return res.status(500).json({error:'Mealz AI is not configured.'})}
  try{
    const auth=await requireUser(req);telemetry.event('auth',{mode:auth.mode});
    const {householdId}=await dataDb(auth);
    await enforceRateLimit(`ai:${householdId}`,20);
    const {days,selectedIdeas,householdSize,adults,children,dietTags,equipment,useUp,notes}=req.body||{};
    if(!validCookingDays(days))return res.status(400).json({error:'Choose up to seven different cooking days.'});
    if(!Array.isArray(selectedIdeas)||selectedIdeas.length!==days.length){telemetry.finish(400,{reason:'selection_mismatch'});return res.status(400).json({error:`Choose exactly ${days.length} meals first.`})}
    const params=days.map((day,i)=>({day,idea:selectedIdeas[i]||{},householdSize,adults,children,dietTags,equipment,useUp,notes,telemetry}));
    const firstPass=await Promise.allSettled(params.map(p=>buildOne(p)));
    const meals=new Array(days.length);const failed=[];
    firstPass.forEach((result,i)=>{if(result.status==='fulfilled')meals[i]=result.value;else failed.push(i)});
    if(failed.length){
      telemetry.event('recipe_retry',{failed_count:failed.length,failed_days:failed.map(i=>days[i])});
      const retries=await Promise.allSettled(failed.map(i=>buildOne({...params[i],retry:true})));
      const stillFailed=[];
      retries.forEach((result,j)=>{const originalIndex=failed[j];if(result.status==='fulfilled')meals[originalIndex]=result.value;else stillFailed.push({index:originalIndex,error:result.reason})});
      if(stillFailed.length){const first=stillFailed[0];telemetry.event('recipe_retry_failed',{failed_count:stillFailed.length,failed_days:stillFailed.map(x=>days[x.index])});throw first.error}
    }
    telemetry.finish(200,{meal_count:meals.length,retried_count:failed.length});
    return res.status(200).json({meals});
  }catch(e){
    if(respondAuthError(res,e)){telemetry.finish(e.status||401,{reason:'auth'});return}
    telemetry.fail(e);return res.status(502).json({error:friendlyError(e)});
  }
}

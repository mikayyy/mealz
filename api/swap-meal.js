import {callOpenAIJson} from './_lib/openai.js';
import {swapSchema} from './_lib/schemas.js';
import {dietaryInstruction,equipmentInstruction,kidInstruction} from './_lib/profile.js';
import {startTelemetry} from './_lib/telemetry.js';

function friendlyError(error){
  const message=String(error?.message||error||'');
  if(message==='openai-timeout')return 'Swap generation took too long. Please try again.';
  if(message==='openai-output-limit')return 'Mealz ran out of room while finding alternatives. Please try again.';
  if(message==='structured-output-invalid'||message==='openai-empty-response'||message==='openai-incomplete')return 'The alternatives came back incomplete. Please try again.';
  return message||'Mealz hit an unexpected error while finding alternatives.';
}

export default async function handler(req,res){
  const telemetry=startTelemetry('swap-meal');
  if(req.method!=='POST'){telemetry.finish(405);return res.status(405).json({error:'Method not allowed'})}
  if(!process.env.OPENAI_API_KEY){telemetry.finish(500,{reason:'openai_not_configured'});return res.status(500).json({error:'Mealz AI is not configured yet.'})}
  try{
    const {meal,otherMeals,householdSize,adults,children,dietTags,equipment,useUp,notes}=req.body||{};
    if(!meal?.day){telemetry.finish(400,{reason:'missing_meal'});return res.status(400).json({error:'Meal information is missing.'})}
    const existing=(otherMeals||[]).map(m=>m.title).filter(Boolean).join(', ')||'none';
    const dietary=dietaryInstruction(dietTags);
    const equipmentText=equipmentInstruction(equipment);
    const kid=kidInstruction(children);
    const prompt=`You are the meal-planning engine for Mealz. Replace one dinner with exactly two distinct alternatives for the same day. Current dinner: ${meal.title||'current dinner'} on ${meal.day}. Other dinners already in this week's plan: ${existing}. Household size: ${householdSize||5} (${adults||0} adults, ${children||0} children). ${kid} Ingredients to use when sensible: ${useUp||'none'}. ${equipmentText} Weekly notes: ${notes||'none'}. ${dietary} Primary store is Trader Joe's; Wegmans is backup. The alternatives must be meaningfully different from the current dinner, different from each other, and avoid duplicating the other meals. Unless dietary preferences require otherwise, prefer chicken, turkey, fish, shrimp, tofu, beans, lentils and eggs. Never use beef or pork. Avoid mushrooms when practical. Scale each recipe to exactly ${householdSize||5} servings. Use only these grocery categories: Produce, Meat & Seafood, Dairy & Eggs, Frozen, Bakery, Pantry, Other. Ingredient quantity must be a number or null. Keep recipes practical for a weeknight. Both alternatives must use day ${meal.day}.`;
    const data=await callOpenAIJson({
      prompt,
      schema:swapSchema,
      schemaName:'mealz_swap_alternatives',
      schemaDescription:'Exactly two complete alternative dinner recipes.',
      timeoutMs:45000,
      reasoningEffort:'low',
      maxOutputTokens:5000,
      telemetry
    });
    const alternatives=data.alternatives.map((m,i)=>({...m,id:m.id||`swap-${Date.now()}-${i+1}`,day:meal.day,servings:Number(m.servings||householdSize||5),ingredients:Array.isArray(m.ingredients)?m.ingredients:[],steps:Array.isArray(m.steps)?m.steps:[],tags:Array.isArray(m.tags)?m.tags:[]}));
    telemetry.finish(200,{alternative_count:alternatives.length});
    return res.status(200).json({alternatives});
  }catch(e){
    telemetry.fail(e);
    return res.status(502).json({error:friendlyError(e)});
  }
}

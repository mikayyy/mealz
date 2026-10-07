import {callOpenAIWithRetry} from './openai.js';
import {recipeSchema,swapSchema,ideasSchema} from './schemas.js';
import {dietaryInstruction,equipmentInstruction,kidInstruction} from './profile.js';
import {requireUser} from './auth.js';
import {dataDb} from './supabase.js';
import {enforceRateLimit} from './rate-limit.js';
import {generationHandler} from './generation-handler.js';
import {generationInput,generationDays,selectedConcept,validateRecipe,GenerationInputError} from './generation-validation.js';
import type {RequestBudget} from './deadline.js';
import type {Telemetry} from '../../types.js';
import {randomUUID} from 'node:crypto';

async function authenticate(req,budget: RequestBudget,telemetry: Telemetry){
  return budget.stage('authentication',telemetry,()=>requireUser(req,{signal:budget.signal}));
}
async function access(auth,budget: RequestBudget,telemetry: Telemetry){
  const context=await budget.stage('membership',telemetry,()=>dataDb(auth,{signal:budget.signal}));
  await budget.stage('rate_limit',telemetry,()=>enforceRateLimit(`ai:${context.householdId}`,20,900,{signal:budget.signal}));
  return context;
}
function profilePrompt(input){
  return `Household size: ${input.householdSize} (${input.adults} adults, ${input.children} children). ${kidInstruction(input.children)} ${equipmentInstruction(input.equipment)} Ingredients to use when sensible: ${input.useUp||'none'}. Weekly notes: ${input.notes||'none'}. ${dietaryInstruction(input.dietTags)} Primary store is Trader Joe's; Wegmans is backup. Never use beef or pork. Avoid mushrooms when practical.`;
}
const recipePrompt=`Use only these grocery categories: Produce, Meat & Seafood, Dairy & Eggs, Frozen, Bakery, Pantry, Other. Ingredient quantity must be a number or null. Keep ingredients practical and instructions concise but complete.`;

export async function preferenceContext(db){
  try{
    const rows=await db('meals?select=title,tags,day&day=neq.Idea&order=created_at.desc&limit=30');
    const recent=[],favorites=[];
    for(const x of rows||[]){
      if(x.title&&!recent.includes(x.title))recent.push(x.title);
      if(x.title&&Array.isArray(x.tags)&&x.tags.includes('Make again')&&!favorites.includes(x.title))favorites.push(x.title);
    }
    return {recent:recent.slice(0,18),favorites:favorites.slice(0,12)};
  }catch{return {recent:[],favorites:[]}}
}

export const expandMeals=generationHandler('expand-meals',async(req,budget,telemetry)=>{
  const auth=await authenticate(req,budget,telemetry);
  const input=generationInput(req.body||{}),days=generationDays(req.body?.days);
  if(!Array.isArray(req.body?.selectedIdeas)||req.body.selectedIdeas.length!==days.length)throw new GenerationInputError(`Choose exactly ${days.length} meals first.`);
  const ideas=req.body.selectedIdeas.map(selectedConcept);
  await access(auth,budget,telemetry);
  // All meals share one deadline. Each failed transient call owns at most one
  // retry; a batch is returned only when every selected dinner is complete.
  const meals=await budget.stage('recipes',telemetry,()=>Promise.all(days.map(async(day,i)=>{
    const idea=ideas[i];
    const prompt=`You are the recipe-building engine for Mealz. Expand this already-selected dinner concept into one complete practical weeknight recipe without changing its core identity. Assigned day: ${day}. Selected meal: ${idea.title}. Description: ${idea.description}. ${profilePrompt(input)} Scale to exactly ${input.householdSize} servings. ${recipePrompt} The day must be ${day}.`;
    const data=await callOpenAIWithRetry({prompt,schema:recipeSchema,schemaName:'mealz_recipe',schemaDescription:'One complete Mealz dinner recipe.',maxOutputTokens:3500,telemetry},budget);
    const meal=validateRecipe(data?.meal,input.householdSize);
    return {...meal,id:`${day.toLowerCase()}-${(idea.id||'dinner').slice(0,80)}`,day};
  })));
  telemetry.event('generation_result',{meal_count:meals.length});return {meals};
});

export const generateIdeas=generationHandler('generate-ideas',async(req,budget,telemetry)=>{
  const auth=await authenticate(req,budget,telemetry);
  const input=generationInput(req.body||{}),days=generationDays(req.body?.days);
  const count=req.body?.ideaCount??6;
  if(typeof count!=='number'||!Number.isInteger(count)||count<6||count>9)throw new GenerationInputError('Choose between six and nine dinner ideas.');
  const previous=req.body?.previousIdeas??[];
  if(!Array.isArray(previous)||previous.length>9||previous.some(x=>typeof x!=='string'||x.length>200))throw new GenerationInputError('Previous ideas are invalid.');
  const {db}=await access(auth,budget,telemetry);
  const pref=await budget.stage('preferences',telemetry,()=>preferenceContext(db));
  const prompt=`You are the meal-idea engine for Mealz. Generate exactly ${count} distinct, practical dinner ideas from which a household will choose ${days.length}. These are lightweight ideas only, not full recipes. ${profilePrompt(input)} Cooking days: ${days.join(', ')}. Unless dietary preferences require otherwise, prefer chicken, turkey, fish, shrimp, tofu, beans, lentils and eggs. Make options varied across proteins, cuisines, and cooking methods. Favor useful ingredient overlap without making meals repetitive. Recent meals already planned: ${pref.recent.join(', ')||'none yet'}. Avoid direct repeats unless the notes explicitly request one. Meals marked MAKE AGAIN: ${pref.favorites.join(', ')||'none yet'}. Treat favorites as taste signals by borrowing cuisines, flavors, formats, or cooking styles without simply repeating titles. Keep descriptions concise and tags useful.${previous.length?` Give a substantially different set from these previous ideas: ${previous.join(', ')}.`:''}`;
  const data=await budget.stage('ideas',telemetry,()=>callOpenAIWithRetry({prompt,schema:ideasSchema(count),schemaName:'mealz_meal_ideas',schemaDescription:`Exactly ${count} lightweight dinner ideas.`,maxOutputTokens:2500,telemetry},budget));
  if(!Array.isArray(data?.ideas)||data.ideas.length!==count)throw Object.assign(new Error('Invalid ideas'),{code:'invalid_ideas'});
  const ideas=data.ideas.map((value,i)=>{
    let concept;
    try{concept=selectedConcept(value)}catch{throw Object.assign(new Error('Invalid generated ideas'),{code:'invalid_ideas'})}
    return {...concept,id:concept.id||`idea-${i+1}`,protein:typeof value.protein==='string'?value.protein:'',tags:Array.isArray(value.tags)?value.tags.slice(0,3):[]};
  });
  telemetry.event('generation_result',{idea_count:ideas.length});return {ideas,ideaCount:count};
});

export const swapMeal=generationHandler('swap-meal',async(req,budget,telemetry)=>{
  const auth=await authenticate(req,budget,telemetry);
  const input=generationInput(req.body||{}),day=generationDays([req.body?.meal?.day])[0];
  const meal=selectedConcept(req.body?.meal),other=req.body?.otherMeals??[];
  if(!Array.isArray(other)||other.length>6)throw new GenerationInputError('Choose a valid saved week to swap.');
  const existing=other.map(selectedConcept).map(x=>x.title).join(', ')||'none';
  await access(auth,budget,telemetry);
  const prompt=`You are the meal-planning engine for Mealz. Replace one dinner with exactly two distinct alternatives for the same day. Current dinner: ${meal.title} on ${day}. Other dinners already in this week's plan: ${existing}. ${profilePrompt(input)} The alternatives must be meaningfully different from the current dinner, different from each other, and avoid duplicating the other meals. Unless dietary preferences require otherwise, prefer chicken, turkey, fish, shrimp, tofu, beans, lentils and eggs. Scale each recipe to exactly ${input.householdSize} servings. ${recipePrompt} Both alternatives must use day ${day}.`;
  const data=await budget.stage('alternatives',telemetry,()=>callOpenAIWithRetry({prompt,schema:swapSchema,schemaName:'mealz_swap_alternatives',schemaDescription:'Exactly two complete alternative dinner recipes.',maxOutputTokens:5000,telemetry},budget));
  if(!Array.isArray(data?.alternatives)||data.alternatives.length!==2)throw Object.assign(new Error('Invalid alternatives'),{code:'invalid_alternatives'});
  const alternatives=data.alternatives.map(value=>({...validateRecipe(value,input.householdSize),id:`swap-${randomUUID()}`,day}));
  telemetry.event('generation_result',{alternative_count:alternatives.length});return {alternatives};
});

const H=()=>({'apikey':process.env.SUPABASE_SECRET_KEY,'Content-Type':'application/json'});
const enc=x=>encodeURIComponent(String(x));
async function sb(path,options={}){const r=await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{...H(),...(options.headers||{})}});const t=await r.text();let d=null;if(t){try{d=JSON.parse(t)}catch{d=t}}if(!r.ok)throw new Error(typeof d==='object'?(d.message||d.hint||JSON.stringify(d)):d||`Supabase error ${r.status}`);return d}
function outputText(r){if(r.output_text)return r.output_text;return (r.output||[]).flatMap(x=>x.content||[]).map(c=>c.text||'').join('\n')}
function parseJson(t){const s=String(t||'').trim().replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/\s*```$/,'');try{return JSON.parse(s)}catch{const a=s.indexOf('{'),b=s.lastIndexOf('}');if(a>=0&&b>a)return JSON.parse(s.slice(a,b+1));throw new Error('invalid json')}}
function nextMonday(){const d=new Date();const day=d.getUTCDay();let add=(8-day)%7;if(add===0)add=7;d.setUTCDate(d.getUTCDate()+add);return d.toISOString().slice(0,10)}
function ideaCountForDays(n){return n>=5?Math.min(9,n+2):6}
async function generate(prompt){const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-5.6-luna',input:prompt})});const raw=await r.json();if(!r.ok)throw new Error(raw?.error?.message||'OpenAI could not prepare ideas.');return parseJson(outputText(raw))}
export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!process.env.CRON_SECRET)return res.status(503).json({error:'CRON_SECRET is not configured.'});
  if(req.headers.authorization!==`Bearer ${process.env.CRON_SECRET}`)return res.status(401).json({error:'Unauthorized'});
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SECRET_KEY||!process.env.OPENAI_API_KEY)return res.status(500).json({error:'Mealz services are not configured.'});
  try{
    const weekStart=nextMonday();
    const recentPlans=await sb('weekly_plans?select=*&status=eq.active&order=week_start.desc,created_at.desc&limit=1');
    const p=recentPlans?.[0]||{};
    const householdSize=p.household_size||5;
    const days=Array.isArray(p.cooking_days)&&p.cooking_days.length?p.cooking_days:['Monday','Thursday','Friday'];
    const ideaCount=ideaCountForDays(days.length);
    const existing=await sb(`weekly_plans?select=id&week_start=eq.${enc(weekStart)}&status=eq.ideas&limit=1`);
    if(existing?.length){const rows=await sb(`meals?select=id&weekly_plan_id=eq.${enc(existing[0].id)}`);if(rows?.length>=ideaCount)return res.status(200).json({ok:true,weekStart,prepared:false,reason:'already-ready',count:rows.length})}
    const equipment=Array.isArray(p.equipment)&&p.equipment.length?p.equipment:['Instant Pot','Oven','Cast iron pans'];
    const recentMeals=await sb('meals?select=title,tags,day&day=neq.Idea&order=created_at.desc&limit=30');
    const recent=[],favorites=[];
    for(const x of recentMeals||[]){if(x.title&&!recent.includes(x.title))recent.push(x.title);if(x.title&&Array.isArray(x.tags)&&x.tags.includes('Make again')&&!favorites.includes(x.title))favorites.push(x.title)}
    const prompt=`You are the proactive meal-idea engine for Mealz. Prepare exactly ${ideaCount} distinct, practical dinner ideas for next week. These are lightweight ideas only: do NOT include recipes, ingredients, quantities, grocery lists, or instructions. Household size: ${householdSize}. Typical cooking days: ${days.join(', ')}. Available equipment: ${equipment.join(', ')}. Primary store is Trader Joe's; Wegmans is backup. Prefer chicken, turkey, fish, shrimp, tofu, beans, lentils and eggs. Never use beef or pork. Avoid mushrooms when practical. Vary proteins, cuisines and cooking methods. Favor some ingredient overlap without making meals repetitive. Recent meals: ${recent.slice(0,18).join(', ')||'none'}. Avoid direct repeats when practical. Meals marked MAKE AGAIN: ${favorites.slice(0,12).join(', ')||'none yet'}. Treat those favorites as strong taste signals and generate related cuisines, flavors, meal formats, or fresh variations without merely repeating them. Return ONLY JSON shaped exactly like {"ideas":[{"id":"unique-slug","title":"Meal title","emoji":"🍽️","description":"one concise sentence","total_minutes":30,"protein":"Turkey","tags":["Kid friendly","Skillet"]}]}. Exactly ${ideaCount} ideas.`;
    let data;try{data=await generate(prompt)}catch(first){try{data=await generate(prompt+'\nYour prior response could not be parsed. Return raw JSON only.')}catch{throw first}}
    if(!Array.isArray(data.ideas)||data.ideas.length<ideaCount)throw new Error(`Did not receive ${ideaCount} meal ideas.`);
    const ideas=data.ideas.slice(0,ideaCount);
    await sb(`weekly_plans?week_start=eq.${enc(weekStart)}&status=eq.ideas`,{method:'DELETE',headers:{Prefer:'return=minimal'}});
    const plans=await sb('weekly_plans',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([{week_start:weekStart,household_size:householdSize,cooking_days:days,equipment,use_up:null,notes:null,status:'ideas'}])});
    const plan=plans[0];
    const rows=ideas.map((x,i)=>({weekly_plan_id:plan.id,meal_key:x.id||`idea-${i+1}`,day:'Idea',title:x.title||'Dinner idea',description:x.description||null,emoji:x.emoji||'🍽️',servings:householdSize,total_minutes:Number(x.total_minutes||30),difficulty:null,tags:[`Protein:${x.protein||''}`,...(Array.isArray(x.tags)?x.tags.slice(0,3):[])],kid_note:null,sort_order:i}));
    await sb('meals',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(rows)});
    return res.status(200).json({ok:true,weekStart,prepared:true,count:ideaCount});
  }catch(e){console.error('Mealz Friday prep error',e);return res.status(500).json({error:e.message||'Could not prepare next week.'})}
}

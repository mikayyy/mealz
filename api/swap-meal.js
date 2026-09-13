function text(r){
  if(r.output_text)return r.output_text;
  return (r.output||[]).flatMap(x=>x.content||[]).map(c=>c.text||'').join('\n');
}

function parse(t){
  return JSON.parse(String(t).trim().replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/\s*```$/,''));
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(!process.env.OPENAI_API_KEY)return res.status(500).json({error:'Mealz AI is not configured yet.'});

  try{
    const {meal,otherMeals,householdSize,equipment,useUp,notes}=req.body||{};
    if(!meal?.day)return res.status(400).json({error:'Meal information is missing.'});

    const existing=(otherMeals||[]).map(m=>m.title).filter(Boolean).join(', ')||'none';
    const prompt=`You are the meal-planning engine for Mealz. The user wants to replace one dinner and see exactly TWO distinct alternatives before choosing.

Dinner being replaced: ${meal.title||'current dinner'} on ${meal.day}.
Other dinners already in this week's plan: ${existing}.
Household size: ${householdSize||5}.
Ingredients to use when sensible: ${useUp||'none'}.
Available equipment: ${(equipment||[]).join(', ')||'basic stovetop only'}.
Weekly notes: ${notes||'none'}.
Primary store is Trader Joe's; Wegmans is backup.

Create exactly two practical weeknight dinner alternatives for the SAME DAY. They must be meaningfully different from the current dinner, different from each other, and avoid duplicating the other meals in the week. Prefer chicken, turkey, fish, shrimp, tofu, beans, lentils and eggs. Never use beef or pork. Avoid mushrooms when practical. Make meals kid-adaptable. Respect the equipment list. Scale each recipe to exactly ${householdSize||5} servings. Use only grocery categories Produce, Meat & Seafood, Dairy & Eggs, Frozen, Bakery, Pantry, Other. Quantity must be a JSON number or null.

Return ONLY valid JSON in this shape: {"alternatives":[{"id":"unique-slug","day":"${meal.day}","title":"Meal title","emoji":"🍽️","description":"short description","servings":${householdSize||5},"total_minutes":30,"difficulty":"Easy","tags":["Kid friendly"],"kid_note":"optional adaptation","ingredients":[{"name":"lime","quantity":2,"unit":"whole","category":"Produce","optional":false}],"steps":["Step one","Step two"]}]}`;

    const o=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-5.6-luna',input:prompt})
    });
    const raw=await o.json();
    if(!o.ok)return res.status(502).json({error:raw?.error?.message||'OpenAI could not find alternatives.'});

    let p;
    try{p=parse(text(raw))}catch{return res.status(502).json({error:'The alternatives came back in an unexpected format. Please try again.'})}
    if(!Array.isArray(p.alternatives)||p.alternatives.length<2)return res.status(502).json({error:'Mealz did not receive two alternatives. Please try again.'});

    p.alternatives=p.alternatives.slice(0,2).map((m,i)=>({
      ...m,
      id:m.id||`swap-${Date.now()}-${i+1}`,
      day:meal.day,
      servings:Number(m.servings||householdSize||5),
      ingredients:Array.isArray(m.ingredients)?m.ingredients:[],
      steps:Array.isArray(m.steps)?m.steps:[],
      tags:Array.isArray(m.tags)?m.tags:[]
    }));
    return res.status(200).json(p);
  }catch(e){
    console.error(e);
    return res.status(500).json({error:'Mealz hit an unexpected error while finding alternatives.'});
  }
}

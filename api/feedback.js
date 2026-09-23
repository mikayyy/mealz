import {dataDb,enc,supabaseConfigured} from './_lib/supabase.js';
import {requireUser,respondAuthError} from './_lib/auth.js';

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(!supabaseConfigured())return res.status(500).json({error:'Supabase is not configured.'});
  try{
    const auth=await requireUser(req);
    const {db}=await dataDb(auth);
    const {planId,mealId,makeAgain}=req.body||{};
    if(!planId||!mealId)return res.status(400).json({error:'Missing meal information.'});
    const rows=await db(`meals?select=id,tags&weekly_plan_id=eq.${enc(planId)}&meal_key=eq.${enc(mealId)}&limit=1`);
    if(!rows?.length)return res.status(404).json({error:'Meal not found.'});
    const row=rows[0],tags=Array.isArray(row.tags)?row.tags.filter(t=>t!=='Make again'):[];if(makeAgain)tags.push('Make again');
    await db(`meals?id=eq.${enc(row.id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({tags})});
    return res.status(200).json({ok:true,makeAgain:!!makeAgain,tags});
  }catch(e){if(respondAuthError(res,e))return;console.error('mealz feedback error',e);return res.status(500).json({error:e.message||'Could not save preference.'})}
}

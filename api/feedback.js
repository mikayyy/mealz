import {requireUser,respondAuthError} from './_lib/auth.js';

const H=()=>({'apikey':process.env.SUPABASE_SECRET_KEY,'Content-Type':'application/json'});
const enc=x=>encodeURIComponent(String(x));
async function sb(path,options={}){const r=await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{...H(),...(options.headers||{})}});const t=await r.text();let d=null;if(t){try{d=JSON.parse(t)}catch{d=t}}if(!r.ok)throw new Error(typeof d==='object'?(d.message||d.hint||JSON.stringify(d)):d||`Supabase error ${r.status}`);return d}
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SECRET_KEY)return res.status(500).json({error:'Supabase is not configured.'});
  try{
    await requireUser(req);
    const {planId,mealId,makeAgain}=req.body||{};
    if(!planId||!mealId)return res.status(400).json({error:'Missing meal information.'});
    const rows=await sb(`meals?select=id,tags&weekly_plan_id=eq.${enc(planId)}&meal_key=eq.${enc(mealId)}&limit=1`);
    if(!rows?.length)return res.status(404).json({error:'Meal not found.'});
    const row=rows[0],tags=Array.isArray(row.tags)?row.tags.filter(t=>t!=='Make again'):[];if(makeAgain)tags.push('Make again');
    await sb(`meals?id=eq.${enc(row.id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({tags})});
    return res.status(200).json({ok:true,makeAgain:!!makeAgain,tags});
  }catch(e){if(respondAuthError(res,e))return;console.error('mealz feedback error',e);return res.status(500).json({error:e.message||'Could not save preference.'})}
}

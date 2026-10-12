import {dataDb,supabaseConfigured,DatabaseError} from './_lib/supabase.js';
import {requireUser,respondAuthError} from './_lib/auth.js';

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(!supabaseConfigured())return res.status(500).json({error:'Supabase is not configured.'});
  try{
    const auth=await requireUser(req);
    const {db}=await dataDb(auth);
    const {planId,mealId,makeAgain,expectedRevision}=req.body||{};
    if(typeof planId!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(planId)||typeof mealId!=='string'||!mealId.trim()||mealId.length>100||typeof makeAgain!=='boolean'||!Number.isSafeInteger(expectedRevision)||expectedRevision<1)return res.status(400).json({error:'Reload the saved week before changing preferences.'});
    const result=await db('rpc/mealz_set_feedback',{method:'POST',body:JSON.stringify({p_plan:planId,p_meal_key:mealId,p_expected_revision:expectedRevision,p_make_again:makeAgain})});
    return res.status(200).json(result);
  }catch(e){
    if(respondAuthError(res,e))return;
    if(e instanceof DatabaseError&&e.status===409)return res.status(409).json({error:e.message,code:'WEEK_CONFLICT'});
    if(e instanceof DatabaseError&&[400,403,404].includes(e.status))return res.status(e.status).json({error:e.message});
    console.error('Meal preference update failed');return res.status(500).json({error:e.message||'Could not save preference.'});
  }
}

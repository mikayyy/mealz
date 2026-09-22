import {dataDb,supabaseConfigured} from './_lib/supabase.js';
import {readProfile,writeProfile} from './_lib/profile-store.js';
import {startTelemetry} from './_lib/telemetry.js';
import {requireUser,respondAuthError} from './_lib/auth.js';

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const telemetry=startTelemetry('profile',{method:req.method});
  if(!supabaseConfigured()){telemetry.finish(500,{reason:'supabase_not_configured'});return res.status(500).json({error:'Supabase is not configured.'})}
  try{
    const auth=await requireUser(req);telemetry.event('auth',{mode:auth.mode});
    const {db,owned,household,householdId,householdRole}=await dataDb(auth);
    const context={db,owned,userId:auth.id,household,householdId,householdRole};
    telemetry.event('data_scope',{owned,household,household_role:householdRole||null});
    if(req.method==='GET'){const result=await readProfile(context);telemetry.finish(200,{profile:!!result.profile,source:result.source,owned,household});return res.status(200).json({profile:result.profile,source:result.source})}
    if(req.method==='POST'){
      const result=await writeProfile(req.body||{},context);
      await db('weekly_plans?status=eq.ideas',{method:'DELETE',headers:{Prefer:'return=minimal'}});
      telemetry.finish(200,{profile:true,source:result.source,owned,household,diet_tag_count:result.profile?.dietTags?.length||0,equipment_count:result.profile?.equipment?.length||0});
      return res.status(200).json({ok:true,profileId:result.id,profile:result.profile,source:result.source});
    }
    telemetry.finish(405);return res.status(405).json({error:'Method not allowed'});
  }catch(e){
    if(respondAuthError(res,e)){telemetry.finish(e.status||401,{reason:'auth'});return}
    telemetry.fail(e);return res.status(500).json({error:e.message||'Could not sync profile.'});
  }
}

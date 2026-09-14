import {sb,supabaseConfigured} from './_lib/supabase.js';
import {startTelemetry} from './_lib/telemetry.js';

const PROFILE_DATE='1970-01-01';
function parseMeta(notes){try{return notes?JSON.parse(notes):{}}catch{return {}}}

export default async function handler(req,res){
  const telemetry=startTelemetry('profile',{method:req.method});
  if(!supabaseConfigured()){telemetry.finish(500,{reason:'supabase_not_configured'});return res.status(500).json({error:'Supabase is not configured.'})}
  try{
    if(req.method==='GET'){
      const rows=await sb(`weekly_plans?select=*&status=eq.profile&week_start=eq.${PROFILE_DATE}&order=created_at.desc&limit=1`);
      if(!rows?.length){telemetry.finish(200,{profile:false});return res.status(200).json({profile:null})}
      const row=rows[0],meta=parseMeta(row.notes);
      const profile={adults:Number(meta.adults||0),children:Number(meta.children||0),householdSize:Number(row.household_size||5),dietTags:Array.isArray(meta.dietTags)?meta.dietTags:[],equipment:Array.isArray(row.equipment)?row.equipment:[],stores:Array.isArray(meta.stores)?meta.stores:["Trader Joe's",'Wegmans'],updatedAt:row.updated_at||row.created_at};
      telemetry.finish(200,{profile:true});
      return res.status(200).json({profile});
    }
    if(req.method==='POST'){
      const body=req.body||{};
      const adults=Math.max(0,Number(body.adults||0)),children=Math.max(0,Number(body.children||0));
      const householdSize=Math.max(1,adults+children||Number(body.householdSize||5));
      const dietTags=Array.isArray(body.dietTags)?body.dietTags:[];
      const equipment=Array.isArray(body.equipment)?body.equipment:[];
      const meta={adults,children,dietTags,stores:Array.isArray(body.stores)?body.stores:["Trader Joe's",'Wegmans']};
      await sb(`weekly_plans?status=eq.profile&week_start=eq.${PROFILE_DATE}`,{method:'DELETE',headers:{Prefer:'return=minimal'}});
      const rows=await sb('weekly_plans',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([{week_start:PROFILE_DATE,household_size:householdSize,cooking_days:[],equipment,use_up:null,notes:JSON.stringify(meta),status:'profile'}])});
      await sb('weekly_plans?status=eq.ideas',{method:'DELETE',headers:{Prefer:'return=minimal'}});
      telemetry.finish(200,{profile:true,diet_tag_count:dietTags.length,equipment_count:equipment.length});
      return res.status(200).json({ok:true,profileId:rows?.[0]?.id||null,profile:{...meta,householdSize,equipment}});
    }
    telemetry.finish(405);return res.status(405).json({error:'Method not allowed'});
  }catch(e){telemetry.fail(e);return res.status(500).json({error:e.message||'Could not sync household profile.'})}
}

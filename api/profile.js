const H=()=>({'apikey':process.env.SUPABASE_SECRET_KEY,'Content-Type':'application/json'});
const PROFILE_DATE='1970-01-01';
const enc=x=>encodeURIComponent(String(x));
async function sb(path,options={}){const r=await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{...H(),...(options.headers||{})}});const t=await r.text();let d=null;if(t){try{d=JSON.parse(t)}catch{d=t}}if(!r.ok)throw new Error(typeof d==='object'?(d.message||d.hint||JSON.stringify(d)):d||`Supabase error ${r.status}`);return d}
function configured(){return process.env.SUPABASE_URL&&process.env.SUPABASE_SECRET_KEY}
function parseMeta(notes){try{return notes?JSON.parse(notes):{}}catch{return {}}}
export default async function handler(req,res){
  if(!configured())return res.status(500).json({error:'Supabase is not configured.'});
  try{
    if(req.method==='GET'){
      const rows=await sb(`weekly_plans?select=*&status=eq.profile&week_start=eq.${PROFILE_DATE}&order=created_at.desc&limit=1`);
      if(!rows?.length)return res.status(200).json({profile:null});
      const row=rows[0],meta=parseMeta(row.notes);
      return res.status(200).json({profile:{adults:Number(meta.adults||0),children:Number(meta.children||0),householdSize:Number(row.household_size||5),dietTags:Array.isArray(meta.dietTags)?meta.dietTags:[],equipment:Array.isArray(row.equipment)?row.equipment:[],stores:Array.isArray(meta.stores)?meta.stores:['Trader Joe\'s','Wegmans'],updatedAt:row.updated_at||row.created_at}})
    }
    if(req.method==='POST'){
      const body=req.body||{};const adults=Math.max(0,Number(body.adults||0)),children=Math.max(0,Number(body.children||0));const householdSize=Math.max(1,adults+children||Number(body.householdSize||5));const dietTags=Array.isArray(body.dietTags)?body.dietTags:[];const equipment=Array.isArray(body.equipment)?body.equipment:[];const meta={adults,children,dietTags,stores:Array.isArray(body.stores)?body.stores:['Trader Joe\'s','Wegmans']};
      await sb(`weekly_plans?status=eq.profile&week_start=eq.${PROFILE_DATE}`,{method:'DELETE',headers:{Prefer:'return=minimal'}});
      const rows=await sb('weekly_plans',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([{week_start:PROFILE_DATE,household_size:householdSize,cooking_days:[],equipment,use_up:null,notes:JSON.stringify(meta),status:'profile'}])});
      return res.status(200).json({ok:true,profileId:rows?.[0]?.id||null,profile:{...meta,householdSize,equipment}})
    }
    return res.status(405).json({error:'Method not allowed'});
  }catch(e){console.error('Mealz profile error',e);return res.status(500).json({error:e.message||'Could not sync household profile.'})}
}

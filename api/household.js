import crypto from 'node:crypto';
import {sb,sbAsUser,enc,supabaseConfigured} from './_lib/supabase.js';
import {requireUser,respondAuthError} from './_lib/auth.js';
import {enforceRateLimit} from './_lib/rate-limit.js';

const CODE_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const normalizeCode=value=>String(value||'').toUpperCase().replace(/[\s-]/g,'');
const hashCode=value=>crypto.createHash('sha256').update(normalizeCode(value)).digest('hex');
function makeCode(){
  const raw=Array.from({length:8},()=>CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
  return `${raw.slice(0,4)}-${raw.slice(4)}`;
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
  if(!supabaseConfigured())return res.status(503).json({error:'Household setup is temporarily unavailable.'});
  try{
    const auth=await requireUser(req);
    if(req.method==='GET'){
      const db=(path)=>sbAsUser(auth.token,path);
      const rows=await db(`household_members?select=household_id,role&user_id=eq.${enc(auth.id)}&limit=1`);
      const member=rows?.[0];
      if(!member)return res.status(200).json({linked:false,household:null,role:null});
      const homes=await db(`households?select=id,name,join_code_hint&id=eq.${enc(member.household_id)}&limit=1`);
      if(!homes?.[0])throw new Error('Missing household');
      const profiles=await db('profiles?select=id&profile_key=eq.default&limit=1');
      return res.status(200).json({linked:true,household:homes[0],role:member.role,needsProfile:!profiles?.length});
    }
    const action=req.body?.action;
    if(!['create','join','rotate'].includes(action))return res.status(400).json({error:'Unknown household action.'});
    await enforceRateLimit(`household:${auth.id}`,10);
    const name=typeof req.body?.name==='string'?req.body.name.trim():'';
    if(action==='create'&&(!name||name.length>60))return res.status(400).json({error:'Enter a household name of 1–60 characters.'});
    if(action==='join'&&!/^[A-Z0-9]{8}$/.test(normalizeCode(req.body?.code)))return res.status(400).json({error:'Enter the eight-character household code.'});
    const code=action==='join'?normalizeCode(req.body.code):makeCode();
    const result=await sb('rpc/mealz_manage_household',{method:'POST',body:JSON.stringify({
      p_user_id:auth.id,p_action:action,p_name:name||null,p_hash:hashCode(code),p_hint:code.slice(-4)
    })});
    if(result?.error)return res.status(result.status||400).json({error:result.error});
    return res.status(action==='create'?201:200).json({ok:true,...result,...(action==='join'?{}:{joinCode:code})});
  }catch(error){
    if(respondAuthError(res,error))return;
    console.error('Household operation failed');
    return res.status(503).json({error:'Could not manage the household. Please try again. If you just created or joined one, reload to check its status.'});
  }
}

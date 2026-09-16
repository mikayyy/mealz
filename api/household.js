import crypto from 'node:crypto';
import {sb,enc,householdSchemaReady,supabaseConfigured} from './_lib/supabase.js';
import {requireUser,respondAuthError} from './_lib/auth.js';
import {startTelemetry} from './_lib/telemetry.js';

const CODE_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const cleanName=value=>String(value||'').trim().slice(0,60);
const normalizeCode=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const hashCode=value=>crypto.createHash('sha256').update(normalizeCode(value)).digest('hex');
function makeCode(){let raw='';const bytes=crypto.randomBytes(8);for(let i=0;i<8;i++)raw+=CODE_ALPHABET[bytes[i]%CODE_ALPHABET.length];return `${raw.slice(0,4)}-${raw.slice(4)}`}

async function membershipFor(userId){
  const rows=await sb(`household_members?select=household_id,role,created_at&user_id=eq.${enc(userId)}&limit=1`);
  return rows?.[0]||null;
}
async function householdFor(id){
  if(!id)return null;
  const rows=await sb(`households?select=id,name,join_code_hint,created_by,created_at,updated_at&id=eq.${enc(id)}&limit=1`);
  return rows?.[0]||null;
}
async function uniqueCode(){
  for(let i=0;i<8;i++){
    const code=makeCode(),hash=hashCode(code);
    const rows=await sb(`households?select=id&join_code_hash=eq.${enc(hash)}&limit=1`);
    if(!rows?.length)return {code,hash,hint:code.slice(-4)};
  }
  throw new Error('Could not generate a household code.');
}

export default async function handler(req,res){
  const telemetry=startTelemetry('household',{method:req.method});
  if(!supabaseConfigured()){telemetry.finish(500,{reason:'supabase_not_configured'});return res.status(500).json({error:'Supabase is not configured.'})}
  try{
    const auth=await requireUser(req,{allowLegacy:false});
    if(!await householdSchemaReady()){telemetry.finish(409,{reason:'household_schema_missing'});return res.status(409).json({error:'Household setup is not ready yet.',code:'HOUSEHOLD_SCHEMA_REQUIRED'})}
    const membership=await membershipFor(auth.id);

    if(req.method==='GET'){
      const household=membership?await householdFor(membership.household_id):null;
      telemetry.finish(200,{linked:!!household,role:membership?.role||null});
      return res.status(200).json({linked:!!household,household,role:membership?.role||null});
    }

    if(req.method==='POST'){
      const action=String(req.body?.action||'');
      if(membership)return res.status(409).json({error:'This account is already linked to a household.',code:'HOUSEHOLD_ALREADY_LINKED'});

      if(action==='create'){
        const name=cleanName(req.body?.name);
        if(!name)return res.status(400).json({error:'Household name is required.'});
        const invite=await uniqueCode();
        const households=await sb('households',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([{name,created_by:auth.id,join_code_hash:invite.hash,join_code_hint:invite.hint}])});
        const household=households?.[0];
        if(!household?.id)throw new Error('Could not create household.');
        try{
          await sb('household_members',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify([{household_id:household.id,user_id:auth.id,role:'owner'}])});
        }catch(error){
          try{await sb(`households?id=eq.${enc(household.id)}`,{method:'DELETE',headers:{Prefer:'return=minimal'}})}catch{}
          throw error;
        }
        telemetry.finish(201,{action:'create'});
        return res.status(201).json({ok:true,household:{id:household.id,name:household.name},role:'owner',joinCode:invite.code});
      }

      if(action==='join'){
        const normalized=normalizeCode(req.body?.code);
        if(normalized.length!==8)return res.status(400).json({error:'Enter a valid household code.'});
        const hash=hashCode(normalized);
        const households=await sb(`households?select=id,name&join_code_hash=eq.${enc(hash)}&limit=1`);
        const household=households?.[0];
        if(!household)return res.status(404).json({error:'That household code was not found.',code:'HOUSEHOLD_CODE_NOT_FOUND'});
        await sb('household_members',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify([{household_id:household.id,user_id:auth.id,role:'member'}])});
        telemetry.finish(200,{action:'join'});
        return res.status(200).json({ok:true,household,role:'member'});
      }

      return res.status(400).json({error:'Unknown household action.'});
    }

    telemetry.finish(405);return res.status(405).json({error:'Method not allowed'});
  }catch(error){
    if(respondAuthError(res,error)){telemetry.finish(error.status||401,{reason:'auth'});return}
    telemetry.fail(error);return res.status(500).json({error:error.message||'Could not manage household.'});
  }
}

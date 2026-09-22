import {AuthError} from './auth.js';
import {REQUIRED_TABLES,REQUIRED_COLUMNS} from '../../migrations/manifest.js';
const PUBLIC_KEY=()=>process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY||'';
export function supabaseConfigured(){return !!(process.env.SUPABASE_URL&&process.env.SUPABASE_SECRET_KEY)}
export const enc=value=>encodeURIComponent(String(value));

async function request(path,options={},headers={}){
  const timeoutMs=options.timeoutMs||12000;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const {timeoutMs:_,headers:optionHeaders,...rest}=options;
    const response=await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`,{
      ...rest,
      signal:controller.signal,
      headers:{'Content-Type':'application/json',...headers,...(optionHeaders||{})}
    });
    const text=await response.text();
    let data=null;
    if(text){try{data=JSON.parse(text)}catch{data=text}}
    if(!response.ok)throw new Error(typeof data==='object'?(data.message||data.hint||JSON.stringify(data)):data||`Supabase request failed (${response.status})`);
    return data;
  }catch(error){
    if(error?.name==='AbortError')throw new Error('Cloud database request timed out.');
    throw error;
  }finally{clearTimeout(timer)}
}

export async function sb(path,options={}){
  return request(path,options,{apikey:process.env.SUPABASE_SECRET_KEY});
}

export async function sbAsUser(token,path,options={}){
  const key=PUBLIC_KEY();
  if(!key||!token)throw new Error('Authenticated database access is not configured.');
  return request(path,options,{apikey:key,Authorization:`Bearer ${token}`});
}

let householdCheck={value:false,checkedAt:0};
/**
 * Verifies that the full required migration set has been applied before the
 * application attempts household-scoped data access. Probes every table and
 * column listed in migrations/manifest.js via the PostgREST API, using the
 * same REST pattern as the live preflight check. Returns false if any check
 * fails; never throws.
 *
 * Caches the result for 30 s to avoid probing on every request.
 */
export async function householdSchemaReady(){
  const now=Date.now();
  if(now-householdCheck.checkedAt<30000)return householdCheck.value;
  try{
    for (const table of REQUIRED_TABLES) {
      await sb(`${table}?select=id&limit=0`);
    }
    for (const [table, cols] of Object.entries(REQUIRED_COLUMNS)) {
      for (const col of cols) {
        await sb(`${table}?select=${col}&limit=0`);
      }
    }
    householdCheck={value:true,checkedAt:now};
  }catch{
    householdCheck={value:false,checkedAt:now};
  }
  return householdCheck.value;
}

export async function dataDb(auth){
  if(!auth?.id||!auth?.token)throw new AuthError();
  const db=(path,options={})=>sbAsUser(auth.token,path,options);
  // Never retry a failed user-scoped query with the service key.
  const memberships=await db(`household_members?select=household_id,role&user_id=eq.${enc(auth.id)}&limit=1`);
  const membership=memberships?.[0];
  if(!membership)throw new AuthError('Create or join a household to continue.',403);
  return {owned:true,household:true,householdId:membership.household_id,householdRole:membership.role,db};
}

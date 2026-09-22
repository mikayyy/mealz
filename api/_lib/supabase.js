import {AuthError} from './auth.js';
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
 * application attempts household-scoped data access. Checks go beyond table
 * existence: we probe for a column that only appears after the household
 * migration, the rate-limit RPC, and the grocery editable-list column
 * introduced in v0.21.0. Returns false if any check fails; never throws.
 *
 * Caches the result for 30 s to avoid probing on every request.
 */
export async function householdSchemaReady(){
  const now=Date.now();
  if(now-householdCheck.checkedAt<30000)return householdCheck.value;
  try{
    // Probe for required tables and critical columns introduced by each phase.
    // household_id on weekly_plans: v0.16.1 household migration
    await sb('weekly_plans?select=household_id&limit=0');
    // household_members with role column: v0.16.1
    await sb('household_members?select=household_id,user_id,role&limit=0');
    // source column on grocery_items: v0.21.0 editable groceries
    await sb('grocery_items?select=id,source,deleted&limit=0');
    // mealz_rate_limits: v0.17.0 account security
    await sb('mealz_rate_limits?select=bucket_key&limit=0');
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

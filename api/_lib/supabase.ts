import {AuthError} from './auth.js';
import {SCHEMA_PROBES} from '../../migrations/manifest.js';
import type { DatabaseRequestOptions } from '../../types.js';
import {abortable,requestTimeout} from './deadline.js';

const PUBLIC_KEY=()=>process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY||'';
export class DatabaseError extends Error{
  status: number;
  code: string;
  constructor(message: string,status: number,code=''){super(message);this.name='DatabaseError';this.status=status;this.code=code}
}
export function supabaseConfigured(){return !!(process.env.SUPABASE_URL&&process.env.SUPABASE_SECRET_KEY)}
export const enc=(value: unknown)=>encodeURIComponent(String(value));

async function request(path: string, options: DatabaseRequestOptions = {}, headers: Record<string, string> = {}){
  const timeoutMs=Number(options.timeoutMs)||12000;
  const timeout=requestTimeout(timeoutMs,options.signal);
  try{
    const {timeoutMs:_,headers:optionHeaders,...rest}=options;
    timeout.signal.throwIfAborted();
    const response=await abortable(fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`,{
      ...(rest as any),
      signal:timeout.signal,
      headers:{'Content-Type':'application/json',...headers,...((optionHeaders as Record<string, string>)||{})}
    }),timeout.signal);
    const text=await abortable(response.text(),timeout.signal);
    let data=null;
    if(text){try{data=JSON.parse(text)}catch{data=text}}
    if(!response.ok)throw new DatabaseError(typeof data==='object'?(data?.message||data?.hint||JSON.stringify(data)):data||`Supabase request failed (${response.status})`,response.status,data?.code||'');
    return data;
  }catch(error){
    if(options.signal?.aborted)throw options.signal.reason;
    if(error?.name==='AbortError')throw new Error('Cloud database request timed out.');
    throw error;
  }finally{timeout.dispose()}
}

export async function sb(path: string, options: DatabaseRequestOptions = {}){
  return request(path,options,{apikey:process.env.SUPABASE_SECRET_KEY as string});
}

export async function sbAsUser(token: string, path: string, options: DatabaseRequestOptions = {}){
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
    for (const {path} of SCHEMA_PROBES) await sb(path);
    householdCheck={value:true,checkedAt:now};
  }catch{
    householdCheck={value:false,checkedAt:now};
  }
  return householdCheck.value;
}

export async function dataDb(auth: {id: string; token: string},{signal}: {signal?: AbortSignal}={}){
  if(!auth?.id||!auth?.token)throw new AuthError();
  const db=(path: string, options: DatabaseRequestOptions={})=>sbAsUser(auth.token,path,{...options,signal:signal&&options.signal?AbortSignal.any([signal,options.signal]):signal||options.signal});
  // Never retry a failed user-scoped query with the service key.
  const memberships=await db(`household_members?select=household_id,role&user_id=eq.${enc(auth.id)}&limit=1`);
  const membership=memberships?.[0];
  if(!membership)throw new AuthError('Create or join a household to continue.',403);
  return {owned:true,household:true,householdId:membership.household_id,householdRole:membership.role,db};
}

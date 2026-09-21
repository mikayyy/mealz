import {sb} from './supabase.js';
import {AuthError} from './auth.js';

// Postgres counters hold across serverless instances and cold starts.
export async function enforceRateLimit(key,limit,windowSeconds=900){
  let result;
  try{
    result=await sb('rpc/mealz_take_rate_limit',{method:'POST',body:JSON.stringify({p_key:key,p_limit:limit,p_window_seconds:windowSeconds})});
  }catch{
    throw new AuthError('This action is temporarily unavailable. Please try again later.',503);
  }
  if(!result?.allowed){
    const error=new AuthError('Too many attempts. Please wait a few minutes and try again.',429);
    /** @type {AuthError & {retryAfter?: number}} */(error).retryAfter=result?.retry_after||windowSeconds;
    throw error;
  }
}

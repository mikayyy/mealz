const PUBLIC_KEY=()=>process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY||'';

export class AuthError extends Error{
  constructor(message='Authentication required.',status=401){super(message);this.name='AuthError';this.status=status}
}

export function authConfigured(){return !!(process.env.SUPABASE_URL&&PUBLIC_KEY())}
export function bearerToken(req){
  const raw=String(req?.headers?.authorization||req?.headers?.Authorization||'');
  const match=raw.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim()||'';
}

export async function requireUser(req,{allowLegacy=true}={}){
  if(!authConfigured()){
    if(allowLegacy)return {id:null,email:null,token:null,mode:'legacy'};
    throw new AuthError('Authentication is not configured.',503);
  }
  const token=bearerToken(req);
  if(!token)throw new AuthError();
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),8000);
  try{
    const response=await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`,{
      signal:controller.signal,
      headers:{apikey:PUBLIC_KEY(),Authorization:`Bearer ${token}`}
    });
    if(!response.ok)throw new AuthError('Your session has expired. Please sign in again.',401);
    const user=await response.json();
    if(!user?.id)throw new AuthError();
    return {id:user.id,email:user.email||null,token,mode:'authenticated'};
  }catch(error){
    if(error instanceof AuthError)throw error;
    if(error?.name==='AbortError')throw new AuthError('Authentication check timed out. Please try again.',503);
    throw new AuthError('Could not verify your session. Please try again.',503);
  }finally{clearTimeout(timer)}
}

export function respondAuthError(res,error){
  if(!(error instanceof AuthError))return false;
  res.status(error.status||401).json({error:error.message,code:'AUTH_REQUIRED'});
  return true;
}

export function publicAuthConfig(){
  const key=PUBLIC_KEY();
  return {enabled:!!(process.env.SUPABASE_URL&&key),supabaseUrl:process.env.SUPABASE_URL||null,publishableKey:key||null};
}

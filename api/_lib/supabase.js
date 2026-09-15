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

let ownershipCheck={value:false,checkedAt:0};
export async function ownershipSchemaReady(){
  const now=Date.now();
  if(now-ownershipCheck.checkedAt<30000)return ownershipCheck.value;
  try{
    await sb('weekly_plans?select=owner_user_id&limit=0');
    await sb('profiles?select=owner_user_id&limit=0');
    ownershipCheck={value:true,checkedAt:now};
  }catch{
    ownershipCheck={value:false,checkedAt:now};
  }
  return ownershipCheck.value;
}

export async function dataDb(auth){
  const owned=!!(auth?.id&&auth?.token&&await ownershipSchemaReady());
  return {
    owned,
    db:owned?(path,options={})=>sbAsUser(auth.token,path,options):sb
  };
}

export function supabaseConfigured(){return !!(process.env.SUPABASE_URL&&process.env.SUPABASE_SECRET_KEY)}
export const enc=value=>encodeURIComponent(String(value));
export async function sb(path,options={}){
  const timeoutMs=options.timeoutMs||12000;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const {timeoutMs:_,headers,...rest}=options;
    const response=await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`,{
      ...rest,
      signal:controller.signal,
      headers:{apikey:process.env.SUPABASE_SECRET_KEY,'Content-Type':'application/json',...(headers||{})}
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

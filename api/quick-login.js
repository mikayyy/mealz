import crypto from 'node:crypto';
import {sb,enc,supabaseConfigured} from './_lib/supabase.js';
import {requireUser,respondAuthError,AuthError} from './_lib/auth.js';
import {enforceRateLimit} from './_lib/rate-limit.js';

const PIN_RE=/^\d{4}$/;
const TOKEN_BYTES=32;
const SCRYPT_OPTIONS={N:16384,r:8,p:1,maxmem:64*1024*1024};

const tokenHash=value=>crypto.createHash('sha256').update(String(value||'')).digest('hex');
function hashPin(pin,salt=crypto.randomBytes(16).toString('base64url')){
  const hash=crypto.scryptSync(pin,salt,32,SCRYPT_OPTIONS).toString('base64url');
  return {salt,hash};
}
function pinMatches(pin,salt,expected){
  try{
    const actual=Buffer.from(hashPin(pin,salt).hash);
    const wanted=Buffer.from(String(expected||''));
    return actual.length===wanted.length&&crypto.timingSafeEqual(actual,wanted);
  }catch{return false}
}
async function adminGenerateLogin(email){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),8000);
  try{
    const response=await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/generate_link`,{
      method:'POST',
      signal:controller.signal,
      headers:{
        apikey:process.env.SUPABASE_SECRET_KEY,
        Authorization:`Bearer ${process.env.SUPABASE_SECRET_KEY}`,
        'Content-Type':'application/json'
      },
      body:JSON.stringify({type:'magiclink',email})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data?.hashed_token)throw new Error('Could not issue quick-login token.');
    return data.hashed_token;
  }finally{clearTimeout(timer)}
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(!supabaseConfigured())return res.status(503).json({error:'Quick login is temporarily unavailable.'});
  try{
    const action=req.body?.action;
    if(!['setup','unlock','revoke'].includes(action))return res.status(400).json({error:'Unknown quick-login action.'});

    if(action==='unlock'){
      const deviceToken=String(req.body?.deviceToken||''),pin=String(req.body?.pin||'');
      if(deviceToken.length<32||deviceToken.length>200||!PIN_RE.test(pin))return res.status(400).json({error:'Enter the 4-digit code.'});
      const hash=tokenHash(deviceToken);
      await enforceRateLimit(`quick-login:${hash}`,5,60);
      const rows=await sb(`mealz_trusted_devices?select=id,user_id,email,label,pin_salt,pin_hash&device_token_hash=eq.${enc(hash)}&revoked_at=is.null&limit=1`);
      const device=rows?.[0];
      if(!device||!pinMatches(pin,device.pin_salt,device.pin_hash))return res.status(401).json({error:'That code did not work.'});
      const tokenHashValue=await adminGenerateLogin(device.email);
      await sb(`mealz_trusted_devices?id=eq.${enc(device.id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({last_used_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
      return res.status(200).json({ok:true,tokenHash:tokenHashValue,label:device.label,email:device.email});
    }

    const auth=await requireUser(req);
    await enforceRateLimit(`quick-login-manage:${auth.id}`,10,900);

    if(action==='revoke'){
      const deviceToken=String(req.body?.deviceToken||'');
      if(deviceToken.length<32||deviceToken.length>200)return res.status(400).json({error:'Invalid remembered device.'});
      await sb(`mealz_trusted_devices?user_id=eq.${enc(auth.id)}&device_token_hash=eq.${enc(tokenHash(deviceToken))}&revoked_at=is.null`,{
        method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({revoked_at:new Date().toISOString(),updated_at:new Date().toISOString()})
      });
      return res.status(200).json({ok:true});
    }

    const pin=String(req.body?.pin||''),label=String(req.body?.label||'').trim(),previousDeviceToken=String(req.body?.previousDeviceToken||'');
    if(!PIN_RE.test(pin))return res.status(400).json({error:'Choose exactly four digits.'});
    if(!label||label.length>40)return res.status(400).json({error:'Choose a name of 1–40 characters.'});
    if(!auth.email)return res.status(400).json({error:'This account needs an email address for quick login.'});

    if(previousDeviceToken){
      await sb(`mealz_trusted_devices?user_id=eq.${enc(auth.id)}&device_token_hash=eq.${enc(tokenHash(previousDeviceToken))}&revoked_at=is.null`,{
        method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({revoked_at:new Date().toISOString(),updated_at:new Date().toISOString()})
      });
    }

    const deviceToken=crypto.randomBytes(TOKEN_BYTES).toString('base64url');
    const pinRecord=hashPin(pin);
    await sb('mealz_trusted_devices',{
      method:'POST',
      headers:{Prefer:'return=minimal'},
      body:JSON.stringify({
        user_id:auth.id,
        email:auth.email,
        label,
        device_token_hash:tokenHash(deviceToken),
        pin_salt:pinRecord.salt,
        pin_hash:pinRecord.hash
      })
    });
    return res.status(201).json({ok:true,userId:auth.id,email:auth.email,label,deviceToken});
  }catch(error){
    if(respondAuthError(res,error))return;
    console.error('Quick login failed');
    return res.status(503).json({error:'Quick login is temporarily unavailable. Use your full sign-in and try again later.'});
  }
}

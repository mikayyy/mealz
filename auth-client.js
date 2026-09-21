// Supabase remains the source of truth. Quick login is a trusted-device convenience layer.
(()=>{
  const nativeFetch=window.fetch.bind(window);
  const QUICK_KEY='mealz:quick-login:v1';
  const QUICK_OFFER_KEY='mealz:offer-quick-login';
  const QUICK_UNLOCK_KEY='mealz:quick-unlocked';
  const PIN_ATTEMPT_LIMIT=5;
  const PIN_COOLDOWN_MS=60000;
  const PBKDF2_ITERATIONS=310000;
  let state={initialized:false,session:null,user:null,client:null};
  let resolveReady;
  const ready=new Promise(resolve=>{resolveReady=resolve});
  let recovering=new URLSearchParams(location.search).get('reset')==='1';

  const escape=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const bytesToBase64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
  const base64ToBytes=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
  const quickAccounts=()=>{try{const value=JSON.parse(localStorage.getItem(QUICK_KEY)||'[]');return Array.isArray(value)?value:[]}catch{return []}};
  const saveQuickAccounts=accounts=>localStorage.setItem(QUICK_KEY,JSON.stringify(accounts));
  const rememberedFor=userId=>quickAccounts().find(account=>account.userId===userId)||null;
  const defaultLabel=email=>String(email||'account').split('@')[0].replace(/[._-]+/g,' ').trim()||'account';

  function clearAccountCache(userId){
    if(!userId)return;
    for(const key of Object.keys(localStorage))if(key.startsWith(`mealz:${userId}:`))localStorage.removeItem(key);
  }
  function gate(){
    let node=document.querySelector('#mealzAuthGate');
    if(!node){node=document.createElement('div');node.id='mealzAuthGate';node.className='auth-gate';document.body.appendChild(node)}
    document.querySelector('#app')?.setAttribute('inert','');
    return node;
  }
  function removeGate(){document.querySelector('#mealzAuthGate')?.remove();document.querySelector('#app')?.removeAttribute('inert')}

  async function derivePinKey(pin,salt){
    const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:PBKDF2_ITERATIONS,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }
  async function encryptSession(pin,session){
    const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
    const key=await derivePinKey(pin,salt);
    const plain=new TextEncoder().encode(JSON.stringify({access_token:session.access_token,refresh_token:session.refresh_token}));
    const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain);
    return {salt:bytesToBase64(salt),iv:bytesToBase64(iv),ciphertext:bytesToBase64(ciphertext)};
  }
  async function decryptSession(pin,account){
    const key=await derivePinKey(pin,base64ToBytes(account.salt));
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:base64ToBytes(account.iv)},key,base64ToBytes(account.ciphertext));
    return JSON.parse(new TextDecoder().decode(plain));
  }
  function upsertRemembered(record){
    const accounts=quickAccounts().filter(account=>account.userId!==record.userId);
    accounts.unshift(record);saveQuickAccounts(accounts.slice(0,8));
  }
  function forgetRemembered(userId){saveQuickAccounts(quickAccounts().filter(account=>account.userId!==userId))}
  function updateRemembered(userId,patch){
    saveQuickAccounts(quickAccounts().map(account=>account.userId===userId?{...account,...patch}:account));
  }
  function lockedFor(account){
    const remaining=Number(account.lockedUntil||0)-Date.now();
    return Math.max(0,remaining);
  }

  function authShell(title,copy,body,message=''){
    return `<div class="auth-card"><div class="auth-wordmark" aria-label="mealz">meal<span class="brand-z" aria-hidden="true">z</span></div><p class="auth-tagline">already sorted.</p><h1>${title}</h1><p class="auth-copy">${copy}</p>${body}<p class="auth-message" id="mealzAuthMessage" role="status" aria-live="polite">${escape(message)}</p></div>`;
  }
  function renderRemembered(message=''){
    const accounts=quickAccounts(),node=gate();
    if(!accounts.length)return renderGate('signin',message);
    node.innerHTML=authShell('who’s planning?','choose a remembered account on this device.',`
      <div class="remembered-list">${accounts.map(account=>`<button class="remembered-account" data-quick-user="${escape(account.userId)}"><span class="remembered-name">${escape(account.label||defaultLabel(account.email))}</span><span class="remembered-email">${escape(account.email)}</span></button>`).join('')}</div>
      <div class="auth-links"><button id="quickAddAccount">add another person</button></div>`,message);
    node.querySelectorAll('[data-quick-user]').forEach(button=>button.onclick=()=>renderPin(button.dataset.quickUser));
    node.querySelector('#quickAddAccount').onclick=()=>renderGate('signin');
  }
  function renderPin(userId,message=''){
    const account=rememberedFor(userId);if(!account)return renderRemembered();
    const node=gate(),wait=lockedFor(account);
    node.innerHTML=authShell('your code',`${escape(account.label||defaultLabel(account.email))} · ${escape(account.email)}`,`
      <form id="quickPinForm">
        <label for="quickPin">4-digit code</label>
        <input id="quickPin" class="pin-input" type="password" inputmode="numeric" autocomplete="off" pattern="[0-9]{4}" maxlength="4" required aria-label="4-digit code" ${wait?'disabled':''}>
        <button class="primary" type="submit" ${wait?'disabled':''}>unlock</button>
      </form>
      <div class="auth-links"><button id="quickBack">back</button><button id="quickForget">forget this account</button></div>`,wait?`too many attempts. try again in ${Math.ceil(wait/1000)} seconds.`:message);
    node.querySelector('#quickBack').onclick=()=>renderRemembered();
    node.querySelector('#quickForget').onclick=()=>{forgetRemembered(userId);renderRemembered('account forgotten on this device.')};
    const form=node.querySelector('#quickPinForm');
    if(wait){setTimeout(()=>{if(document.querySelector('#quickPinForm'))renderPin(userId)},Math.min(wait+100,PIN_COOLDOWN_MS));return}
    form.onsubmit=async event=>{
      event.preventDefault();
      const input=node.querySelector('#quickPin'),button=form.querySelector('button[type=submit]'),status=node.querySelector('#mealzAuthMessage');
      const pin=input.value.trim();if(!/^\d{4}$/.test(pin)){status.textContent='enter four digits.';return}
      button.disabled=true;input.disabled=true;status.textContent='opening…';
      try{
        const session=await decryptSession(pin,account);
        const result=await state.client.auth.setSession(session);
        if(result.error)throw result.error;
        updateRemembered(userId,{attempts:0,lockedUntil:0,lastUsedAt:Date.now()});
        sessionStorage.setItem(QUICK_UNLOCK_KEY,'1');
        location.reload();
      }catch(error){
        const latest=rememberedFor(userId)||account,attempts=Number(latest.attempts||0)+1;
        const lockedUntil=attempts>=PIN_ATTEMPT_LIMIT?Date.now()+PIN_COOLDOWN_MS:0;
        updateRemembered(userId,{attempts:lockedUntil?0:attempts,lockedUntil});
        renderPin(userId,lockedUntil?'too many attempts. wait a minute, then try again.':'that code did not work.');
      }
    };
  }

  function renderQuickSetup(message=''){
    if(!state.session||!state.user)return removeGate();
    const node=gate(),existing=rememberedFor(state.user.id);
    node.innerHTML=authShell(existing?'update quick login':'make this device yours?','next time, choose your name and use a 4-digit code. your code stays on this device.',`
      <form id="quickSetupForm">
        <label for="quickLabel">name on this device</label>
        <input id="quickLabel" maxlength="40" autocomplete="nickname" value="${escape(existing?.label||defaultLabel(state.user.email))}" required>
        <label for="quickSetupPin">choose a 4-digit code</label>
        <input id="quickSetupPin" class="pin-input" type="password" inputmode="numeric" autocomplete="new-password" pattern="[0-9]{4}" maxlength="4" required>
        <label for="quickConfirmPin">confirm code</label>
        <input id="quickConfirmPin" class="pin-input" type="password" inputmode="numeric" autocomplete="new-password" pattern="[0-9]{4}" maxlength="4" required>
        <button class="primary" type="submit">save quick login</button>
      </form>
      <div class="auth-links"><button id="quickSetupSkip">not now</button></div>`,message);
    node.querySelector('#quickSetupSkip').onclick=()=>{sessionStorage.removeItem(QUICK_OFFER_KEY);removeGate()};
    node.querySelector('#quickSetupForm').onsubmit=async event=>{
      event.preventDefault();
      const form=event.currentTarget,status=node.querySelector('#mealzAuthMessage'),pin=form.querySelector('#quickSetupPin').value,confirm=form.querySelector('#quickConfirmPin').value,label=form.querySelector('#quickLabel').value.trim();
      if(!/^\d{4}$/.test(pin)){status.textContent='choose exactly four digits.';return}
      if(pin!==confirm){status.textContent='the codes do not match.';return}
      const button=form.querySelector('button[type=submit]');button.disabled=true;status.textContent='saving…';
      try{
        const encrypted=await encryptSession(pin,state.session);
        upsertRemembered({userId:state.user.id,email:state.user.email||'',label:label||defaultLabel(state.user.email),...encrypted,attempts:0,lockedUntil:0,createdAt:existing?.createdAt||Date.now(),lastUsedAt:Date.now()});
        sessionStorage.removeItem(QUICK_OFFER_KEY);removeGate();
      }catch(error){button.disabled=false;status.textContent='quick login could not be saved. try again.'}
    };
  }

  function renderGate(mode='signin',message=''){
    const node=gate();
    const title={signin:'sign in',signup:'create your account',reset:'reset your password',password:'choose a password',reauth:'confirm it’s you',error:'Unable to connect'}[mode];
    const hasPassword=['signin','signup','password','reauth'].includes(mode);
    const copy=mode==='signup'?'next, create a household or join the people you cook with.':mode==='reset'?'we’ll email you a link to choose a password. existing mealz accounts can use this too.':mode==='password'?'use at least 8 characters.':mode==='reauth'?'enter your account password before changing sensitive settings.':'use your full sign-in once on this device. quick login can come next.';
    node.innerHTML=authShell(title,copy,mode==='error'?'<button id="authRetry" class="primary">try again</button>':`<form id="mealzAuthForm">${mode!=='password'?`<label for="mealzAuthEmail">email</label><input id="mealzAuthEmail" type="email" autocomplete="email" required maxlength="254" ${mode==='reauth'?`value="${escape(state.user?.email||'')}" readonly`:''}>`:''}${hasPassword?`<label for="mealzAuthPassword">password</label><div class="password-field"><input id="mealzAuthPassword" type="password" autocomplete="${mode==='signin'?'current-password':'new-password'}" required minlength="${mode==='signin'?1:8}" maxlength="128"><button id="togglePassword" class="password-toggle" type="button" aria-controls="mealzAuthPassword" aria-label="show password" title="show password" data-revealed="false"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path class="eye-slash" d="m3 3 18 18"/></svg></button></div>`:''}<button class="primary" type="submit">${{signin:'sign in',signup:'create account',reset:'send reset link',password:'save password',reauth:'continue'}[mode]}</button></form><div class="auth-links">${mode==='signin'?'<button data-mode="signup">create an account</button><button data-mode="reset">forgot or need a password?</button>'+(quickAccounts().length?'<button id="backToRemembered">remembered accounts</button>':''):mode==='password'?'<button id="passwordCancel">cancel</button>':'<button data-mode="signin">back to sign in</button>'}</div>`,message);
    node.querySelector('#authRetry')?.addEventListener('click',()=>location.reload());
    node.querySelector('#backToRemembered')?.addEventListener('click',()=>renderRemembered());
    node.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>renderGate(button.dataset.mode));
    node.querySelector('#passwordCancel')?.addEventListener('click',()=>{recovering=false;history.replaceState(null,'',location.pathname);location.reload()});
    node.querySelector('#togglePassword')?.addEventListener('click',event=>{
      const input=node.querySelector('#mealzAuthPassword'),visible=input.type==='password';
      input.type=visible?'text':'password';const button=event.currentTarget,label=visible?'hide password':'show password';
      button.dataset.revealed=String(visible);button.setAttribute('aria-label',label);button.title=label;
    });
    const form=node.querySelector('form');if(!form)return;
    form.onsubmit=async event=>{
      event.preventDefault();
      const button=form.querySelector('button[type="submit"]'),status=node.querySelector('#mealzAuthMessage'),email=form.querySelector('input[type=email]')?.value.trim(),password=form.querySelector('#mealzAuthPassword')?.value;
      button.disabled=true;status.textContent='please wait…';
      try{
        const auth=state.client.auth;let result;
        if(mode==='signin'||mode==='reauth')result=await auth.signInWithPassword({email,password});
        if(mode==='signup')result=await auth.signUp({email,password,options:{emailRedirectTo:location.origin}});
        if(mode==='reset')result=await auth.resetPasswordForEmail(email,{redirectTo:`${location.origin}/?reset=1`});
        if(mode==='password')result=await auth.updateUser({password});
        if(result.error)throw result.error;
        if(mode==='reauth'){sessionStorage.removeItem(QUICK_UNLOCK_KEY);renderGate('password');return}
        if(mode==='password'){recovering=false;history.replaceState(null,'',location.pathname);location.reload();return}
        if(result.data?.session){sessionStorage.removeItem(QUICK_UNLOCK_KEY);sessionStorage.setItem(QUICK_OFFER_KEY,'1');location.reload();return}
        status.textContent=mode==='reset'?'if an account exists for that email, a reset link is on its way.':'check your email to confirm your account, then return here to sign in.';
      }catch(error){status.textContent=error.message||'Please try again.'}
      finally{if(button.isConnected)button.disabled=false}
    };
  }

  async function fetchConfig(){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
    try{const response=await nativeFetch('/api/auth-config',{cache:'no-store',signal:controller.signal});if(!response.ok)throw new Error('Could not load sign-in settings.');return await response.json()}
    finally{clearTimeout(timer)}
  }
  function authResponse(){return new Response(JSON.stringify({error:'Please sign in to continue.',code:'AUTH_REQUIRED'}),{status:401,headers:{'Content-Type':'application/json'}})}
  window.fetch=async(input,init={})=>{
    const url=new URL(typeof input==='string'?input:input.url,location.origin);
    if(url.origin!==location.origin||!url.pathname.startsWith('/api/')||url.pathname==='/api/auth-config')return nativeFetch(input,init);
    await ready;const auth=state;if(!auth.session)return authResponse();
    const requestUser=auth.user.id,headers=new Headers(init.headers||(typeof input!=='string'?input.headers:undefined)||{});
    headers.set('Authorization',`Bearer ${auth.session.access_token}`);
    const response=await nativeFetch(input,{...init,headers});
    if(state.user?.id!==requestUser)return authResponse();
    if(response.status===401){clearAccountCache(state.user?.id);state.session=null;state.user=null;document.querySelector('#app')?.replaceChildren();renderRemembered('your session expired. use quick login or sign in again.')}
    return response;
  };

  async function init(){
    gate().innerHTML='<div class="auth-card"><p role="status">opening mealz…</p></div>';
    try{
      const config=await fetchConfig();if(!config?.enabled)throw new Error('Sign-in is not configured. Please contact the household owner.');
      const createClient=globalThis.supabase?.createClient;if(!createClient)throw new Error('Sign-in could not load. Check your connection and try again.');
      const client=createClient(config.supabaseUrl,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});state.client=client;
      client.auth.onAuthStateChange((event,session)=>{
        const previous=state.user?.id;state.session=session||null;state.user=session?.user||null;
        if(event==='PASSWORD_RECOVERY'){recovering=true;setTimeout(()=>renderGate('password'),0)}
        if(state.initialized&&previous!==state.user?.id){clearAccountCache(previous);document.querySelector('#app')?.replaceChildren();gate();setTimeout(()=>location.reload(),0)}
      });
      let timer;const {data,error}=await Promise.race([client.auth.getSession(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Sign-in timed out. Please try again.')),10000)})]).finally(()=>clearTimeout(timer));
      if(error)throw error;state.session=data?.session||null;state.user=state.session?.user||null;
      if(!state.session)renderRemembered(recovering?'your reset link expired. request another link below.':'');
      else if(recovering)renderGate('password');
      else if(sessionStorage.getItem(QUICK_OFFER_KEY)==='1'&&!rememberedFor(state.user.id))renderQuickSetup();
      else removeGate();
    }catch(error){renderGate('error',error.message||'Could not connect. Please try again.')}
    finally{state.initialized=true;resolveReady(state)}
  }

  window.MealzAuth={
    ready,
    get session(){return state.session},get user(){return state.user},get recovering(){return recovering},
    get quickLoginEnabled(){return !!rememberedFor(state.user?.id)},
    changePassword(){sessionStorage.getItem(QUICK_UNLOCK_KEY)==='1'?renderGate('reauth'):renderGate('password')},
    setupQuickLogin(){renderQuickSetup()},
    forgetQuickLogin(){if(state.user?.id)forgetRemembered(state.user.id)},
    async signOut({forgetDevice=false}={}){
      const previous=state.user?.id;if(forgetDevice)forgetRemembered(previous);
      const {error}=await state.client.auth.signOut({scope:'local'});if(error)throw error;
      clearAccountCache(previous);state.session=null;state.user=null;document.querySelector('#app')?.replaceChildren();location.reload();
    }
  };
  init();
})();

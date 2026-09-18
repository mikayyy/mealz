// Keep async work outside Supabase auth callbacks to avoid session-lock deadlocks.
(()=>{
  const nativeFetch=window.fetch.bind(window);
  let state={initialized:false,session:null,user:null,client:null};
  let resolveReady;
  const ready=new Promise(resolve=>{resolveReady=resolve});
  let recovering=new URLSearchParams(location.search).get('reset')==='1';
  function clearAccountCache(userId){
    if(!userId)return;
    for(const key of Object.keys(localStorage))if(key.startsWith(`mealz:${userId}:`))localStorage.removeItem(key);
  }
  const escape=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function gate(){
    let node=document.querySelector('#mealzAuthGate');
    if(!node){node=document.createElement('div');node.id='mealzAuthGate';node.className='auth-gate';document.body.appendChild(node)}
    document.querySelector('#app')?.setAttribute('inert','');
    return node;
  }
  function removeGate(){document.querySelector('#mealzAuthGate')?.remove();document.querySelector('#app')?.removeAttribute('inert')}
  function renderGate(mode='signin',message=''){
    const node=gate();
    const title={signin:'Welcome back',signup:'Create your account',reset:'Reset your password',password:'Choose a password',error:'Unable to connect'}[mode];
    const hasPassword=['signin','signup','password'].includes(mode);
    node.innerHTML=`<div class="auth-card"><div class="auth-wordmark">mealz</div><p class="auth-tagline">less planning. more good food.</p><h1>${title}</h1><p class="auth-copy">${mode==='signup'?'Next, create a household or join the people you cook with.':mode==='reset'?'We’ll email you a link to choose a password. Existing mealz accounts can use this too.':mode==='password'?'Use at least 8 characters.':'Your household’s meals, all in one place.'}</p>${mode==='error'?'<button id="authRetry" class="primary">Try again</button>':`<form id="mealzAuthForm">${mode!=='password'?'<label for="mealzAuthEmail">Email</label><input id="mealzAuthEmail" type="email" autocomplete="email" required maxlength="254">':''}${hasPassword?`<label for="mealzAuthPassword">Password</label><div class="password-field"><input id="mealzAuthPassword" type="password" autocomplete="${mode==='signin'?'current-password':'new-password'}" required minlength="${mode==='signin'?1:8}" maxlength="128"><button id="togglePassword" class="password-toggle" type="button" aria-controls="mealzAuthPassword" aria-label="Show password" title="Show password" data-revealed="false"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path class="eye-slash" d="m3 3 18 18"/></svg></button></div>`:''}<button class="primary" type="submit">${{signin:'Sign in',signup:'Create account',reset:'Send reset link',password:'Save password'}[mode]}</button></form><div class="auth-links">${mode==='signin'?'<button data-mode="signup">Create an account</button><button data-mode="reset">Forgot or need a password?</button>':mode==='password'?'<button id="passwordCancel">Cancel</button>':'<button data-mode="signin">Back to sign in</button>'}</div>`}<p class="auth-message" id="mealzAuthMessage" role="status" aria-live="polite">${escape(message)}</p></div>`;
    node.querySelector('#authRetry')?.addEventListener('click',()=>location.reload());
    node.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>renderGate(button.dataset.mode));
    node.querySelector('#passwordCancel')?.addEventListener('click',()=>{recovering=false;history.replaceState(null,'',location.pathname);location.reload()});
    node.querySelector('#togglePassword')?.addEventListener('click',event=>{
      const input=node.querySelector('#mealzAuthPassword');
      const visible=input.type==='password';
      input.type=visible?'text':'password';
      const button=event.currentTarget,label=visible?'Hide password':'Show password';
      button.dataset.revealed=String(visible);
      button.setAttribute('aria-label',label);button.title=label;
    });
    const form=node.querySelector('form');
    if(!form)return;
    form.onsubmit=async event=>{
      event.preventDefault();
      const button=form.querySelector('button[type="submit"]'),status=node.querySelector('#mealzAuthMessage');
      const email=form.querySelector('input[type=email]')?.value.trim();
      const password=form.querySelector('#mealzAuthPassword')?.value;
      button.disabled=true;status.textContent='Please wait…';
      try{
        const auth=state.client.auth;
        let result;
        if(mode==='signin')result=await auth.signInWithPassword({email,password});
        if(mode==='signup')result=await auth.signUp({email,password,options:{emailRedirectTo:location.origin}});
        if(mode==='reset')result=await auth.resetPasswordForEmail(email,{redirectTo:`${location.origin}/?reset=1`});
        if(mode==='password')result=await auth.updateUser({password});
        if(result.error)throw result.error;
        if(mode==='password'){recovering=false;history.replaceState(null,'',location.pathname);location.reload();return}
        if(result.data?.session){location.reload();return}
        status.textContent=mode==='reset'?'If an account exists for that email, a reset link is on its way.':'Check your email to confirm your account, then return here to sign in.';
      }catch(error){status.textContent=error.message||'Please try again.'}
      finally{if(button.isConnected)button.disabled=false}
    };
  }
  async function fetchConfig(){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),5000);
    try{
      const response=await nativeFetch('/api/auth-config',{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error('Could not load sign-in settings.');
      return await response.json();
    }finally{clearTimeout(timer)}
  }
  function authResponse(){return new Response(JSON.stringify({error:'Please sign in to continue.',code:'AUTH_REQUIRED'}),{status:401,headers:{'Content-Type':'application/json'}})}
  window.fetch=async(input,init={})=>{
    const url=new URL(typeof input==='string'?input:input.url,location.origin);
    if(url.origin!==location.origin||!url.pathname.startsWith('/api/')||url.pathname==='/api/auth-config')return nativeFetch(input,init);
    await ready;
    const auth=state;
    if(!auth.session)return authResponse();
    const requestUser=auth.user.id;
    const headers=new Headers(init.headers||(typeof input!=='string'?input.headers:undefined)||{});
    headers.set('Authorization',`Bearer ${auth.session.access_token}`);
    const response=await nativeFetch(input,{...init,headers});
    if(state.user?.id!==requestUser)return authResponse();
    if(response.status===401){
      clearAccountCache(state.user?.id);
      state.session=null;state.user=null;
      document.querySelector('#app')?.replaceChildren();
      renderGate('signin','Your session expired. Please sign in again.');
    }
    return response;
  };
  async function init(){
    gate().innerHTML='<div class="auth-card"><p role="status">Opening mealz…</p></div>';
    try{
      const config=await fetchConfig();
      if(!config?.enabled)throw new Error('Sign-in is not configured. Please contact the household owner.');
      const createClient=globalThis.supabase?.createClient;
      if(!createClient)throw new Error('Sign-in could not load. Check your connection and try again.');
      const client=createClient(config.supabaseUrl,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
      state.client=client;
      client.auth.onAuthStateChange((event,session)=>{
        const previous=state.user?.id;
        state.session=session||null;state.user=session?.user||null;
        if(event==='PASSWORD_RECOVERY'){recovering=true;setTimeout(()=>renderGate('password'),0)}
        if(state.initialized&&previous!==state.user?.id){
          clearAccountCache(previous);
          document.querySelector('#app')?.replaceChildren();gate();
          setTimeout(()=>location.reload(),0);
        }
      });
      let timer;
      const {data,error}=await Promise.race([
        client.auth.getSession(),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Sign-in timed out. Please try again.')),10000)})
      ]).finally(()=>clearTimeout(timer));
      if(error)throw error;
      state.session=data?.session||null;state.user=state.session?.user||null;
      if(!state.session)renderGate('signin',recovering?'Your reset link expired. Request another link below.':'');
      else if(recovering)renderGate('password');
      else removeGate();
    }catch(error){renderGate('error',error.message||'Could not connect. Please try again.')}
    finally{state.initialized=true;resolveReady(state)}
  }
  window.MealzAuth={ready,get session(){return state.session},get user(){return state.user},get recovering(){return recovering},
    changePassword(){renderGate('password')},
    async signOut(){
      const previous=state.user?.id;
      const {error}=await state.client.auth.signOut({scope:'local'});
      if(error)throw error;
      clearAccountCache(previous);
      state.session=null;state.user=null;document.querySelector('#app')?.replaceChildren();location.reload();
    }
  };
  init();
})();

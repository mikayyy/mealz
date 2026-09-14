// Lightweight browser auth gate for the static mealz client.
(()=>{
  const nativeFetch=window.fetch.bind(window);
  let state={enabled:false,client:null,session:null,user:null};
  let resolveReady;
  let resolveSession;
  const ready=new Promise(resolve=>{resolveReady=resolve});
  const sessionReady=new Promise(resolve=>{resolveSession=resolve});
  let sessionResolved=false;

  function settleSession(session){
    state.session=session||null;
    state.user=session?.user||null;
    if(session&&!sessionResolved){sessionResolved=true;resolveSession(session)}
  }

  function apiUrl(input){
    const raw=typeof input==='string'?input:input?.url||'';
    try{return new URL(raw,location.origin)}catch{return null}
  }

  window.fetch=async(input,init={})=>{
    const url=apiUrl(input);
    if(!url||url.origin!==location.origin||!url.pathname.startsWith('/api/')||url.pathname==='/api/auth-config')return nativeFetch(input,init);
    const auth=await ready;
    if(!auth.enabled)return nativeFetch(input,init);
    const session=auth.session||await sessionReady;
    const headers=new Headers(init.headers||(typeof input!=='string'?input?.headers:undefined)||{});
    if(session?.access_token)headers.set('Authorization',`Bearer ${session.access_token}`);
    return nativeFetch(input,{...init,headers});
  };

  function removeGate(){document.querySelector('#mealzAuthGate')?.remove()}
  function renderGate(){
    if(document.querySelector('#mealzAuthGate'))return;
    const gate=document.createElement('div');
    gate.id='mealzAuthGate';gate.className='auth-gate';
    gate.innerHTML=`<div class="auth-card"><div class="auth-wordmark">mealz</div><p class="auth-tagline">less planning. more good food.</p><h1>sign in</h1><p class="auth-copy">enter your email and mealz will send you a secure sign-in link.</p><form id="mealzAuthForm"><label for="mealzAuthEmail">email</label><input id="mealzAuthEmail" type="email" autocomplete="email" required placeholder="you@example.com"><button class="primary" type="submit">send sign-in link</button></form><p class="auth-message" id="mealzAuthMessage" aria-live="polite"></p></div>`;
    document.body.appendChild(gate);
    const form=gate.querySelector('#mealzAuthForm');
    const message=gate.querySelector('#mealzAuthMessage');
    form.onsubmit=async event=>{
      event.preventDefault();
      const email=gate.querySelector('#mealzAuthEmail').value.trim();
      if(!email)return;
      const button=form.querySelector('button');button.disabled=true;message.textContent='sending…';
      const {error}=await state.client.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin}});
      button.disabled=false;
      message.textContent=error?error.message:'check your email for the sign-in link.';
    };
  }

  async function init(){
    try{
      const response=await nativeFetch('/api/auth-config',{cache:'no-store'});
      const config=await response.json();
      if(!config?.enabled){
        state.enabled=false;resolveReady(state);resolveSession(null);sessionResolved=true;return;
      }
      const createClient=globalThis.supabase?.createClient;
      if(!createClient)throw new Error('Supabase auth library did not load.');
      const client=createClient(config.supabaseUrl,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
      state={...state,enabled:true,client};
      const {data,error}=await client.auth.getSession();
      if(error)console.warn('mealz auth session',error);
      settleSession(data?.session||null);
      resolveReady(state);
      if(state.session)removeGate();else renderGate();
      client.auth.onAuthStateChange((event,session)=>{
        settleSession(session);
        if(session)removeGate();
        else if(event==='SIGNED_OUT')location.reload();
      });
    }catch(error){
      console.error('mealz auth initialization failed',error);
      state.enabled=false;resolveReady(state);if(!sessionResolved){sessionResolved=true;resolveSession(null)}
    }
  }

  window.MealzAuth={
    ready,
    get enabled(){return state.enabled},
    get session(){return state.session},
    get user(){return state.user},
    async signOut(){if(state.client)await state.client.auth.signOut();location.reload()}
  };
  init();
})();

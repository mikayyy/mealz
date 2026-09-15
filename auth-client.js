// Lightweight browser auth gate for the static mealz client.
(()=>{
  const nativeFetch=window.fetch.bind(window);
  let state={enabled:false,client:null,session:null,user:null,initialized:false};
  let resolveReady;
  const ready=new Promise(resolve=>{resolveReady=resolve});

  function apiUrl(input){
    const raw=typeof input==='string'?input:input?.url||'';
    try{return new URL(raw,location.origin)}catch{return null}
  }

  function authResponse(message='Authentication required.'){
    return new Response(JSON.stringify({error:message,code:'AUTH_REQUIRED'}),{
      status:401,
      headers:{'Content-Type':'application/json'}
    });
  }

  function removeGate(){document.querySelector('#mealzAuthGate')?.remove()}
  function renderGate(message=''){
    let gate=document.querySelector('#mealzAuthGate');
    if(!gate){
      gate=document.createElement('div');
      gate.id='mealzAuthGate';gate.className='auth-gate';
      gate.innerHTML=`<div class="auth-card"><div class="auth-wordmark">mealz</div><p class="auth-tagline">less planning. more good food.</p><h1>sign in</h1><p class="auth-copy">enter your email and mealz will send you a secure sign-in link.</p><form id="mealzAuthForm"><label for="mealzAuthEmail">email</label><input id="mealzAuthEmail" type="email" autocomplete="email" required placeholder="you@example.com"><button class="primary" type="submit">send sign-in link</button></form><p class="auth-message" id="mealzAuthMessage" aria-live="polite"></p></div>`;
      document.body.appendChild(gate);
      const form=gate.querySelector('#mealzAuthForm');
      form.onsubmit=async event=>{
        event.preventDefault();
        const email=gate.querySelector('#mealzAuthEmail').value.trim();
        if(!email||!state.client)return;
        const button=form.querySelector('button');
        const status=gate.querySelector('#mealzAuthMessage');
        button.disabled=true;status.textContent='sending…';
        const {error}=await state.client.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin}});
        button.disabled=false;
        status.textContent=error?error.message:'check your email for the sign-in link.';
      };
    }
    if(message){const status=gate.querySelector('#mealzAuthMessage');if(status)status.textContent=message}
  }

  async function fetchConfig(){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),5000);
    try{
      const response=await nativeFetch('/api/auth-config',{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error(`Auth config failed (${response.status}).`);
      return await response.json();
    }finally{clearTimeout(timer)}
  }

  window.fetch=async(input,init={})=>{
    const url=apiUrl(input);
    if(!url||url.origin!==location.origin||!url.pathname.startsWith('/api/')||url.pathname==='/api/auth-config')return nativeFetch(input,init);

    const auth=await ready;
    if(!auth.enabled)return nativeFetch(input,init);

    // Never leave app requests waiting on a future login event. If auth is enabled
    // but there is no current session, fail immediately and keep the sign-in gate visible.
    if(!auth.session){
      renderGate('sign in to continue.');
      return authResponse();
    }

    const headers=new Headers(init.headers||(typeof input!=='string'?input?.headers:undefined)||{});
    headers.set('Authorization',`Bearer ${auth.session.access_token}`);
    return nativeFetch(input,{...init,headers});
  };

  async function init(){
    try{
      const config=await fetchConfig();
      if(!config?.enabled){
        state={...state,enabled:false,initialized:true};
        resolveReady(state);
        return;
      }

      const createClient=globalThis.supabase?.createClient;
      if(!createClient)throw new Error('Supabase auth library did not load.');

      const client=createClient(config.supabaseUrl,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
      state={...state,enabled:true,client};

      const {data,error}=await client.auth.getSession();
      if(error)console.warn('mealz auth session',error);
      state.session=data?.session||null;
      state.user=state.session?.user||null;
      state.initialized=true;
      resolveReady(state);

      if(state.session)removeGate();else renderGate();

      client.auth.onAuthStateChange((event,session)=>{
        state.session=session||null;
        state.user=session?.user||null;
        if(session){removeGate()}
        else if(event==='SIGNED_OUT'){renderGate('signed out. sign in to continue.')}
      });
    }catch(error){
      console.error('mealz auth initialization failed',error);
      state={...state,enabled:false,initialized:true};
      resolveReady(state);
    }
  }

  window.MealzAuth={
    ready,
    get enabled(){return state.enabled},
    get initialized(){return state.initialized},
    get session(){return state.session},
    get user(){return state.user},
    async signOut(){if(state.client)await state.client.auth.signOut();renderGate('signed out. sign in to continue.')}
  };

  init();
})();

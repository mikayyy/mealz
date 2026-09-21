// Coordinate account/household readiness before loading any meal data.
(()=>{
  let home=null;
  let inviteCode='';
  function status(message){const node=document.querySelector('#accountStatus');if(node)node.textContent=message}
  async function householdRequest(body){
    return apiJson('/api/household',body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined);
  }
  function accountControls(){
    let nav=document.querySelector('#accountControls');
    if(!nav){nav=document.createElement('div');nav.id='accountControls';nav.className='account-controls';document.querySelector('.topbar').appendChild(nav)}
    nav.innerHTML='<button class="secondary" id="accountSettings">account</button><button class="secondary" id="signOut">sign out</button>';
    nav.querySelector('#accountSettings').onclick=()=>home?.linked?settings():chooseHousehold();
    nav.querySelector('#signOut').onclick=async()=>{
      const button=nav.querySelector('#signOut');button.disabled=true;
      try{await MealzAuth.signOut()}catch(error){button.disabled=false;status(error.message);alert('Could not sign out. Please check your connection and try again.')}
    };
  }
  function chooseHousehold(mode='choose'){
    app.innerHTML=`<h1>who are you cooking with?</h1><p class="subtle">create a household for your family, or join one to share its preferences, meals, and groceries.</p><div class="card account-card">${mode==='choose'?'<button class="primary" id="createHousehold">create a household</button><button class="secondary" id="joinHousehold">join a household</button>':`<form id="householdForm"><label class="label" for="householdInput">${mode==='create'?'household name':'invitation code'}</label><input id="householdInput" required ${mode==='create'?'maxlength="60" autocomplete="organization" placeholder="e.g. Munoz Family"':'maxlength="20" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD-2345"'}><button class="primary" type="submit">${mode==='create'?'create household':'join household'}</button></form><button class="secondary" id="householdBack">back</button>`}<p id="accountStatus" role="status" aria-live="polite"></p></div>`;
    document.querySelector('#createHousehold')?.addEventListener('click',()=>chooseHousehold('create'));
    document.querySelector('#joinHousehold')?.addEventListener('click',()=>chooseHousehold('join'));
    document.querySelector('#householdBack')?.addEventListener('click',()=>chooseHousehold());
    const form=document.querySelector('#householdForm');
    if(form)form.onsubmit=async event=>{
      event.preventDefault();
      const button=form.querySelector('button');button.disabled=true;status('connecting your household…');
      const value=document.querySelector('#householdInput').value.trim();
      try{
        const result=await householdRequest({action:mode,...(mode==='create'?{name:value}:{code:value})});
        inviteCode=result.joinCode||'';
        await start();
        if(inviteCode)showInvite();
      }catch(error){status(error.message);button.disabled=false}
    };
  }
  function showInvite(){
    const box=document.createElement('div');box.className='status status--success invite-notice';
    box.innerHTML=`<b>invitation code ready.</b><p class="invite-code">${esc(inviteCode)}</p><p>share this code privately with the person you want to invite. save it now; mealz stores only a protected version. you can replace it in account.</p>`;
    app.prepend(box);
  }
  function settings(){
    cancelTransientNavigation();
    app.innerHTML=`<button class="secondary" id="accountBack">← weeks</button><h1>account</h1><p class="subtle">${esc(MealzAuth.user?.email||'')}</p><div class="card account-card"><h2>${esc(home.household.name)}</h2><p>you are a household ${esc(home.role)}.</p>${home.role==='owner'?'<button class="secondary" id="replaceInvite">create a new invitation code</button><p class="small">replaces the previous code. existing members stay connected.</p>':'<p>ask your household owner for an invitation code to share.</p>'}<button class="secondary" id="setPassword">set or change password</button><p id="accountStatus" role="status"></p></div>`;
    document.querySelector('#accountBack').onclick=backToWeeks;
    document.querySelector('#setPassword').onclick=()=>MealzAuth.changePassword();
    document.querySelector('#replaceInvite')?.addEventListener('click',async event=>{
      if(!confirm('Replace the invitation code? The previous code will stop working. Existing members will stay connected.'))return;
      event.target.disabled=true;
      try{const result=await householdRequest({action:'rotate'});inviteCode=result.joinCode;document.querySelector('.invite-notice')?.remove();showInvite()}
      catch(error){status(error.message)}finally{event.target.disabled=false}
    });
  }
  async function start(){
    app.innerHTML='<h1>opening your household…</h1><p role="status">loading your preferences and meals.</p>';
    home=await householdRequest();
    if(!home.linked){chooseHousehold();return}
    // Fresh state is hydrated from this household only. Never import prototype
    // localStorage data into a new account or upload it during onboarding.
    storageKey=`mealz:${MealzAuth.user.id}:${home.household.id}`;
    localStorage.removeItem('mealz');
    s=structuredClone(DEFAULT_STATE);weeklyDraft={days:[],useUp:'',notes:''};readyIdeas=null;
    weeksOverview=null;weekCache.clear();cancelTransientNavigation();
    await boot();
    if(home.needsProfile)profile();
  }
  MealzAuth.ready.then(async()=>{
    if(!MealzAuth.session||MealzAuth.recovering)return;
    accountControls();
    try{await start()}
    catch(error){
      app.innerHTML=`<h1>Could not open your household</h1><p role="alert">${esc(error.message)}</p><button class="primary" id="retryHousehold">Try again</button>`;
      document.querySelector('#retryHousehold').onclick=()=>location.reload();
    }
  });
})();

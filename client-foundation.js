// mealz foundation helpers: session draft preservation, conflict warnings, scroll reset, and profile labels.
(()=>{
  const logic=globalThis.MealzLogic;
  const appRoot=document.querySelector('#app');
  if(!logic||!appRoot)return;

  function conflictMarkup(conflicts){
    if(!conflicts.length)return '';
    const unique=[...new Set(conflicts.flatMap(c=>c.matches))];
    const prefs=[...new Set(conflicts.map(c=>c.preference))];
    return `<div class="constraint-warning" id="constraintWarning"><div class="constraint-icon">⚠️</div><div><b>These ingredients may conflict with your profile settings.</b><p>${esc(unique.join(', '))} ${unique.length===1?'does':'do'} not fit ${esc(prefs.join(' + '))}. mealz will follow your profile preference, so it may leave ${unique.length===1?'that ingredient':'those ingredients'} out.</p><button class="constraint-edit" id="constraintEditHousehold" type="button">Edit Profile</button></div></div>`;
  }

  function renderUseUpConflict(){
    const input=appRoot.querySelector('#useUp');
    if(!input)return;
    const section=input.closest('.section');
    if(!section)return;
    const conflicts=logic.householdUseUpConflicts(input.value,s.dietTags||[]);
    const existing=section.querySelector('#constraintWarning');
    if(!conflicts.length){existing?.remove();return}
    const markup=conflictMarkup(conflicts);
    if(existing?.outerHTML===markup)return;
    existing?.remove();
    section.insertAdjacentHTML('beforeend',markup);
    const edit=section.querySelector('#constraintEditHousehold');
    if(edit)edit.onclick=()=>{captureWeeklyDraft();profile()};
  }

  function applyProfileLabels(){
    const heading=appRoot.querySelector('h1');
    if(heading?.textContent?.trim()==='Household')heading.textContent='Profile';
    const summaryHeading=appRoot.querySelector('.household-summary h2');
    if(summaryHeading?.textContent?.trim()==='Household')summaryHeading.textContent='Profile';
    const saveButton=appRoot.querySelector('#profileDone');
    if(saveButton&&/save household/i.test(saveButton.textContent||''))saveButton.textContent='Save Profile';
    const profileIntro=heading?.nextElementSibling;
    if(heading?.textContent==='Profile'&&profileIntro?.classList?.contains('subtle')){
      const introText='Set the preferences mealz should remember from week to week.';
      // Even an unchanged textContent assignment replaces the text node and
      // retriggers our subtree observer. Only write when normalization is needed.
      if(profileIntro.textContent!==introText)profileIntro.textContent=introText;
    }
  }

  document.addEventListener('focusout',event=>{
    if(event.target?.id==='useUp'){
      weeklyDraft.useUp=event.target.value;
      renderUseUpConflict();
    }
    if(event.target?.id==='notes')weeklyDraft.notes=event.target.value;
  });
  document.addEventListener('input',event=>{if(event.target?.id==='useUp')renderUseUpConflict()});

  let lastScreenKey='';
  let lastUseUpInput=null;
  const currentScreenKey=()=>{
    const heading=appRoot.querySelector('h1')?.textContent?.trim()||'';
    if(!heading)return '';
    const week=typeof selectedWeekStart!=='undefined'&&selectedWeekStart?selectedWeekStart:'';
    const mode=typeof weekScreenMode!=='undefined'?weekScreenMode:'';
    const crumb=appRoot.querySelector('.breadcrumb-current')?.textContent?.trim()||'';
    return [heading,week,mode,crumb].join('|');
  };
  const resetScrollIfScreenChanged=()=>{
    const key=currentScreenKey();
    if(!key||key===lastScreenKey)return;
    const hadScreen=!!lastScreenKey;
    lastScreenKey=key;
    if(hadScreen)requestAnimationFrame(()=>window.scrollTo({top:0,left:0,behavior:'auto'}));
  };
  const syncNewPlanningScreen=()=>{
    const input=appRoot.querySelector('#useUp');
    if(!input){lastUseUpInput=null;return}
    if(input===lastUseUpInput)return;
    lastUseUpInput=input;
    renderUseUpConflict();
  };

  new MutationObserver(()=>{
    applyProfileLabels();
    syncNewPlanningScreen();
    resetScrollIfScreenChanged();
  }).observe(appRoot,{childList:true,subtree:true});
  applyProfileLabels();
  syncNewPlanningScreen();
  resetScrollIfScreenChanged();
})();

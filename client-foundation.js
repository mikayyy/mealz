// Mealz v0.11.3 foundation helpers: session draft preservation, conflict warnings, and scroll reset.
(()=>{
  const logic=globalThis.MealzLogic;
  const appRoot=document.querySelector('#app');
  if(!logic||!appRoot)return;

  function conflictMarkup(conflicts){
    if(!conflicts.length)return '';
    const unique=[...new Set(conflicts.flatMap(c=>c.matches))];
    const prefs=[...new Set(conflicts.map(c=>c.preference))];
    return `<div class="constraint-warning" id="constraintWarning"><div class="constraint-icon">⚠️</div><div><b>These ingredients may conflict with your household settings.</b><p>${esc(unique.join(', '))} ${unique.length===1?'does':'do'} not fit ${esc(prefs.join(' + '))}. Mealz will follow your household preference, so it may leave ${unique.length===1?'that ingredient':'those ingredients'} out.</p><button class="constraint-edit" id="constraintEditHousehold" type="button">Edit Household</button></div></div>`;
  }

  function renderUseUpConflict(){
    const input=document.querySelector('#useUp');
    if(!input)return;
    const section=input.closest('.section');
    if(!section)return;
    section.querySelector('#constraintWarning')?.remove();
    const conflicts=logic.householdUseUpConflicts(input.value,s.dietTags||[]);
    if(!conflicts.length)return;
    section.insertAdjacentHTML('beforeend',conflictMarkup(conflicts));
    const edit=document.querySelector('#constraintEditHousehold');
    if(edit)edit.onclick=()=>{captureWeeklyDraft();profile()};
  }

  document.addEventListener('focusout',event=>{
    if(event.target?.id==='useUp'){
      weeklyDraft.useUp=event.target.value;
      renderUseUpConflict();
    }
    if(event.target?.id==='notes')weeklyDraft.notes=event.target.value;
  });
  document.addEventListener('input',event=>{if(event.target?.id==='useUp')renderUseUpConflict()});

  let lastHeading='';
  const resetScrollIfScreenChanged=()=>{
    const heading=appRoot.querySelector('h1')?.textContent?.trim()||'';
    if(!heading||heading===lastHeading)return;
    const hadScreen=!!lastHeading;
    lastHeading=heading;
    if(hadScreen)requestAnimationFrame(()=>window.scrollTo({top:0,left:0,behavior:'auto'}));
  };

  new MutationObserver(()=>{
    if(document.querySelector('#useUp'))renderUseUpConflict();
    resetScrollIfScreenChanged();
  }).observe(appRoot,{childList:true,subtree:true});
  resetScrollIfScreenChanged();
})();

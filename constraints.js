// Mealz v0.11.1: surface high-confidence conflicts between household preferences and weekly use-up ingredients.
const DIET_CONFLICT_RULES={
  Pescatarian:[
    {label:'meat or poultry',terms:['t-bone','t bone','steak','beef','ground beef','hamburger','pork','bacon','ham','chicken','turkey','lamb','veal']}
  ],
  Vegetarian:[
    {label:'meat or seafood',terms:['t-bone','t bone','steak','beef','ground beef','hamburger','pork','bacon','ham','chicken','turkey','lamb','veal','salmon','tuna','shrimp','prawn','cod','tilapia','fish']}
  ],
  Vegan:[
    {label:'animal products',terms:['t-bone','t bone','steak','beef','ground beef','hamburger','pork','bacon','ham','chicken','turkey','lamb','veal','salmon','tuna','shrimp','prawn','cod','tilapia','fish','egg','eggs','milk','cheese','yogurt','butter','cream','honey']}
  ],
  'Dairy-Free':[
    {label:'dairy',terms:['milk','cheese','yogurt','butter','cream','half and half','half-and-half']}
  ],
  'Nut-Free':[
    {label:'nuts',terms:['peanut','peanuts','almond','almonds','cashew','cashews','walnut','walnuts','pecan','pecans','pistachio','pistachios','hazelnut','hazelnuts']}
  ]
};

function normalizedWords(text){return String(text||'').toLowerCase()}
function hasTerm(text,term){
  const escaped=term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+');
  return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`,'i').test(text);
}
function householdUseUpConflicts(text){
  const value=normalizedWords(text),conflicts=[];
  if(!value.trim())return conflicts;
  for(const preference of s.dietTags||[]){
    const rules=DIET_CONFLICT_RULES[preference]||[];
    for(const rule of rules){
      const matches=rule.terms.filter(term=>hasTerm(value,term));
      if(matches.length)conflicts.push({preference,label:rule.label,matches:[...new Set(matches)]});
    }
  }
  return conflicts;
}
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
  const conflicts=householdUseUpConflicts(input.value);
  if(!conflicts.length)return;
  section.insertAdjacentHTML('beforeend',conflictMarkup(conflicts));
  const edit=document.querySelector('#constraintEditHousehold');
  if(edit)edit.onclick=()=>{captureWeeklyDraft();profile()};
}

document.addEventListener('input',event=>{if(event.target?.id==='useUp')renderUseUpConflict()});
document.addEventListener('focusout',event=>{if(event.target?.id==='useUp')renderUseUpConflict()});
const constraintObserver=new MutationObserver(()=>{if(document.querySelector('#useUp'))renderUseUpConflict()});
constraintObserver.observe(document.querySelector('#app'),{childList:true,subtree:true});

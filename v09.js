// Mealz v0.9: persistent household profile + cleaner weekly planning.
const DIET_TAGS=['Vegetarian','Vegan','Pescatarian','Keto','Whole30'];
if(!Number.isFinite(Number(s.adults)))s.adults=3;
if(!Number.isFinite(Number(s.children)))s.children=Math.max(0,(Number(s.size)||5)-s.adults);
if(!Array.isArray(s.dietTags))s.dietTags=[];
function householdTotal(){return Math.max(1,(Number(s.adults)||0)+(Number(s.children)||0))}
function saveProfile(){s.size=householdTotal();save()}
function profile(){
  app.innerHTML=`<h1>Household</h1><p class=subtle>Set the preferences Mealz should remember from week to week.</p><div class="section card"><h2>Who are we feeding?</h2><div class=profile-counter><div><b>Adults</b><p class=small>Full-size servings</p></div><div class=counter><button id=adultMinus>−</button><div class=counter-value>${s.adults}</div><button id=adultPlus>+</button></div></div><div class=profile-counter><div><b>Children</b><p class=small>Mealz will keep meals kid-adaptable</p></div><div class=counter><button id=childMinus>−</button><div class=counter-value>${s.children}</div><button id=childPlus>+</button></div></div><p class=small>${householdTotal()} people total. Recipe quantities currently use the total headcount.</p></div><div class="section card"><h2>Dietary style</h2><p class=small>Select any that should influence everyday recommendations.</p><div class=preference-grid>${DIET_TAGS.map(t=>`<button class="preference-btn ${s.dietTags.includes(t)?'selected':''}" data-tag="${t}">${t}</button>`).join('')}</div></div><div class="section card"><h2>Kitchen equipment</h2><div class=equipment-grid>${EQ.map(e=>`<button class="equipment-btn ${s.eq.includes(e)?'selected':''}" data-e="${e}">${e}</button>`).join('')}</div></div><button class=primary id=profileDone>Save Household</button>`;
  adultMinus.onclick=()=>{s.adults=Math.max(0,s.adults-1);saveProfile();profile()};adultPlus.onclick=()=>{s.adults=Math.min(20,s.adults+1);saveProfile();profile()};childMinus.onclick=()=>{s.children=Math.max(0,s.children-1);saveProfile();profile()};childPlus.onclick=()=>{s.children=Math.min(20,s.children+1);saveProfile();profile()};
  document.querySelectorAll('.preference-btn').forEach(b=>b.onclick=()=>{const t=b.dataset.tag;s.dietTags=s.dietTags.includes(t)?s.dietTags.filter(x=>x!==t):[...s.dietTags,t];saveProfile();profile()});
  document.querySelectorAll('.equipment-btn').forEach(b=>b.onclick=()=>{const e=b.dataset.e;s.eq=s.eq.includes(e)?s.eq.filter(x=>x!==e):[...s.eq,e];saveProfile();profile()});
  profileDone.onclick=()=>view('plan');
}
const v09BasePlan=plan;
plan=function(){v09BasePlan();const card=document.querySelector('.household-card');if(card)card.outerHTML=`<div class="section card household-summary"><div><h2>Household</h2><p>${s.adults} adult${s.adults===1?'':'s'} · ${s.children} child${s.children===1?'':'ren'} · ${s.dietTags.length?s.dietTags.join(' · '):'No dietary style selected'}</p></div><button class=secondary id=openProfile>Edit</button></div>`;const p=document.querySelector('#openProfile');if(p)p.onclick=profile}
function v09Context(){return {householdSize:householdTotal(),adults:s.adults,children:s.children,dietTags:s.dietTags||[],equipment:s.eq}}
const v09Generate=generate;
generate=async function(){s.size=householdTotal();save();return v09Generate()}
const v09Refresh=refreshMealIdeas;
refreshMealIdeas=async function(){s.size=householdTotal();save();return v09Refresh()}
const v09Build=buildSelectedWeek;
buildSelectedWeek=async function(){s.size=householdTotal();save();return v09Build()}

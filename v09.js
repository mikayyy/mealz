// Mealz v0.9.2: cloud-backed household profile, dietary preferences, standardized equipment.
const DIET_GROUPS={
  'Dietary style':['Vegetarian','Vegan','Pescatarian','Mediterranean','Plant-Forward'],
  'Nutrition goals':['Keto','Low Carb','High Protein','Whole30','Low Sodium','Low Added Sugar'],
  'Dietary needs':['Gluten-Free','Dairy-Free','Nut-Free'],
  'General':['No Dietary Restrictions']
};
const DIET_TAGS=Object.values(DIET_GROUPS).flat();
const PROFILE_EQUIPMENT=['Oven','Stovetop','Broiler','Microwave','Toaster','Toaster Oven','Air Fryer','Pressure Cooker / Instant Pot','Slow Cooker','Griddle','Grill','Cast-Iron Skillet','Wok','Food Processor','Blender','Stand Mixer','Rice Cooker','Sous Vide','Dutch Oven'];
const EQUIPMENT_MIGRATION={'Instant Pot':'Pressure Cooker / Instant Pot','Air fryer attachment':'Air Fryer','Tovala smart oven':'Toaster Oven','Standalone griddle':'Griddle','Cast iron pans':'Cast-Iron Skillet','KitchenAid mixer':'Stand Mixer','Food processor':'Food Processor','Oven':'Oven'};
if(!Number.isFinite(Number(s.adults)))s.adults=3;
if(!Number.isFinite(Number(s.children)))s.children=Math.max(0,(Number(s.size)||5)-s.adults);
if(!Array.isArray(s.dietTags))s.dietTags=[];
if(!s.equipmentV091Migrated){s.eq=[...new Set((s.eq||[]).map(x=>EQUIPMENT_MIGRATION[x]||x).filter(x=>PROFILE_EQUIPMENT.includes(x)))];s.equipmentV091Migrated=true;save()}
function householdTotal(){return Math.max(1,(Number(s.adults)||0)+(Number(s.children)||0))}
function saveProfile(){s.size=householdTotal();save()}
async function persistCloudProfile(){if(DEV)return {ok:true};const r=await fetch('/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({adults:s.adults,children:s.children,householdSize:householdTotal(),dietTags:s.dietTags||[],equipment:s.eq||[]})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not save household profile.');return d}
async function loadCloudProfile(){if(DEV)return;try{const r=await fetch('/api/profile'),d=await r.json();if(!r.ok)throw new Error(d.error||'Could not load household profile.');if(d.profile){s.adults=Math.max(0,Number(d.profile.adults||0));s.children=Math.max(0,Number(d.profile.children||0));s.dietTags=Array.isArray(d.profile.dietTags)?d.profile.dietTags:[];s.eq=Array.isArray(d.profile.equipment)?d.profile.equipment.filter(x=>PROFILE_EQUIPMENT.includes(x)):[];s.size=householdTotal();save();if(document.querySelector('.nav-btn.active')?.dataset.view==='plan')plan()}else{await persistCloudProfile()}}catch(e){console.warn('Household profile cloud sync unavailable',e)}}
function toggleDietTag(tag){
  if(tag==='No Dietary Restrictions'){s.dietTags=s.dietTags.includes(tag)?[]:['No Dietary Restrictions']}
  else{s.dietTags=(s.dietTags||[]).filter(x=>x!=='No Dietary Restrictions');s.dietTags=s.dietTags.includes(tag)?s.dietTags.filter(x=>x!==tag):[...s.dietTags,tag]}
  saveProfile();profile();
}
function profile(){
  app.innerHTML=`<h1>Household</h1><p class=subtle>Set the preferences Mealz should remember from week to week.</p><div class="section card"><h2>Who are we feeding?</h2><div class=profile-counter><div><b>Adults</b><p class=small>Full-size servings</p></div><div class=counter><button id=adultMinus>−</button><div class=counter-value>${s.adults}</div><button id=adultPlus>+</button></div></div><div class=profile-counter><div><b>Children</b><p class=small>Mealz will keep meals kid-adaptable</p></div><div class=counter><button id=childMinus>−</button><div class=counter-value>${s.children}</div><button id=childPlus>+</button></div></div><p class=small>${householdTotal()} people total. Recipe quantities currently use the total headcount.</p></div>${Object.entries(DIET_GROUPS).map(([group,tags])=>`<div class="section card"><h2>${esc(group)}</h2><div class=preference-grid>${tags.map(t=>`<button class="preference-btn ${s.dietTags.includes(t)?'selected':''}" data-tag="${t}">${t}</button>`).join('')}</div></div>`).join('')}<div class="section card"><h2>Kitchen equipment</h2><p class=small>Select the equipment Mealz can use for everyday recipes.</p><div class=equipment-grid>${PROFILE_EQUIPMENT.map(e=>`<button class="equipment-btn ${s.eq.includes(e)?'selected':''}" data-e="${e}">${e}</button>`).join('')}</div></div><button class=primary id=profileDone>Save Household</button>`;
  adultMinus.onclick=()=>{s.adults=Math.max(0,s.adults-1);saveProfile();profile()};adultPlus.onclick=()=>{s.adults=Math.min(20,s.adults+1);saveProfile();profile()};childMinus.onclick=()=>{s.children=Math.max(0,s.children-1);saveProfile();profile()};childPlus.onclick=()=>{s.children=Math.min(20,s.children+1);saveProfile();profile()};
  document.querySelectorAll('.preference-btn').forEach(b=>b.onclick=()=>toggleDietTag(b.dataset.tag));
  document.querySelectorAll('.equipment-btn').forEach(b=>b.onclick=()=>{const e=b.dataset.e;s.eq=s.eq.includes(e)?s.eq.filter(x=>x!==e):[...s.eq,e];saveProfile();profile()});
  profileDone.onclick=async()=>{profileDone.disabled=true;profileDone.textContent='Saving…';try{await persistCloudProfile();s.syncError=null}catch(e){s.syncError=e.message}save();view('plan')};
}
const v09BasePlan=plan;
plan=function(){v09BasePlan();const card=document.querySelector('.household-card');if(card)card.outerHTML=`<div class="section card household-summary"><div><h2>Household</h2><p>${s.adults} adult${s.adults===1?'':'s'} · ${s.children} child${s.children===1?'':'ren'} · ${s.dietTags.length?s.dietTags.join(' · '):'No dietary style selected'}</p></div><button class=secondary id=openProfile>Edit</button></div>`;const p=document.querySelector('#openProfile');if(p)p.onclick=profile}
function profilePayload(){return {householdSize:householdTotal(),adults:s.adults,children:s.children,dietTags:(s.dietTags||[]).filter(x=>x!=='No Dietary Restrictions'),equipment:s.eq}}

generate=async function(){
  captureWeeklyDraft();s.error=null;s.syncError=null;weeklyDraft.days=sortDays(weeklyDraft.days);s.size=householdTotal();save();
  if(!weeklyDraft.days.length){s.error='Choose at least one cooking day.';return plan()}
  const count=ideaCountForDays(weeklyDraft.days.length);
  if(preparedIdeasAvailable(count)){s.ideas=readyIdeas.ideas.slice(0,count);s.selectedIdeas=[];save();return ideaPicker()}
  go.disabled=true;go.textContent=`Finding ${count} good options…`;
  try{const r=await fetch('/api/generate-ideas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({days:weeklyDraft.days,ideaCount:count,...profilePayload(),useUp:weeklyDraft.useUp,notes:weeklyDraft.notes})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not generate ideas.');s.ideas=(d.ideas||[]).slice(0,count);s.selectedIdeas=[];s.error=null;save();ideaPicker()}catch(e){s.error=typeof friendlyClientError==='function'?friendlyClientError(e.message):e.message;save();plan()}
}
refreshMealIdeas=async function(){
  const count=ideaCountForDays(weeklyDraft.days.length);s.size=householdTotal();save();app.innerHTML=`<h1>Fresh ideas coming up…</h1><div class="status swap-loading">✨ Shuffling ${count} dinner ideas…</div>`;
  try{const r=await fetch('/api/generate-ideas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({days:weeklyDraft.days,ideaCount:count,...profilePayload(),useUp:weeklyDraft.useUp,notes:`${weeklyDraft.notes||''}\nGive a substantially different set from these previous ideas: ${(s.ideas||[]).map(x=>x.title).join(', ')}`})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not refresh ideas.');s.ideas=(d.ideas||[]).slice(0,count);s.selectedIdeas=[];save();ideaPicker()}catch(e){s.error=typeof friendlyClientError==='function'?friendlyClientError(e.message):e.message;save();plan()}
}

buildSelectedWeek=async function(){
  const picked=s.selectedIdeas.map(id=>s.ideas.find(x=>x.id===id)).filter(Boolean);weeklyDraft.days=sortDays(weeklyDraft.days);if(picked.length!==weeklyDraft.days.length)return ideaPicker();s.days=weeklyDraft.days;s.useUp=weeklyDraft.useUp.trim();s.notes=weeklyDraft.notes.trim();s.size=householdTotal();save();app.innerHTML=`<h1>Building your week…</h1><p class=subtle>Now Mealz is creating recipes only for the dinners you picked.</p><div class="status swap-loading">🥕 Writing recipes and assembling groceries…</div>`;
  try{const payload={days:s.days,selectedIdeas:picked,...profilePayload(),useUp:s.useUp,notes:s.notes};const r=await expandRequest(payload);const text=await r.text();let d={};if(text){try{d=JSON.parse(text)}catch{throw new Error('Mealz received an incomplete server response.')}}if(!r.ok)throw new Error(d.error||`Recipe generation failed (${r.status}).`);s.meals=sortMealsByDay(d.meals||[]);s.checked={};s.planId=null;s.syncError=null;s.error=null;save();if(!DEV){try{await syncPlan()}catch(e){s.syncError=e.message;save()}}view('meals')}catch(e){app.innerHTML=`<button class=secondary id=backIdeas>← Back to Ideas</button><h1>That batch didn’t come together</h1><div class="status error">${esc(typeof friendlyClientError==='function'?friendlyClientError(e.message):e.message)}</div><button class=primary id=retryBuild>Try Building Again</button>`;backIdeas.onclick=ideaPicker;retryBuild.onclick=buildSelectedWeek}
}

swapMeal=async function(id){const original=s.meals.find(m=>m.id===id);if(!original)return;app.innerHTML=`<button class=secondary id=cancelSwap>← Back</button><h1>Swap ${esc(original.day)}</h1><p class=subtle>Finding two alternatives for ${esc(original.title)}…</p><div class="status swap-loading">✨ Stirring the idea pot…</div>`;cancelSwap.onclick=meals;try{const r=await fetch('/api/swap-meal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({meal:original,otherMeals:s.meals.filter(m=>m.id!==id).map(m=>({title:m.title,day:m.day})),...profilePayload(),useUp:s.useUp,notes:s.notes})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not find alternatives.');showSwapChoices(original,d.alternatives||[])}catch(e){app.innerHTML=`<button class=secondary id=backSwapError>← Back</button><h1>Swap ${esc(original.day)}</h1><div class="status error">${esc(e.message)}</div><button class=primary id=retrySwap>Try Again</button>`;backSwapError.onclick=meals;retrySwap.onclick=()=>swapMeal(id)}}

setTimeout(loadCloudProfile,500);

// Mealz v0.5: lightweight ideas first, full recipes after selection.
if(!Array.isArray(s.ideas))s.ideas=[];
if(!Array.isArray(s.selectedIdeas))s.selectedIdeas=[];
const DAY_ORDER=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const sortDays=days=>(days||[]).slice().sort((a,b)=>DAY_ORDER.indexOf(a)-DAY_ORDER.indexOf(b));

function plan(){
  app.innerHTML=`<h1>Plan This Week</h1><p class=subtle>Tell Mealz what this week looks like. We’ll give you six dinner ideas before building any recipes.</p>${s.error?`<div class="status error">${esc(s.error)}</div>`:''}${cloudNote()}<div class=section><label class=label>Which days are you cooking?</label><div class=day-grid>${DAY_ORDER.map(d=>`<button class="day-btn ${s.days.includes(d)?'selected':''}" data-d="${d}">${d.slice(0,3)}</button>`).join('')}</div></div><div class=section><label class=label>Any ingredients to use up?</label><input id=useUp value="${esc(s.useUp)}"></div><div class=section><label class=label>Anything else?</label><textarea id=notes>${esc(s.notes)}</textarea></div><div class="section card household-card"><h2>Household & Kitchen</h2><label class=label>People eating this week</label><div class=counter><button id=minus>−</button><div class=counter-value>${s.size}</div><button id=plus>+</button></div><div class=section><label class=label>Equipment available this week</label><div class=equipment-grid>${EQ.map(e=>`<button class="equipment-btn ${s.eq.includes(e)?'selected':''}" data-e="${e}">${e}</button>`).join('')}</div><p class=small>Mealz will avoid equipment you turn off.</p></div></div><button id=go class=primary>Find 6 Meal Ideas ✨</button>${devTools()}`;
  document.querySelectorAll('.day-btn').forEach(b=>b.onclick=()=>{draft();const d=b.dataset.d;s.days=s.days.includes(d)?s.days.filter(x=>x!==d):[...s.days,d];s.days=sortDays(s.days);save();plan()});
  document.querySelectorAll('.equipment-btn').forEach(b=>b.onclick=()=>{draft();const e=b.dataset.e;s.eq=s.eq.includes(e)?s.eq.filter(x=>x!==e):[...s.eq,e];save();plan()});
  minus.onclick=()=>{draft();s.size=Math.max(1,s.size-1);save();plan()};
  plus.onclick=()=>{draft();s.size=Math.min(20,s.size+1);save();plan()};
  go.onclick=generate;
  if(DEV){loadWeek.onclick=loadTestWeek;loadGroceries.onclick=loadGroceryTest;resetData.onclick=resetTestData}
}

async function generate(){
  draft();s.error=null;s.syncError=null;s.days=sortDays(s.days);save();
  if(!s.days.length){s.error='Choose at least one cooking day.';return plan()}
  if(s.days.length>6){s.error='For now, choose up to 6 cooking days so you have more ideas than meals to pick.';return plan()}
  go.disabled=true;go.textContent='Finding six good options…';
  try{
    const r=await fetch('/api/generate-ideas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({days:s.days,householdSize:s.size,equipment:s.eq,useUp:s.useUp,notes:s.notes})});
    const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not generate ideas.');
    s.ideas=d.ideas||[];s.selectedIdeas=[];s.error=null;save();ideaPicker();
  }catch(e){s.error=e.message;save();plan()}
}

function selectionNumber(id){const i=s.selectedIdeas.indexOf(id);return i<0?'':String(i+1)}
function ideaPicker(){
  s.days=sortDays(s.days);
  const needed=s.days.length,chosen=s.selectedIdeas.length;
  app.innerHTML=`<button class=secondary id=editPlan>← Edit Plan</button><h1>Pick ${needed} Dinner${needed===1?'':'s'}</h1><p class=subtle>Choose your favorites from six ideas. Recipes and groceries are generated only after you decide.</p><div class="selection-status ${chosen===needed?'ready':''}"><b>${chosen} of ${needed} selected</b>${chosen?`<div class=small>${s.selectedIdeas.map((id,i)=>`${i+1} → ${esc(s.days[i]||'')}`).join(' · ')}</div>`:''}</div><div class=idea-grid>${(s.ideas||[]).map(x=>{const n=selectionNumber(x.id),selected=!!n;return `<button class="idea-card ${selected?'selected-idea':''}" data-id="${esc(x.id)}"><div class=idea-top><span class=idea-emoji>${esc(x.emoji||'🍽️')}</span>${selected?`<span class=pick-number>${n}</span>`:''}</div><div class=idea-title>${esc(x.title)}</div><p>${esc(x.description)}</p><div><span class=pill>${x.total_minutes||30} min</span>${x.protein?`<span class=pill>${esc(x.protein)}</span>`:''}${(x.tags||[]).slice(0,2).map(t=>`<span class=pill>${esc(t)}</span>`).join('')}</div></button>`}).join('')}</div><div class=picker-actions><button class=secondary id=refreshIdeas>Give Me 6 Different Ideas</button><button class=primary id=buildWeek ${chosen===needed?'':'disabled'}>${chosen===needed?'Build My Week →':`Pick ${needed-chosen} More`}</button></div>`;
  editPlan.onclick=plan;
  document.querySelectorAll('.idea-card').forEach(b=>b.onclick=()=>toggleIdea(b.dataset.id));
  refreshIdeas.onclick=()=>refreshMealIdeas();
  buildWeek.onclick=()=>{if(s.selectedIdeas.length===needed)buildSelectedWeek()};
}
function toggleIdea(id){
  const i=s.selectedIdeas.indexOf(id);
  if(i>=0)s.selectedIdeas.splice(i,1);
  else if(s.selectedIdeas.length<s.days.length)s.selectedIdeas.push(id);
  else return;
  save();ideaPicker();
}
async function refreshMealIdeas(){
  app.innerHTML='<h1>Fresh ideas coming up…</h1><div class="status swap-loading">✨ Shuffling the dinner deck…</div>';
  try{
    const r=await fetch('/api/generate-ideas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({days:sortDays(s.days),householdSize:s.size,equipment:s.eq,useUp:s.useUp,notes:`${s.notes||''}\nGive a substantially different set from these previous ideas: ${(s.ideas||[]).map(x=>x.title).join(', ')}`})});
    const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not refresh ideas.');s.ideas=d.ideas||[];s.selectedIdeas=[];save();ideaPicker();
  }catch(e){s.error=e.message;save();plan()}
}
async function buildSelectedWeek(){
  const picked=s.selectedIdeas.map(id=>s.ideas.find(x=>x.id===id)).filter(Boolean);
  s.days=sortDays(s.days);
  if(picked.length!==s.days.length)return ideaPicker();
  app.innerHTML=`<h1>Building your week…</h1><p class=subtle>Now Mealz is creating recipes only for the dinners you picked.</p><div class="status swap-loading">🥕 Writing recipes and assembling groceries…</div>`;
  try{
    const r=await fetch('/api/expand-meals',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({days:s.days,selectedIdeas:picked,householdSize:s.size,equipment:s.eq,useUp:s.useUp,notes:s.notes})});
    const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not build your recipes.');
    s.meals=(d.meals||[]).slice().sort((a,b)=>DAY_ORDER.indexOf(a.day)-DAY_ORDER.indexOf(b.day));s.checked={};s.planId=null;s.syncError=null;s.error=null;save();
    if(!DEV){try{await syncPlan()}catch(e){s.syncError=e.message;save()}}
    view('meals');
  }catch(e){
    app.innerHTML=`<button class=secondary id=backIdeas>← Back to Ideas</button><h1>That batch didn’t come together</h1><div class="status error">${esc(e.message)}</div><button class=primary id=retryBuild>Try Building Again</button>`;
    backIdeas.onclick=ideaPicker;retryBuild.onclick=buildSelectedWeek;
  }
}

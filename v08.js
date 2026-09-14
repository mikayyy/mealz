// Mealz v0.8: separate persistent household defaults from fresh weekly planning inputs.
let weeklyDraft={days:[],useUp:'',notes:''};
if(!DEV){s.ideas=[];s.selectedIdeas=[];save()}
function ideaCountForDays(n){return n>=5?Math.min(9,n+2):6}
function captureWeeklyDraft(){const u=document.querySelector('#useUp'),n=document.querySelector('#notes');if(u)weeklyDraft.useUp=u.value;if(n)weeklyDraft.notes=n.value}
function preparedIdeasAvailable(count){return Array.isArray(readyIdeas?.ideas)&&readyIdeas.ideas.length>=count}

plan=function(){
  const count=ideaCountForDays(weeklyDraft.days.length);
  const prepared=preparedIdeasAvailable(count);
  app.innerHTML=`<h1>Plan This Week</h1><p class=subtle>Choose what this week looks like. Weekly details start fresh each time you open Mealz.</p>${s.error?`<div class="status error">${esc(s.error)}</div>`:''}${cloudNote()}${prepared?`<div class="status ready-ideas">🍲 <b>${count} ideas are ready.</b><br><span class="small">Mealz prepared options ahead of time. Adjust this week first if you need to.</span></div>`:''}<div class=section><label class=label>Which days are you cooking?</label><div class=day-grid>${DAY_ORDER.map(d=>`<button class="day-btn ${weeklyDraft.days.includes(d)?'selected':''}" data-d="${d}">${d.slice(0,3)}</button>`).join('')}</div></div><div class=section><label class=label>Any ingredients to use up?</label><input id=useUp value="${esc(weeklyDraft.useUp)}" placeholder="Optional"></div><div class=section><label class=label>Anything else?</label><textarea id=notes placeholder="Optional">${esc(weeklyDraft.notes)}</textarea></div><div class="section card household-card"><h2>Household & Kitchen</h2><label class=label>People eating this week</label><div class=counter><button id=minus>−</button><div class=counter-value>${s.size}</div><button id=plus>+</button></div><div class=section><label class=label>Equipment available this week</label><div class=equipment-grid>${EQ.map(e=>`<button class="equipment-btn ${s.eq.includes(e)?'selected':''}" data-e="${e}">${e}</button>`).join('')}</div><p class=small>These household settings persist between weeks.</p></div></div><button id=go class=primary>${prepared?`See ${count} Ready Ideas ✨`:`Find ${count} Meal Ideas ✨`}</button>${devTools()}`;
  document.querySelectorAll('.day-btn').forEach(b=>b.onclick=()=>{captureWeeklyDraft();const d=b.dataset.d;weeklyDraft.days=weeklyDraft.days.includes(d)?weeklyDraft.days.filter(x=>x!==d):sortDays([...weeklyDraft.days,d]);s.error=null;plan()});
  document.querySelectorAll('.equipment-btn').forEach(b=>b.onclick=()=>{captureWeeklyDraft();const e=b.dataset.e;s.eq=s.eq.includes(e)?s.eq.filter(x=>x!==e):[...s.eq,e];save();plan()});
  minus.onclick=()=>{captureWeeklyDraft();s.size=Math.max(1,s.size-1);save();plan()};
  plus.onclick=()=>{captureWeeklyDraft();s.size=Math.min(20,s.size+1);save();plan()};
  go.onclick=generate;
  if(DEV){loadWeek.onclick=loadTestWeek;loadGroceries.onclick=loadGroceryTest;resetData.onclick=resetTestData}
}

generate=async function(){
  captureWeeklyDraft();s.error=null;s.syncError=null;weeklyDraft.days=sortDays(weeklyDraft.days);
  if(!weeklyDraft.days.length){s.error='Choose at least one cooking day.';return plan()}
  const count=ideaCountForDays(weeklyDraft.days.length);
  if(preparedIdeasAvailable(count)){s.ideas=readyIdeas.ideas.slice(0,count);s.selectedIdeas=[];save();return ideaPicker()}
  go.disabled=true;go.textContent=`Finding ${count} good options…`;
  try{
    const r=await fetch('/api/generate-ideas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({days:weeklyDraft.days,ideaCount:count,householdSize:s.size,equipment:s.eq,useUp:weeklyDraft.useUp,notes:weeklyDraft.notes})});
    const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not generate ideas.');
    s.ideas=(d.ideas||[]).slice(0,count);s.selectedIdeas=[];s.error=null;save();ideaPicker();
  }catch(e){s.error=friendlyClientError?friendlyClientError(e.message):e.message;save();plan()}
}

ideaPicker=function(){
  weeklyDraft.days=sortDays(weeklyDraft.days);
  const needed=weeklyDraft.days.length,chosen=s.selectedIdeas.length,count=ideaCountForDays(needed);
  app.innerHTML=`<button class=secondary id=editPlan>← Edit Plan</button><h1>Pick ${needed} Dinner${needed===1?'':'s'}</h1><p class=subtle>Choose your favorites from ${count} ideas. Recipes and groceries are generated only after you decide.</p><div class="selection-status ${chosen===needed?'ready':''}"><b>${chosen} of ${needed} selected</b>${chosen?`<div class=small>${s.selectedIdeas.map((id,i)=>`${i+1} → ${esc(weeklyDraft.days[i]||'')}`).join(' · ')}</div>`:''}</div><div class=idea-grid>${(s.ideas||[]).map(x=>{const n=selectionNumber(x.id),selected=!!n;return `<button class="idea-card ${selected?'selected-idea':''}" data-id="${esc(x.id)}"><div class=idea-top><span class=idea-emoji>${esc(x.emoji||'🍽️')}</span>${selected?`<span class=pick-number>${n}</span>`:''}</div><div class=idea-title>${esc(x.title)}</div><p>${esc(x.description)}</p><div><span class=pill>${x.total_minutes||30} min</span>${x.protein?`<span class=pill>${esc(x.protein)}</span>`:''}${(x.tags||[]).slice(0,2).map(t=>`<span class=pill>${esc(t)}</span>`).join('')}</div></button>`}).join('')}</div><div class=picker-actions><button class=secondary id=refreshIdeas>Give Me ${count} Different Ideas</button><button class=primary id=buildWeek ${chosen===needed?'':'disabled'}>${chosen===needed?'Build My Week →':`Pick ${needed-chosen} More`}</button></div>`;
  editPlan.onclick=plan;document.querySelectorAll('.idea-card').forEach(b=>b.onclick=()=>toggleIdea(b.dataset.id));refreshIdeas.onclick=refreshMealIdeas;buildWeek.onclick=()=>{if(s.selectedIdeas.length===needed)buildSelectedWeek()}
}

refreshMealIdeas=async function(){
  const count=ideaCountForDays(weeklyDraft.days.length);
  app.innerHTML=`<h1>Fresh ideas coming up…</h1><div class="status swap-loading">✨ Shuffling ${count} dinner ideas…</div>`;
  try{const r=await fetch('/api/generate-ideas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({days:weeklyDraft.days,ideaCount:count,householdSize:s.size,equipment:s.eq,useUp:weeklyDraft.useUp,notes:`${weeklyDraft.notes||''}\nGive a substantially different set from these previous ideas: ${(s.ideas||[]).map(x=>x.title).join(', ')}`})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not refresh ideas.');s.ideas=(d.ideas||[]).slice(0,count);s.selectedIdeas=[];save();ideaPicker()}catch(e){s.error=friendlyClientError?friendlyClientError(e.message):e.message;save();plan()}
}

const v08ReliableBuild=buildSelectedWeek;
buildSelectedWeek=async function(){
  s.days=sortDays(weeklyDraft.days);s.useUp=weeklyDraft.useUp.trim();s.notes=weeklyDraft.notes.trim();save();
  return v08ReliableBuild()
}

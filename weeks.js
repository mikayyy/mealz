// Week-first navigation: Monday-Sunday is the canonical Mealz week.
let weekScreenMode='dashboard';
let selectedWeekStart=null;
let weeksOverview=null;
let weeksOverviewPromise=null;
const weekLoadPromises=new Map();
const weekPrefetchPromises=new Map();
let activeSwapEpoch=null;
let navigationEpoch=0;
const weekCache=new Map();
const basePlanEditor=plan;
const baseSyncPlan=syncPlan;
const baseMealsView=meals;
const baseGroceriesView=groceries;
const baseRecipeView=recipe;
const baseProfileView=profile;
const baseIdeaPicker=ideaPicker;
const baseBuildSelectedWeek=buildSelectedWeek;
const baseSwapMeal=swapMeal;
const baseShowSwapChoices=showSwapChoices;
const weekLogic=globalThis.MealzLogic;

function currentWeekStart(){return weekLogic.currentWeekStart()}
function nextWeekStart(){return weekLogic.nextWeekStart()}
function parseLocalDate(iso){const [y,m,d]=String(iso).split('-').map(Number);return new Date(y,m-1,d)}
function weekLabel(start){const a=parseLocalDate(start),b=weekLogic.addDays(a,6);const sameMonth=a.getMonth()===b.getMonth();const monthA=a.toLocaleDateString(undefined,{month:'short'});const monthB=b.toLocaleDateString(undefined,{month:'short'});return sameMonth?`${monthA} ${a.getDate()}–${b.getDate()}`:`${monthA} ${a.getDate()} – ${monthB} ${b.getDate()}`}
function weekKind(start){if(start===currentWeekStart())return 'this week';if(start===nextWeekStart())return 'next week';return 'past week'}
function mealPreview(w){if(!w?.meals?.length)return 'no meals planned yet.';return w.meals.slice(0,3).map(m=>esc(m.title)).join(' · ')+(w.meals.length>3?` · +${w.meals.length-3} more`:'')}
function weekCard(title,w,{actions=[],emptyText}={}){
  const start=w?.weekStart;
  const buttons=actions.map((a,i)=>`<button class=${i===0?'primary':'secondary'} data-week-action="${esc(a.action)}" ${start?`data-week="${esc(start)}"`:''}>${esc(a.label)}</button>`).join('');
  return `<div class="card week-card ${w?'has-plan':'empty-week'}"><div class=week-card-top><div><div class=week-eyebrow>${esc(title)}</div><h2>${start?esc(weekLabel(start)):''}</h2></div>${w?`<span class=week-count>${w.mealCount||0} meal${Number(w.mealCount||0)===1?'':'s'}</span>`:''}</div><p class=week-preview>${w?mealPreview(w):esc(emptyText||'nothing planned yet.')}</p><div class=week-actions>${buttons}</div></div>`
}
function profileCard(){
  const diet=(s.dietTags||[]).length?s.dietTags.join(' · '):'no dietary style selected';
  return `<div class="card household-summary"><div><h2>profile</h2><p>${s.adults} adult${s.adults===1?'':'s'} · ${s.children} child${s.children===1?'':'ren'} · ${esc(diet)}</p></div><button class=secondary data-week-action="edit-profile">edit</button></div>`;
}
async function loadWeeksOverview(force=false){if(DEV){weeksOverview={current:null,next:null,past:[]};return weeksOverview}if(weeksOverview&&!force)return weeksOverview;if(weeksOverviewPromise&&!force)return weeksOverviewPromise;const pending=apiJson(`/api/weeks?current_start=${encodeURIComponent(currentWeekStart())}&next_start=${encodeURIComponent(nextWeekStart())}`).then(result=>{weeksOverview=result;return result}).catch(e=>{s.syncError=e.message;save();weeksOverview={current:null,next:null,past:[]};return weeksOverview}).finally(()=>{if(weeksOverviewPromise===pending)weeksOverviewPromise=null});weeksOverviewPromise=pending;return pending}
function applyWeekData(start,d){if(!d?.plan)return false;selectedWeekStart=start;s.viewWeekStart=start;s.meals=sortMealsByDay(d.meals||[]);s.planId=d.plan.id;s.days=d.plan.cooking_days||[];s.useUp=d.plan.use_up||'';s.notes=d.plan.notes||'';s.checked={};for(const i of d.groceryItems||[])s.checked[groceryKey(i)]=!!i.checked;save();return true}
function cacheCurrentState(start){if(!start||!s.planId)return;weekCache.set(start,{plan:{id:s.planId,cooking_days:s.days||[],use_up:s.useUp||'',notes:s.notes||''},meals:sortMealsByDay(s.meals||[]),groceryItems:groceryData().map(i=>({...i,checked:!!s.checked[i.key]}))})}
async function hydrateWeek(start,{force=false}={}){
  if(!start)return false;
  // The selected week is navigation state, even when the data is already hydrated.
  selectedWeekStart=start;
  if(!force&&weekCache.has(start))return applyWeekData(start,weekCache.get(start));
  if(!force&&s.viewWeekStart===start&&s.planId&&(s.meals||[]).length){cacheCurrentState(start);return true}
  if(!force&&weekPrefetchPromises.has(start)){
    await weekPrefetchPromises.get(start);
    if(weekCache.has(start))return applyWeekData(start,weekCache.get(start));
  }
  let pending=!force?weekLoadPromises.get(start):null;
  if(!pending){
    pending=apiJson(`/api/plan?week_start=${encodeURIComponent(start)}`).finally(()=>{if(weekLoadPromises.get(start)===pending)weekLoadPromises.delete(start)});
    weekLoadPromises.set(start,pending);
  }
  try{const d=await pending;if(!d?.plan)return false;weekCache.set(start,d);return applyWeekData(start,d)}catch(e){s.syncError=e.message;save();return false}
}
function prefetchWeek(start){
  if(DEV||!start||weekCache.has(start)||weekLoadPromises.has(start)||weekPrefetchPromises.has(start))return;
  let pending=apiJson(`/api/plan?week_start=${encodeURIComponent(start)}`).then(d=>{if(d?.plan)weekCache.set(start,d);return d}).catch(()=>null).finally(()=>{if(weekPrefetchPromises.get(start)===pending)weekPrefetchPromises.delete(start)});
  weekPrefetchPromises.set(start,pending);
}
function scheduleDashboardPrefetch(o){
  const starts=[o?.next?.weekStart,o?.current?.weekStart].filter(Boolean);
  if(!starts.length)return;
  const run=()=>starts.forEach(prefetchWeek);
  if('requestIdleCallback'in window)requestIdleCallback(run,{timeout:1200});else setTimeout(run,0);
}
function cancelTransientNavigation(){activeSwapEpoch=null;navigationEpoch++}
function backToWeeks(){cancelTransientNavigation();weekScreenMode='dashboard';selectedWeekStart=null;dashboard()}
function addWeekContext(){
  if(!selectedWeekStart||app.querySelector('.week-context'))return;
  const h1=app.querySelector('h1');if(!h1)return;
  const context=document.createElement('div');context.className='week-context';context.innerHTML=`<button class="secondary week-back" type="button">← weeks</button><div><b>${esc(weekKind(selectedWeekStart))}</b><span>${esc(weekLabel(selectedWeekStart))}</span></div>`;
  h1.before(context);context.querySelector('.week-back').onclick=backToWeeks;
}
function addEditorBack(){
  if(app.querySelector('.week-context'))return;
  const h1=app.querySelector('h1');if(!h1)return;
  const context=document.createElement('div');context.className='week-context';context.innerHTML=`<button class="secondary week-back" type="button">← weeks</button><div><b>next week</b><span>${esc(weekLabel(nextWeekStart()))}</span></div>`;
  h1.before(context);context.querySelector('.week-back').onclick=backToWeeks;
}
function addProfileBack(){
  if(app.querySelector('.week-context'))return;
  const h1=app.querySelector('h1');if(!h1)return;
  const fromEditor=weekScreenMode==='editor';
  const context=document.createElement('div');context.className='week-context';context.innerHTML=`<button class="secondary week-back" type="button">← ${fromEditor?'plan':'weeks'}</button><div><b>profile</b><span>${fromEditor?'return to next week planning':'meal preferences and settings'}</span></div>`;
  h1.before(context);context.querySelector('.week-back').onclick=()=>{cancelTransientNavigation();plan()};
}
async function startNextWeekPlanning(prefill=false){cancelTransientNavigation();weekScreenMode='editor';selectedWeekStart=nextWeekStart();s.viewWeekStart=selectedWeekStart;s.error=null;if(prefill){const ok=await hydrateWeek(selectedWeekStart);if(ok)weeklyDraft={days:sortDays(s.days||[]),useUp:s.useUp||'',notes:s.notes||''};else weeklyDraft={days:[],useUp:'',notes:''}}else{weeklyDraft={days:[],useUp:'',notes:''}}basePlanEditor();addEditorBack()}
async function openWeekMeals(start){cancelTransientNavigation();const ok=await hydrateWeek(start);if(ok){weekScreenMode='dashboard';view('meals')}else{weeksOverview=null;dashboard()}}
async function openWeekGroceries(start){cancelTransientNavigation();const ok=await hydrateWeek(start);if(ok){weekScreenMode='dashboard';view('groceries')}else{weeksOverview=null;dashboard()}}

async function handleWeekAction(button){
  const action=button?.dataset?.weekAction,start=button?.dataset?.week;
  if(!action||button.disabled)return;
  const originalLabel=button.textContent;
  const waitsForData=['replan-next','view-meals','view-groceries'].includes(action);
  if(waitsForData){button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='opening…'}
  try{
    if(action==='plan-next')return startNextWeekPlanning(false);
    if(action==='replan-next')return await startNextWeekPlanning(true);
    if(action==='view-meals')return await openWeekMeals(start);
    if(action==='view-groceries')return await openWeekGroceries(start);
    if(action==='edit-profile'){cancelTransientNavigation();weekScreenMode='dashboard';return profile()}
  }finally{
    if(waitsForData&&button.isConnected){button.disabled=false;button.removeAttribute('aria-busy');button.textContent=originalLabel}
  }
}

// Dashboard content is replaced wholesale on every render. A single delegated handler
// on the stable #app root survives those replacements and avoids losing navigation
// when auth/startup work causes an additional render after the dashboard first appears.
function wireWeekActions(){
  if(app.dataset.weekActionsWired==='true')return;
  app.dataset.weekActionsWired='true';
  app.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-week-action]');
    if(!button||!app.contains(button))return;
    event.preventDefault();
    handleWeekAction(button).catch?.(error=>{console.error('mealz week navigation failed',error)});
  });
}

async function dashboard(){weekScreenMode='dashboard';selectedWeekStart=null;wireWeekActions();if(weeksOverview){renderDashboard(weeksOverview);return}app.innerHTML='<h1>your weeks</h1><p class=subtle>mealz weeks run Monday through Sunday.</p><div class="dashboard-loading" role="status" aria-live="polite"><span class="sr-only">loading your meal plans…</span><div class="skeleton-line skeleton-title"></div><div class="skeleton-card"></div><div class="skeleton-line"></div><div class="skeleton-card"></div></div>';const o=await loadWeeksOverview();renderDashboard(o)}
function renderDashboard(o){
  const next=o?.next,current=o?.current,past=o?.past||[];
  const nextActions=next?[{label:'meals',action:'view-meals'},{label:'groceries',action:'view-groceries'},{label:'replan',action:'replan-next'}]:[{label:'plan next week',action:'plan-next'}];
  const savedActions=[{label:'meals',action:'view-meals'},{label:'groceries',action:'view-groceries'}];
  app.innerHTML=`<h1>your weeks</h1><p class=subtle>choose a week, then work with its meals and groceries.</p>${cloudNote()}${profileCard()}<section class=week-section><h3>next week</h3>${weekCard('next week',next,{actions:nextActions,emptyText:'ready when you are. build the week before Monday arrives.'})}</section><section class=week-section><h3>this week</h3>${weekCard('this week',current,{actions:current?savedActions:[],emptyText:'no saved meal plan for this Monday–Sunday week.'})}</section><section class=week-section><div class=week-section-heading><h3>past weeks</h3><span class=small>${past.length?`${past.length} recent`:'no history yet'}</span></div>${past.length?past.map(w=>weekCard('past week',w,{actions:savedActions})).join(''):'<div class="card empty-history"><p>past weeks will collect here as you use mealz.</p></div>'}</section>`;
  scheduleDashboardPrefetch(o);
}

planningWeekStart=function(){return selectedWeekStart||nextWeekStart()};
plan=function(){if(weekScreenMode==='editor'){basePlanEditor();addEditorBack();return}return dashboard()};
profile=function(){baseProfileView();addProfileBack()};
ideaPicker=function(){baseIdeaPicker();addWeekContext()};
meals=function(){activeSwapEpoch=null;baseMealsView();addWeekContext()};
groceries=function(){activeSwapEpoch=null;baseGroceriesView();addWeekContext()};
recipe=function(id){baseRecipeView(id);if(selectedWeekStart){const back=app.querySelector('#back');if(back)back.textContent='← Meals';addWeekContext()}};
buildSelectedWeek=async function(){const result=await baseBuildSelectedWeek();addWeekContext();return result};
swapMeal=async function(id){
  const epoch=++navigationEpoch;
  activeSwapEpoch=epoch;
  const pending=baseSwapMeal(id);
  // The loading state already has a Back control. The week context provides a direct
  // dashboard escape, and showSwapChoices is guarded so a canceled request cannot
  // unexpectedly pull the user forward again when the response arrives.
  addWeekContext();
  const result=await pending;
  if(activeSwapEpoch===epoch)addWeekContext();
  return result;
};
showSwapChoices=function(original,alts){if(activeSwapEpoch==null)return;baseShowSwapChoices(original,alts);addWeekContext()};
syncPlan=async function(){const week=planningWeekStart();const result=await baseSyncPlan();weeksOverview=null;weekCache.delete(week);cacheCurrentState(week);return result};

// The wordmark is a persistent escape hatch back to the week dashboard on every screen.
const brandHome=document.querySelector('.brand');
if(brandHome){
  brandHome.setAttribute('role','button');
  brandHome.setAttribute('tabindex','0');
  brandHome.setAttribute('aria-label','go to weeks dashboard');
  brandHome.setAttribute('title','go to weeks dashboard');
  brandHome.onclick=backToWeeks;
  brandHome.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();backToWeeks()}};
}

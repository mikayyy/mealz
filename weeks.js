// Week-first navigation: Monday-Sunday is the canonical Mealz week.
let weekScreenMode='dashboard';
let selectedWeekStart=null;
let weeksOverview=null;
let weeksOverviewLoading=false;
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
function weekKind(start){if(start===currentWeekStart())return 'This Week';if(start===nextWeekStart())return 'Next Week';return 'Past Week'}
function mealPreview(w){if(!w?.meals?.length)return 'No meals planned yet.';return w.meals.slice(0,3).map(m=>`${m.emoji||'🍽️'} ${esc(m.title)}`).join(' · ')+(w.meals.length>3?` · +${w.meals.length-3} more`:'')}
function weekCard(title,w,{actions=[],emptyText}={}){
  const start=w?.weekStart;
  const buttons=actions.map((a,i)=>`<button class=${i===0?'primary':'secondary'} data-week-action="${esc(a.action)}" ${start?`data-week="${esc(start)}"`:''}>${esc(a.label)}</button>`).join('');
  return `<div class="card week-card ${w?'has-plan':'empty-week'}"><div class=week-card-top><div><div class=week-eyebrow>${esc(title)}</div><h2>${start?esc(weekLabel(start)):''}</h2></div>${w?`<span class=week-count>${w.mealCount||0} meal${Number(w.mealCount||0)===1?'':'s'}</span>`:''}</div><p class=week-preview>${w?mealPreview(w):esc(emptyText||'Nothing planned yet.')}</p><div class=week-actions>${buttons}</div></div>`
}
function profileCard(){
  const diet=(s.dietTags||[]).length?s.dietTags.join(' · '):'No dietary style selected';
  return `<div class="card household-summary"><div><h2>Profile</h2><p>${s.adults} adult${s.adults===1?'':'s'} · ${s.children} child${s.children===1?'':'ren'} · ${esc(diet)}</p></div><button class=secondary data-week-action="edit-profile">Edit</button></div>`;
}
async function loadWeeksOverview(force=false){if(DEV){weeksOverview={current:null,next:null,past:[]};return weeksOverview}if(weeksOverview&&!force)return weeksOverview;if(weeksOverviewLoading)return weeksOverview;weeksOverviewLoading=true;try{weeksOverview=await apiJson(`/api/weeks?current_start=${encodeURIComponent(currentWeekStart())}&next_start=${encodeURIComponent(nextWeekStart())}`);return weeksOverview}catch(e){s.syncError=e.message;save();weeksOverview={current:null,next:null,past:[]};return weeksOverview}finally{weeksOverviewLoading=false}}
function applyWeekData(start,d){if(!d?.plan)return false;selectedWeekStart=start;s.viewWeekStart=start;s.meals=sortMealsByDay(d.meals||[]);s.planId=d.plan.id;s.days=d.plan.cooking_days||[];s.useUp=d.plan.use_up||'';s.notes=d.plan.notes||'';s.checked={};for(const i of d.groceryItems||[])s.checked[groceryKey(i)]=!!i.checked;save();return true}
function cacheCurrentState(start){if(!start||!s.planId)return;weekCache.set(start,{plan:{id:s.planId,cooking_days:s.days||[],use_up:s.useUp||'',notes:s.notes||''},meals:sortMealsByDay(s.meals||[]),groceryItems:groceryData().map(i=>({...i,checked:!!s.checked[i.key]}))})}
async function hydrateWeek(start,{force=false}={}){
  if(!start)return false;
  // The selected week is navigation state, even when the data is already hydrated.
  // Previously this was only set on a network/cache hydration path, which could leave
  // Meals/Groceries without a route back to the dashboard for the already-loaded week.
  selectedWeekStart=start;
  if(!force&&weekCache.has(start))return applyWeekData(start,weekCache.get(start));
  if(!force&&s.viewWeekStart===start&&s.planId&&(s.meals||[]).length){cacheCurrentState(start);return true}
  try{const d=await apiJson(`/api/plan?week_start=${encodeURIComponent(start)}`);if(!d.plan)return false;weekCache.set(start,d);return applyWeekData(start,d)}catch(e){s.syncError=e.message;save();return false}
}
function cancelTransientNavigation(){activeSwapEpoch=null;navigationEpoch++}
function backToWeeks(){cancelTransientNavigation();weekScreenMode='dashboard';selectedWeekStart=null;dashboard()}
function addWeekContext(){
  if(!selectedWeekStart||app.querySelector('.week-context'))return;
  const h1=app.querySelector('h1');if(!h1)return;
  const context=document.createElement('div');context.className='week-context';context.innerHTML=`<button class="secondary week-back" type="button">← Weeks</button><div><b>${esc(weekKind(selectedWeekStart))}</b><span>${esc(weekLabel(selectedWeekStart))}</span></div>`;
  h1.before(context);context.querySelector('.week-back').onclick=backToWeeks;
}
function addEditorBack(){
  if(app.querySelector('.week-context'))return;
  const h1=app.querySelector('h1');if(!h1)return;
  const context=document.createElement('div');context.className='week-context';context.innerHTML=`<button class="secondary week-back" type="button">← Weeks</button><div><b>Next Week</b><span>${esc(weekLabel(nextWeekStart()))}</span></div>`;
  h1.before(context);context.querySelector('.week-back').onclick=backToWeeks;
}
function addProfileBack(){
  if(app.querySelector('.week-context'))return;
  const h1=app.querySelector('h1');if(!h1)return;
  const fromEditor=weekScreenMode==='editor';
  const context=document.createElement('div');context.className='week-context';context.innerHTML=`<button class="secondary week-back" type="button">← ${fromEditor?'Plan':'Weeks'}</button><div><b>Profile</b><span>${fromEditor?'Return to next week planning':'Meal preferences and settings'}</span></div>`;
  h1.before(context);context.querySelector('.week-back').onclick=()=>{cancelTransientNavigation();plan()};
}
async function startNextWeekPlanning(prefill=false){cancelTransientNavigation();weekScreenMode='editor';selectedWeekStart=nextWeekStart();s.viewWeekStart=selectedWeekStart;s.error=null;if(prefill){const ok=await hydrateWeek(selectedWeekStart);if(ok)weeklyDraft={days:sortDays(s.days||[]),useUp:s.useUp||'',notes:s.notes||''};else weeklyDraft={days:[],useUp:'',notes:''}}else{weeklyDraft={days:[],useUp:'',notes:''}}basePlanEditor();addEditorBack()}
async function openWeekMeals(start){cancelTransientNavigation();const ok=await hydrateWeek(start);if(ok){weekScreenMode='dashboard';view('meals')}else{weeksOverview=null;dashboard()}}
async function openWeekGroceries(start){cancelTransientNavigation();const ok=await hydrateWeek(start);if(ok){weekScreenMode='dashboard';view('groceries')}else{weeksOverview=null;dashboard()}}

async function handleWeekAction(button){
  const action=button?.dataset?.weekAction,start=button?.dataset?.week;
  if(!action)return;
  if(action==='plan-next')return startNextWeekPlanning(false);
  if(action==='replan-next')return startNextWeekPlanning(true);
  if(action==='view-meals')return openWeekMeals(start);
  if(action==='view-groceries')return openWeekGroceries(start);
  if(action==='edit-profile'){
    cancelTransientNavigation();
    weekScreenMode='dashboard';
    return profile();
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

async function dashboard(){weekScreenMode='dashboard';selectedWeekStart=null;wireWeekActions();if(weeksOverview){renderDashboard(weeksOverview);return}app.innerHTML='<h1>Your Weeks</h1><p class=subtle>mealz weeks run Monday through Sunday.</p><div class="status">Loading your meal plans…</div>';const o=await loadWeeksOverview();renderDashboard(o)}
function renderDashboard(o){
  const next=o?.next,current=o?.current,past=o?.past||[];
  const nextActions=next?[{label:'Meals',action:'view-meals'},{label:'Groceries',action:'view-groceries'},{label:'Replan',action:'replan-next'}]:[{label:'Plan next week',action:'plan-next'}];
  const savedActions=[{label:'Meals',action:'view-meals'},{label:'Groceries',action:'view-groceries'}];
  app.innerHTML=`<h1>Your Weeks</h1><p class=subtle>Choose a week, then work with its meals and groceries.</p>${cloudNote()}${profileCard()}<section class=week-section><h3>Next Week</h3>${weekCard('NEXT WEEK',next,{actions:nextActions,emptyText:'Ready when you are. Build the week before Monday arrives.'})}</section><section class=week-section><h3>This Week</h3>${weekCard('THIS WEEK',current,{actions:current?savedActions:[],emptyText:'No saved meal plan for this Monday–Sunday week.'})}</section><section class=week-section><div class=week-section-heading><h3>Past Weeks</h3><span class=small>${past.length?`${past.length} recent`:'No history yet'}</span></div>${past.length?past.map(w=>weekCard('PAST WEEK',w,{actions:savedActions})).join(''):'<div class="card empty-history"><p>Past weeks will collect here as you use mealz.</p></div>'}</section>`;
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
  brandHome.setAttribute('aria-label','Go to weeks dashboard');
  brandHome.setAttribute('title','Go to weeks dashboard');
  brandHome.onclick=backToWeeks;
  brandHome.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();backToWeeks()}};
}

// Week dashboard: Monday-Sunday is the canonical Mealz week.
let weekScreenMode='dashboard';
let selectedWeekStart=null;
let weeksOverview=null;
let weeksOverviewLoading=false;
const weekCache=new Map();
const basePlanEditor=plan;
const baseSyncPlan=syncPlan;
const weekLogic=globalThis.MealzLogic;

function currentWeekStart(){return weekLogic.currentWeekStart()}
function nextWeekStart(){return weekLogic.nextWeekStart()}
function parseLocalDate(iso){const [y,m,d]=String(iso).split('-').map(Number);return new Date(y,m-1,d)}
function weekLabel(start){const a=parseLocalDate(start),b=weekLogic.addDays(a,6);const sameMonth=a.getMonth()===b.getMonth();const monthA=a.toLocaleDateString(undefined,{month:'short'});const monthB=b.toLocaleDateString(undefined,{month:'short'});return sameMonth?`${monthA} ${a.getDate()}–${b.getDate()}`:`${monthA} ${a.getDate()} – ${monthB} ${b.getDate()}`}
function mealPreview(w){if(!w?.meals?.length)return 'No meals planned yet.';return w.meals.slice(0,3).map(m=>`${m.emoji||'🍽️'} ${esc(m.title)}`).join(' · ')+(w.meals.length>3?` · +${w.meals.length-3} more`:'')}
function weekCard(title,w,{primaryLabel,primaryAction,secondaryLabel,secondaryAction,emptyText}={}){
  const start=w?.weekStart;
  return `<div class="card week-card ${w?'has-plan':'empty-week'}"><div class=week-card-top><div><div class=week-eyebrow>${esc(title)}</div><h2>${start?esc(weekLabel(start)):''}</h2></div>${w?`<span class=week-count>${w.mealCount||0} meal${Number(w.mealCount||0)===1?'':'s'}</span>`:''}</div><p class=week-preview>${w?mealPreview(w):esc(emptyText||'Nothing planned yet.')}</p><div class=week-actions>${primaryLabel?`<button class=primary data-week-action="${esc(primaryAction)}" ${start?`data-week="${esc(start)}"`:''}>${esc(primaryLabel)}</button>`:''}${secondaryLabel?`<button class=secondary data-week-action="${esc(secondaryAction)}" ${start?`data-week="${esc(start)}"`:''}>${esc(secondaryLabel)}</button>`:''}</div></div>`
}
function profileCard(){
  const diet=(s.dietTags||[]).length?s.dietTags.join(' · '):'No dietary style selected';
  return `<div class="card household-summary"><div><h2>Profile</h2><p>${s.adults} adult${s.adults===1?'':'s'} · ${s.children} child${s.children===1?'':'ren'} · ${esc(diet)}</p></div><button class=secondary data-week-action="edit-profile">Edit</button></div>`;
}
async function loadWeeksOverview(force=false){if(DEV){weeksOverview={current:null,next:null,past:[]};return weeksOverview}if(weeksOverview&&!force)return weeksOverview;if(weeksOverviewLoading)return weeksOverview;weeksOverviewLoading=true;try{weeksOverview=await apiJson(`/api/weeks?current_start=${encodeURIComponent(currentWeekStart())}&next_start=${encodeURIComponent(nextWeekStart())}`);return weeksOverview}catch(e){s.syncError=e.message;save();weeksOverview={current:null,next:null,past:[]};return weeksOverview}finally{weeksOverviewLoading=false}}
function applyWeekData(start,d){if(!d?.plan)return false;selectedWeekStart=start;s.viewWeekStart=start;s.meals=sortMealsByDay(d.meals||[]);s.planId=d.plan.id;s.days=d.plan.cooking_days||[];s.useUp=d.plan.use_up||'';s.notes=d.plan.notes||'';s.checked={};for(const i of d.groceryItems||[])s.checked[groceryKey(i)]=!!i.checked;save();return true}
function cacheCurrentState(start){if(!start||!s.planId)return;weekCache.set(start,{plan:{id:s.planId,cooking_days:s.days||[],use_up:s.useUp||'',notes:s.notes||''},meals:sortMealsByDay(s.meals||[]),groceryItems:groceryData().map(i=>({...i,checked:!!s.checked[i.key]}))})}
async function hydrateWeek(start,{force=false}={}){if(!start)return false;if(!force&&weekCache.has(start))return applyWeekData(start,weekCache.get(start));if(!force&&s.viewWeekStart===start&&s.planId&&(s.meals||[]).length){cacheCurrentState(start);return true}try{const d=await apiJson(`/api/plan?week_start=${encodeURIComponent(start)}`);if(!d.plan)return false;weekCache.set(start,d);return applyWeekData(start,d)}catch(e){s.syncError=e.message;save();return false}}
async function startNextWeekPlanning(prefill=false){weekScreenMode='editor';selectedWeekStart=nextWeekStart();s.viewWeekStart=selectedWeekStart;s.error=null;if(prefill){const ok=await hydrateWeek(selectedWeekStart);if(ok)weeklyDraft={days:sortDays(s.days||[]),useUp:s.useUp||'',notes:s.notes||''};else weeklyDraft={days:[],useUp:'',notes:''}}else{weeklyDraft={days:[],useUp:'',notes:''}}basePlanEditor()}
async function openWeekMeals(start){const ok=await hydrateWeek(start);if(ok){weekScreenMode='dashboard';view('meals')}else{weeksOverview=null;dashboard()}}
async function openWeekGroceries(start){const ok=await hydrateWeek(start);if(ok){weekScreenMode='dashboard';view('groceries')}else{weeksOverview=null;dashboard()}}
function wireWeekActions(){document.querySelectorAll('[data-week-action]').forEach(b=>b.onclick=async()=>{const action=b.dataset.weekAction,start=b.dataset.week;if(action==='plan-next')return startNextWeekPlanning(false);if(action==='replan-next')return startNextWeekPlanning(true);if(action==='view-meals')return openWeekMeals(start);if(action==='view-groceries')return openWeekGroceries(start);if(action==='edit-profile'){weekScreenMode='dashboard';return profile()}})}
async function dashboard(){weekScreenMode='dashboard';document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view==='plan'));if(weeksOverview){renderDashboard(weeksOverview);return}app.innerHTML='<h1>Your Weeks</h1><p class=subtle>Mealz weeks run Monday through Sunday.</p><div class="status">Loading your meal plans…</div>';const o=await loadWeeksOverview();renderDashboard(o)}
function renderDashboard(o){const next=o?.next,current=o?.current,past=o?.past||[];app.innerHTML=`<h1>Your Weeks</h1><p class=subtle>Plan ahead, cook this week, and revisit what worked.</p>${cloudNote()}${profileCard()}<section class=week-section><h3>Next Week</h3>${weekCard('NEXT WEEK',next,{primaryLabel:next?'View meals':'Plan next week',primaryAction:next?'view-meals':'plan-next',secondaryLabel:next?'Replan next week':null,secondaryAction:'replan-next',emptyText:'Ready when you are. Build the week before Monday arrives.'})}</section><section class=week-section><h3>This Week</h3>${weekCard('THIS WEEK',current,{primaryLabel:current?'View meals':null,primaryAction:'view-meals',secondaryLabel:current?'Groceries':null,secondaryAction:'view-groceries',emptyText:'No saved meal plan for this Monday–Sunday week.'})}</section><section class=week-section><div class=week-section-heading><h3>Past Weeks</h3><span class=small>${past.length?`${past.length} recent`:'No history yet'}</span></div>${past.length?past.map(w=>weekCard('PAST WEEK',w,{primaryLabel:'View meals',primaryAction:'view-meals'})).join(''):'<div class="card empty-history"><p>Past weeks will collect here as you use Mealz.</p></div>'}</section>`;wireWeekActions()}

planningWeekStart=function(){return selectedWeekStart||nextWeekStart()};
plan=function(){return weekScreenMode==='editor'?basePlanEditor():dashboard()};
syncPlan=async function(){const week=planningWeekStart();const result=await baseSyncPlan();weeksOverview=null;weekCache.delete(week);cacheCurrentState(week);return result};

const planNav=document.querySelector('.nav-btn[data-view="plan"]');
if(planNav)planNav.addEventListener('click',()=>{weekScreenMode='dashboard'},true);
const mealsNav=document.querySelector('.nav-btn[data-view="meals"]');
if(mealsNav)mealsNav.addEventListener('click',event=>{event.stopImmediatePropagation();openWeekMeals(currentWeekStart())},true);
const groceriesNav=document.querySelector('.nav-btn[data-view="groceries"]');
if(groceriesNav)groceriesNav.addEventListener('click',event=>{event.stopImmediatePropagation();openWeekGroceries(currentWeekStart())},true);

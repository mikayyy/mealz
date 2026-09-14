// Mealz v0.8.1: always hydrate the newest active plan after boot.
async function loadNewestActivePlan(){
  if(DEV)return;
  try{
    const r=await fetch('/api/plan');
    const d=await r.json();
    if(!r.ok||!d?.plan)return;
    const latestId=d.plan.id;
    if(s.planId===latestId&&Array.isArray(s.meals)&&s.meals.length)return;
    s={...s,size:d.plan.household_size||s.size,eq:d.plan.equipment||s.eq,meals:d.meals||[],planId:latestId,checked:{},syncError:null};
    for(const i of d.groceryItems||[])s.checked[groceryKey(i)]=!!i.checked;
    save();
    const active=document.querySelector('.nav-btn.active')?.dataset.view||'plan';
    if(active==='meals')meals();
    else if(active==='groceries')groceries();
    else plan();
  }catch(e){console.warn('Could not refresh newest Mealz plan',e)}
}
setTimeout(loadNewestActivePlan,350);

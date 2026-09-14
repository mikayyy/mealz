// Directory-style breadcrumbs keep the week hierarchy visible without stacked back buttons.
(()=>{
  function crumbButton(label,onClick){
    const b=document.createElement('button');b.type='button';b.className='breadcrumb-link';b.textContent=label;b.onclick=onClick;return b;
  }
  function crumbText(label,current=false){const s=document.createElement('span');s.className=current?'breadcrumb-current':'breadcrumb-label';s.textContent=label;return s}
  function sep(){const s=document.createElement('span');s.className='breadcrumb-sep';s.textContent='›';s.setAttribute('aria-hidden','true');return s}
  function installCrumbs(parts,{removeBack=false,switchTo=null}={}){
    app.querySelector('.week-context')?.remove();
    if(removeBack)app.querySelector('#back')?.remove();
    app.querySelector('.breadcrumb-row')?.remove();
    app.querySelector('.breadcrumb-nav')?.remove();
    const h1=app.querySelector('h1');if(!h1)return;
    const row=document.createElement('div');row.className='breadcrumb-row';
    const nav=document.createElement('nav');nav.className='breadcrumb-nav';nav.setAttribute('aria-label','Breadcrumb');
    parts.forEach((part,i)=>{if(i)nav.appendChild(sep());nav.appendChild(part.action?crumbButton(part.label,part.action):crumbText(part.label,i===parts.length-1))});
    row.appendChild(nav);
    if(switchTo){
      const button=document.createElement('button');button.type='button';button.className='secondary week-view-switch';button.textContent=switchTo.label;button.setAttribute('aria-label',switchTo.ariaLabel||`Switch to ${switchTo.label}`);button.onclick=switchTo.action;row.appendChild(button);
    }
    h1.before(row);
  }
  function weekParts(section){
    if(!selectedWeekStart)return [{label:'Weeks',action:backToWeeks},{label:section}];
    return [{label:'Weeks',action:backToWeeks},{label:weekKind(selectedWeekStart)},{label:section}];
  }

  const basePlan=plan;
  plan=function(){const result=basePlan();if(weekScreenMode==='editor')installCrumbs(weekParts('Plan'));return result};

  const baseProfile=profile;
  profile=function(){
    const fromEditor=weekScreenMode==='editor';
    const result=baseProfile();
    installCrumbs(fromEditor?[{label:'Weeks',action:backToWeeks},{label:'Next Week'},{label:'Plan',action:plan},{label:'Profile'}]:[{label:'Weeks',action:backToWeeks},{label:'Profile'}]);
    return result;
  };

  const baseIdeas=ideaPicker;
  ideaPicker=function(){const result=baseIdeas();installCrumbs(weekParts('Meal Ideas'));return result};

  const baseMeals=meals;
  meals=function(){
    const result=baseMeals();
    installCrumbs(weekParts('Meals'),{switchTo:{label:'Groceries',ariaLabel:`Open groceries for ${selectedWeekStart?weekKind(selectedWeekStart):'this week'}`,action:()=>groceries()}});
    return result;
  };

  const baseGroceries=groceries;
  groceries=function(animateKey){
    const result=baseGroceries(animateKey);
    installCrumbs(weekParts('Groceries'),{switchTo:{label:'Meals',ariaLabel:`Open meals for ${selectedWeekStart?weekKind(selectedWeekStart):'this week'}`,action:()=>meals()}});
    return result;
  };

  const baseRecipe=recipe;
  recipe=function(id){const result=baseRecipe(id);installCrumbs([...weekParts('Meals'),{label:'Recipe'}],{removeBack:true});return result};

  const baseSwap=swapMeal;
  swapMeal=function(id){const pending=baseSwap(id);installCrumbs([...weekParts('Meals'),{label:'Swap'}]);return pending};

  const baseChoices=showSwapChoices;
  showSwapChoices=function(original,alts){const result=baseChoices(original,alts);installCrumbs([...weekParts('Meals'),{label:'Swap'}]);return result};
})();

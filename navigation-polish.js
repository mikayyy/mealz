// Directory-style navigation keeps week hierarchy visible while preserving flexible back paths.
(()=>{
  function crumbButton(label,onClick){
    const b=document.createElement('button');b.type='button';b.className='breadcrumb-link';b.textContent=label;b.onclick=onClick;return b;
  }
  function crumbText(label,kind='current'){
    const s=document.createElement('span');
    s.className=kind==='context'?'breadcrumb-context':'breadcrumb-current';
    s.textContent=label;
    return s;
  }
  function sep(){const s=document.createElement('span');s.className='breadcrumb-sep';s.textContent='›';s.setAttribute('aria-hidden','true');return s}
  function installCrumbs(parts,{switchTo=null,backTo=null}={}){
    app.querySelector('.week-context')?.remove();
    app.querySelector('.breadcrumb-shell')?.remove();
    app.querySelector('.breadcrumb-row')?.remove();
    app.querySelector('.breadcrumb-nav')?.remove();
    if(backTo)app.querySelector('#back')?.remove();
    const h1=app.querySelector('h1');if(!h1)return;

    const shell=document.createElement('div');shell.className='breadcrumb-shell';
    if(backTo){
      const tools=document.createElement('div');tools.className='breadcrumb-tools';
      const back=document.createElement('button');back.type='button';back.className='secondary breadcrumb-back';back.textContent=`← ${backTo.label}`;back.onclick=backTo.action;tools.appendChild(back);shell.appendChild(tools);
    }

    const row=document.createElement('div');row.className='breadcrumb-row';
    const nav=document.createElement('nav');nav.className='breadcrumb-nav';nav.setAttribute('aria-label','Breadcrumb');
    parts.forEach((part,i)=>{
      if(i)nav.appendChild(sep());
      if(part.action)nav.appendChild(crumbButton(part.label,part.action));
      else nav.appendChild(crumbText(part.label,part.kind||(i===parts.length-1?'current':'context')));
    });
    row.appendChild(nav);
    if(switchTo){
      const button=document.createElement('button');button.type='button';button.className='secondary week-view-switch';button.textContent=switchTo.label;button.setAttribute('aria-label',switchTo.ariaLabel||`Switch to ${switchTo.label}`);button.onclick=switchTo.action;row.appendChild(button);
    }
    shell.appendChild(row);
    h1.before(shell);
  }
  function weekParts(section,{sectionAction=null}={}){
    if(!selectedWeekStart)return [{label:'Weeks',action:backToWeeks},{label:section,action:sectionAction||null}];
    return [{label:'Weeks',action:backToWeeks},{label:weekKind(selectedWeekStart),kind:'context'},{label:section,action:sectionAction||null}];
  }
  function planningParts(current){
    return [{label:'Weeks',action:backToWeeks},{label:'Next Week',kind:'context'},{label:'Plan',action:current==='Plan'?null:plan},{label:current}];
  }

  const basePlan=plan;
  plan=function(){const result=basePlan();if(weekScreenMode==='editor')installCrumbs([{label:'Weeks',action:backToWeeks},{label:'Next Week',kind:'context'},{label:'Plan'}]);return result};

  const baseProfile=profile;
  profile=function(){
    const fromEditor=weekScreenMode==='editor';
    const result=baseProfile();
    installCrumbs(fromEditor?planningParts('Profile'):[{label:'Weeks',action:backToWeeks},{label:'Profile'}]);
    return result;
  };

  const baseIdeas=ideaPicker;
  ideaPicker=function(){const result=baseIdeas();installCrumbs(planningParts('Meal Ideas'));return result};

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
  recipe=function(id){
    const result=baseRecipe(id);
    installCrumbs([...weekParts('Meals',{sectionAction:()=>meals()}),{label:'Recipe'}],{backTo:{label:'Back to meals',action:()=>meals()}});
    return result;
  };

  const baseSwap=swapMeal;
  swapMeal=function(id){
    const pending=baseSwap(id);
    installCrumbs([...weekParts('Meals',{sectionAction:()=>meals()}),{label:'Swap'}]);
    return pending;
  };

  const baseChoices=showSwapChoices;
  showSwapChoices=function(original,alts){
    const result=baseChoices(original,alts);
    installCrumbs([...weekParts('Meals',{sectionAction:()=>meals()}),{label:'Swap'}]);
    return result;
  };
})();

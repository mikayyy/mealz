(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.MealzLogic=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  /** @type {import('./types.js').DayName[]} */
  const DAY_ORDER=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const GROCERY_STAPLES=new Set(['salt','table salt','kosher salt','sea salt','pepper','black pepper','ground black pepper']);
  /** @type {Record<string, Array<{label: string, terms: string[]}>>} */
  const DIET_CONFLICT_RULES={
    Pescatarian:[{label:'meat or poultry',terms:['t-bone','t bone','steak','beef','ground beef','hamburger','pork','bacon','ham','chicken','turkey','lamb','veal']}],
    Vegetarian:[{label:'meat or seafood',terms:['t-bone','t bone','steak','beef','ground beef','hamburger','pork','bacon','ham','chicken','turkey','lamb','veal','salmon','tuna','shrimp','prawn','cod','tilapia','fish']}],
    Vegan:[{label:'animal products',terms:['t-bone','t bone','steak','beef','ground beef','hamburger','pork','bacon','ham','chicken','turkey','lamb','veal','salmon','tuna','shrimp','prawn','cod','tilapia','fish','egg','eggs','milk','cheese','yogurt','butter','cream','honey']}],
    'Dairy-Free':[{label:'dairy',terms:['milk','cheese','yogurt','butter','cream','half and half','half-and-half']}],
    'Nut-Free':[{label:'nuts',terms:['peanut','peanuts','almond','almonds','cashew','cashews','walnut','walnuts','pecan','pecans','pistachio','pistachios','hazelnut','hazelnuts']}]
  };

  /** @param {import('./types.js').DayName[] | null | undefined} days @returns {import('./types.js').DayName[]} */
  function sortDays(days){return (days||[]).slice().sort((a,b)=>DAY_ORDER.indexOf(a)-DAY_ORDER.indexOf(b))}
  /** @param {number} n @returns {number} */
  function ideaCountForDays(n){return Number(n)>=5?Math.min(9,Number(n)+2):6}
  /** @param {Date} [date] @returns {Date} */
  function mondayStart(date=new Date()){
    const d=new Date(date.getFullYear(),date.getMonth(),date.getDate());
    const day=d.getDay();
    d.setDate(d.getDate()+(day===0?-6:1-day));
    return d;
  }
  /** @param {Date} date @param {number} n @returns {Date} */
  function addDays(date,n){const d=new Date(date);d.setDate(d.getDate()+n);return d}
  /** @param {Date} date @returns {string} */
  function isoLocal(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
  /** @param {Date} [date] @returns {string} */
  function currentWeekStart(date=new Date()){return isoLocal(mondayStart(date))}
  /** @param {Date} [date] @returns {string} */
  function nextWeekStart(date=new Date()){return isoLocal(addDays(mondayStart(date),7))}
  /** @param {unknown} name @returns {string} */
  function normalizeIngredientName(name){
    let n=String(name||'').trim().toLowerCase().replace(/\s+/g,' ');
    const irregular={tomatoes:'tomato',potatoes:'potato',berries:'berry',cherries:'cherry',loaves:'loaf'};
    if(irregular[n])return irregular[n];
    if(n.endsWith('ies')&&n.length>4)n=n.slice(0,-3)+'y';
    else if(n.endsWith('oes')&&n.length>4)n=n.slice(0,-2);
    else if(n.endsWith('s')&&!n.endsWith('ss')&&!n.endsWith('us')&&n.length>3)n=n.slice(0,-1);
    return n;
  }
  /** @param {unknown} name @returns {boolean} */
  function isPantryStaple(name){return GROCERY_STAPLES.has(String(name||'').trim().toLowerCase())}
  /** @param {Partial<import('./types.js').Ingredient>} item @returns {string} */
  function groceryKey(item){return `${item?.category||'Other'}::${normalizeIngredientName(item?.name)}::${item?.unit||''}`}
  /** @param {unknown} text @param {unknown} term @returns {boolean} */
  function hasTerm(text,term){
    const escaped=String(term).replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+');
    return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`,'i').test(String(text||''));
  }
  /**
   * @param {unknown} text
   * @param {Array<import('./types.js').DietPreference | string> | null | undefined} dietTags
   * @returns {import('./types.js').Conflict[]}
   */
  function householdUseUpConflicts(text,dietTags){
    const value=String(text||'').toLowerCase(),conflicts=[];
    if(!value.trim())return conflicts;
    for(const preference of dietTags||[]){
      for(const rule of DIET_CONFLICT_RULES[preference]||[]){
        const matches=rule.terms.filter(term=>hasTerm(value,term));
        if(matches.length)conflicts.push({preference,label:rule.label,matches:[...new Set(matches)]});
      }
    }
    return conflicts;
  }
  return {DAY_ORDER,GROCERY_STAPLES,DIET_CONFLICT_RULES,sortDays,ideaCountForDays,mondayStart,addDays,isoLocal,currentWeekStart,nextWeekStart,normalizeIngredientName,isPantryStaple,groceryKey,householdUseUpConflicts};
});

(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.MealzShopping=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  /** @type {import('./types.js').ShoppingCategory[]} */
  const SHOPPING_CATEGORY_ORDER=['Produce','Meat & Dairy','Pantry','Frozen','Misc'];
  /** @type {Record<string, import('./types.js').ShoppingCategory>} */
  const CATEGORY_MAP={
    'Produce':'Produce',
    'Meat & Seafood':'Meat & Dairy',
    'Dairy & Eggs':'Meat & Dairy',
    'Meat & Dairy':'Meat & Dairy',
    'Bakery':'Pantry',
    'Pantry':'Pantry',
    'Frozen':'Frozen',
    'Other':'Misc',
    'Misc':'Misc'
  };
  const PANTRY_STAPLES=new Set(['salt','table salt','kosher salt','sea salt','pepper','black pepper','ground black pepper']);
  const PREPARATION_WORDS=new Set([
    'chopped','diced','minced','sliced','grated','shredded','peeled','seeded',
    'cored','cubed','julienned','crushed','drained','rinsed','thawed','softened',
    'melted','divided','finely','roughly','thinly','coarsely','fresh','freshly'
  ]);
  const UNIT_ALIASES={
    teaspoon:'tsp',teaspoons:'tsp',tsp:'tsp',
    tablespoon:'tbsp',tablespoons:'tbsp',tbsp:'tbsp',tbsps:'tbsp',
    cup:'cup',cups:'cup',
    ounce:'oz',ounces:'oz',oz:'oz',
    pound:'lb',pounds:'lb',lb:'lb',lbs:'lb',
    clove:'clove',cloves:'clove',
    bulb:'bulb',bulbs:'bulb',head:'bulb',heads:'bulb',
    whole:'whole',each:'whole',count:'whole',piece:'whole',pieces:'whole'
  };
  /** @param {unknown} category @returns {import('./types.js').ShoppingCategory} */
  function shoppingCategory(category){return CATEGORY_MAP[String(category||'Other')]||'Misc'}
  /** @param {unknown} category @returns {number} */
  function categoryRank(category){const i=SHOPPING_CATEGORY_ORDER.indexOf(shoppingCategory(category));return i<0?SHOPPING_CATEGORY_ORDER.length:i}
  /** @param {unknown} value @returns {number | null} */
  function numericQuantity(value){const n=Number(value);return value===null||value===undefined||value===''||!Number.isFinite(n)?null:n}
  /** @param {unknown} value @returns {number} */
  function rounded(value){return Math.round(Number(value)*100)/100}
  /** @param {unknown} unit @returns {string} */
  function normalizeUnit(unit){const value=String(unit||'').trim().toLowerCase().replace(/\.$/,'');return UNIT_ALIASES[value]||value}
  /** @param {string} value @returns {string} */
  function singularizeLastWord(value){
    const parts=value.split(' '),last=parts.pop()||'';
    const irregular={tomatoes:'tomato',potatoes:'potato',berries:'berry',cherries:'cherry',loaves:'loaf',leaves:'leaf',knives:'knife'};
    let word=irregular[last]||last;
    if(!irregular[last]){
      if(word.endsWith('ies')&&word.length>4)word=word.slice(0,-3)+'y';
      else if(word.endsWith('oes')&&word.length>4)word=word.slice(0,-2);
      else if(word.endsWith('s')&&!word.endsWith('ss')&&!word.endsWith('us')&&word.length>3)word=word.slice(0,-1);
    }
    return [...parts,word].join(' ').trim();
  }
  /**
   * Convert recipe-facing ingredient wording into a shopping-facing name.
   * Recipe objects are never mutated; this result is used only for consolidation.
   * @param {unknown} name
   * @returns {string}
   */
  function cleanGroceryName(name){
    let value=String(name||'').trim().toLowerCase();
    value=value.replace(/\([^)]*\)/g,' ').replace(/,.*$/,' ').replace(/\bfor (?:serving|garnish)\b.*$/,' ');
    const words=value.replace(/[^a-z0-9'-]+/g,' ').split(/\s+/).filter(Boolean).filter(word=>!PREPARATION_WORDS.has(word));
    value=words.join(' ').replace(/^cloves? (?:of )?garlic$/,'garlic').replace(/^garlic cloves?$/,'garlic');
    return singularizeLastWord(value).replace(/\s+/g,' ').trim();
  }
  /** @param {string} name @param {string} unit @returns {string} */
  function unitFamily(name,unit){
    if(name==='garlic'&&(unit==='clove'||unit==='bulb'))return 'garlic-count';
    if(['tsp','tbsp','cup'].includes(unit))return 'volume';
    if(['oz','lb'].includes(unit))return 'weight';
    if(unit==='whole')return 'count';
    return unit||'unspecified';
  }
  /** @param {number} quantity @param {string} family @param {string} unit @returns {number} */
  function toBaseQuantity(quantity,family,unit){
    if(family==='volume')return quantity*({tsp:1,tbsp:3,cup:48}[unit]||1);
    if(family==='weight')return quantity*(unit==='lb'?16:1);
    if(family==='garlic-count')return quantity*(unit==='bulb'?10:1);
    return quantity;
  }
  /** @param {number | null} quantity @param {string} family @returns {{quantity:number | null,unit:string | null}} */
  function shopperQuantity(quantity,family){
    if(quantity===null)return {quantity:null,unit:family==='unspecified'?null:family};
    if(family==='volume'){
      if(quantity>=48)return {quantity:rounded(quantity/48),unit:'cup'};
      if(quantity>=3)return {quantity:rounded(quantity/3),unit:'tbsp'};
      return {quantity:rounded(quantity),unit:'tsp'};
    }
    if(family==='weight')return quantity>=16?{quantity:rounded(quantity/16),unit:'lb'}:{quantity:rounded(quantity),unit:'oz'};
    if(family==='garlic-count')return quantity>=10?{quantity:Math.ceil(quantity/10),unit:'bulbs'}:{quantity:rounded(quantity),unit:'cloves'};
    if(family==='count')return {quantity:rounded(quantity),unit:'whole'};
    return {quantity:rounded(quantity),unit:family==='unspecified'?null:family};
  }
  /** @param {unknown} name @returns {boolean} */
  function isPantryStaple(name){return PANTRY_STAPLES.has(cleanGroceryName(name))}
  /** @param {Partial<import('./types.js').Ingredient> & {source_key?:string}} item @returns {string} */
  function grocerySourceKey(item){
    const name=cleanGroceryName(item?.name),unit=normalizeUnit(item?.unit),family=unitFamily(name,unit);
    return item?.source_key||`${name}::${family}`;
  }
  /**
   * Consolidate ingredients across recipes without changing recipe-facing data.
   * @param {Array<{ingredients?: Array<Partial<import('./types.js').Ingredient>>}> | null | undefined} meals
   * @returns {Array<Partial<import('./types.js').GroceryItem> & {source_key:string}>}
   */
  function consolidateGroceries(meals){
    const map=new Map();
    for(const meal of meals||[])for(const ingredient of meal?.ingredients||[]){
      if(ingredient?.optional||isPantryStaple(ingredient?.name))continue;
      const name=cleanGroceryName(ingredient?.name);if(!name)continue;
      const unit=normalizeUnit(ingredient?.unit),family=unitFamily(name,unit),source_key=`${name}::${family}`;
      const rawQuantity=numericQuantity(ingredient?.quantity);
      const baseQuantity=rawQuantity===null?null:toBaseQuantity(rawQuantity,family,unit);
      const existing=map.get(source_key);
      if(existing){
        existing.baseQuantity=existing.baseQuantity===null||baseQuantity===null?null:existing.baseQuantity+baseQuantity;
        if(shoppingCategory(existing.category)==='Misc'&&shoppingCategory(ingredient?.category)!=='Misc')existing.category=ingredient.category;
      }else map.set(source_key,{name,category:ingredient?.category||'Other',family,baseQuantity,source_key});
    }
    return [...map.values()].map(item=>{
      const amount=shopperQuantity(item.baseQuantity,item.family);
      return {name:item.name,quantity:amount.quantity,unit:amount.unit,category:item.category,source_key:item.source_key};
    });
  }
  /**
   * Carry household grocery-list choices into a rebuilt plan. Generated amounts
   * refresh unless a household member edited them; manual rows and generated
   * deletion markers survive. Recipe ingredient objects remain untouched.
   * @param {Array<Partial<import('./types.js').GroceryItem> & {source?:string,source_key?:string,user_modified?:boolean,deleted?:boolean}> | null | undefined} previous
   * @param {Array<{ingredients?: Array<Partial<import('./types.js').Ingredient>>}> | null | undefined} meals
   */
  function reconcileGroceries(previous,meals){
    const generated=consolidateGroceries(meals);
    const priorGenerated=new Map();
    const carried=[],manual=[];
    for(const item of previous||[]){
      if(item?.source==='manual'){
        if(!item.deleted)manual.push({...item,source:'manual',source_key:null,user_modified:true,deleted:false});
        continue;
      }
      priorGenerated.set(grocerySourceKey(item),item);
    }
    const activeKeys=new Set(generated.map(item=>item.source_key));
    for(const item of generated){
      const prior=priorGenerated.get(item.source_key);
      if(prior?.deleted){
        carried.push({...prior,source:'generated',source_key:item.source_key,deleted:true});
      }else if(prior?.user_modified){
        carried.push({...prior,source:'generated',source_key:item.source_key,deleted:false});
      }else{
        carried.push({...item,checked:!!prior?.checked,source:'generated',user_modified:false,deleted:false});
      }
    }
    for(const [key,item] of priorGenerated){
      if(activeKeys.has(key)||!item?.user_modified||item?.deleted)continue;
      manual.push({...item,source:'manual',source_key:null,user_modified:true,deleted:false});
    }
    return [...carried,...manual].map(({id,weekly_plan_id,created_at,updated_at,...item})=>item);
  }
  return {SHOPPING_CATEGORY_ORDER,shoppingCategory,categoryRank,normalizeUnit,cleanGroceryName,grocerySourceKey,consolidateGroceries,reconcileGroceries};
});

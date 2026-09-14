(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.MealzShopping=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const SHOPPING_CATEGORY_ORDER=['Produce','Meat & Dairy','Pantry','Frozen','Misc'];
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
  function shoppingCategory(category){return CATEGORY_MAP[String(category||'Other')]||'Misc'}
  function categoryRank(category){const i=SHOPPING_CATEGORY_ORDER.indexOf(shoppingCategory(category));return i<0?SHOPPING_CATEGORY_ORDER.length:i}
  return {SHOPPING_CATEGORY_ORDER,shoppingCategory,categoryRank};
});

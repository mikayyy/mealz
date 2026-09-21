// Grocery presentation groups detailed recipe categories into a stable shopping path.
(()=>{
  const shopping=globalThis.MealzShopping;
  if(!shopping)return;
  const baseGroceryData=groceryData;
  const baseSyncGrocery=syncGrocery;

  function groupedGroceryData(){
    return baseGroceryData().map(item=>({...item,shoppingCategory:shopping.shoppingCategory(item.category)}));
  }

  groceryData=function(){return groupedGroceryData()};

  groceries=function(animateKey){
    const before={};
    if(animateKey&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      document.querySelectorAll('.grocery-item[data-key]').forEach(el=>before[el.dataset.key]=el.getBoundingClientRect().top);
    }
    if(!s.meals.length){app.innerHTML='<h1>grocery list</h1><div class="status status--info">generate a plan first.</div>';return}
    const a=groupedGroceryData();
    const cats=shopping.SHOPPING_CATEGORY_ORDER.filter(c=>a.some(i=>i.shoppingCategory===c));
    app.innerHTML=`<h1>grocery list</h1><p class=subtle>ordered for a typical Trader Joe's trip.</p>${cloudNote()}<p class=small>checked items move to the bottom of their section.</p>${cats.map(c=>{const z=a.filter(i=>i.shoppingCategory===c).sort((x,y)=>(s.checked[x.key]?1:0)-(s.checked[y.key]?1:0)||x.name.localeCompare(y.name));return `<section class=category><h3>${esc(c)}</h3>${z.map(i=>`<label class="grocery-item ${s.checked[i.key]?'checked':''}" data-key="${encodeURIComponent(i.key)}"><input type=checkbox data-k="${encodeURIComponent(i.key)}" ${s.checked[i.key]?'checked':''}><span>${esc(fmt(i))}</span></label>`).join('')}</section>`}).join('')}`;
    if(animateKey&&Object.keys(before).length)requestAnimationFrame(()=>{
      document.querySelectorAll('.grocery-item[data-key]').forEach(el=>{const old=before[el.dataset.key];if(old==null)return;const delta=old-el.getBoundingClientRect().top;if(Math.abs(delta)>1)el.animate([{transform:`translateY(${delta}px)`},{transform:'translateY(0)'}],{duration:340,easing:'cubic-bezier(.2,.8,.2,1)'})});
      const moved=document.querySelector(`.grocery-item[data-key="${CSS.escape(encodeURIComponent(animateKey))}"]`);if(moved)moved.animate([{opacity:.55},{opacity:1}],{duration:340,easing:'ease-out'});
    });
    document.querySelectorAll('.grocery-item input').forEach(b=>b.onchange=()=>{
      const k=decodeURIComponent(b.dataset.k),item=a.find(i=>i.key===k);
      s.checked[k]=b.checked;save();groceries(k);if(item)baseSyncGrocery(item,b.checked);
    });
  };
})();

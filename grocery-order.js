// @ts-nocheck -- Ordered browser globals are intentionally deferred to the client architecture phase.
// Saved grocery rows are authoritative; recipe ingredients remain recipe-facing data.
(()=>{
  const shopping=globalThis.MealzShopping;
  if(!shopping)return;
  const CATEGORIES=['Produce','Meat & Seafood','Dairy & Eggs','Frozen','Bakery','Pantry','Other'];
  let editingId=null,showAdd=false,groceryUiError='';

  function itemKey(item){return String(item.id||item.key||item.source_key||groceryKey(item))}
  function currentItems(){return groceryData().filter(item=>!item.deleted).map(item=>({...item,key:itemKey(item),shoppingCategory:shopping.shoppingCategory(item.category)}))}
  function formFields(item={}){
    const quantity=item.quantity==null?'':item.quantity;
    return `<div class=grocery-form-grid><label>item<input name=name required maxlength=120 value="${esc(item.name||'')}" placeholder="e.g. limes"></label><label>quantity<input name=quantity inputmode=decimal type=number min=0 max=100000 step=any value="${esc(quantity)}" placeholder="optional"></label><label>unit<input name=unit maxlength=40 value="${esc(item.unit||'')}" placeholder="e.g. bags"></label><label>section<select name=category>${CATEGORIES.map(category=>`<option ${category===(item.category||'Produce')?'selected':''}>${esc(category)}</option>`).join('')}</select></label></div>`;
  }
  function groceryForm({item=null}={}){
    const action=item?'save changes':'add item';
    return `<form class="grocery-form ${item?'grocery-edit-form':'grocery-add-form'}" data-id="${esc(item?.id||'')}">${formFields(item||{})}<div class=grocery-form-actions><button class=primary type=submit>${action}</button><button class=secondary type=button data-grocery-action=cancel>cancel</button></div></form>`;
  }
  function row(item){
    if(editingId&&item.id===editingId)return groceryForm({item});
    return `<div class="grocery-item ${item.checked?'checked':''}" data-key="${esc(encodeURIComponent(item.key))}"><label class=grocery-check><input type=checkbox data-grocery-action=toggle ${item.checked?'checked':''}><span>${esc(fmt(item))}</span></label><div class=grocery-row-actions><button type=button class=grocery-text-button data-grocery-action=edit aria-label="edit ${esc(item.name)}">edit</button><button type=button class=grocery-text-button data-grocery-action=delete aria-label="delete ${esc(item.name)}">delete</button></div></div>`;
  }
  function render(animateKey){
    const before={};
    if(animateKey&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches)document.querySelectorAll('.grocery-item[data-key]').forEach(el=>before[el.dataset.key]=el.getBoundingClientRect().top);
    if(!s.meals.length&&!s.planId){app.innerHTML='<h1>grocery list</h1><div class="status status--info">generate a plan first.</div>';return}
    const items=currentItems(),categories=shopping.SHOPPING_CATEGORY_ORDER.filter(category=>items.some(item=>item.shoppingCategory===category));
    app.innerHTML=`<h1>grocery list</h1><p class=subtle>combined across this week's recipes. recipe-specific wording stays in each recipe.</p>${cloudNote()}${groceryUiError?`<div class="status status--error">${esc(groceryUiError)}</div>`:''}<div class=grocery-toolbar><p class=small>checked items move to the bottom of their section.</p><button class=secondary type=button data-grocery-action=show-add>${showAdd?'close':'add item'}</button></div>${showAdd?groceryForm():''}${categories.map(category=>{const rows=items.filter(item=>item.shoppingCategory===category).sort((a,b)=>(a.checked?1:0)-(b.checked?1:0)||a.name.localeCompare(b.name));return `<section class=category><h3>${esc(category)}</h3>${rows.map(row).join('')}</section>`}).join('')}${items.length?'':'<div class="status status--info">this list is empty. add an item whenever you need one.</div>'}`;
    wire();
    if(typeof addWeekContext==='function')addWeekContext();
    if(animateKey&&Object.keys(before).length)requestAnimationFrame(()=>{
      document.querySelectorAll('.grocery-item[data-key]').forEach(el=>{const old=before[el.dataset.key];if(old==null)return;const delta=old-el.getBoundingClientRect().top;if(Math.abs(delta)>1)el.animate([{transform:`translateY(${delta}px)`},{transform:'translateY(0)'}],{duration:340,easing:'cubic-bezier(.2,.8,.2,1)'})});
    });
  }
  function localizeDerivedItems(){
    if(s.planId||s.groceryItems?.length)return;
    s.groceryItems=currentItems().map((item,index)=>({...item,id:`local-generated-${index}`,checked:!!item.checked,source:'generated',user_modified:false,deleted:false}));
  }
  function formPayload(form){
    const data=new FormData(form),raw=data.get('quantity');
    return {name:String(data.get('name')||'').trim(),quantity:raw===''?null:Number(raw),unit:String(data.get('unit')||'').trim()||null,category:String(data.get('category')||'Other')};
  }
  async function mutate(method,payload){return apiJson('/api/plan',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify({planId:s.planId,...payload})})}
  async function toggle(item,checked){
    if((DEV||!s.planId)&&!item.id){const key=item.key;localizeDerivedItems();item=currentItems().find(row=>row.source_key===key||row.key===key)||item}
    const index=(s.groceryItems||[]).findIndex(row=>row.id===item.id);
    if(index>=0)s.groceryItems[index].checked=checked;
    item.checked=checked;s.checked[item.key]=checked;save();render(item.key);
    if(DEV||!s.planId||!item.id)return;
    try{const result=await mutate('PATCH',{action:'toggle',itemId:item.id,checked});if(index>=0&&result.item)s.groceryItems[index]=result.item;s.syncError=null;save()}
    catch(error){if(index>=0)s.groceryItems[index].checked=!checked;item.checked=!checked;s.checked[item.key]=!checked;s.syncError=error.message;save();render()}
  }
  async function submit(form){
    const values=formPayload(form),id=form.dataset.id;
    groceryUiError='';
    try{
      if(DEV||!s.planId){
        localizeDerivedItems();
        if(id){const index=s.groceryItems.findIndex(item=>item.id===id);if(index>=0)s.groceryItems[index]={...s.groceryItems[index],...values,user_modified:true}}
        else s.groceryItems.push({...values,id:`local-manual-${Date.now()}`,checked:false,source:'manual',source_key:null,user_modified:true,deleted:false});
      }else if(id){
        const result=await mutate('PATCH',{itemId:id,...values});const index=s.groceryItems.findIndex(item=>item.id===id);if(index>=0)s.groceryItems[index]=result.item;
      }else{
        const result=await mutate('PUT',values);s.groceryItems.push(result.item);
      }
      editingId=null;showAdd=false;s.syncError=null;save();render();
    }catch(error){groceryUiError=friendlyClientError(error.message);render()}
  }
  async function remove(item){
    groceryUiError='';
    if((DEV||!s.planId)&&!item.id){const key=item.key;localizeDerivedItems();item=currentItems().find(row=>row.source_key===key||row.key===key)||item}
    if(!confirm(`Delete ${item.name} from this grocery list?`))return;
    try{
      if(!DEV&&s.planId&&item.id)await mutate('DELETE',{itemId:item.id});
      s.groceryItems=(s.groceryItems||[]).filter(row=>row.id!==item.id);delete s.checked[item.key];s.syncError=null;save();render();
    }catch(error){groceryUiError=friendlyClientError(error.message);render()}
  }
  function wire(){
    app.querySelectorAll('[data-grocery-action]').forEach(control=>{
      const action=control.dataset.groceryAction;
      if(action==='show-add')control.onclick=()=>{showAdd=!showAdd;editingId=null;groceryUiError='';render()};
      if(action==='cancel')control.onclick=()=>{showAdd=false;editingId=null;groceryUiError='';render()};
      if(['toggle','edit','delete'].includes(action)){
        const container=control.closest('[data-key]'),key=container?decodeURIComponent(container.dataset.key):'',item=currentItems().find(row=>row.key===key);if(!item)return;
        if(action==='toggle')control.onchange=()=>toggle(item,control.checked);
        if(action==='edit')control.onclick=()=>{if((DEV||!s.planId)&&!item.id){const key=item.key;localizeDerivedItems();item=currentItems().find(row=>row.source_key===key||row.key===key)||item}editingId=item.id;showAdd=false;groceryUiError='';render()};
        if(action==='delete')control.onclick=()=>remove(item);
      }
    });
    app.querySelectorAll('.grocery-form').forEach(form=>form.onsubmit=event=>{event.preventDefault();submit(form)});
  }

  const baseGroceryData=groceryData;
  groceryData=function(){return baseGroceryData()};
  groceries=render;
})();

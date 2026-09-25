// @ts-nocheck -- Ordered browser globals are intentionally deferred to the client architecture phase.
// Saved grocery rows are authoritative; recipe ingredients remain recipe-facing data.
(()=>{
  const shopping=globalThis.MealzShopping;
  if(!shopping)return;
  const CATEGORIES=['Produce','Meat & Seafood','Dairy & Eggs','Frozen','Bakery','Pantry','Other'];
  let editingId=null,showAdd=false,groceryUiError='',disclosureWeek=null,disclosureOpen=null;
  const pending=new Set();

  function itemKey(item){return String(item.id||item.key||item.source_key||groceryKey(item))}
  function currentItems(){return groceryData().filter(item=>!item.deleted).map(item=>({...item,key:itemKey(item),shoppingCategory:shopping.shoppingCategory(item.category),sundry:shopping.isSundry(item.name)}))}
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
    const busy=pending.has(item.key),needed=!!item.needed_this_week;
    const checkbox=`<label class=grocery-check><input type=checkbox data-grocery-action=toggle aria-label="purchased ${esc(item.name)}" ${item.checked?'checked':''} ${busy?'disabled':''}><span>${esc(fmt(item))}</span></label>`;
    const content=item.sundry?`<div class=grocery-sundry-main>${needed?`<input type=checkbox data-grocery-action=toggle aria-label="purchased ${esc(item.name)}" ${item.checked?'checked':''} ${busy?'disabled':''}>`:''}<button type=button class=grocery-need-button data-grocery-action=set-needed aria-pressed="${needed}" aria-label="${esc(fmt(item))}: ${needed?'buy':'available at home'}; toggle buy" ${busy?'disabled':''}><span class=grocery-name>${esc(fmt(item))}</span><span class="grocery-intent ${needed?'grocery-intent--buy':''}">${needed?'buy':'available at home'}</span></button></div>`:checkbox;
    return `<div class="grocery-item ${item.checked&&(!item.sundry||needed)?'checked':''} ${item.sundry?`grocery-sundry ${needed?'grocery-sundry--needed':'grocery-sundry--available'}`:''}" data-key="${esc(encodeURIComponent(item.key))}">${content}<div class=grocery-row-actions><button type=button class=grocery-text-button data-grocery-action=edit aria-label="edit ${esc(item.name)}" ${busy?'disabled':''}>edit</button><button type=button class=grocery-text-button data-grocery-action=delete aria-label="delete ${esc(item.name)}" ${busy?'disabled':''}>delete</button></div></div>`;
  }
  function render(animateKey){
    const before={};
    if(animateKey&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches)document.querySelectorAll('.grocery-item[data-key]').forEach(el=>before[el.dataset.key]=el.getBoundingClientRect().top);
    if(!s.meals.length&&!s.planId){app.innerHTML='<h1>grocery list</h1><div class="status status--info">generate a plan first.</div>';return}
    const items=currentItems(),sundries=items.filter(item=>item.sundry),ordinary=items.filter(item=>!item.sundry);
    const toBuy=sundries.filter(item=>item.needed_this_week&&!item.checked).length;
    const week=s.viewWeekStart||s.planId||'local';
    if(disclosureWeek!==week){disclosureWeek=week;disclosureOpen=null}
    const open=disclosureOpen??sundries.some(item=>item.needed_this_week);
    const categories=shopping.SHOPPING_CATEGORY_ORDER.filter(category=>ordinary.some(item=>item.shoppingCategory===category));
    app.innerHTML=`<h1>grocery list</h1><p class=subtle>combined across this week's recipes. recipe-specific wording stays in each recipe.</p>${cloudNote()}${groceryUiError?`<div class="status status--error">${esc(groceryUiError)}</div>`:''}<div class=grocery-toolbar><p class=small>checked items move to the bottom of their section.</p><button class=secondary type=button data-grocery-action=show-add>${showAdd?'close':'add item'}</button></div>${showAdd?groceryForm():''}${sundries.length?`<details class="category grocery-sundries" ${open?'open':''}><summary>sundries <span class=grocery-summary-count>${sundries.length} used this week · ${toBuy} to buy</span></summary><p class="small grocery-sundries-note">available at home is an assumption, not tracked inventory. select an item to mark it for purchase.</p>${sundries.sort((a,b)=>(a.checked&&a.needed_this_week?1:0)-(b.checked&&b.needed_this_week?1:0)||a.name.localeCompare(b.name)).map(row).join('')}</details>`:''}${categories.map(category=>{const rows=ordinary.filter(item=>item.shoppingCategory===category).sort((a,b)=>(a.checked?1:0)-(b.checked?1:0)||a.name.localeCompare(b.name));return `<section class=category><h3>${esc(category)}</h3>${rows.map(row).join('')}</section>`}).join('')}${items.length?'':'<div class="status status--info">this list is empty. add an item whenever you need one.</div>'}`;
    const disclosure=app.querySelector('.grocery-sundries');if(disclosure)disclosure.ontoggle=()=>{disclosureOpen=disclosure.open};
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
    if(pending.has(item.key))return;
    if((DEV||!s.planId)&&!item.id){const key=item.key;localizeDerivedItems();item=currentItems().find(row=>row.source_key===key||row.key===key)||item}
    pending.add(item.key);
    const index=(s.groceryItems||[]).findIndex(row=>row.id===item.id);
    const before=index>=0?!!s.groceryItems[index].checked:!!item.checked,planId=s.planId;
    if(index>=0)s.groceryItems[index].checked=checked;
    item.checked=checked;s.checked[item.key]=checked;save();render(item.key);
    try{
      if(!DEV&&s.planId&&item.id){const result=await mutate('PATCH',{action:'toggle',itemId:item.id,checked});if(s.planId===planId&&index>=0&&result.item)s.groceryItems[index]=result.item}
      if(s.planId===planId)s.syncError=null;
    }catch(error){if(s.planId===planId){if(index>=0)s.groceryItems[index].checked=before;s.checked[item.key]=before;s.syncError=friendlyClientError(error.message)}}
    finally{pending.delete(item.key);if(s.planId===planId){save();if(app.querySelector('.grocery-toolbar'))render()}}
  }
  async function setNeeded(item,needed){
    if(pending.has(item.key))return;
    if((DEV||!s.planId)&&!item.id){const key=item.key;localizeDerivedItems();item=currentItems().find(row=>row.source_key===key||row.key===key)||item}
    pending.add(item.key);
    const index=(s.groceryItems||[]).findIndex(row=>row.id===item.id),planId=s.planId;
    const before=index>=0?{...s.groceryItems[index]}:{...item};
    if(index>=0){s.groceryItems[index].needed_this_week=needed;if(!needed)s.groceryItems[index].checked=false}
    if(!needed)s.checked[item.key]=false;
    save();render();
    try{
      if(!DEV&&s.planId&&item.id){const result=await mutate('PATCH',{action:'set_needed',itemId:item.id,needed});if(s.planId===planId&&index>=0&&result.item)s.groceryItems[index]=result.item}
      if(s.planId===planId)s.syncError=null;
    }catch(error){if(s.planId===planId){if(index>=0)s.groceryItems[index]=before;s.checked[item.key]=!!before.checked;s.syncError=friendlyClientError(error.message)}}
    finally{pending.delete(item.key);if(s.planId===planId){save();if(app.querySelector('.grocery-toolbar'))render()}}
  }
  async function submit(form){
    const values=formPayload(form),id=form.dataset.id;
    groceryUiError='';
    try{
      if(DEV||!s.planId){
        localizeDerivedItems();
        if(id){const index=s.groceryItems.findIndex(item=>item.id===id);if(index>=0)s.groceryItems[index]={...s.groceryItems[index],...values,user_modified:true}}
        else s.groceryItems.push({...values,id:`local-manual-${Date.now()}`,checked:false,needed_this_week:shopping.isSundry(values.name),source:'manual',source_key:null,user_modified:true,deleted:false});
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
      if(['toggle','set-needed','edit','delete'].includes(action)){
        const container=control.closest('[data-key]'),key=container?decodeURIComponent(container.dataset.key):'',item=currentItems().find(row=>row.key===key);if(!item)return;
        if(action==='toggle')control.onchange=()=>toggle(item,control.checked);
        if(action==='set-needed')control.onclick=()=>setNeeded(item,!item.needed_this_week);
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

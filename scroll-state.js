// Mealz navigation polish: every new screen starts at the top.
// We only reset scroll when the rendered screen heading changes, so interactions
// that re-render the current screen (like checking groceries) keep their place.
(()=>{
  const appRoot=document.querySelector('#app');
  if(!appRoot)return;
  let lastHeading='';
  const currentHeading=()=>appRoot.querySelector('h1')?.textContent?.trim()||'';
  const resetIfScreenChanged=()=>{
    const heading=currentHeading();
    if(!heading||heading===lastHeading)return;
    const hadScreen=!!lastHeading;
    lastHeading=heading;
    if(hadScreen)requestAnimationFrame(()=>window.scrollTo({top:0,left:0,behavior:'auto'}));
  };
  resetIfScreenChanged();
  new MutationObserver(resetIfScreenChanged).observe(appRoot,{childList:true,subtree:true});
})();

// Mealz v0.10.1: keep weekly draft text while navigating within the app.
// These fields remain intentionally session-only and reset on a full app reopen.
document.addEventListener('focusout',event=>{
  if(event.target?.id==='useUp')weeklyDraft.useUp=event.target.value;
  if(event.target?.id==='notes')weeklyDraft.notes=event.target.value;
});

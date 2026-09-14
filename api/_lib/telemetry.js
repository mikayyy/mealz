export function startTelemetry(endpoint,meta={}){
  const started=Date.now();
  const base={app:'mealz',endpoint,...meta};
  return {
    event(name,data={}){console.log(JSON.stringify({...base,event:name,...data}))},
    finish(status,data={}){console.log(JSON.stringify({...base,event:'complete',status,duration_ms:Date.now()-started,...data}))},
    fail(error,data={}){console.error(JSON.stringify({...base,event:'error',duration_ms:Date.now()-started,error:String(error?.message||error||'unknown'),...data}))}
  };
}

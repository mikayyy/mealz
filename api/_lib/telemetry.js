/**
 * @param {string} endpoint
 * @param {TelemetryData} [meta]
 * @returns {Telemetry}
 */
export function startTelemetry(endpoint,meta={}){
  const started=Date.now();
  const base={app:'mealz',endpoint,...meta};
  return {
    /** @param {string} name @param {TelemetryData} [data] */
    event(name,data={}){console.log(JSON.stringify({...base,event:name,...data}))},
    /** @param {number} status @param {TelemetryData} [data] */
    finish(status,data={}){console.log(JSON.stringify({...base,event:'complete',status,duration_ms:Date.now()-started,...data}))},
    /** @param {any} error @param {TelemetryData} [data] */
    fail(error,data={}){console.error(JSON.stringify({...base,event:'error',duration_ms:Date.now()-started,error:String(error?.message||error||'unknown'),...data}))}
  };
}

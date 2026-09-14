export function outputText(response){if(response?.output_text)return response.output_text;return (response?.output||[]).flatMap(x=>x.content||[]).map(c=>c.text||'').join('\n')}
export function parseLooseJson(text){const s=String(text||'').trim().replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/\s*```$/,'');try{return JSON.parse(s)}catch{const a=s.indexOf('{'),b=s.lastIndexOf('}');if(a>=0&&b>a)return JSON.parse(s.slice(a,b+1));throw new Error('invalid-json')}}
export async function callOpenAIJson({prompt,timeoutMs=45000,model=process.env.OPENAI_MODEL||'gpt-5.6-luna',telemetry}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  const started=Date.now();
  try{
    const response=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',signal:controller.signal,
      headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({model,input:prompt,store:false})
    });
    const raw=await response.json().catch(()=>null);
    telemetry?.event('openai_response',{model,status:response.status,duration_ms:Date.now()-started,input_tokens:raw?.usage?.input_tokens||null,output_tokens:raw?.usage?.output_tokens||null,total_tokens:raw?.usage?.total_tokens||null});
    if(!response.ok)throw new Error(raw?.error?.message||`OpenAI request failed (${response.status}).`);
    return parseLooseJson(outputText(raw||{}));
  }catch(error){
    if(error?.name==='AbortError')throw new Error('openai-timeout');
    throw error;
  }finally{clearTimeout(timer)}
}

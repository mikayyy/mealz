import type { JsonSchema, Telemetry } from '../../types.js';

export function outputText(response: any){
  if(response?.output_text)return response.output_text;
  return (response?.output||[]).flatMap((x: any)=>x.content||[]).map((c: any)=>c.text||'').join('\n');
}

export function parseLooseJson(text: string){
  const s=String(text||'').trim().replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/\s*```$/,'');
  try{return JSON.parse(s)}catch{
    const a=s.indexOf('{'),b=s.lastIndexOf('}');
    if(a>=0&&b>a)return JSON.parse(s.slice(a,b+1));
    throw new Error('invalid-json');
  }
}

interface CallOpenAIOptions {
  prompt: string;
  schema?: JsonSchema;
  schemaName?: string;
  schemaDescription?: string;
  timeoutMs?: number;
  model?: string;
  reasoningEffort?: string;
  maxOutputTokens?: number;
  telemetry?: Telemetry;
}

export async function callOpenAIJson({
  prompt,
  schema,
  schemaName='mealz_response',
  schemaDescription,
  timeoutMs=45000,
  model=process.env.OPENAI_MODEL||'gpt-5.6-luna',
  reasoningEffort='low',
  maxOutputTokens=4000,
  telemetry
}: CallOpenAIOptions){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  const started=Date.now();
  try{
    const body: Record<string, any>={
      model,
      input:prompt,
      store:false,
      max_output_tokens:maxOutputTokens,
      reasoning:{effort:reasoningEffort}
    };
    if(schema){
      body.text={format:{type:'json_schema',name:schemaName,strict:true,schema,...(schemaDescription?{description:schemaDescription}:{})}};
    }
    const response=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',signal:controller.signal,
      headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    const raw=await response.json().catch(()=>null);

    telemetry?.event('openai_response',{
      model,
      status:response.status,
      response_status:raw?.status||null,
      incomplete_reason:raw?.incomplete_details?.reason||null,
      duration_ms:Date.now()-started,
      input_tokens:raw?.usage?.input_tokens||null,
      output_tokens:raw?.usage?.output_tokens||null,
      reasoning_tokens:raw?.usage?.output_tokens_details?.reasoning_tokens||null,
      total_tokens:raw?.usage?.total_tokens||null,
      structured:!!schema,
      reasoning_effort:reasoningEffort,
      max_output_tokens:maxOutputTokens
    });
    if(!response.ok)throw new Error(raw?.error?.message||`OpenAI request failed (${response.status}).`);
    if(raw?.status==='incomplete')throw new Error(raw?.incomplete_details?.reason==='max_output_tokens'?'openai-output-limit':'openai-incomplete');
    const text=outputText(raw||{});
    if(!text)throw new Error('openai-empty-response');
    try{return JSON.parse(text)}catch(error){
      if(schema)throw new Error('structured-output-invalid');
      return parseLooseJson(text);
    }
  }catch(error){
    if(error?.name==='AbortError')throw new Error('openai-timeout');
    throw error;
  }finally{clearTimeout(timer)}
}

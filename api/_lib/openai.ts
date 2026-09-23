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
      reasoning:{effort:reasoningEffort},
      stream:true
    };
    if(schema){
      body.text={format:{type:'json_schema',name:schemaName,strict:true,schema,...(schemaDescription?{description:schemaDescription}:{})}};
    }
    const response=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',signal:controller.signal,
      headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    
    if(!response.ok){
      const raw=await response.json().catch(()=>null);
      throw new Error(raw?.error?.message||`OpenAI request failed (${response.status}).`);
    }

    let raw: any = {};
    let text = '';

    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, {stream: true});
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (let line of lines) {
          line = line.trim();
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const chunk = JSON.parse(line.slice(6));
              raw = { ...raw, ...chunk };
              if (chunk.usage) raw.usage = chunk.usage;
              if (chunk.status) raw.status = chunk.status;
              
              const chunkText = outputText(chunk);
              if (chunkText) text += chunkText;
            } catch (e) {}
          }
        }
      }
    }

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
    if(raw?.status==='incomplete')throw new Error(raw?.incomplete_details?.reason==='max_output_tokens'?'openai-output-limit':'openai-incomplete');
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

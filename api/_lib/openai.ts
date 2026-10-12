import type { JsonSchema, Telemetry } from '../../types.js';
import {abortable,requestTimeout,RequestBudget,RESPONSE_RESERVE_MS} from './deadline.js';

export class OpenAIError extends Error{
  constructor(readonly code: string,readonly retryable=false,readonly retryAfterMs=0,readonly status=0){super(code);this.name='OpenAIError'}
}
export function retryAfterMs(value: string|null){
  if(!value)return 0;
  const seconds=Number(value);
  if(Number.isFinite(seconds)&&seconds>=0)return seconds*1000;
  const date=Date.parse(value);return Number.isFinite(date)?Math.max(0,date-Date.now()):0;
}

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
  signal?: AbortSignal;
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
  telemetry,
  signal
}: CallOpenAIOptions){
  const timeout=requestTimeout(timeoutMs,signal);
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
    timeout.signal.throwIfAborted();
    const response=await abortable(fetch('https://api.openai.com/v1/responses',{
      method:'POST',signal:timeout.signal,
      headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify(body)
    }),timeout.signal).catch(error=>{
      // Only transport TypeErrors indicate a connection failure. Parser/type
      // errors in a completed response must not trigger another paid request.
      if(!timeout.signal.aborted&&error instanceof TypeError)throw new OpenAIError('openai-network-error',true);
      throw error;
    });
    const raw=await abortable(response.json().catch(()=>null),timeout.signal);

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
    if(!response.ok){
      const code=raw?.error?.code,type=raw?.error?.type;
      const quota=['insufficient_quota','organization_usage_limit_exceeded','billing_hard_limit_reached'].includes(code)||type==='insufficient_quota';
      const rate=response.status===429&&!quota&&(type==='rate_limit_error'||['rate_limit_exceeded','slow_down'].includes(code));
      throw new OpenAIError('openai-http-error',!quota&&(rate||[408,500,502,503,504].includes(response.status)),retryAfterMs(response.headers.get('retry-after')),response.status);
    }
    if(raw?.status==='incomplete')throw new OpenAIError(raw?.incomplete_details?.reason==='max_output_tokens'?'openai-output-limit':'openai-incomplete');
    const text=outputText(raw||{});
    if(!text)throw new OpenAIError('openai-empty-response');
    try{return JSON.parse(text)}catch(error){
      if(schema)throw new OpenAIError('structured-output-invalid');
      return parseLooseJson(text);
    }
  }catch(error){
    if(signal?.aborted)throw signal.reason;
    if(error?.name==='AbortError')throw new OpenAIError('openai-timeout',true);
    throw error;
  }finally{timeout.dispose()}
}

// At most two attempts per logical generation. A 35-second first attempt
// leaves room for a useful retry inside the shared 50-second request budget.
export async function callOpenAIWithRetry(options: CallOpenAIOptions,budget: RequestBudget){
  for(let attempt=1;attempt<=2;attempt++){
    budget.check();
    const timeoutMs=Math.min(35_000,budget.remaining()-RESPONSE_RESERVE_MS);
    if(timeoutMs<=0){await budget.wait(budget.remaining());budget.check()}
    try{
      return await budget.run(()=>callOpenAIJson({...options,timeoutMs,signal:budget.signal}));
    }catch(error){
      if(!(error instanceof OpenAIError)||!error.retryable||attempt===2)throw error;
      const delay=Math.max(500,error.retryAfterMs);
      if(budget.remaining()<delay+8_000+RESPONSE_RESERVE_MS){
        options.telemetry?.event('generation_retry_skipped',{reason:'insufficient_budget',remaining_ms:budget.remaining(),upstream_status:error.status});throw error;
      }
      options.telemetry?.event('generation_retry',{attempt:attempt+1,delay_ms:delay,remaining_ms:budget.remaining(),upstream_status:error.status,reason:error.code});
      await budget.wait(delay);
    }
  }
}

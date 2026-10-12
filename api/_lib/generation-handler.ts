import {randomUUID} from 'node:crypto';
import {RequestBudget,DeadlineError,CancellationError} from './deadline.js';
import {respondAuthError} from './auth.js';
import {startTelemetry} from './telemetry.js';
import {GenerationInputError} from './generation-validation.js';

// The callback returns data instead of sending a response. Only this wrapper
// responds, so an expired or disconnected request cannot later send success.
export function generationHandler(endpoint: string,work: (req: any,budget: RequestBudget,telemetry: import('../../types.js').Telemetry)=>Promise<any>,options: {timeoutMs?: number}={}){
  return async(req,res)=>{
    const budget=new RequestBudget(options.timeoutMs),requestId=randomUUID();
    const telemetry=startTelemetry(endpoint,{request_id:requestId});
    const disconnect=()=>budget.cancel();
    const closed=()=>{if(!res.writableEnded)disconnect()};
    req.once?.('aborted',disconnect);res.once?.('close',closed);
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Request-Id',requestId);
    try{
      if(req.method!=='POST'){telemetry.finish(405);return res.status(405).json({error:'Method not allowed'})}
      if(!process.env.OPENAI_API_KEY){telemetry.finish(503,{reason:'ai_not_configured'});return res.status(503).json({error:'Mealz AI is not configured.'})}
      if(req.aborted)budget.cancel();
      const data=await budget.run(()=>work(req,budget,telemetry));
      budget.check();telemetry.finish(200,{remaining_ms:budget.remaining()});return res.status(200).json(data);
    }catch(error){
      if(error instanceof CancellationError){telemetry.finish(499,{reason:'client_disconnected'});return}
      if(error instanceof DeadlineError){
        telemetry.finish(504,{reason:'generation_deadline'});
        return res.status(504).json({error:'Generation took too long. Your saved week is unchanged and your selections are still here. Please try again.',code:'GENERATION_TIMEOUT',retryable:true});
      }
      if(respondAuthError(res,error)){telemetry.finish(error.status||401,{reason:'auth_or_limiter'});return}
      if(error instanceof GenerationInputError){telemetry.finish(400,{reason:'invalid_input'});return res.status(400).json({error:error.message,code:'INVALID_GENERATION'})}
      // Provider messages may contain submitted content. Log only fixed codes.
      telemetry.finish(502,{reason:typeof error?.code==='string'?error.code:'generation_failed'});
      return res.status(502).json({error:'Mealz could not complete generation. Your saved week is unchanged. Please try again.',code:'GENERATION_FAILED',retryable:!!error?.retryable});
    }finally{
      budget.cancel();budget.dispose();req.removeListener?.('aborted',disconnect);res.removeListener?.('close',closed);
    }
  };
}

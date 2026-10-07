// One request clock is shared across authentication, database work and AI calls.
// Promise racing bounds the response even if a transport ignores cancellation;
// the AbortSignal also asks real fetches and retry delays to stop their work.
export const GENERATION_BUDGET_MS=50_000;
export const RESPONSE_RESERVE_MS=1_000;
export class DeadlineError extends Error{
  constructor(){super('generation-deadline');this.name='DeadlineError'}
}
export class CancellationError extends Error{
  constructor(){super('generation-cancelled');this.name='CancellationError'}
}

export function abortable<T>(work: Promise<T>,signal: AbortSignal): Promise<T>{
  if(signal.aborted)return Promise.reject(signal.reason);
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(signal.reason);
    signal.addEventListener('abort',abort,{once:true});
    work.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  });
}

export function requestTimeout(timeoutMs: number,parent?: AbortSignal){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(new DOMException('Request timed out','AbortError')),timeoutMs);
  const signal=parent?AbortSignal.any([parent,controller.signal]):controller.signal;
  return {signal,dispose(){clearTimeout(timer)}};
}

export class RequestBudget{
  readonly controller=new AbortController();
  readonly started=Date.now();
  readonly expires: number;
  readonly timer: ReturnType<typeof setTimeout>;
  get signal(){return this.controller.signal}
  constructor(readonly timeoutMs=GENERATION_BUDGET_MS){
    this.expires=this.started+timeoutMs;
    this.timer=setTimeout(()=>this.controller.abort(new DeadlineError()),timeoutMs);
  }
  remaining(){return Math.max(0,this.expires-Date.now())}
  check(){
    if(!this.remaining()&&!this.signal.aborted)this.controller.abort(new DeadlineError());
    this.signal.throwIfAborted();
  }
  async run<T>(work: ()=>Promise<T>): Promise<T>{
    this.check();const result=await abortable(Promise.resolve().then(()=>{this.check();return work()}),this.signal);this.check();return result;
  }
  async stage<T>(name: string,telemetry: import('../../types.js').Telemetry,work: ()=>Promise<T>): Promise<T>{
    const started=Date.now();
    try{return await this.run(work)}
    finally{telemetry.event('generation_stage',{stage:name,duration_ms:Date.now()-started,remaining_ms:this.remaining()})}
  }
  async wait(ms: number){
    this.check();let timer: ReturnType<typeof setTimeout>;
    try{await abortable(new Promise<void>(resolve=>{timer=setTimeout(resolve,ms)}),this.signal);this.check()}
    finally{clearTimeout(timer!)}
  }
  cancel(){if(!this.signal.aborted)this.controller.abort(new CancellationError())}
  dispose(){clearTimeout(this.timer)}
}

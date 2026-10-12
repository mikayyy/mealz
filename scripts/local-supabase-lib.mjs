import {readFileSync} from 'node:fs';

// Local keys are deliberately kept outside source control and never logged.
export function localEnvironment() {
  const status=JSON.parse(readFileSync(new URL('../.local/supabase-status.json',import.meta.url),'utf8'));
  return validateLocalSettings(status);
}
export function validateLocalSettings(status) {
  const url=new URL(status.API_URL);
  if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname)||url.port!=='54321'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Only the local Supabase API on port 54321 is allowed.');
  const publicKey=status.PUBLISHABLE_KEY||status.ANON_KEY;
  const secretKey=status.SECRET_KEY||status.SERVICE_ROLE_KEY;
  if(!publicKey||!secretKey)throw new Error('Local Supabase credentials are incomplete.');
  return {url:url.origin,publicKey,secretKey};
}
export function configureLocalEnvironment() {
  const local=localEnvironment();
  process.env.SUPABASE_URL=local.url;
  process.env.SUPABASE_PUBLISHABLE_KEY=local.publicKey;
  process.env.SUPABASE_SECRET_KEY=local.secretKey;
  delete process.env.SUPABASE_ANON_KEY;
  // AI calls are intentionally disabled in this unpaid acceptance environment.
  delete process.env.OPENAI_API_KEY;
  return local;
}

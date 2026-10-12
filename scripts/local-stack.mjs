import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const action=process.argv[2];
if(!['start','stop'].includes(action))throw new Error('Choose start or stop.');
mkdirSync(new URL('../.local/',import.meta.url),{recursive:true});
function cli(args,label) {
  // Shell use is required for the Windows npx shim. Every argument below is
  // fixed by this script, never interpolated from user input or credentials.
  const result=spawnSync('npx',['--yes','supabase@2.120.0',...args],{cwd:root,shell:process.platform==='win32',encoding:'utf8',maxBuffer:8*1024*1024});
  writeFileSync(new URL(`../.local/${label}.log`,import.meta.url),(result.stdout||'')+(result.stderr||''));
  if(result.status!==0)throw new Error(`Local ${label} failed. See the ignored .local/${label}.log file.`);
  return result.stdout;
}
if(action==='stop') {
  const config=readFileSync(new URL('../supabase/config.toml',import.meta.url),'utf8');
  if(!/^project_id = "mealz-local"$/m.test(config))throw new Error('Refusing to stop an unexpected project.');
  cli(['stop'],'stop');console.log('Mealz local Supabase stopped; its data is retained.');
} else {
  if(!existsSync(new URL('../supabase/config.toml',import.meta.url))) {
    cli(['init'],'init');cli(['migration','new','local_prototype_baseline'],'migration-new');
  }
  await import('./local-supabase-init.mjs');
  console.log('Starting local Supabase; the first run downloads container images.');
  cli(['start','--exclude','vector,logflare'],'start');
  const status=JSON.parse(cli(['status','-o','json'],'status'));
  writeFileSync(new URL('../.local/supabase-status.json',import.meta.url),JSON.stringify(status));
  await import('./local-supabase-apply.mjs');
  const response=await fetch('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0');
  if(!response.ok)throw new Error('Pinned browser SDK download failed.');
  writeFileSync(new URL('../.local/supabase-sdk.js',import.meta.url),Buffer.from(await response.arrayBuffer()));
  console.log('Local services ready. Run pnpm local:verify, or pnpm local:app to open the app.');
}

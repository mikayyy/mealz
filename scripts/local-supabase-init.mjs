import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {BOOTSTRAP_SQL} from '../migrations/pglite-fixture.js';

const directory=new URL('../supabase/migrations/',import.meta.url);
const file=readdirSync(directory).find(name=>name.endsWith('_local_prototype_baseline.sql'));
if(!file)throw new Error('Generate the local baseline with Supabase migration new first.');
// The actual Supabase stack provides Auth and database roles. Never replace them
// with the lightweight definitions used only by the isolated SQL unit fixture.
writeFileSync(new URL(file,directory),'-- Local prototype baseline; do not apply this file to production.\n'+BOOTSTRAP_SQL.slice(BOOTSTRAP_SQL.indexOf('    create table if not exists public.weekly_plans')).trimEnd()+'\n');
const config=new URL('../supabase/config.toml',import.meta.url);
let content=readFileSync(config,'utf8');
content=content.replace(/^project_id = .+$/m,'project_id = "mealz-local"');
content=content.replace(/^additional_redirect_urls = .+$/m,'additional_redirect_urls = ["http://127.0.0.1:3000/?reset=1"]');
// Enable email confirmation only; leave disabled SMS service configuration alone.
content=content.replace(/(\[auth\.email\][\s\S]*?)enable_confirmations = false/,'$1enable_confirmations = true');
content=content.replace(/(\[analytics\]\s*\r?\nenabled = )true/,'$1false');
content=content.replace(/^openai_api_key = .+$/m,'openai_api_key = ""');
writeFileSync(config,content);
console.log('Local Supabase baseline and test redirects prepared.');

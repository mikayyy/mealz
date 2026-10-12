import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {MIGRATIONS} from '../migrations/manifest.js';
import {localEnvironment} from './local-supabase-lib.mjs';

localEnvironment(); // Reject nonlocal credentials before touching any database.
const name='supabase_db_mealz-local';
const container=JSON.parse(execFileSync('docker',['inspect',name],{encoding:'utf8'}))[0];
if(container.Name!==`/${name}`||!container.State.Running)throw new Error('Expected local Mealz database container is not running.');
const query=sql=>execFileSync('docker',['exec','-i',name,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe']});
query('create schema if not exists mealz_local_setup; revoke all on schema mealz_local_setup from public,anon,authenticated,service_role; create table if not exists mealz_local_setup.migrations(filename text primary key,hash text not null);');
const applied=new Map(query("select filename||':'||hash from mealz_local_setup.migrations").trim().split('\n').filter(Boolean).map(row=>row.trim().split(':')));
for(const migration of MIGRATIONS) {
  const sql=readFileSync(new URL('../migrations/'+migration,import.meta.url),'utf8').replaceAll('\r\n','\n');
  const hash=createHash('sha256').update(sql).digest('hex');
  if(applied.has(migration)) {
    if(applied.get(migration)!==hash)throw new Error(`Previously applied local migration changed: ${migration}. Review before resetting the synthetic database.`);
    console.log(`Already applied locally: ${migration}`);continue;
  }
  const record=`insert into mealz_local_setup.migrations(filename,hash) values('${migration.replaceAll("'","''")}','${hash}');`;
  // Record success in the same transaction. Historical prototype migrations
  // cannot all be replayed after later migrations replace their constraints.
  const wrapped=/^\s*begin\s*;/i.test(sql)?sql.replace(/commit;\s*$/i,record+'\ncommit;'):'begin;\n'+sql+'\n'+record+'\ncommit;';
  query(wrapped);
  console.log(`Applied locally: ${migration}`);
}
execFileSync('docker',['exec','-i',name,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input:"NOTIFY pgrst, 'reload schema';",stdio:['pipe','ignore','pipe']});
console.log('Local schema ready; production was not contacted.');

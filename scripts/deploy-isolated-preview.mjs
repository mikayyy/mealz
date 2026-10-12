import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,unlinkSync,existsSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

// Deploy only a tracked release snapshot. Local keys and untracked files are excluded.
const repo=fileURLToPath(new URL('../',import.meta.url));
const local=join(repo,'.local');
const configPath=join(local,'hosted-preview-config.json');
const source=mkdtempSync(join(local,'hosted-preview-source-'));
const lease=JSON.parse(readFileSync(join(repo,'docs/preview-session.json'),'utf8'));
assert.equal(lease.kind,'free_project');
assert.equal(lease.projectRef,'haqifhywyswptyykncnm');
assert.equal(lease.projectName,'mealz-v0230-preview');
const branch=execFileSync('git',['-C',repo,'branch','--show-current'],{encoding:'utf8'}).trim();
assert.equal(branch,'release/v0.23.0-reliable-planning');
const sha=execFileSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
mkdirSync(source,{recursive:true});
const archive=join(local,'hosted-preview-source.tar');
execFileSync('git',['-C',repo,'archive','--format=tar','--output='+archive,sha]);
execFileSync('tar',['-xf',archive,'-C',source]);
unlinkSync(archive);
assert.ok(!existsSync(join(source,'.local')),'Credential directory must never be uploaded');
const vercelConfig=JSON.parse(readFileSync(join(source,'vercel.json'),'utf8'));
delete vercelConfig.crons; // No scheduled work in this temporary preview.
writeFileSync(join(source,'vercel.json'),JSON.stringify(vercelConfig,null,2));
if(!process.argv.includes('--deploy')) {
  console.log(JSON.stringify({prepared:true,commit:sha,target:'preview',projectId:'prj_QQnJmrE0Jmhu8pgtfIXOCkqucrqx',database:lease.projectRef,aiEnabled:false,credentialsUploaded:false}));
} else {
  assert.ok(!existsSync(join(local,'hosted-preview-deployment.json')),'A preview is already recorded; inspect it before authorizing a replacement');
  assert.ok(Date.parse(lease.expiresAt)>Date.now(),'Session expired; renew authorization first');
  assert.equal(lease.status,'active_ready_for_deployment','Resume and verify the exact preview before deploying');
  const config=JSON.parse(readFileSync(configPath,'utf8'));
  assert.equal(config.projectRef,lease.projectRef);
  assert.equal(config.supabaseUrl,'https://haqifhywyswptyykncnm.supabase.co');
  assert.ok(config.publishableKey.startsWith('sb_publishable_'));
  assert.ok(config.secretKey.startsWith('sb_secret_'),'Supply the preview secret key, not a production or public key');
  const environment={...process.env,SUPABASE_URL:config.supabaseUrl,SUPABASE_PUBLISHABLE_KEY:config.publishableKey,SUPABASE_SECRET_KEY:config.secretKey,OPENAI_API_KEY:''};
  delete environment.SUPABASE_ANON_KEY;

  const args=['--yes','vercel@63.1.2','deploy',source,'--project','prj_QQnJmrE0Jmhu8pgtfIXOCkqucrqx','--scope','fumpster-dire','--target','preview','--yes','--no-wait','--meta','mealzReviewedSha='+sha];
  for(const [name,value] of Object.entries({SUPABASE_URL:config.supabaseUrl,SUPABASE_PUBLISHABLE_KEY:config.publishableKey,SUPABASE_SECRET_KEY:config.secretKey,SUPABASE_ANON_KEY:'',OPENAI_API_KEY:'',CRON_SECRET:''})) {
    args.push('--env',name+'='+value,'--build-env',name+'='+value);
  }
  try {
  execFileSync(process.execPath,[join(source,'scripts/migrate-live.js'),'--require-credentials'],{env:environment,stdio:'pipe',timeout:90000});
    const npxCli=join(dirname(process.execPath),'node_modules/npm/bin/npx-cli.js');
    assert.ok(existsSync(npxCli),'Cannot locate npm CLI beside Node.js');
    const result=spawnSync(process.execPath,[npxCli,...args],{encoding:'utf8',timeout:120000,stdio:'pipe'});
    assert.equal(result.status,0,'Vercel CLI submission failed; inspect deployment state before repeating');
    const output=(result.stdout||'')+' '+(result.stderr||'');
    const url=output.match(/https:\/\/[a-z0-9-]+\.vercel\.app/i)?.[0];
    assert.ok(url,'Deployment URL missing; inspect Vercel before repeating');
    writeFileSync(join(local,'hosted-preview-deployment.json'),JSON.stringify({url,commit:sha,target:'preview',database:lease.projectRef,aiEnabled:false},null,2));
    console.log(JSON.stringify({submitted:true,url,commit:sha,aiEnabled:false}));
  } catch {
    throw new Error('Preview submission failed. Inspect the exact Vercel project before repeating; command output is withheld to protect credentials.');
  } finally {
    unlinkSync(configPath);
  }
}
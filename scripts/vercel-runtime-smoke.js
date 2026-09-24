#!/usr/bin/env node

const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {copyFileSync,mkdtempSync,mkdirSync,readFileSync,readdirSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {pathToFileURL}=require('node:url');

const projectRoot=join(__dirname,'..');
const tempRoot=mkdtempSync(join(tmpdir(),'mealz-vercel-runtime-'));

async function main(){
  try{
    const apiFiles=[];
    const collectTypescript=directory=>{
      for(const entry of readdirSync(directory,{withFileTypes:true})){
        const absolute=join(directory,entry.name);
        if(entry.isDirectory())collectTypescript(absolute);
        else if(entry.name.endsWith('.ts'))apiFiles.push(absolute.slice(projectRoot.length+1));
      }
    };
    collectTypescript(join(projectRoot,'api'));
    execFileSync(process.execPath,[join(projectRoot,'node_modules','typescript','bin','tsc'),
      '--ignoreConfig',
      '--outDir',tempRoot,
      '--rootDir',projectRoot,
      '--target','ES2022',
      '--module','Preserve',
      '--moduleResolution','Bundler',
      '--noCheck',
      '--skipLibCheck',
      '--esModuleInterop',
      ...apiFiles
    ],{cwd:projectRoot,stdio:'pipe'});
    const entry=join(tempRoot,'api','auth-config.js');
    copyFileSync(join(projectRoot,'api/package.json'),join(tempRoot,'api/package.json'));
    copyFileSync(join(projectRoot,'shopping-logic.js'),join(tempRoot,'shopping-logic.js'));
    mkdirSync(join(tempRoot,'migrations'),{recursive:true});
    copyFileSync(join(projectRoot,'migrations/manifest.js'),join(tempRoot,'migrations','manifest.js'));
    copyFileSync(join(projectRoot,'migrations/package.json'),join(tempRoot,'migrations','package.json'));
    const emitted=readFileSync(entry,'utf8');
    assert.match(emitted,/^\s*import\s/m,'Smoke test did not reproduce Vercel ESM output');

    const handler=(await import(pathToFileURL(entry).href)).default;
    assert.equal(typeof handler,'function','Auth config handler was not exported');

    const response={
      headers:{},
      statusCode:null,
      body:null,
      setHeader(name,value){this.headers[name]=value},
      status(value){this.statusCode=value;return this},
      json(value){this.body=value;return this}
    };
    await handler({method:'GET'},response);
    assert.equal(response.statusCode,200);
    assert.equal(response.headers['Cache-Control'],'no-store');
    assert.equal(typeof response.body?.enabled,'boolean');

    for(const file of apiFiles.filter(file=>!file.split(/[\\/]/).includes('_lib'))){
      const runtimeFile=join(tempRoot,file.replace(/\.ts$/,'.js'));
      const route=(await import(pathToFileURL(runtimeFile).href)).default;
      assert.equal(typeof route,'function',`${file} did not export a function`);
    }

    const plan=(await import(pathToFileURL(join(tempRoot,'api','plan.js')).href)).default;
    const protectedResponse={...response,headers:{},statusCode:null,body:null};
    process.env.SUPABASE_URL='https://runtime-smoke.invalid';
    process.env.SUPABASE_SECRET_KEY='runtime-smoke-secret';
    process.env.SUPABASE_PUBLISHABLE_KEY='runtime-smoke-publishable';
    await plan({method:'GET',headers:{},query:{}},protectedResponse);
    assert.equal(protectedResponse.statusCode,401,'Protected route did not return an application auth response');
    assert.equal(protectedResponse.body?.code,'AUTH_REQUIRED');
    console.log('Vercel runtime smoke passed: API modules loaded, auth config returned 200, and a protected route returned application JSON.');
  }finally{
    rmSync(tempRoot,{recursive:true,force:true});
  }
}

main().catch(error=>{
  console.error(error);
  process.exitCode=1;
});

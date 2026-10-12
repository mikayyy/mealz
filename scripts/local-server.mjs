import {createServer} from 'node:http';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join,extname} from 'node:path';
import {configureLocalEnvironment} from './local-supabase-lib.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
export async function startLocalServer(port=3000) {
  configureLocalEnvironment();
  // Serve only public root assets. Environment files, logs and SQL are excluded.
  const assets=new Set(readdirSync(root).filter(name=>/\.(?:html|js|css|svg|png|ico)$/.test(name)));
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
  const server=createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,'http://127.0.0.1');
      res.setHeader('Cache-Control','no-store');
      if(/^\/api\/[a-z-]+$/.test(url.pathname)) {
        const file=join(root,url.pathname.slice(1)+'.ts');
        if(!existsSync(file)){res.writeHead(404).end();return}
        let body='';for await(const chunk of req){body+=chunk;if(body.length>600000){res.writeHead(413).end();return}}
        req.body=body?JSON.parse(body):{};req.query=Object.fromEntries(url.searchParams);
        res.status=code=>{res.statusCode=code;return res};
        res.json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return res};
        const {default:handler}=await import(pathToFileURL(file).href);
        await handler(req,res);return;
      }
      if(url.pathname==='/local-supabase-sdk.js'){
        res.setHeader('Content-Type','text/javascript');res.end(readFileSync(join(root,'.local/supabase-sdk.js')));return;
      }
      const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
      if(!assets.has(name)){res.writeHead(404).end();return}
      res.setHeader('Content-Type',types[extname(name)]||'application/octet-stream');
      let content=readFileSync(join(root,name));
      if(name==='index.html')content=Buffer.from(content.toString().replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^"']+/g,'/local-supabase-sdk.js'));
      res.end(content);
    } catch {
      if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json'});
      res.end(JSON.stringify({error:'Local request failed. See the acceptance report.'}));
    }
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});
  return server;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]) {
  const server=await startLocalServer();
  console.log('Mealz local test app: http://127.0.0.1:3000 (AI disabled)');
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close());
}

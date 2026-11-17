// Minimal static server for local checks. Applies the clean-URL rewrites from vercel.json.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const config=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
const rewrites=new Map(config.rewrites.filter(r=>r.destination.startsWith('/')&&!r.source.includes(':')).map(r=>[r.source,r.destination]));
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};

export function start(port=0){
  const server=http.createServer((req,res)=>{
    let pathname=decodeURIComponent(new URL(req.url,'http://x').pathname);
    pathname=(rewrites.get(pathname)||pathname).split('?')[0];
    if(pathname==='/')pathname='/index.html';
    const file=path.join(root,pathname);
    if(!file.startsWith(root)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve=>server.listen(port,'127.0.0.1',()=>resolve({server,url:`http://127.0.0.1:${server.address().port}`})));
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const {url}=await start(Number(process.env.PORT)||4173);console.log(url);}

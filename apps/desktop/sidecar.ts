/** Fixed, private parent/child protocol. No shell execution, vault-read command or arbitrary IPC. */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { startLocalWeb } from '../local-web/server.ts';

if(!process.argv.includes('--desktop-child'))throw new Error('This service must be started by the desktop host. Use npm run local for browser mode.');
const directory=process.env.PROMTESAVER_DATA_DIR??join(homedir(),'.promtesaver-local');
let app:Awaited<ReturnType<typeof startLocalWeb>>|undefined;
let closing=false;
const send=(message:unknown)=>{if(!process.stdout.destroyed)process.stdout.write(JSON.stringify(message)+'\n');};
const shutdown=async(code=0)=>{
  if(closing)return; closing=true;
  const force=setTimeout(()=>process.exit(code),3000);force.unref();
  try { await app?.close(); process.exitCode=code; }
  finally { clearTimeout(force);process.stdin.destroy();process.stdout.end(); }
};
process.stdout.on('error',()=>{void shutdown(1);});
process.on('SIGINT',()=>void shutdown());process.on('SIGTERM',()=>void shutdown());
try {
  app=await startLocalWeb({directory});
  if(process.stdin.destroyed || process.stdin.readableEnded){await shutdown();}
  else {
    send({type:'ready',version:1,url:app.url});
    let buffer=''; process.stdin.setEncoding('utf8');
    process.stdin.on('data',(chunk:string)=>{
      if(closing)return;
      buffer+=chunk;
      if(Buffer.byteLength(buffer)>4096){send({type:'error',code:'PROTOCOL_LIMIT'});void shutdown(1);return;}
      let newline:number;
      while((newline=buffer.indexOf('\n'))!==-1){
        const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);
        try {
          const value:unknown=JSON.parse(line);
          if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1||!('type' in value))throw new Error('Invalid command');
          if(value.type==='shutdown'){void shutdown();return;}
          if(value.type==='lock'){app!.lock();send({type:'locked'});}
          else if(value.type==='ping')send({type:'pong'});
          else throw new Error('Invalid command');
        } catch {send({type:'error',code:'INVALID_COMMAND'});}
      }
    });
    process.stdin.on('end',()=>void shutdown());
    process.stdin.on('error',()=>void shutdown(1));
    process.stdin.resume();
  }
} catch {send({type:'error',code:'STARTUP_FAILED'});await shutdown(1);}

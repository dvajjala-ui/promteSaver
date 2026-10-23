/** Synthetic password-work/event-loop probe. Not an installed-app latency guarantee. */
import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setTimeout as wait } from 'node:timers/promises';
import { platform, arch } from 'node:os';
import { wrapKey, wrapKeyAsync } from '../apps/local-web/key-envelope.ts';
import { APP_VERSION } from '../packages/contracts/app-info.ts';
const key=randomBytes(32),password='Synthetic-benchmark-passphrase-only';
const round=(value:number)=>Math.round(value*100)/100;
async function measure(asynchronous:boolean) {
  const gaps:number[]=[];let previous=performance.now();
  const timer=setInterval(()=>{const now=performance.now();gaps.push(now-previous);previous=now;},10);
  try {
    await wait(30);
    const start=performance.now();
    if(asynchronous)await wrapKeyAsync(password,key);else wrapKey(password,key);
    const workMs=performance.now()-start;await wait(30);
    return {workMs:round(workMs),maximumTimerGapMs:round(Math.max(...gaps)),timerSamples:gaps.length};
  }finally{clearInterval(timer);}
}
try {
  await wrapKeyAsync(password,key); // Warm the native crypto implementation, excluded.
  const synchronous: Awaited<ReturnType<typeof measure>>[] = [], asynchronous: Awaited<ReturnType<typeof measure>>[] = [];
  for(let i=0;i<3;i++){synchronous.push(await measure(false));asynchronous.push(await measure(true));}
  const median=(samples:typeof synchronous,field:'workMs'|'maximumTimerGapMs')=>round(samples.map(s=>s[field]).sort((a,b)=>a-b)[1]!);
  console.log(JSON.stringify({version:APP_VERSION,node:process.version,platform:platform(),architecture:arch(),
    timerIntervalMs:10,workFactor:{N:32768,r:8,p:3},synchronous,asynchronous,
    median:{synchronousWorkMs:median(synchronous,'workMs'),asynchronousWorkMs:median(asynchronous,'workMs'),
      synchronousMaximumTimerGapMs:median(synchronous,'maximumTimerGapMs'),asynchronousMaximumTimerGapMs:median(asynchronous,'maximumTimerGapMs')},
    limitations:['Three alternating samples on one Linux development host','Compares the same KDF work factor, not different security settings','Async derivation avoids blocking the event loop but does not remove CPU or temporary native memory cost','Does not measure browser, native UI, low-memory hardware or all other synchronous application work']},null,2));
}finally{key.fill(0);}

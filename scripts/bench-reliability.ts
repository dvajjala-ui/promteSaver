import { APP_VERSION } from '../packages/contracts/app-info.ts';
/** Reproducible synthetic Node-backend benchmark; no browser/native performance claims. */
import { mkdtempSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir, arch, platform } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { EncryptedArchive } from '../packages/local-store/archive.ts';

const count=Number(process.argv[2]??5000);
if(!Number.isInteger(count)||count<100||count>50000)throw new Error('Record count must be 100..50000');
const directory=mkdtempSync(join(tmpdir(),'promte-benchmark-'));
const path=join(directory,'bench.sqlite');
const archive=new EncryptedArchive(path,randomBytes(32));
const round=(value:number)=>Math.round(value*100)/100;
const measure=(fn:()=>unknown)=>{const start=performance.now();fn();return performance.now()-start;};
const summarize=(values:number[])=>{const sorted=values.slice().sort((a,b)=>a-b);return {samples:values.length,p50Ms:round(sorted[Math.floor(sorted.length*.5)]!),p95Ms:round(sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*.95)-1)]!),maximumMs:round(sorted.at(-1)!)};};
try {
  const start=performance.now();
  for(let i=0;i<count;i++)archive.saveLibrary({title:`Synthetic prompt ${i}`,body:`Review scenario ${i} for security, latency, privacy, rollback and testing. ${'Illustrative context only. '.repeat(20)} cohort${i%10} sentinel${i%37}`,
    project:`Project ${i%12}`,tags:[`topic-${i%80}`],notes:`Synthetic fixture ${i}`,pinned:i%50===0});
  const seedMs=performance.now()-start;
  const distinct=Array.from({length:10},(_,i)=>measure(()=>archive.queryLibrary({query:`security cohort${i}`,sort:'relevance',limit:40})));
  // Seed identical-query cache separately. All subsequent samples are explicitly warm.
  archive.queryLibrary({query:'latency rollback',sort:'relevance',limit:40});
  const warm=Array.from({length:20},()=>measure(()=>archive.queryLibrary({query:'latency rollback',sort:'relevance',limit:40})));
  const deepPageMs=measure(()=>archive.queryLibrary({query:'privacy',sort:'relevance',limit:20,offset:Math.max(0,count-20)}));
  archive.setPreferences({idleMinutes:15,lowMemory:true,compactMode:true,lockOnHide:false});
  const lowMemoryColdMs=measure(()=>archive.queryLibrary({query:'privacy',limit:20}));
  const lowMemoryWarm=Array.from({length:20},()=>measure(()=>archive.queryLibrary({query:'privacy',limit:20})));
  const facetsColdMs=measure(()=>archive.libraryFacets()),facetsWarmMs=measure(()=>archive.libraryFacets());
  const diskBytes=['','-wal','-shm'].reduce((sum,suffix)=>sum+(existsSync(path+suffix)?statSync(path+suffix).size:0),0);
  console.log(JSON.stringify({version:APP_VERSION,records:count,node:process.version,platform:platform(),architecture:arch(),seedMs:round(seedMs),
    distinctQueryCacheMiss:summarize(distinct),identicalQueryCacheHit:summarize(warm),deepPageMs:round(deepPageMs),
    lowMemory:{coldMs:round(lowMemoryColdMs),warm:summarize(lowMemoryWarm)},facets:{coldMs:round(facetsColdMs),warmMs:round(facetsWarmMs)},
    rssMiB:round(process.memoryUsage().rss/1024/1024),heapUsedMiB:round(process.memoryUsage().heapUsed/1024/1024),dbAndWalMiB:round(diskBytes/1024/1024),
    limitations:['Synthetic data and Linux compatibility runtime only','RSS is a point-in-time Node process measurement, not peak or whole-app memory','Browser and webview memory excluded','Cold full-text search still decrypts/scans O(n) rows','Warm results are keyed cache hits, not a general search-speed guarantee']},null,2));
}finally{archive.close();rmSync(directory,{recursive:true,force:true});}

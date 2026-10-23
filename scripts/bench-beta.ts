/** Synthetic, Linux/Node-style measurement only. Does not benchmark Windows or Mac UI/collector. */
import {mkdtempSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {randomBytes} from 'node:crypto';
import {EncryptedArchive} from '../packages/local-store/archive.ts';

const count = Number(process.argv[2] || 5000);
if (!Number.isInteger(count) || count < 100 || count > 50000) throw new Error('Count must be 100..50000');
const directory=mkdtempSync(join(tmpdir(),'promte-beta-bench-'));
const filename=join(directory,'bench.sqlite');
const archive=new EncryptedArchive(filename,randomBytes(32));
const operations:number[]=[];
try {
  for (let i=0;i<count;i++) {
    archive.saveLibrary({title:`Synthetic planning prompt ${i}`,body:`Perform a careful review of scenario ${i}; consider correctness, latency, security, and rollback. ${'illustrative filler '.repeat(15)}`,
      project:`Project ${i%12}`,tags:[`topic-${i%80}`],notes:`Expected output: clear prioritized actions for ${i}`,pinned:i%50===0});
  }
  const t0=performance.now();const first=archive.queryLibrary({query:'latency rollback',sort:'relevance',limit:40});operations.push(performance.now()-t0);
  for (let i=0;i<9;i++) {
    const t=performance.now();archive.queryLibrary({query:i%2?'scenario security':'synthetic project',project:`Project ${i%12}`,limit:40});operations.push(performance.now()-t);
  }
  const facetsCold=performance.now();const projects=archive.libraryFacets();const facetsColdMs=performance.now()-facetsCold;
  const facetsWarm=performance.now();archive.libraryFacets();const facetsWarmMs=performance.now()-facetsWarm;
  operations.sort((a,b)=>a-b);
  console.log(JSON.stringify({scenario:'local encrypted library 0.2 (synthetic)',records:count,firstSearchResults:first.total,
    searchP50Ms:Math.round(operations[4]!),searchP95Ms:Math.round(operations[9]!),
    facetsColdMs:Math.round(facetsColdMs),facetsWarmMs:Math.round(facetsWarmMs),
    projects:projects.projects.length,dbMiB:Math.round(statSync(filename).size/1024/1024*10)/10,
    rssMiB:Math.round(process.memoryUsage().rss/1024/1024),
    scope:'Linux Node runtime process only, excludes browser/OS; no native capture'},null,2));
} finally {archive.close();rmSync(directory,{recursive:true,force:true});}

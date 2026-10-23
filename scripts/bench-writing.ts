import { APP_VERSION } from '../packages/contracts/app-info.ts';
/** Synthetic, opt-in writing algorithms microbenchmark. No vault, model, or network. */
import { performance } from 'node:perf_hooks';
import { arch, platform } from 'node:os';
import { analyzeWriting, createStylePrompt } from '../packages/writing-style/profile.ts';
import { proofreadWriting } from '../packages/writing-style/proofread.ts';

const rounds=Number(process.argv[2]??40);
if(!Number.isSafeInteger(rounds)||rounds<5||rounds>1000)throw new Error('Rounds must be between 5 and 1000');
const sample="I'm sharing a concise status update. I focus on evidence and next steps. I don't want fluff.\n\n".repeat(65);
const analysisSamples=[sample,sample.slice(0,4500)];
const checkText='This  release release note has extra spacing!!!\n'+sample.slice(0,7000);
const measure=(fn:()=>unknown)=>{
  const readings:number[]=[];
  for(let i=0;i<rounds;i++){
    const start=performance.now();fn();readings.push(performance.now()-start);
  }
  readings.sort((a,b)=>a-b);
  const round=(value:number)=>Math.round(value*1000)/1000;
  return {iterations:rounds,medianMs:round(readings[Math.floor(readings.length/2)]!),
    p95Ms:round(readings[Math.ceil(readings.length*.95)-1]!),maxMs:round(readings.at(-1)!)};
};
const profile=analyzeWriting(analysisSamples);
console.log(JSON.stringify({version:APP_VERSION,runtime:process.version,platform:platform(),arch:arch(),
  inputChars:{sampleTotal:analysisSamples.reduce((n,s)=>n+s.length,0),proofread:checkText.length},
  styleAnalysis:measure(()=>analyzeWriting(analysisSamples)),
  promptGeneration:measure(()=>createStylePrompt(profile,'Rewrite this synthetic project update.')),
  proofread:measure(()=>proofreadWriting(checkText)),
  rssMiB:Math.round(process.memoryUsage().rss/1024/1024*10)/10,
  caveats:['Linux/Node synthetic CPU measurements only', 'Node RSS includes runtime and benchmark, not a whole desktop application',
  'Warm repeat inputs, not P95 of an installed application', 'No model, background grammar service, or network activity']},null,2));

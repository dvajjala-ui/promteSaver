import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { BoundedTopK } from '../packages/local-store/top-k.ts';
import { EncryptedArchive } from '../packages/local-store/archive.ts';

test('bounded ranker matches a full reference sort for every bounded capacity and input order',()=>{
  let seed=1729;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  for(const length of [0,1,2,30,300,2000])for(const capacity of [0,1,2,20,40,150,500]){
    const values=Array.from({length},(_,id)=>({id,score:random()%50,pinned:random()%7===0}));
    const compare=(a:typeof values[number],b:typeof values[number])=>Number(b.pinned)-Number(a.pinned)||b.score-a.score||a.id-b.id;
    for(const input of [values,values.slice().reverse()]){
      const heap=new BoundedTopK(capacity,compare);
      for(const value of input){heap.add(value);assert.ok(heap.size<=capacity);}
      assert.deepEqual(heap.sorted(),input.slice().sort(compare).slice(0,capacity));
      // Reading the sorted result must not mutate the heap and break future insertion.
      const next={id:length+1,score:99,pinned:true};heap.add(next);
      assert.deepEqual(heap.sorted(),[...input,next].sort(compare).slice(0,capacity));
    }
  }
});

test('ranking rejects invalid resource caps and stays sub-quadratic on deep result windows',()=>{
  for(const capacity of [-1,NaN,Infinity,1.5,100101])assert.throws(()=>new BoundedTopK(capacity,(a:number,b:number)=>a-b),/capacity/);
  let calls=0;const heap=new BoundedTopK<number>(5000,(a,b)=>{calls++;return a-b;});
  for(let i=19999;i>=0;i--)heap.add(i);
  assert.deepEqual(heap.sorted(),Array.from({length:5000},(_,i)=>i));
  assert.ok(calls<600000,`Unexpected comparisons: ${calls}`);
});

test('encrypted search pages preserve relevance, popularity, recent and stable tie-break order',()=>{
  const archive=new EncryptedArchive(':memory:',randomBytes(32));
  try{
    for(let i=0;i<250;i++){
      const item=archive.saveLibrary({title:`${i%3===0?'needle ':''}Entry ${i}`,body:'needle body',tags:i%7===0?['needle']:[],pinned:i%11===0}).item;
      if(i%5===0)archive.recordUse(item.id);
    }
    for(const options of [{sort:'relevance' as const},{sort:'popular' as const},{sort:'updated' as const},{filter:'recent' as const}]){
      const expected=[];
      for(let offset=0;offset<250;offset+=100)expected.push(...archive.queryLibrary({query:'needle',limit:100,offset,...options}).items);
      const ids=[];
      for(let offset=0;offset<expected.length;offset+=17)ids.push(...archive.queryLibrary({query:'needle',limit:17,offset,...options}).items.map(x=>x.id));
      assert.deepEqual(ids,expected.map(x=>x.id));assert.equal(new Set(ids).size,ids.length);
    }
  }finally{archive.close();}
});

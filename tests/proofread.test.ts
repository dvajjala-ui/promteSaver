import test from 'node:test';
import assert from 'node:assert/strict';
import {proofreadWriting} from '../packages/writing-style/proofread.ts';

test('offline writing check recognizes explicitly selected spacing and duplicate-word candidates',()=>{
  const text='This  is is a useful test!!!';
  const issues=proofreadWriting(text);
  assert.ok(issues.some(i=>i.kind==='spacing'&&i.replacement===' '));
  assert.ok(issues.some(i=>i.kind==='repetition'&&i.before.includes('is is')));
  assert.ok(issues.some(i=>i.kind==='punctuation'&&i.replacement==='!'));
  for(const issue of issues)assert.equal(text.slice(issue.start,issue.end),issue.before);
});

test('writing issue positions preserve unicode UTF-16 offsets',()=>{
  const text='🧠 We  write thoughtfully.';
  const space=proofreadWriting(text).find(i=>i.kind==='spacing');
  assert.ok(space);assert.equal(space.start,5);assert.equal(text.slice(space.start,space.end),'  ');
});

test('empty input is fine, non-string and over-limit input fail safely',()=>{
  assert.deepEqual(proofreadWriting(''),[]);
  assert.deepEqual(proofreadWriting(' \n '),[]);
  assert.throws(()=>proofreadWriting('x'.repeat(12_001)),RangeError);
  assert.throws(()=>proofreadWriting(123 as unknown as string),RangeError);
});

test('trailing whitespace and readability warnings never apply automatic corrections',()=>{
  const text='A short line with spaces  \n' + 'word '.repeat(45)+'.';
  const issues=proofreadWriting(text);
  assert.ok(issues.some(i=>i.kind==='trailing-space'&&i.replacement===''));
  assert.ok(issues.some(i=>i.kind==='length'&&!('replacement' in i)));
  assert.equal(text.includes('word '),true,'the analyzer must not modify source text');
});

test('writing checker bounds issue counts and keeps deterministic ordering',()=>{
  const text=('a  b ').repeat(100);
  const first=proofreadWriting(text);
  assert.ok(first.length<=50);
  assert.deepEqual(first,proofreadWriting(text));
  assert.deepEqual(first.map(x=>x.start),first.map(x=>x.start).sort((a,b)=>a-b));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeWriting, createStylePrompt } from '../packages/writing-style/profile.ts';
test('builds bounded deterministic opt-in profile', () => {
 const samples=["I'm thinking about a simple design. I'm thinking about a clean interface!", "I'm thinking about a simple design. We don't need a complicated interface?"];
 const p=analyzeWriting(samples,{tone:'casual',avoid:['corporate jargon']});
 assert.equal(p.sampleCount,2);assert.equal(p.schemaVersion,1); assert.ok(p.wordCount>10);
 assert.equal(p.tendencies.contractions,'often');assert.deepEqual(p.preferences.avoid,['corporate jargon']);
 assert.deepEqual(analyzeWriting(samples,{tone:'casual',avoid:['corporate jargon']}),p);
 assert.match(createStylePrompt(p,'Write a release note'), /Write a release note/);
});
test('rejects unbounded or missing samples',()=>{
 assert.throws(()=>analyzeWriting([]),RangeError);
 assert.throws(()=>analyzeWriting(['x'.repeat(10001)]),RangeError);
 assert.throws(()=>analyzeWriting(Array(13).fill('hi')),RangeError);
 assert.throws(()=>createStylePrompt(analyzeWriting(['Hello world']),'a'.repeat(12001)),TypeError);
});
test('styles do not make any automatic network or file reads',()=>{
 const p=analyzeWriting(['Hello world. This is my writing sample.']);
 assert.equal(p.examples[0],'Hello world. This is my writing sample.');
 assert.ok(!JSON.stringify(p).includes('api_key'));
});

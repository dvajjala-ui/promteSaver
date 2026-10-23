import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeWriting,createStylePrompt} from '../apps/writing-studio/profile.mjs';
test('standalone browser module creates portable style prompt',()=>{
 const p=analyzeWriting(['I love concise emails. I love concise messages.'],{tone:'plain'});
 assert.match(createStylePrompt(p,'Draft a summary'),/Draft a summary/);
 assert.equal(p.preferences.tone,'plain');
});
test('browser module refuses oversize input',()=>assert.throws(()=>analyzeWriting(['z'.repeat(10001)]),RangeError));

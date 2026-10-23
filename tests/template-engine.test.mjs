import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTemplate, fillTemplate } from '../apps/local-web/public/template-engine.js';

test('template fields deduplicate and preserve first default in appearance order', () => {
  assert.deepEqual(parseTemplate('Use {{language|TypeScript}} for {{task}} and {{language|Rust}}'),[
    {name:'language',fallback:'TypeScript'},{name:'task',fallback:''}
  ]);
});
test('template replacement is single pass and inserted text remains literal data', () => {
  const values = new Map([['task','{{language}} $& <script>alert(1)</script>'],['language','Rust']]);
  assert.equal(fillTemplate('{{task}} in {{language}}',values),'{{language}} $& <script>alert(1)</script> in Rust');
});
test('template uses explicit empty values, defaults, repeated variables, and spaced names', () => {
  assert.equal(fillTemplate('{{ first name |Sam}} {{a|default}} {{b|ok}} {{b|ok}}',new Map([['first name','Ava'],['a','']])), 'Ava  ok ok');
});
test('malformed template tokens are not evaluated or executed', () => {
  assert.equal(fillTemplate('{{process.exit()}} {{9bad}} {{x|{nested}}} ${danger}',new Map()),'{{process.exit()}} {{9bad}} {{x|{nested}}} ${danger}');
});
test('template variable count and expanded output have explicit bounds', () => {
  assert.throws(()=>parseTemplate(Array.from({length:65},(_,i)=>`{{v${i}}}`).join(' ')),/64/);
  assert.throws(()=>fillTemplate('{{a}}{{a}}{{a}}',new Map([['a','x'.repeat(400000)]])),/1,000,000/);
  assert.equal(fillTemplate('Plain text',new Map()),'Plain text');
});

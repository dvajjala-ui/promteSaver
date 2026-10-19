import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const schema = JSON.parse(readFileSync(new URL('../packages/contracts/capture.schema.json', import.meta.url), 'utf8'));
function typeOf(node) {
  if (node.$ref) return node.$ref.split('/').at(-1);
  if ('const' in node) return JSON.stringify(node.const);
  if (node.enum) return node.enum.map(value => JSON.stringify(value)).join(' | ');
  if (node.type === 'string') return 'string';
  if (node.type === 'integer' || node.type === 'number') return 'number';
  if (node.type === 'boolean') return 'boolean';
  throw new Error('Unsupported contract schema node');
}
const output = '// Generated from capture.schema.json. Run npm run contracts:generate.\n\n' +
  Object.entries(schema.$defs).map(([name, node]) => {
    const fields = Object.entries(node.properties).map(([key, value]) =>
      `  ${key}${node.required.includes(key) ? '' : '?'}: ${typeOf(value)};`).join('\n');
    return `export interface ${name} {\n${fields}\n}\n`;
  }).join('\n');
const target = new URL('../packages/contracts/generated.ts', import.meta.url);
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== output) throw new Error('Generated contracts are stale');
} else {
  writeFileSync(fileURLToPath(target), output);
}

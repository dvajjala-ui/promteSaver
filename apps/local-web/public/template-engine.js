/** Pure single-pass template expansion. Inserted values are data, never parsed a second time. */
const pattern = () => /\{\{[ \t]*([a-zA-Z][a-zA-Z0-9_ ]{0,50})(?:\|([^{}]{0,100}))?\}\}/g;
/** @param {string} body @returns {{name:string,fallback:string}[]} */
export function parseTemplate(body) {
  const variables = new Map();
  for (const match of body.matchAll(pattern())) {
    const name = match[1].trim();
    if (!variables.has(name)) variables.set(name, match[2] || '');
    if (variables.size > 64) throw new Error('A template can have at most 64 different variables.');
  }
  return [...variables].map(([name, fallback]) => ({ name, fallback }));
}
/** @param {string} body @param {Map<string,string>} values @returns {string} */
export function fillTemplate(body, values) {
  parseTemplate(body);
  const result = body.replace(pattern(), (_match, name, fallback) => values.get(name.trim()) ?? fallback ?? '');
  if (result.length > 1_000_000) throw new Error('The filled template exceeds 1,000,000 characters.');
  return result;
}

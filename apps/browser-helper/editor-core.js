/* Small isolated-world helpers. No network, timers, storage, or application-wide hooks. */
(() => {
  'use strict';
  const adapters = Object.freeze({
    'chatgpt.com': {editors:'#prompt-textarea, textarea[data-testid="prompt-textarea"]',send:'[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label="Send message"]'},
    'claude.ai': {editors:'div[contenteditable="true"][role="textbox"], div.ProseMirror[contenteditable="true"]',send:'button[aria-label="Send message"], button[data-testid="send-button"]'},
    'gemini.google.com': {editors:'.ql-editor[contenteditable="true"], rich-textarea [contenteditable="true"][role="textbox"]',send:'button.send-button, button[aria-label="Send message"]'}
  });
  function privatePage(url,doc) {
    const u = new URL(url);
    return u.protocol!=='https:' || /\/(incognito|temporary|private)(\/|$)/i.test(u.pathname) ||
      ['temporary-chat','temporary','incognito'].some(k=>['true','1'].includes(u.searchParams.get(k))) ||
      !!doc.querySelector('[data-testid="temporary-chat-bar"], [data-is-temporary-chat="true"]');
  }
  function eligible(el) {
    if(!el || !el.isConnected || el.getClientRects().length===0 || el.closest('[hidden],[aria-hidden="true"],[data-private="true"],[data-sensitive="true"]'))return false;
    if(el.matches('input,[disabled],[readonly],[aria-readonly="true"]'))return false;
    if(!(el.matches('textarea')||el.isContentEditable))return false;
    if(/password|secret|token|credit.card|security.code|search|one.time/i.test([el.id,el.getAttribute('name'),el.getAttribute('placeholder'),el.getAttribute('aria-label'),el.getAttribute('autocomplete')].join(' ')))return false;
    const style=getComputedStyle(el);return style.display!=='none' && style.visibility==='visible' && style.opacity!=='0';
  }
  function read(el) {
    if(!eligible(el))return null;
    const value=el.matches('textarea')?el.value:el.innerText;
    return typeof value==='string' && value.trim() && value.length<=50_000 ? value : null;
  }
  function hints(text) {
    if(typeof text!=='string'||!text.trim()||text.length>12_000)return [];
    const result=[];
    if(/\b([a-z]{2,})[ \t]+\1\b/i.test(text))result.push('Possible repeated word. Review before sending.');
    if(/[^\n] {2,}[^\n]/.test(text))result.push('Extra spaces may be accidental.');
    if(/[!?]{3,}/.test(text))result.push('Repeated punctuation can make tone harder to read.');
    if(text.length>180&&!/\b(format|return|output|list|table|json|markdown|steps|summary)\b/i.test(text))result.push('Consider specifying the output format you need.');
    return result.slice(0,3);
  }
  function fingerprint(text) {let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return (h>>>0).toString(16);}
  globalThis.PromteEditor=Object.freeze({adapters,privatePage,eligible,read,hints,fingerprint});
})();

/* Small isolated-world helpers. No network, timers, storage, or application-wide hooks. */
(() => {
  'use strict';
  const adapters = Object.freeze({
    'chatgpt.com': {editors:'#prompt-textarea, textarea[data-testid="prompt-textarea"]',send:'[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label="Send message"]'},
    'claude.ai': {editors:'div[contenteditable="true"][role="textbox"], div.ProseMirror[contenteditable="true"]',send:'button[aria-label="Send message"], button[data-testid="send-button"]'},
    'gemini.google.com': {editors:'.ql-editor[contenteditable="true"], rich-textarea [contenteditable="true"][role="textbox"]',send:'button.send-button, button[aria-label="Send message"]'}
  });
  function privatePage(url,doc) {
    try {
      const u = new URL(url);
      return u.protocol!=='https:' || /\/(incognito|temporary|temporary-chat|private)(\/|$)/i.test(u.pathname) ||
        ['temporary-chat','temporary','incognito','private'].some(k=>['true','1'].includes(u.searchParams.get(k)?.toLowerCase())) ||
        !!doc.querySelector('[data-testid="temporary-chat-bar"], [data-is-temporary-chat="true"]');
    } catch { return true; }
  }
  function blocked(el) {
    return !el || !!el.closest('input,[hidden],[inert],[aria-hidden="true"],[aria-disabled="true"],[data-private="true"],[data-sensitive="true"],fieldset[disabled]');
  }
  function eligible(el) {
    if(!el || !el.isConnected || el.getClientRects().length===0 || blocked(el))return false;
    if(el.matches('input,[disabled],[readonly],[aria-readonly="true"]'))return false;
    if(!(el.matches('textarea')||el.isContentEditable))return false;
    if(/password|secret|token|credit.card|card.number|security.code|search|one.time/i.test([el.id,el.getAttribute('name'),el.getAttribute('placeholder'),el.getAttribute('aria-label'),el.getAttribute('autocomplete')].join(' ')))return false;
    const style=getComputedStyle(el);
    if(style.display==='none'||style.visibility!=='visible'||style.opacity==='0')return false;
    // Opacity is not inherited: a fully transparent wrapper can still contain a
    // programmatically focused editor with visible computed styles of its own.
    for(let parent=el.parentElement;parent;parent=parent.parentElement)if(getComputedStyle(parent).opacity==='0')return false;
    return true;
  }
  function read(el) {
    if(!eligible(el))return null;
    const value=el.matches('textarea')?el.value:el.innerText;
    return typeof value==='string' && value.trim() && value.length<=50_000 ? value : null;
  }
  // Used by the explicit popup preview too, so it cannot bypass producer exclusions.
  // Unknown single-line inputs stay unsupported; preview reads only the focused editor.
  function preview(url,doc) {
    if(doc.hidden || privatePage(url,doc))return {error:'Private, temporary or hidden page excluded. No text read.'};
    if(blocked(doc.activeElement))return {error:'Protected or unsupported focused input. No text read.'};
    const editor=doc.activeElement?.closest('textarea,[contenteditable="true"],[role="textbox"]');
    if(!eligible(editor))return {error:'Focus a visible, unprotected prompt editor and try again.'};
    const text=read(editor);
    return text?{text}:{error:'The editor is empty or exceeds the 50,000-character limit.'};
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
  globalThis.PromteEditor=Object.freeze({adapters,privatePage,blocked,eligible,read,preview,hints,fingerprint});
})();

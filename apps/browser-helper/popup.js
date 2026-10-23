/* Manual preview plus explicit, per-site opt-in send-intent capture. No cloud inference. */
const permittedHosts = new Set([
  'chatgpt.com','chat.openai.com','claude.ai','gemini.google.com',
  'perplexity.ai','www.perplexity.ai','copilot.microsoft.com','poe.com',
  'aistudio.google.com','chat.deepseek.com','grok.com'
]);
const $ = id => document.getElementById(id);
function note(text) { $('message').textContent = text; }
let previewHost = null;
let bridge = null;
// Manual pairing/save uses the same bounded, redirect-free loopback trust boundary as the worker.
async function postLocal(port,path,payload,token) {
  if(!Number.isInteger(port)||port<1||port>65535||!['pair','save'].includes(path))throw Error('Invalid local connection.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000);
  try {
    const response=await fetch(`http://127.0.0.1:${port}/api/bridge/${path}`,{method:'POST',cache:'no-store',redirect:'error',signal:controller.signal,
      headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(payload)});
    const reader=response.body?.getReader();if(!reader)throw Error('Empty local response.');
    const chunks=[];let length=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;
      if(length>8192)throw Error('Local response exceeded the limit.');chunks.push(value);}}
    finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const data=JSON.parse(new TextDecoder().decode(bytes));return {response,data};
  } catch {throw Error('Could not complete the local request safely. Check the vault and pairing; nothing was queued.');}
  finally{clearTimeout(timer);}
}

async function showBridge() {
  const data = await chrome.storage.session.get('promtesaver.bridge');
  const saved = data['promtesaver.bridge'];
  bridge = saved && Number.isInteger(saved.port) && saved.port > 0 && saved.port <= 65535 &&
    /^[a-f0-9]{64}$/.test(saved.writeToken) && saved.expiresAt > Date.now() ? saved : null;
  $('pairStatus').textContent = bridge ? 'Paired until '+new Date(bridge.expiresAt).toLocaleTimeString()+' · Write-only' : 'Not paired · Clipboard copy still works';
  $('directSave').hidden = !bridge || $('result').hidden;
}

$('inspect').addEventListener('click', async () => {
  $('result').hidden = true; previewHost = null; note('');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || !tab.url || tab.incognito) throw new Error('Open a supported AI tab first.');
    const u = new URL(tab.url); const host = u.hostname.toLowerCase();
    if (u.protocol !== 'https:' || !permittedHosts.has(host)) throw new Error('Site not on the privacy allowlist. No text read.');
    const [result] = await chrome.scripting.executeScript({ target: {tabId:tab.id}, func: () => {
      // Read only the one currently focused, user-visible editor. Do not traverse other page text.
      const focused = document.activeElement;
      if (!focused || !(focused instanceof HTMLElement)) return {error:'Focus a prompt editor and try again.'};
      const editor = focused.closest('textarea, input, [contenteditable="true"], [role="textbox"]');
      if (!editor || !(editor instanceof HTMLElement)) return {error:'No supported focused editor.'};
      if (!editor.getClientRects().length || getComputedStyle(editor).visibility !== 'visible') return {error:'Hidden editor excluded.'};
      if (editor.closest('[aria-hidden="true"], [data-private="true"], [autocomplete="off"][data-sensitive="true"]'))
        return {error:'Protected editor excluded.'};
      const description = [editor.id,editor.getAttribute('name'),editor.getAttribute('placeholder'),
        editor.getAttribute('aria-label'),editor.getAttribute('autocomplete')].join(' ').toLowerCase();
      if (/(password|secret|token|credit.card|card.number|search|one.time.code|security.code)/i.test(description))
        return {error:'Sensitive or search input excluded.'};
      if (editor.hasAttribute('readonly') || editor.hasAttribute('disabled') || editor.getAttribute('aria-readonly') === 'true')
        return {error:'Editor is read-only.'};
      let value = '';
      if (editor instanceof HTMLInputElement) {
        if (!['text','search'].includes(editor.type) || editor.type === 'search') return {error:'Not an allowed prompt field.'};
        value = editor.value;
      } else if (editor instanceof HTMLTextAreaElement) value = editor.value;
      else {
        if (!editor.isContentEditable) return {error:'Field is not editable.'};
        value = editor.innerText || editor.textContent || '';
      }
      if (!value.trim()) return {error:'The editor is empty.'};
      if (value.length > 50000) return {error:'Preview exceeds the 50,000-character limit.'};
      return {text:value};
    } });
    const value = result?.result;
    if (!value || typeof value.text !== 'string') throw new Error(value?.error || 'Unable to read focused editor.');
    $('preview').value = value.text; previewHost = host;
    $('promptTitle').value = `Prompt from ${host}`.slice(0,140);
    $('result').hidden = false;
    $('directSave').hidden = !bridge;
    note('Review your preview. You decide whether to copy or save.');
  } catch (error) { note(error instanceof Error ? error.message : 'Failed to inspect the focused editor.'); }
});
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('preview').value); note('Copied. Paste into your local vault or an AI tool.'); }
  catch { note('Clipboard permission denied. Select the preview and copy manually.'); }
});
$('pair').addEventListener('click', async () => {
  const value = $('pairCode').value.trim();
  const match = /^psv2:(\d{1,5}):([a-f0-9]{64})$/.exec(value);
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 65535) {note('Invalid pairing code. Generate a new code in the local vault Settings.');return;}
  const port = Number(match[1]);
  $('pair').disabled = true;
  try {
    const {response,data} = await postLocal(port,'pair',{code:match[2]});
    if (!response.ok || typeof data.writeToken !== 'string' || !/^[a-f0-9]{64}$/.test(data.writeToken)) throw new Error(data.error || 'Pairing failed.');
    bridge = {port,writeToken:data.writeToken,expiresAt:Date.parse(data.expiresAt),allowedCaptureHosts:data.allowedCaptureHosts||[]};
    await chrome.storage.session.set({'promtesaver.bridge':bridge});
    $('pairCode').value='';
    note('Paired. Enable capture separately for an approved site. Locking the vault revokes access.');
    await showBridge();
  } catch (error) {note(error.message || 'Could not pair. Make sure the vault is open and unlocked.');}
  finally {$('pair').disabled=false;}
});
$('saveToVault').addEventListener('click', async () => {
  if (!bridge || !previewHost || $('result').hidden) return;
  const title = $('promptTitle').value.trim(); const text = $('preview').value;
  if (!title || !text.trim() || text.length > 50000) {note('Provide a title and a valid preview.');return;}
  $('saveToVault').disabled = true;
  try {
    const {response,data} = await postLocal(bridge.port,'save',{host:previewHost,text,title},bridge.writeToken);
    if (!response.ok) {
      if (response.status === 401 || response.status === 423) {
        await chrome.storage.session.remove('promtesaver.bridge');
        bridge = null; await showBridge();
      }
      throw new Error(data.error || 'Local vault rejected the save.');
    }
    note(data.redactions ? `Saved locally; ${data.redactions} sensitive match(es) redacted.` : 'Saved to your local encrypted vault.');
    $('result').hidden=true; previewHost=null; $('preview').value='';
  } catch (error) {note(error.message || 'Could not save. Restart local vault and pair again.');}
  finally {$('saveToVault').disabled=false;}
});
void showBridge();

let autoHost=null;
async function currentSite(){
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  try{const url=new URL(tab.url);autoHost=url.protocol==='https:'&&['chatgpt.com','claude.ai','gemini.google.com'].includes(url.hostname)&&!tab.incognito?url.hostname:null;}catch{autoHost=null;}
  $('siteName').textContent=autoHost||'Open ChatGPT, Claude or Gemini in a normal tab';
  $('enableSite').disabled=!autoHost;$('pauseSite').disabled=!autoHost;
  if(autoHost){const state=await chrome.runtime.sendMessage({type:'STATE',host:autoHost});$('siteState').textContent=state.enabled?(state.canCapture?'Site enabled; vault paired.':'Site enabled; capture needs vault pairing.'):'Off for this site';$('siteHints').checked=!!state.hints;}
}
$('enableSite').addEventListener('click',async()=>{
  if(!autoHost)return;
  try{
    const granted=await chrome.permissions.request({origins:[`https://${autoHost}/*`]});
    if(!granted){note('No site permission granted; capture stays off.');return;}
    const result=await chrome.runtime.sendMessage({type:'SET_SITE',host:autoHost,enabled:true,hints:$('siteHints').checked});
    if(!result.ok)throw Error(result.error);
    note('Only the known composer on this site is enabled. Send snapshots are not proof of delivery.');await currentSite();
  }catch(error){note(error.message||'Could not enable the site.');}
});
$('pauseSite').addEventListener('click',async()=>{if(autoHost){await chrome.runtime.sendMessage({type:'SET_SITE',host:autoHost,enabled:false,hints:false});await currentSite();note('Paused. No text retained for retry.');}});
void currentSite();

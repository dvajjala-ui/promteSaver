/* Manual preview plus explicit, per-site opt-in send-intent capture. No cloud inference. */
const permittedHosts = new Set([
  'chatgpt.com','chat.openai.com','claude.ai','gemini.google.com',
  'perplexity.ai','www.perplexity.ai','copilot.microsoft.com','poe.com',
  'aistudio.google.com','chat.deepseek.com','grok.com'
]);
const autoHosts=new Set(['chatgpt.com','claude.ai','gemini.google.com']);
const $ = id => document.getElementById(id);
function note(text) { $('message').textContent = text; }
const GAP_LABELS={
  'paused-or-permission':'Site paused or permission missing',
  'vault-unpaired':'Vault pairing unavailable',
  'authorization-changed':'Consent or pairing changed during capture',
  'vault-locked':'Vault locked or pairing expired',
  'rate-limit':'Capture rate limit reached',
  'service-rejected':'Local service rejected the capture',
  'save-unconfirmed':'Local save could not be confirmed',
  'capacity':'Two other captures were pending'
};
async function showGapHistory(){
  const list=$('gapList');list.replaceChildren();
  try{
    const entries=(await chrome.storage.session.get('promtesaver.gaps'))['promtesaver.gaps'];
    for(const entry of (Array.isArray(entries)?entries:[]).slice(-20).reverse()){
      if(!entry||!autoHosts.has(entry.host)||!Object.hasOwn(GAP_LABELS,entry.reason)||
         typeof entry.at!=='string'||!Number.isFinite(Date.parse(entry.at)))continue;
      const line=document.createElement('li');line.textContent=`${entry.host} · ${new Date(entry.at).toLocaleString()} · ${GAP_LABELS[entry.reason]}`;list.append(line);
    }
  }catch{/* Gap display cannot change capture authority. */}
  if(!list.children.length){const line=document.createElement('li');line.textContent='No recorded save gaps this browser session.';list.append(line);}
}
$('clearGaps').addEventListener('click',async()=>{try{await chrome.storage.session.remove('promtesaver.gaps');await showGapHistory();note('Content-free gap history cleared.');}catch{note('Could not clear gap history. Try again.');}});
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
  $('result').hidden = true; previewHost = null; $('preview').value=''; $('promptTitle').value=''; note('');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || !tab.url || tab.incognito) throw new Error('Open a supported AI tab first.');
    const u = new URL(tab.url); const host = u.hostname.toLowerCase();
    if (u.protocol !== 'https:' || !permittedHosts.has(host)) throw new Error('Site not on the privacy allowlist. No text read.');
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['editor-core.js']});
    const [result] = await chrome.scripting.executeScript({ target: {tabId:tab.id}, func: () => {
      return {...(globalThis.PromteEditor?.preview(location.href,document) || {error:'Preview unavailable. No text read.'}),host:location.hostname};
    } });
    const value = result?.result;
    if (!value || value.host!==host || typeof value.text !== 'string') throw new Error(value?.error || 'The tab changed or its focused editor is unavailable. Preview again.');
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
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 65535) {note('Invalid pairing code. Choose Connect browser in the Windows app, or use Settings in the source app.');return;}
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
void showGapHistory();

let autoHost=null,sitePermission=false;
async function currentSite(){
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  try{const url=new URL(tab.url);autoHost=url.protocol==='https:'&&autoHosts.has(url.hostname)&&!tab.incognito?url.hostname:null;}catch{autoHost=null;}
  $('siteName').textContent=autoHost||'Open ChatGPT, Claude or Gemini in a normal tab';
  $('enableSite').disabled=!autoHost;$('pauseSite').disabled=!autoHost;
  sitePermission=false;
  if(autoHost){
    try{sitePermission=await chrome.permissions.contains({origins:[`https://${autoHost}/*`]});}catch{sitePermission=false;}
    const state=await chrome.runtime.sendMessage({type:'STATE',host:autoHost});
    $('siteState').textContent=!sitePermission?'Site permission required; click Enable for this site.':state.enabled?(state.canCapture?'Site enabled; vault paired.':'Site enabled; capture needs vault pairing.'):'Off for this site';
    $('siteHints').checked=!!state.hints;
  }
}
$('enableSite').addEventListener('click',async()=>{
  if(!autoHost)return;
  try{
    const granted=sitePermission||await chrome.permissions.request({origins:[`https://${autoHost}/*`]});
    if(!granted){note('No site permission granted; capture stays off.');return;}
    const result=await chrome.runtime.sendMessage({type:'SET_SITE',host:autoHost,enabled:true,hints:$('siteHints').checked});
    if(!result.ok)throw Error(result.error);
    note('Only the known composer on this site is enabled. Send snapshots are not proof of delivery.');await currentSite();
  }catch(error){note(error.message||'Could not enable the site.');}
});
$('pauseSite').addEventListener('click',async()=>{if(autoHost){await chrome.runtime.sendMessage({type:'SET_SITE',host:autoHost,enabled:false,hints:false});await currentSite();note('Paused. No text retained for retry.');}});
void currentSite();

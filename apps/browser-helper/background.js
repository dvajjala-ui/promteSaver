/* Event-driven MV3 bridge: no prompt queue, polling, raw-text storage, or cloud access. */
const HOSTS=new Set(['chatgpt.com','claude.ai','gemini.google.com']);
const BRIDGE='promtesaver.bridge',SITES='promtesaver.sites';
let pendingRequests=0;
async function boundedResult(response){
  const reader=response.body?.getReader();if(!reader)throw Error('Empty bridge response');
  const chunks=[];let length=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;
    if(length>8192)throw Error('Oversized bridge response');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}).catch(()=>{});
chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}).catch(()=>{});
function source(sender){
  if(!sender.tab||sender.tab.incognito||sender.frameId!==0)return null;
  try{const u=new URL(sender.url);return u.protocol==='https:'&&HOSTS.has(u.hostname)?u.hostname:null;}catch{return null;}
}
function privileged(sender){return !sender.tab&&sender.url===chrome.runtime.getURL('popup.html');}
async function stateFor(host){
  const data=await chrome.storage.local.get(SITES),session=await chrome.storage.session.get(BRIDGE);
  const setting=data[SITES]?.[host],bridge=session[BRIDGE];
  const paired=!!bridge&&Number.isInteger(bridge.port)&&bridge.port>0&&bridge.port<=65535&&/^[a-f0-9]{64}$/.test(bridge.writeToken)&&bridge.expiresAt>Date.now();
  return {enabled:setting?.enabled===true,hints:setting?.hints===true,
    canCapture:paired&&Array.isArray(bridge.allowedCaptureHosts)&&bridge.allowedCaptureHosts.includes(host)};
}
async function broadcast(){
  for(const tab of await chrome.tabs.query({url:[...HOSTS].map(h=>`https://${h}/*`)}))
    if(tab.id)chrome.tabs.sendMessage(tab.id,{type:'STATE_CHANGED'}).catch(()=>{});
}
async function setSite(host,enabled,hints){
  if(!HOSTS.has(host))throw Error('Unsupported site.');
  if(enabled&&!await chrome.permissions.contains({origins:[`https://${host}/*`]}))throw Error('Site permission required.');
  const data=await chrome.storage.local.get(SITES),sites=data[SITES]||{};
  sites[host]={enabled:!!enabled,hints:!!hints};await chrome.storage.local.set({[SITES]:sites});
  const id='promte-'+host.replaceAll('.','-');
  await chrome.scripting.unregisterContentScripts({ids:[id]}).catch(()=>{});
  if(enabled){
    await chrome.scripting.registerContentScripts([{id,matches:[`https://${host}/*`],js:['editor-core.js','recorder.js'],runAt:'document_idle',allFrames:false,persistAcrossSessions:true}]);
    for(const tab of await chrome.tabs.query({url:`https://${host}/*`}))if(tab.id&&!tab.incognito)
      await chrome.scripting.executeScript({target:{tabId:tab.id},files:['editor-core.js','recorder.js']}).catch(()=>{});
  }
  await broadcast();return {ok:true,...await stateFor(host)};
}
async function handle(message,sender){
  if(!message||typeof message!=='object')return {ok:false,error:'Invalid message.'};
  const host=source(sender);
  if(message.type==='STATE'){
    const target=host||(privileged(sender)&&HOSTS.has(message.host)?message.host:null);
    return target?{ok:true,...await stateFor(target)}:{ok:false,enabled:false};
  }
  if(message.type==='SET_SITE'&&privileged(sender))return setSite(message.host,message.enabled===true,message.hints===true);
  if(message.type==='PAUSE_SITE'&&host)return setSite(host,false,false);
  if(message.type!=='CAPTURE'||!host)return {ok:false,error:'Not an approved top-level editor.'};
  const state=await stateFor(host);if(!state.enabled||!state.canCapture)return {ok:false,repair:true,error:'Not saved: site is paused or vault needs pairing.'};
  const e=message.event;
  if(!e||typeof e.text!=='string'||!e.text.trim()||e.text.length>50_000||
     typeof e.eventId!=='string'||!/^[a-f0-9-]{36}$/i.test(e.eventId)||!['send-click','enter'].includes(e.signal))return {ok:false,error:'Invalid capture.'};
  const {[BRIDGE]:bridge}=await chrome.storage.session.get(BRIDGE);
  // Re-read after every await; revoked pairings are never resurrected by an in-flight request.
  if(!bridge||bridge.expiresAt<=Date.now())return {ok:false,repair:true,error:'Vault pairing expired.'};
  if(pendingRequests>=2)return {ok:false,error:'Two captures are already pending. Nothing was queued.'};
  pendingRequests++;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000);
  try{
    const response=await fetch(`http://127.0.0.1:${bridge.port}/api/bridge/capture`,{method:'POST',cache:'no-store',redirect:'error',signal:controller.signal,
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${bridge.writeToken}`},
      body:JSON.stringify({eventId:e.eventId,text:e.text,recordedAt:e.recordedAt,signal:e.signal,host})});
    if(response.status===401||response.status===423){
      await response.body?.cancel().catch(()=>{});
      const current=await chrome.storage.session.get(BRIDGE);
      if(current[BRIDGE]?.writeToken===bridge.writeToken)await chrome.storage.session.remove(BRIDGE);
      return {ok:false,repair:true,error:'Not saved: unlock the vault and pair again.'};
    }
    if(!response.ok){await response.body?.cancel().catch(()=>{});return {ok:false,error:response.status===429?'Capture limit reached. Nothing was queued.':'Capture rejected. Check pairing and site consent.'};}
    const result=await boundedResult(response);
    return {ok:true,saved:result.saved===true,redactions:Number.isSafeInteger(result.redactions)?result.redactions:0};
  }catch{return {ok:false,error:'Vault unreachable. This prompt was not saved or queued.'};}
  finally{pendingRequests--;clearTimeout(timer);}
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  void handle(message,sender).then(respond,()=>respond({ok:false,error:'Local helper operation failed.'}));return true;
});
chrome.storage.onChanged.addListener((changes,area)=>{if((area==='session'&&changes[BRIDGE])||(area==='local'&&changes[SITES]))void broadcast().catch(()=>{});});
chrome.permissions.onRemoved.addListener(permissions=>{for(const host of HOSTS)if(permissions.origins?.includes(`https://${host}/*`))void setSite(host,false,false).catch(()=>{});});

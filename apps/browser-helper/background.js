/* Event-driven MV3 bridge: no prompt queue, polling, raw-text storage, or cloud access. */
const HOSTS=new Set(['chatgpt.com','claude.ai','gemini.google.com']);
const BRIDGE='promtesaver.bridge',SITES='promtesaver.sites',GAPS='promtesaver.gaps';
let pendingRequests=0;
let authorizationEpoch=0,siteChanges=Promise.resolve(),gapWrites=Promise.resolve();
const siteEpochs=new Map(),changingSites=new Set(),activeRequests=new Map();
const GAP_REASONS=new Set(['paused-or-permission','vault-unpaired','authorization-changed','vault-locked','rate-limit','service-rejected','save-unconfirmed','capacity']);
function recordGap(host,reason){
  if(!HOSTS.has(host)||!GAP_REASONS.has(reason))return Promise.resolve();
  const operation=gapWrites.then(async()=>{
    const current=(await chrome.storage.session.get(GAPS))[GAPS];
    const entries=Array.isArray(current)?current.filter(entry=>entry&&HOSTS.has(entry.host)&&GAP_REASONS.has(entry.reason)&&typeof entry.at==='string').slice(-19):[];
    entries.push({host,reason,at:new Date().toISOString()});
    await chrome.storage.session.set({[GAPS]:entries});
  });
  gapWrites=operation.catch(()=>{});
  return operation.catch(()=>{});
}
function invalidate(host){
  authorizationEpoch++;
  for(const [controller,requestHost] of activeRequests)if(!host||requestHost===host)controller.abort();
}
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
function validBridge(bridge,host){
  return !!bridge&&Number.isInteger(bridge.port)&&bridge.port>0&&bridge.port<=65535&&
    /^[a-f0-9]{64}$/.test(bridge.writeToken)&&bridge.expiresAt>Date.now()&&
    Array.isArray(bridge.allowedCaptureHosts)&&bridge.allowedCaptureHosts.includes(host);
}
async function authorityFor(host){
  const [data,session,permission]=await Promise.all([chrome.storage.local.get(SITES),chrome.storage.session.get(BRIDGE),
    chrome.permissions.contains({origins:[`https://${host}/*`]})]);
  const setting=data[SITES]?.[host],bridge=session[BRIDGE];
  const enabled=permission&&!changingSites.has(host)&&setting?.enabled===true;
  return {bridge,state:{enabled,hints:enabled&&setting?.hints===true,canCapture:enabled&&validBridge(bridge,host)}};
}
async function stateFor(host){return (await authorityFor(host)).state;}
async function broadcast(){
  for(const tab of await chrome.tabs.query({url:[...HOSTS].map(h=>`https://${h}/*`)}))
    if(tab.id)chrome.tabs.sendMessage(tab.id,{type:'STATE_CHANGED'}).catch(()=>{});
}
function setSite(host,enabled,hints){
  if(!HOSTS.has(host))throw Error('Unsupported site.');
  const epoch=(siteEpochs.get(host)||0)+1;siteEpochs.set(host,epoch);changingSites.add(host);invalidate(host);
  // Serialize read/modify/write and script registration across hosts. A later Pause
  // invalidates an earlier Enable immediately, including while Chrome is awaiting it.
  const operation=siteChanges.then(async()=>{
    const current=()=>siteEpochs.get(host)===epoch;
    const id='promte-'+host.replaceAll('.','-');
    try{
      if(!current())return;
      if(enabled&&!await chrome.permissions.contains({origins:[`https://${host}/*`]}))throw Error('Site permission required.');
      if(!current())return;
      const data=await chrome.storage.local.get(SITES),sites=data[SITES]||{};
      if(!current())return;
      sites[host]={enabled:!!enabled,hints:!!enabled&&!!hints};await chrome.storage.local.set({[SITES]:sites});
      await chrome.scripting.unregisterContentScripts({ids:[id]});
      if(enabled&&current()){
        await chrome.scripting.registerContentScripts([{id,matches:[`https://${host}/*`],js:['editor-core.js','recorder.js'],runAt:'document_idle',allFrames:false,persistAcrossSessions:true}]);
        for(const tab of await chrome.tabs.query({url:`https://${host}/*`}))if(current()&&tab.id&&!tab.incognito)
          await chrome.scripting.executeScript({target:{tabId:tab.id},files:['editor-core.js','recorder.js']}).catch(()=>{});
      }
    }catch(error){
      // Failed registration must not leave an enabled persisted choice behind.
      const data=await chrome.storage.local.get(SITES),sites=data[SITES]||{};
      sites[host]={enabled:false,hints:false};await chrome.storage.local.set({[SITES]:sites});
      await chrome.scripting.unregisterContentScripts({ids:[id]}).catch(()=>{});
      throw error;
    }finally{if(current())changingSites.delete(host);await broadcast().catch(()=>{});}
  });
  siteChanges=operation.catch(()=>{});
  return operation.then(async()=>({ok:true,...await stateFor(host)}));
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
  const epoch=authorizationEpoch;
  const authority=await authorityFor(host),state=authority.state;
  if(!state.enabled||!state.canCapture){await recordGap(host,state.enabled?'vault-unpaired':'paused-or-permission');return {ok:false,repair:true,error:'Not saved: site is paused or vault needs pairing.'};}
  const e=message.event;
  if(!e||typeof e.text!=='string'||!e.text.trim()||e.text.length>50_000||
     typeof e.eventId!=='string'||!/^[a-f0-9-]{36}$/i.test(e.eventId)||!['send-click','enter'].includes(e.signal))return {ok:false,error:'Invalid capture.'};
  const {[BRIDGE]:bridge}=await chrome.storage.session.get(BRIDGE);
  // Re-read after every await; revoked pairings are never resurrected by an in-flight request.
  if(epoch!==authorizationEpoch||changingSites.has(host)||!validBridge(bridge,host)||
    bridge.writeToken!==authority.bridge.writeToken||bridge.port!==authority.bridge.port){await recordGap(host,'authorization-changed');return {ok:false,repair:true,error:'Capture authorization changed. Check site consent and pairing.'};}
  if(pendingRequests>=2){await recordGap(host,'capacity');return {ok:false,error:'Two captures are already pending. Nothing was queued.'};}
  pendingRequests++;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000);
  activeRequests.set(controller,host);
  try{
    const response=await fetch(`http://127.0.0.1:${bridge.port}/api/bridge/capture`,{method:'POST',cache:'no-store',redirect:'error',signal:controller.signal,
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${bridge.writeToken}`},
      body:JSON.stringify({eventId:e.eventId,text:e.text,recordedAt:e.recordedAt,signal:e.signal,host})});
    if(response.status===401||response.status===423){
      await response.body?.cancel().catch(()=>{});
      const current=await chrome.storage.session.get(BRIDGE);
      if(current[BRIDGE]?.writeToken===bridge.writeToken)await chrome.storage.session.remove(BRIDGE);
      await recordGap(host,'vault-locked');
      return {ok:false,repair:true,error:'Not saved: unlock the vault and pair again.'};
    }
    if(!response.ok){await response.body?.cancel().catch(()=>{});await recordGap(host,response.status===429?'rate-limit':'service-rejected');return {ok:false,error:response.status===429?'Capture limit reached. Nothing was queued.':'Capture rejected. Check pairing and site consent.'};}
    const result=await boundedResult(response);
    if(!result||typeof result!=='object'||typeof result.saved!=='boolean')
      throw Error('Invalid bridge acknowledgement');
    if(epoch!==authorizationEpoch||controller.signal.aborted){await recordGap(host,'authorization-changed');return {ok:false,error:'Capture authorization changed. An already received request cannot be withdrawn.'};}
    return {ok:true,saved:result.saved===true,redactions:Number.isSafeInteger(result.redactions)?result.redactions:0};
  }catch{await recordGap(host,epoch!==authorizationEpoch?'authorization-changed':'save-unconfirmed');return {ok:false,error:epoch!==authorizationEpoch?
    'Capture consent changed. Check the vault; an already received request cannot be withdrawn.':
    'Could not confirm local save. Check the vault; no retry was queued.'};}
  finally{pendingRequests--;activeRequests.delete(controller);clearTimeout(timer);}
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  void handle(message,sender).then(respond,()=>respond({ok:false,error:'Local helper operation failed.'}));return true;
});
chrome.storage.onChanged.addListener((changes,area)=>{if((area==='session'&&changes[BRIDGE])||(area==='local'&&changes[SITES])){invalidate();void broadcast().catch(()=>{});}});
chrome.permissions.onRemoved.addListener(permissions=>{for(const host of HOSTS)if(permissions.origins?.includes(`https://${host}/*`))void setSite(host,false,false).catch(()=>{});});

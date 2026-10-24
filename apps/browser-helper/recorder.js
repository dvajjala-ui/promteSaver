/* Per-site, explicit opt-in recorder. Observes send intent, never claims server delivery. */
(() => {
  'use strict';
  if(globalThis.__promteRecorder)return;
  globalThis.__promteRecorder=true;
  const core=globalThis.PromteEditor,adapter=core?.adapters[location.hostname];
  if(!adapter || window.top!==window)return;
  let enabled=false,localHints=false,canCapture=false,editor=null,timer=null,lastHash='',lastAt=0,host=null,root=null;
  let epoch=0,stateRequest=0,composing=null,lastEditor=null;
  const clearTimer=()=>{clearTimeout(timer);timer=null;};
  const safePage=()=>{const safe=!document.hidden&&!core.privatePage(location.href,document);if(!safe)removeUI();return safe;};
  const send=async message=>{try{return await chrome.runtime.sendMessage(message)||{ok:false};}catch{return {ok:false,error:'Extension unavailable. Reload this tab.'};}};
  const textNode=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e;};
  function removeUI(keepDuplicate=false){epoch++;host?.remove();host=null;root=null;clearTimer();editor=null;composing=null;if(!keepDuplicate){lastHash='';lastEditor=null;}}
  function panel(){
    if(root)return root;
    host=document.createElement('div');host.setAttribute('data-promtesaver-assistant','');
    // This panel contains only the page's own text-derived hints, never vault secrets or Groq credentials.
    root=host.attachShadow({mode:'open'});
    const style=textNode('style',':host{all:initial;position:fixed;right:18px;bottom:18px;z-index:2147483000;font:12px/1.45 system-ui,sans-serif;color:#dce8e3}section{background:#15221e;border:1px solid #365647;border-radius:14px;box-shadow:0 6px 26px #0004;width:270px;padding:12px}header{display:flex;align-items:center;justify-content:space-between;gap:12px}strong{font-size:12px}button{font:inherit;background:#263e32;border:1px solid #4c6e5c;color:#d9f1e3;border-radius:7px;padding:4px 8px;cursor:pointer}button:focus-visible{outline:2px solid #abefcb}p{margin:9px 0 0;font-size:11px;color:#b3c8bd}ul{padding:0 0 0 15px;font-size:11px;margin:9px 0}small{display:block;color:#93ada0;font-size:10px;margin-top:8px}');
    const section=document.createElement('section');section.setAttribute('aria-label','promteSaver browser assistant');
    const header=document.createElement('header');header.append(textNode('strong','promteSaver / local'));
    const pause=textNode('button','Pause');pause.type='button';pause.onclick=async event=>{if(!event.isTrusted)return;stateRequest++;enabled=false;removeUI();await send({type:'PAUSE_SITE'});};header.append(pause);
    const status=textNode('p',canCapture?'Site enabled; vault checked on Send.':'Capture paused: unlock and pair the vault.');status.id='status';status.setAttribute('role','status');
    const list=document.createElement('ul');list.id='hints';
    section.append(header,status,list,textNode('small','Only this approved composer. No cloud calls while typing.'));
    root.append(style,section);document.documentElement.append(host);return root;
  }
  function note(text){if(enabled&&safePage())panel().querySelector('#status').textContent=text;}
  function candidate(target,scope){
    const direct=target instanceof Element?target.closest(adapter.editors):null;
    if(direct&&scope.contains(direct)&&core.eligible(direct))return direct;
    const visible=[...scope.querySelectorAll(adapter.editors)].filter(core.eligible);
    return visible.length===1?visible[0]:null;
  }
  async function state(){
    const request=++stateRequest;
    // Invalidate pending hints/acknowledgements before awaiting extension state.
    enabled=false;removeUI();
    const result=await send({type:'STATE'});
    if(request!==stateRequest)return;
    enabled=!!result.enabled;localHints=!!result.hints;canCapture=!!result.canCapture;
    if(!enabled||!safePage())removeUI();
  }
  function input(event){
    if(!enabled||!localHints||!event.isTrusted||event.isComposing||composing||!safePage())return;
    if(!(event.target instanceof Element)||core.blocked(event.target))return;
    const target=event.target instanceof Element?event.target.closest(adapter.editors):null;
    if(!core.eligible(target))return;
    editor=target;clearTimer();
    timer=setTimeout(()=>{
      timer=null;if(!enabled||!localHints||composing||!safePage()||!core.eligible(target)||!target.contains(document.activeElement))return;
      const value=core.read(target);const list=panel().querySelector('#hints');list.replaceChildren();
      if(value&&value.length<=12_000)for(const hint of core.hints(value))list.append(textNode('li',hint));
    },900);
  }
  async function capture(target,signal,scope=document){
    if(!enabled||!safePage()||composing||target instanceof Element&&core.blocked(target))return;
    editor=candidate(target,scope);const text=core.read(editor);if(!text)return;
    if(!canCapture){note('Not saved: unlock and pair your local vault.');return;}
    const hash=core.fingerprint(text),now=Date.now();
    if(editor===lastEditor&&hash===lastHash&&now-lastAt<1500)return;
    lastHash=hash;lastEditor=editor;lastAt=now;clearTimer();
    const generation=epoch;
    const result=await send({type:'CAPTURE',event:{eventId:crypto.randomUUID(),text,recordedAt:new Date(now).toISOString(),signal}});
    // Sites commonly clear or replace the composer after Send. The source was
    // checked before forwarding; removal must not hide the local save receipt.
    if(generation!==epoch||!enabled||!safePage())return;
    if(result.ok)note(result.saved ? result.redactions>0 ?
      `Saved locally / delivery not verified. ${result.redactions} sensitive match(es) redacted.` :
      'Saved locally / delivery not verified.' : 'Already saved.');
    else {lastHash='';if(result.repair)canCapture=false;note(result.error||'Not saved. Check the local vault.');}
  }
  function key(event){
    if(!event.isTrusted||event.isComposing||event.keyCode===229||event.repeat||event.key!=='Enter'||event.shiftKey||event.ctrlKey||event.altKey||event.metaKey)return;
    if(!(event.target instanceof Element)||!event.target.closest(adapter.editors))return;
    void capture(event.target,'enter');
  }
  function click(event){
    if(!event.isTrusted||!(event.target instanceof Element))return;
    const button=event.target.closest(adapter.send);
    if(!button||button.disabled||button.getAttribute('aria-disabled')==='true')return;
    void capture(document.activeElement,'send-click',button.closest('form')||document);
  }
  function focus(event){
    if(!enabled||!safePage()||!(event.target instanceof Element))return;
    const target=event.target.closest(adapter.editors);
    if(!core.blocked(event.target)&&core.eligible(target)){if(editor!==target)removeUI(true);editor=target;panel();}
    else if(!host?.contains(event.target))removeUI(true);
  }
  document.addEventListener('input',input,true);document.addEventListener('keydown',key,true);
  document.addEventListener('click',click,true);document.addEventListener('focusin',focus,true);
  document.addEventListener('compositionstart',event=>{const target=event.target instanceof Element?event.target.closest(adapter.editors):null;if(target){clearTimer();composing=target;root?.querySelector('#hints').replaceChildren();}},true);
  document.addEventListener('compositionend',()=>{composing=null;},true);
  document.addEventListener('visibilitychange',()=>{stateRequest++;enabled=false;removeUI();if(!document.hidden)void state();});
  window.addEventListener('pagehide',()=>{stateRequest++;enabled=false;removeUI();});
  window.addEventListener('pageshow',()=>void state());
  window.addEventListener('popstate',()=>removeUI());
  window.addEventListener('hashchange',()=>removeUI());
  chrome.runtime.onMessage.addListener(message=>{if(message?.type==='STATE_CHANGED')void state();});
  void state();
})();

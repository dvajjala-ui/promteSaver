/** Groq UI. Every cloud request follows a local payload preview and a fresh explicit consent. */
export function initAssistant({api,notice,unlocked,refresh,settings}) {
  const $=id=>document.getElementById(id);
  let generation=0,preview=null,busy=false,result=null,title='AI draft';
  function invalidate(){preview=null;result=null;$('aiPreviewWrap').hidden=true;$('aiPreviewText').value='';$('aiConsent').checked=false;$('aiSend').disabled=true;$('aiOutput').value='';$('aiSave').disabled=true;$('aiCopy').disabled=true;}
  function progress(value){busy=value;$('aiDialog').setAttribute('aria-busy',String(value));
    for(const id of ['aiInput','aiAction','aiStyle','aiPreview'])$(id).disabled=value;
    $('aiSend').disabled=value||!preview||!$('aiConsent').checked;$('aiCancel').hidden=!value;}
  function reset(){generation++;progress(false);invalidate();if($('aiDialog').open)$('aiDialog').close();
    for(const id of ['aiInput','aiOutput','aiPreviewText','groqKey'])$(id).value='';
    $('aiStatus').textContent='';$('groqState').textContent='';$('aiStyle').replaceChildren(new Option('No writing profile',''));}
  async function loadSettings(){const g=generation;try{const value=await api('/api/ai/settings');if(g!==generation||!unlocked())return;
    $('groqModel').value=value.model;$('groqEnabled').checked=value.enabled;
    $('groqState').textContent=value.configured?(value.enabled?'Configured. Text is sent only after preview and consent.':'Key saved, Groq disabled.'):'Not configured. No key has been saved on this device.';
    return value;
  }catch(error){if(g===generation&&unlocked())$('groqState').textContent=error.message;}}
  async function open(text='',name='AI draft'){
    if(!unlocked())return;reset();title=name;const g=generation;
    $('aiInput').value=text;$('aiStatus').textContent='Local until you review and approve a send. Groq output must be checked.';
    $('aiDialog').showModal();$('aiInput').focus();
    try{const [config,styles]=await Promise.all([api('/api/ai/settings'),api('/api/styles')]);if(g!==generation||!unlocked())return;
      $('aiStatus').textContent=config.configured&&config.enabled?`Groq / ${config.model}. Preview before sending. No examples from your writing profiles are shared.`:'Groq is not enabled. Configure the connection in Settings. Local preview still works.';
      for(const profile of styles.profiles)$('aiStyle').append(new Option(profile.name,profile.id));
    }catch(error){if(g===generation&&unlocked())$('aiStatus').textContent=error.message;}
  }
  $('groqSave').addEventListener('click',async()=>{const g=generation;$('groqSave').disabled=true;
    try{const data={apiKey:$('groqKey').value.trim(),model:$('groqModel').value.trim(),enabled:$('groqEnabled').checked};
      $('groqKey').value='';await api('/api/ai/settings','PUT',data);if(g!==generation||!unlocked())return;await loadSettings();notice('Groq settings saved encrypted on this device.');
    }catch(error){if(g===generation&&unlocked())$('groqState').textContent=error.message;}
    finally{$('groqSave').disabled=false;$('groqKey').value='';}});
  $('groqRemove').addEventListener('click',async()=>{const g=generation;try{await api('/api/ai/settings','DELETE');if(g!==generation||!unlocked())return;$('groqKey').value='';await loadSettings();notice('Groq key removed from the active vault. Old vault copies are not revoked.');}catch(error){if(g===generation&&unlocked())$('groqState').textContent=error.message;}});
  for(const id of ['aiInput','aiAction','aiStyle'])$(id).addEventListener('input',invalidate);
  $('aiPreview').addEventListener('click',async()=>{
    const data={text:$('aiInput').value,action:$('aiAction').value,styleId:$('aiStyle').value};
    const g=++generation;invalidate();progress(true);
    try{const p=await api('/api/ai/preview','POST',data);if(g!==generation||!unlocked())return;
      preview={...data,reviewDigest:p.reviewDigest};$('aiPreviewText').value=JSON.stringify(p.messages,null,2);$('aiPreviewWrap').hidden=false;
      $('aiStatus').textContent=`Local preview: ${p.redactions} obvious secret match(es) redacted. Review all contents; redaction cannot detect every secret.`;
    }catch(error){if(g===generation&&unlocked())$('aiStatus').textContent=error.message;}
    finally{if(g===generation)progress(false);}
  });
  $('aiConsent').addEventListener('change',()=>{$('aiSend').disabled=busy||!preview||!$('aiConsent').checked;});
  $('aiSend').addEventListener('click',async()=>{
    if(!preview||!$('aiConsent').checked||busy)return;
    const g=++generation,data={...preview,consent:true};progress(true);$('aiStatus').textContent='Sending the reviewed text to Groq. Original prompt remains unchanged.';
    try{const output=await api('/api/ai/run','POST',data);if(g!==generation||!unlocked())return;result=output;
      $('aiOutput').value=output.text;$('aiSave').disabled=false;$('aiCopy').disabled=false;
      $('aiStatus').textContent=`Draft returned by ${output.provider} / ${output.model}. ${output.truncated?'Output may be incomplete. ':''}Not saved. Review before copying or saving.`;
    }catch(error){if(g===generation&&unlocked())$('aiStatus').textContent=error.message;}
    finally{if(g===generation){$('aiConsent').checked=false;progress(false);}}
  });
  async function cancel(){generation++;progress(false);$('aiConsent').checked=false;$('aiSend').disabled=true;
    try{await api('/api/ai/cancel','POST',{});}catch{/* Lock or service stop already invalidates work. */}
    if(unlocked())$('aiStatus').textContent='Cancelled locally. A request already sent cannot be withdrawn from the provider.';
  }
  $('aiCancel').addEventListener('click',()=>void cancel());
  function close(){if(busy)void api('/api/ai/cancel','POST',{}).catch(()=>{});reset();}
  $('aiClose').addEventListener('click',close);$('aiDialog').addEventListener('cancel',event=>{event.preventDefault();close();});
  $('aiConfigLink').addEventListener('click',()=>{close();settings();$('groqKey').focus();});
  $('aiSave').addEventListener('click',async()=>{
    if(!result||!unlocked())return;const g=generation;const output=result;$('aiSave').disabled=true;
    try{await api('/api/items','POST',{title:(output.action+' - '+title).slice(0,140),body:output.text,kind:'prompt',project:'AI drafts',source:'Groq',tags:['ai-generated',output.action],notes:`Generated with ${output.model}. Review for accuracy. Original prompt was not changed.`});
      if(g!==generation||!unlocked())return;notice('Saved as a separate AI draft.');await refresh();
    }catch(error){if(g===generation&&unlocked()){$('aiStatus').textContent=error.message;$('aiSave').disabled=false;}}
  });
  $('aiCopy').addEventListener('click',async()=>{if(result&&unlocked())try{await navigator.clipboard.writeText(result.text);notice('Copied reviewed AI draft.');}catch{$('aiStatus').textContent='Clipboard unavailable. Select and copy the output manually.';}});
  return {open,reset,loadSettings};
}

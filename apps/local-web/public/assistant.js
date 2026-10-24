/** Groq UI. Every cloud request follows a local payload preview and a fresh explicit consent. */
export function initAssistant({api,notice,unlocked,refresh,settings}) {
  const $=id=>document.getElementById(id);
  let generation=0,preview=null,busy=false,result=null,title='AI draft';
  let sourceRef=null,reviewedUnderstanding=null;
  const refining=()=>['understand','extract'].includes($('aiAction').value);
  function actionState(){
    for(const value of ['understand','extract'])$('aiAction').querySelector(`option[value="${value}"]`).disabled=!sourceRef||value==='extract'&&!reviewedUnderstanding;
    $('aiInput').readOnly=refining();$('aiStyle').disabled=busy||refining();
    if(refining()){$('aiStyle').value='';if(sourceRef)$('aiInput').value=sourceRef.body;}
  }
  function invalidate(){preview=null;result=null;$('aiPreviewWrap').hidden=true;$('aiPreviewText').value='';$('aiConsent').checked=false;$('aiSend').disabled=true;$('aiOutput').value='';$('aiSave').disabled=true;$('aiCopy').disabled=true;
    $('aiReviewUnderstanding').hidden=true;$('aiCandidates').hidden=true;$('aiCandidateList').replaceChildren();}
  function progress(value){busy=value;$('aiDialog').setAttribute('aria-busy',String(value));
    for(const id of ['aiInput','aiAction','aiStyle','aiPreview'])$(id).disabled=value;
    $('aiSend').disabled=value||!preview||!$('aiConsent').checked;$('aiCancel').hidden=!value;actionState();}
  function reset(){generation++;progress(false);invalidate();if($('aiDialog').open)$('aiDialog').close();
    for(const id of ['aiInput','aiOutput','aiPreviewText','groqKey'])$(id).value='';
    sourceRef=null;reviewedUnderstanding=null;$('aiAction').value='improve';actionState();
    $('aiStatus').textContent='';$('groqState').textContent='';$('aiSourceContext').textContent='';$('aiStyle').replaceChildren(new Option('No writing profile',''));}
  async function loadSettings(){const g=generation;try{const value=await api('/api/ai/settings');if(g!==generation||!unlocked())return;
    $('groqModel').value=value.model;$('groqEnabled').checked=value.enabled;
    $('groqState').textContent=value.configured?(value.enabled?'Configured. Text is sent only after preview and consent.':'Key saved, Groq disabled.'):'Not configured. No key has been saved on this device.';
    return value;
  }catch(error){if(g===generation&&unlocked())$('groqState').textContent=error.message;}}
  async function open(text='',name='AI draft',source=null){
    if(!unlocked())return;reset();title=name;const g=generation;
    sourceRef=source?{id:source.id,etag:source.etag,project:source.project,body:text}:null;actionState();
    $('aiSourceContext').textContent=sourceRef?`Saved source: ${name} · ${source.project||'Unassigned'}. Refine it in two reviewed steps.`:'Choose AI assist on a saved prompt to extract reusable instructions.';
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
  for(const id of ['aiInput','aiAction','aiStyle'])$(id).addEventListener('input',()=>{reviewedUnderstanding=null;invalidate();actionState();});
  $('aiPreview').addEventListener('click',async()=>{
    const data={text:$('aiInput').value,action:$('aiAction').value,styleId:refining()?'':$('aiStyle').value,
      ...(refining()&&sourceRef?{sourceId:sourceRef.id,sourceETag:sourceRef.etag}:{}),
      ...($('aiAction').value==='extract'?{understanding:reviewedUnderstanding,reviewedUnderstanding:true}:{})};
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
      $('aiOutput').value=output.structured?JSON.stringify(output.structured,null,2):output.text;$('aiSave').disabled=['understand','extract'].includes(output.action);$('aiCopy').disabled=false;
      if(output.action==='understand')$('aiReviewUnderstanding').hidden=false;
      if(output.action==='extract')renderCandidates(output.structured?.blocks||[]);
      $('aiStatus').textContent=`Draft returned by ${output.provider} / ${output.model}. ${output.truncated?'Output may be incomplete. ':''}Not saved. Review before copying or saving.`;
    }catch(error){if(g===generation&&unlocked())$('aiStatus').textContent=error.message;}
    finally{if(g===generation){$('aiConsent').checked=false;progress(false);}}
  });
  $('aiReviewUnderstanding').addEventListener('click',()=>{
    if(busy||result?.action!=='understand'||!result.structured||!sourceRef)return;
    const understood=result.structured;invalidate();reviewedUnderstanding=understood;$('aiAction').value='extract';actionState();
    $('aiStatus').textContent='Understanding accepted for this extraction. Preview the second request and approve it separately; nothing has been sent.';
  });
  function renderCandidates(blocks){
    $('aiCandidates').hidden=false;const list=$('aiCandidateList');list.replaceChildren();
    if(!blocks.length){const p=document.createElement('p');p.textContent='No reusable instruction candidates were returned. Your original is unchanged.';list.append(p);return;}
    for(const candidate of blocks){
      const row=document.createElement('article'),heading=document.createElement('strong'),quote=document.createElement('blockquote'),reason=document.createElement('p');
      heading.textContent=candidate.title;quote.textContent=candidate.quote;reason.textContent=candidate.reason;
      const label=document.createElement('label'),scope=document.createElement('select');label.textContent='Reuse scope (task: manual only; project: matching project only)';
      scope.append(new Option('This task only','task'),new Option('This project','project'),new Option('Personal','personal'));
      scope.querySelector('option[value="project"]').disabled=!sourceRef?.project;label.append(scope);
      const save=document.createElement('button');save.type='button';save.className='btn outline';save.textContent='Save reviewed instruction';
      const dismiss=document.createElement('button');dismiss.type='button';dismiss.className='btn subtle';dismiss.textContent='Dismiss';dismiss.onclick=()=>{if(!save.disabled)row.remove();};
      save.onclick=async()=>{
        if(save.disabled||!sourceRef||!unlocked())return;const g=generation,source=sourceRef;save.disabled=true;dismiss.disabled=true;scope.disabled=true;
        try{await api('/api/refinements/save','POST',{sourceId:source.id,sourceETag:source.etag,title:candidate.title,quote:candidate.quote,scope:scope.value,reviewed:true});
          if(g!==generation||!unlocked())return;save.textContent='Saved as template';notice('Reviewed instruction saved separately; original unchanged.');await refresh();
        }catch(error){if(g===generation&&unlocked()){$('aiStatus').textContent=error.message;save.disabled=false;dismiss.disabled=false;scope.disabled=false;}}
      };
      row.append(heading,quote,reason,label,save,dismiss);list.append(row);
    }
  }
  async function cancel(){generation++;progress(false);$('aiConsent').checked=false;$('aiSend').disabled=true;
    try{await api('/api/ai/cancel','POST',{});}catch{/* Lock or service stop already invalidates work. */}
    if(unlocked())$('aiStatus').textContent='Cancelled locally. A request already sent cannot be withdrawn from the provider.';
  }
  $('aiCancel').addEventListener('click',()=>void cancel());
  function close(){if(busy)void api('/api/ai/cancel','POST',{}).catch(()=>{});reset();}
  $('aiClose').addEventListener('click',close);$('aiDialog').addEventListener('cancel',event=>{event.preventDefault();close();});
  $('aiConfigLink').addEventListener('click',()=>{close();settings();$('groqKey').focus();});
  $('aiSave').addEventListener('click',async()=>{
    if(!result||!unlocked()||['understand','extract'].includes(result.action))return;const g=generation;const output=result;$('aiSave').disabled=true;
    try{await api('/api/items','POST',{title:(output.action+' - '+title).slice(0,140),body:output.text,kind:'prompt',project:'AI drafts',source:'Groq',tags:['ai-generated',output.action],notes:`Generated with ${output.model}. Review for accuracy. Original prompt was not changed.`});
      if(g!==generation||!unlocked())return;notice('Saved as a separate AI draft.');await refresh();
    }catch(error){if(g===generation&&unlocked()){$('aiStatus').textContent=error.message;$('aiSave').disabled=false;}}
  });
  $('aiCopy').addEventListener('click',async()=>{if(result&&unlocked())try{await navigator.clipboard.writeText(result.text);notice('Copied reviewed AI draft.');}catch{$('aiStatus').textContent='Clipboard unavailable. Select and copy the output manually.';}});
  return {open,reset,loadSettings};
}

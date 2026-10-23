/* Isolated UI-only fixture. NOT a replacement for the real service or crypto tests.
 * Every request stays in this page; no browser security policy is disabled or bypassed. */
(() => {
  const storage=new Map([['promtesaver.session','a'.repeat(64)]]);
  Object.defineProperty(window,'sessionStorage',{configurable:true,value:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)}});
  const state={initialized:false,unlocked:false,password:'',deadline:0,idleMs:900000,serial:0,items:[],drafts:[],histories:{},preferences:{idleMinutes:15,lowMemory:false,compactMode:false,lockOnHide:false},delayItems:0,delayAuth:0,authEpoch:0,operation:null,requests:[],styles:[],styleSerial:0};
  window.__fixture=state;
  const copy=value=>structuredClone(value);
  const add=value=>{const now=new Date().toISOString();const item={id:`fixture-${++state.serial}`,title:'Prompt',body:'Synthetic text',kind:'prompt',project:'',tags:[],pinned:false,notes:'',source:'',createdAt:now,updatedAt:now,revision:1,useCount:0,lastUsedAt:null,deletedAt:null,redactions:0,...value,etag:`"fixture-version-${++state.serial}"`};state.items.push(item);return item;};
  state.add=add;
  const renew=()=>state.deadline=Date.now()+state.idleMs;
  const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','X-Vault-Lock-At':state.unlocked?String(state.deadline):'0','X-Vault-Now':String(Date.now())}});
  const problem=(message,status=400)=>respond({error:message},status);
  window.fetch=async(input,options={})=>{
    const url=new URL(String(input),'http://fixture.invalid');const path=url.pathname;const method=options.method??'GET';
    state.requests.push({path,method});
    if(state.unlocked && Date.now()>=state.deadline)state.unlocked=false;
    if(!['/api/status','/api/diagnostics'].includes(path)&&state.unlocked)renew();
    const payload=options.body?JSON.parse(options.body):{};
    if(path==='/api/status')return respond({initialized:state.initialized,unlocked:state.unlocked,idleMinutes:state.idleMs/60000,keyFormat:state.initialized?2:null,lockAt:state.unlocked?state.deadline:null,version:'0.9.0',operation:state.operation});
    if(path==='/api/setup'){
      const epoch=state.authEpoch;state.operation='setup';
      if(state.delayAuth)await new Promise(resolve=>setTimeout(resolve,state.delayAuth));
      state.operation=null;if(epoch!==state.authEpoch)return problem('Operation cancelled',423);
      state.initialized=true;state.unlocked=true;state.password=payload.passphrase;renew();return respond({ok:true},201);
    }
    if(path==='/api/unlock'){
      const epoch=state.authEpoch;state.operation='unlock';
      if(state.delayAuth)await new Promise(resolve=>setTimeout(resolve,state.delayAuth));
      state.operation=null;if(epoch!==state.authEpoch)return problem('Operation cancelled',423);
      if(payload.passphrase!==state.password)return problem('Could not unlock vault',401);state.unlocked=true;renew();return respond({ok:true});
    }
    if(path==='/api/lock'){state.authEpoch++;state.unlocked=false;return respond({ok:true});}
    if(!state.unlocked)return problem('Vault is locked',423);
    if(path==='/api/ai/settings'){
      if(method==='PUT')state.ai={...payload,apiKey:payload.apiKey||state.ai?.apiKey};
      if(method==='DELETE')state.ai=null;
      return respond({configured:!!state.ai,enabled:state.ai?.enabled||false,model:state.ai?.model||'llama-3.3-70b-versatile',saved:true});
    }
    if(path==='/api/ai/cancel'){state.aiGeneration=(state.aiGeneration||0)+1;return respond({cancelled:true});}
    if(path==='/api/ai/preview'){
      if(!payload.text?.trim()||payload.text.length>12000)return problem('Invalid text');
      const text=payload.text.replace(/gsk_[A-Za-z0-9_-]{12,}/g,'[REDACTED]');
      return respond({text,action:payload.action,messages:[{role:'system',content:'Synthetic transformation instructions'},{role:'user',content:text}],style:'',reviewDigest:'fixture-preview-digest',redactions:text===payload.text?0:1});
    }
    if(path==='/api/ai/run'){
      if(!state.ai?.enabled||!payload.consent)return problem('Configure Groq and consent first');
      const generation=state.aiGeneration||0,epoch=state.authEpoch;
      state.aiCalls=(state.aiCalls||0)+1;
      if(state.aiDelay)await new Promise(resolve=>setTimeout(resolve,state.aiDelay));
      if(epoch!==state.authEpoch||generation!==(state.aiGeneration||0))return problem('Cancelled',409);
      return respond({text:'Synthetic AI draft: '+payload.text,provider:'groq',model:state.ai.model,action:payload.action,redactions:0,saved:false});
    }
    if(path==='/api/diagnostics')return respond({schema:'promtesaver-diagnostics-v1',version:'0.9.0',
      runtime:{node:'24.16.0',supportedNode:true,expectedNode:'>=24.16.0 <25',platform:'fixture',architecture:'synthetic'},
      resources:{profile:state.preferences.lowMemory?'low-memory':'standard',serviceRssMiB:102.4,serviceHeapMiB:9.5,uptimeSeconds:60,
        lowMemoryRecommended:true,secureOperation:state.operation,maxConcurrentSecureOperations:1},
      storage:{sizeMiB:1.2,keyFormat:2,recordEncryption:'AES-256-GCM',wholeDatabaseEncryption:false,portableBackupLimitMiB:12},
      privacy:{telemetry:false,automaticCapture:false,cloudSync:false,externalAI:false},limitations:['Synthetic fixture figures; not a resource measurement.']});
    if(path==='/api/activity')return respond({ok:true});
    if(path==='/api/preferences'){if(method==='PUT'){state.preferences=payload;state.idleMs=payload.idleMinutes*60000;renew();}return respond(state.preferences);}
    if(path==='/api/passphrase'){if(payload.current!==state.password)return problem('Could not unlock vault',401);if(payload.replacement!==payload.confirm)return problem('Passphrases do not match');state.password=payload.replacement;state.unlocked=false;return respond({changed:true,locked:true});}
    if(path==='/api/drafts' && method==='GET')return respond({drafts:copy(state.drafts).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))});
    const draftMatch=/^\/api\/drafts\/([a-f0-9-]{36})$/i.exec(path);
    if(draftMatch){
      if(method==='DELETE'){const original=state.drafts.length;state.drafts=state.drafts.filter(d=>d.id!==draftMatch[1]);return respond({deleted:state.drafts.length!==original});}
      if(method==='PUT'){const draft={...payload,updatedAt:new Date().toISOString()};state.drafts=state.drafts.filter(d=>d.id!==draft.id);state.drafts.push(draft);return respond({draft});}
    }
    if(path==='/api/writing/check'&&method==='POST'){
      const issues=[];for(const m of payload.text.matchAll(/(?<=\S) {2,}(?=\S)/g))issues.push({kind:'spacing',start:m.index,end:m.index+m[0].length,before:m[0],replacement:' ',message:'Extra spaces between words.'});
      return respond({issues,engine:'lightweight-heuristics-v1',language:'en'});
    }
    if(path==='/api/styles/analyze' && method==='POST'){
      if(!Array.isArray(payload.samples)||!payload.samples.length)return problem('Invalid writing samples');
      const text=payload.samples.join(' ');
      return respond({redactions:0,profile:{schemaVersion:1,sampleCount:payload.samples.length,wordCount:text.split(/\s+/).length,
        meanSentenceWords:10,meanParagraphWords:30,tendencies:{contractions:'sometimes',questions:'rarely',exclamations:'rarely',lists:'rarely'},
        preferredPhrases:[],examples:payload.samples.map(s=>s.slice(0,700)),preferences:{tone:payload.preferences?.tone||'Natural',audience:payload.preferences?.audience||'Everyone',avoid:payload.preferences?.avoid||[]}}});
    }
    if(path==='/api/styles'){
      if(method==='GET')return respond({profiles:state.styles.map(item=>({id:item.id,name:item.name,createdAt:item.createdAt,updatedAt:item.updatedAt,
        revision:item.revision,redactions:item.redactions,sampleCount:item.profile.sampleCount,wordCount:item.profile.wordCount,tone:item.profile.preferences.tone}))});
      if(method==='POST'){
        const now=new Date().toISOString();const item={...payload,id:`style-${++state.styleSerial}`,createdAt:now,updatedAt:now,revision:1,redactions:0,etag:`"style-${++state.serial}"`};
        state.styles.push(item);return respond({style:copy(item),etag:item.etag},201);
      }
    }
    const styleMatch=/^\/api\/styles\/(style-\d+)(?:\/(prompt))?$/.exec(path);
    if(styleMatch){
      const item=state.styles.find(s=>s.id===styleMatch[1]);if(!item)return problem('Writing profile not found',404);
      if(styleMatch[2]==='prompt'&&method==='POST'){
        const examples=payload.includeExamples?item.profile.examples.join('\n'):'';
        return respond({prompt:`Write in this style: ${item.profile.preferences.tone}\n\n${examples}\n\nTASK: ${payload.task}`,includesExamples:!!payload.includeExamples});
      }
      if(method==='GET')return respond({style:copy(item),etag:item.etag});
      if(method==='PUT'){
        if(options.headers?.['If-Match']!==item.etag)return problem('This writing profile changed in another window.',412);
        Object.assign(item,copy(payload));item.revision++;item.updatedAt=new Date().toISOString();item.etag=`"style-${++state.serial}"`;
        return respond({style:copy(item),etag:item.etag});
      }
      if(method==='DELETE'){
        if(options.headers?.['If-Match']!==item.etag)return problem('This writing profile changed in another window.',412);
        state.styles=state.styles.filter(s=>s.id!==item.id);return respond({deleted:true});
      }
    }
    if(path==='/api/summary'){const active=state.items.filter(i=>!i.deletedAt);return respond({library:{all:active.length,pinned:active.filter(i=>i.pinned).length,templates:active.filter(i=>i.kind==='template').length},trash:state.items.filter(i=>i.deletedAt).length,captured:{records:0,pending:0,tombstones:0}});}
    if(path==='/api/facets'){const names=key=>[...new Set(state.items.filter(i=>!i.deletedAt).flatMap(i=>key==='tags'?i.tags:[i.project]).filter(Boolean))].map(name=>({name,count:state.items.filter(i=>!i.deletedAt&&(key==='tags'?i.tags.includes(name):i.project===name)).length}));return respond({projects:names('project'),tags:names('tags')});}
    if(path==='/api/bridge/status')return respond({active:false,expiresAt:null});
    if(path==='/api/bridge/start')return respond({pairingCode:'psv2:12345:'+'c'.repeat(64)});
    if(path==='/api/bridge/revoke')return respond({revoked:true});
    if(path==='/api/captured')return respond({items:[]});
    if(path==='/api/examples'){
      if(state.items.length)return problem('Examples are only available for an empty library',409);
      for(const [title,body,kind,project,tags]of [
        ['Review a pull request','Review this change for correctness, security and regression risk. Cite files and recommend focused tests.','prompt','Development',['review','coding']],
        ['Explain a bug clearly','Analyze {{error}} in {{environment}}. Suggest a small, safe diagnostic step.','template','Development',['debugging']],
        ['Architecture decision review','Evaluate {{proposal}}. Identify assumptions, failure modes and migration tradeoffs.','template','Development',['architecture']],
        ['Write a professional email','Write to {{recipient}} about {{topic}} in a clear, respectful tone.','template','Everyday',['writing']],
        ['Summarize meeting actions','Extract decisions and action items from {{notes}}. Do not invent owners.','template','Everyday',['meetings']],
        ['Research with sources','Research {{question}} using dated primary sources; distinguish evidence from speculation.','template','Research',['research']],
        ['Plan a test strategy','Propose unit and integration tests for {{feature}}. Prioritize likely failures.','template','Development',['testing']],
        ['Explain it simply','Explain {{topic}} using one concrete example and no unexplained jargon.','template','Learning',['learning']],
        ['Turn feedback into actions','Turn {{feedback}} into a specific, realistic action plan.','template','Everyday',['planning']]
      ])add({title,body,kind,project,tags,pinned:title==='Review a pull request'});
      return respond({items:state.items},201);
    }
    if(path==='/api/items/batch'){
      for(const ref of payload.entries){const item=state.items.find(i=>i.id===ref.id);if(!item||item.etag!==ref.etag)return problem('This prompt changed in another window.',412);}
      for(const ref of payload.entries){const item=state.items.find(i=>i.id===ref.id);if(payload.operation==='pin')item.pinned=true;if(payload.operation==='unpin')item.pinned=false;if(payload.operation==='move')item.project=payload.project;if(payload.operation==='trash')item.deletedAt=new Date().toISOString();if(payload.operation==='restore')item.deletedAt=null;item.etag=`"fixture-version-${++state.serial}"`;}
      return respond({changed:payload.entries.length});
    }
    if(path==='/api/items'){
      if(method==='POST')return respond({item:add(payload),redactions:0},201);
      const filter=url.searchParams.get('filter')??'all';const q=(url.searchParams.get('q')??'').toLowerCase();const project=url.searchParams.get('project');const tag=url.searchParams.get('tag');
      let items=state.items.filter(i=>filter==='trash'?!!i.deletedAt:!i.deletedAt).filter(i=>filter==='pinned'?i.pinned:filter==='templates'?i.kind==='template':filter==='recent'?i.useCount>0:true);
      items=items.filter(i=>q.split(/\s+/).every(term=>`${i.title} ${i.body} ${i.project} ${i.tags.join(' ')} ${i.notes}`.toLowerCase().includes(term))&&(!project||i.project===project)&&(!tag||i.tags.includes(tag)));
      items=items.slice().sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));
      const offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit')??40);
      const previewLength=state.preferences.lowMemory?420:1600;
      const page=items.slice(offset,offset+limit).map(item=>{
        if(url.searchParams.get('view')!=='preview'||(item.body.length<=previewLength&&item.notes.length<=240))return item;
        return {...item,body:item.body.slice(0,previewLength),notes:item.notes.slice(0,240),preview:true};
      });
      const result=copy({items:page,total:items.length,offset,limit});
      if(state.delayItems)await new Promise(resolve=>setTimeout(resolve,state.delayItems));return respond(result);
    }
    if(path==='/api/backup/export')return new Response(JSON.stringify({items:state.items}),{headers:{'Content-Type':'application/octet-stream'}});
    if(path==='/api/backup/preview'||path==='/api/backup/import'){
      const backup=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(payload.backup),c=>c.charCodeAt(0))));
      const fresh=backup.items.filter(item=>!state.items.some(existing=>existing.id===item.id));
      if(path.endsWith('/preview'))return respond({imported:fresh.length,skipped:backup.items.length-fresh.length,conflicts:0,captures:0,deletions:0,legacy:false});
      state.items.push(...fresh);return respond({imported:fresh.length,skipped:backup.items.length-fresh.length,captures:0});
    }
    const match=/^\/api\/items\/([^/]+)(?:\/(.+))?$/.exec(path);
    if(match){
      const item=state.items.find(i=>i.id===match[1]);if(!item)return problem('Library item not found',404);
      const precondition=options.headers?.['If-Match'];if(precondition&&precondition!==item.etag)return new Response(JSON.stringify({error:'This prompt changed in another window. Reopen it or save your draft as a new prompt.',code:'EDIT_CONFLICT'}),{status:412,headers:{'Content-Type':'application/json'}});
      const action=match[2];if(action==='history')return respond({revisions:state.histories[item.id]??[]});
      if(action==='use'){item.useCount++;return respond({item});}
      if(action==='duplicate')return respond({item:add({...copy(item),id:`fixture-${++state.serial}`,title:'Copy of '+item.title}),redactions:0},201);
      if(action==='undelete'){item.deletedAt=null;item.etag=`"fixture-version-${++state.serial}"`;return respond({item});}
      if(action==='purge'){state.items=state.items.filter(i=>i.id!==item.id);return respond({deleted:true});}
      if(method==='DELETE'){item.deletedAt=new Date().toISOString();item.etag=`"fixture-version-${++state.serial}"`;return respond({deleted:true});}
      if(method==='PUT'){(state.histories[item.id]??=[]).unshift(copy(item));Object.assign(item,payload,{revision:item.revision+1,etag:`"fixture-version-${++state.serial}"`});return respond({item,redactions:0});}
      return respond({item});
    }
    return problem('Not found',404);
  };
})();

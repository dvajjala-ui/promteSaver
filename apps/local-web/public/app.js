import { parseTemplate, fillTemplate } from './template-engine.js';
import { initAssistant } from './assistant.js';
/* promteSaver Local Beta — no trackers, frameworks, CDN imports or implicit capture. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let memoryToken = null;
  const session = {get(){try{return sessionStorage.getItem('promtesaver.session')||memoryToken;}catch{return memoryToken;}},set(value){memoryToken=value;try{sessionStorage.setItem('promtesaver.session',value);}catch{/* An in-memory session still works in restricted webviews. */}}};
  const tokenInUrl = location.hash.startsWith('#') ? location.hash.slice(1) : '';
  if (/^[a-f0-9]{64}$/.test(tokenInUrl)) {
    session.set(tokenInUrl);
    history.replaceState(null, '', location.pathname);
  }
  const token = session.get();
  let PAGE_SIZE = 40;
  const LABELS = {
    all: ['Prompt history', 'Your saved prompts and editable copies, ready to find and reuse.'],
    pinned: ['Pinned favorites', 'The instructions you reach for most often.'],
    templates: ['Templates', 'Your reusable instructions, ready to adapt.'],
    recent: ['Recently used', 'Prompts you have copied and reused.'],
    trash: ['Trash', 'Restore deleted items or permanently remove them.'],
    captured: ['Captured prompts', 'Browser send-intent snapshots and synthetic evidence. Delivery is not verified.']
  };
  let section = 'all'; let pageOffset = 0; let total = 0;
  let currentItems = []; let editingId = null; let initialized = false;
  let wbItem=null,wbRequest=0,wbLayout='cards',wbVisible=true,wbFocus=false;
  let searchTimer; let queryCounter = 0; let quickCounter = 0; let recallRequest = 0; let toastTimer;
  let quickItems = []; let quickIndex = 0; let templateItem = null;
  let templateFields = []; let backupMode = 'export'; let importFile = null; let retentionReview = null;
  let sessionEpoch = 0; let uiUnlocked = false; let deadlineTimer; let statusTimer;
  let serverDeadline = 0; let latestServerTime = 0; let localDeadline = 0;
  let preferences = {idleMinutes:15,lowMemory:false,compactMode:false,lockOnHide:false};
  let editingETag; let editorInitial = ''; const selected = new Set();
  let backupReviewed = false; let pendingBackupData = null;
  let activeDraftId = null; let draftTimer = null; let draftQueue = Promise.resolve(); let savedDraftIds = new Set();
  let authAttempt = 0; let runtimeReport = null;
  let captureRequest = 0, captureReviewRequest = 0;
  let channel = null;
  try { if(typeof BroadcastChannel==='function')channel=new BroadcastChannel('promtesaver-vault'); } catch { /* Deadline checks still work without inter-tab messaging. */ }
  // Writing DNA is fully opt-in and loaded only when the user opens Writing Studio.
  let activeStyle = null; let activeStyleId = null; let activeStyleETag = null;
  let styleWork = null; let styleAnalyzedSamples = ''; let styleSavedFields = '';
  let styleGeneration = 0; let styleLoadGeneration = 0; let proofGeneration=0;
  const styleDownloadUrls = new Set();
  let dialogResolve = null;
  function answerDialog(accepted) {
    const resolve=dialogResolve; dialogResolve=null;
    const result=accepted ? ($('actionInputWrap').hidden ? true : $('actionInput').value) : null;
    if($('actionDialog').open)$('actionDialog').close();
    $('actionMessage').textContent='';$('actionInput').value='';
    resolve?.(result);
  }
  function ask(message, options={}) {
    if(!uiUnlocked)return Promise.resolve(null);
    answerDialog(false);
    $('actionMessage').textContent=message;
    $('actionTitle').textContent=options.title||'Please confirm';
    $('actionInputWrap').hidden=options.input===undefined;
    $('actionInput').value=options.input??''; $('actionInput').readOnly=!!options.readOnly;
    $('actionInputLabel').textContent=options.readOnly?'Select text and copy with Ctrl / Cmd + C':'Value';
    $('actionAccept').textContent=options.accept||'Continue';
    $('actionDialog').showModal();
    if(options.input!==undefined){$('actionInput').focus();if(options.readOnly)$('actionInput').select();}else{$('actionCancel').focus();}
    return new Promise(resolve=>{dialogResolve=resolve;});
  }
  const broadcast = message => channel?.postMessage(message);
  function applyDeadline(at, serverNow, share = true) {
    if (!at || !serverNow || serverNow < latestServerTime) return;
    latestServerTime = serverNow; serverDeadline = at;
    localDeadline = Date.now() + Math.max(0, at - serverNow);
    clearTimeout(deadlineTimer);
    deadlineTimer = setTimeout(() => {
      if (uiUnlocked) { showGate(true); broadcast({type:'locked'}); }
    }, Math.max(0, localDeadline - Date.now()) + 5);
    if (share) broadcast({type:'deadline',at,serverNow});
  }
  if (channel) channel.onmessage = event => {
    if (event.data?.type === 'locked' && uiUnlocked) showGate(true);
    if (event.data?.type === 'deadline' && uiUnlocked) applyDeadline(event.data.at,event.data.serverNow,false);
    if (event.data?.type === 'drafts-changed' && uiUnlocked) void loadDrafts();
  };
  async function checkSession() {
    if (!uiUnlocked || document.hidden) return;
    try { const result = await api('/api/status'); if (!result.unlocked && uiUnlocked) showGate(true); }
    catch { if (uiUnlocked) { showGate(true); $('gateError').textContent='The local service could not be reached. Reopen it before unlocking.'; } }
  }


  function node(tag, className = '', content) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content !== undefined) element.textContent = content;
    return element;
  }
  function button(label, title, click, className = '') {
    const element = node('button', className, label);
    element.type = 'button'; element.title = title; element.setAttribute('aria-label', title);
    element.addEventListener('click', click);
    return element;
  }
  function notice(message) {
    if (!uiUnlocked) return;
    $('toast').textContent = message; $('toast').classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3900);
  }
  function createDraftId() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128;
    const hex = [...bytes].map(n => n.toString(16).padStart(2,'0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }
  function editorDraftPayload(id) {
    return { id, title:$('entryTitle').value, body:$('entryBody').value,
      kind:$('entryKind').value, project:$('entryProject').value, tags:$('entryTags').value,
      pinned:$('entryPinned').checked, notes:$('entryNotes').value, source:$('entrySource').value };
  }
  function persistDraft() {
    clearTimeout(draftTimer); draftTimer=null;
    if (!uiUnlocked || !$('editorDialog').open || !editorDirty() || !activeDraftId) return draftQueue;
    const id=activeDraftId, epoch=sessionEpoch, data=editorDraftPayload(id);
    // Serialized writes ensure a later discard never races an older autosave response.
    draftQueue=draftQueue.catch(()=>{}).then(async()=>{
      if (!uiUnlocked || sessionEpoch!==epoch || activeDraftId!==id) return;
      await api(`/api/drafts/${id}`,'PUT',data);
      savedDraftIds.add(id);
      if(uiUnlocked && activeDraftId===id)$('draftStatus').textContent='Encrypted recovery copy saved locally. Finish by saving this prompt to your library.';
      broadcast({type:'drafts-changed'});
    }).catch(error=>{if(uiUnlocked){$('draftStatus').textContent='Recovery copy not saved. Please save your work to the library.';notice(`Draft could not be recovered later: ${error.message}`);}});
    return draftQueue;
  }
  function scheduleDraft() {
    if (!uiUnlocked || !activeDraftId || !editorDirty()) return;
    clearTimeout(draftTimer);
    $('draftStatus').textContent='Unsaved changes · protecting a recovery copy after typing stops…';
    draftTimer=setTimeout(()=>void persistDraft(),1300);
  }
  function dropDraft(id) {
    clearTimeout(draftTimer); draftTimer=null;
    draftQueue=draftQueue.catch(()=>{}).then(async()=>{
      if (!uiUnlocked) return;
      await api(`/api/drafts/${id}`,'DELETE');
      savedDraftIds.delete(id);
      broadcast({type:'drafts-changed'});
      await loadDrafts();
    }).catch(error=>{if(uiUnlocked)notice(`Could not discard encrypted draft: ${error.message}`);});
    return draftQueue;
  }
  async function loadDrafts() {
    if(!uiUnlocked) return;
    const epoch=sessionEpoch;
    try {
      const result=await api('/api/drafts');
      if(epoch!==sessionEpoch || !uiUnlocked)return;
      const wrap=$('draftRecovery'), list=$('draftList');list.replaceChildren();
      savedDraftIds=new Set(result.drafts.map(draft=>draft.id));
      wrap.hidden=!result.drafts.length;
      for(const draft of result.drafts){
        const line=node('div','draft-row'), label=node('div','draft-text');
        label.append(node('strong','',draft.title.trim()||'Untitled prompt'));
        label.append(node('small','',`Last saved ${localDate(draft.updatedAt)} · ${draft.body.length.toLocaleString()} characters`));
        const actions=node('div','draft-actions');
        actions.append(button('Recover','Recover encrypted draft as a new prompt',()=>recoverDraft(draft),'btn primary'));
        actions.append(button('Discard','Discard this encrypted draft',async()=>{
          if(!(await ask(`Discard encrypted draft “${draft.title||'Untitled'}”? This cannot be undone.`)))return;
          void dropDraft(draft.id);
        },'btn subtle'));
        line.append(label,actions);list.append(line);
      }
    } catch(error){if(uiUnlocked)notice(error.message);}
  }
  function recoverDraft(draft) {
    if ($('editorDialog').open) return;
    openEditor();
    activeDraftId=draft.id;
    $('entryTitle').value=draft.title;$('entryBody').value=draft.body;
    $('entryKind').value=draft.kind;$('entryProject').value=draft.project;
    $('entryTags').value=draft.tags;$('entryPinned').checked=draft.pinned;
    $('entryNotes').value=draft.notes;$('entrySource').value=draft.source;
    $('modalTitle').textContent='Recover draft as a new prompt';
    $('draftStatus').textContent='Recovered encrypted work. Save it to your library to finish recovery.';
    // The previous source item could have changed: recovery never silently overwrites it.
    $('entryTitle').focus();
  }
  function localDate(date) {
    const n = new Date(date);
    return Number.isFinite(n.getTime()) ? n.toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'}) : 'Unknown date';
  }
  async function api(path, method = 'GET', payload, etag) {
    const epoch = sessionEpoch;
    const headers = { Authorization: `Bearer ${token}` };
    if (etag) headers['If-Match'] = etag;
    if (payload !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(path, { method, headers,
      body: payload === undefined ? undefined : JSON.stringify(payload), cache: 'no-store' });
    let body;
    try { body = await response.json(); } catch { throw new Error('Local service returned an invalid response.'); }
    if (epoch !== sessionEpoch) throw new Error('Session changed; stale response discarded.');
    if (!response.ok) {
      if (uiUnlocked && (response.status === 423 || response.status === 401 && path !== '/api/passphrase')) showGate(true);
      const error = new Error(body.error || `Request failed (${response.status}).`);
      error.status = response.status; error.code = body.code; throw error;
    }
    const at = Number(response.headers.get('X-Vault-Lock-At'));
    if (at) applyDeadline(at, Number(response.headers.get('X-Vault-Now')));
    return body;
  }
  const assistant=initAssistant({api,notice,unlocked:()=>uiUnlocked,refresh,settings:()=>{chooseSection('more');$('groqTitle').scrollIntoView({block:'start'});}});
  function showGate(locked) {
    assistant.reset();
    resetRecall();
    resetRetentionReview();
    answerDialog(false);
    uiUnlocked = false; sessionEpoch++; queryCounter++; quickCounter++; captureRequest++; captureReviewRequest++;
    runtimeReport=null;$('healthExport').disabled=true;
    for(const id of ['healthMemory','healthProfile','healthStorage','healthRuntime'])$(id).textContent='Not checked';
    $('healthRuntimeNote').textContent='Source beta, not a signed installer';
    $('healthStatus').textContent='Reports include runtime versions and resource figures, never prompts, keys, session links or file paths.';
    clearTimeout(deadlineTimer); clearInterval(statusTimer); clearTimeout(searchTimer); clearTimeout(draftTimer);
    activeDraftId=null; draftQueue=Promise.resolve(); savedDraftIds.clear();
    selected.clear(); editingId = null; editingETag = undefined; editorInitial = '';
    backupReviewed = false; pendingBackupData = null;
    for(const url of styleDownloadUrls)URL.revokeObjectURL(url);styleDownloadUrls.clear();
    styleGeneration++;styleLoadGeneration++;proofGeneration++;activeStyle=null;activeStyleId=null;activeStyleETag=null;styleWork=null;styleAnalyzedSamples='';styleSavedFields='';
    wbClear(); wbFocus=false; wbVisible=true; wbMode();
    $('shell').hidden = true; $('gate').hidden = false;
    $('captureRecentList').replaceChildren();$('captureRecentCount').textContent='';
    $('captureStateTitle').textContent='Vault locked';$('captureStateDescription').textContent='Unlock to review capture status.';
    $('capturePause').disabled=true;$('captureSetup').hidden=true;
    $('captureNativeConsent').checked=false;$('captureNativeEnable').disabled=true;$('captureNativeControls').hidden=true;
    $('captureReviewPanel').hidden=true;$('captureReviewList').replaceChildren();$('captureReviewStatus').textContent='';$('captureReview').disabled=false;
    $('writingView').hidden = true;
    for (const id of ['editorDialog','historyDialog','quickDialog','templateDialog','backupDialog','passphraseDialog']) {
      const dialog = $(id); if (dialog.open) dialog.close();
    }
    $('passphrase').value = ''; $('confirm').value = '';
    $('draftStatus').textContent='';
    currentItems = []; templateItem = null; templateFields = []; quickItems = [];
    // Do not leave previously decrypted prompts in hidden DOM nodes after locking.
    for (const id of ['styleName','styleSamples','styleTone','styleAudience','styleAvoid','styleTask','styleInstructions','styleProofText',
      'entryTitle','entryBody','entryProject','entryTags','entryNotes','entrySource',
      'quickSearch','templatePreview','pairCode','backupPassphrase','backupConfirm','searchInput','currentPassphrase','newPassphrase','confirmNewPassphrase']) $(id).value = '';
    for (const id of ['styleProfileList','styleAnalytics','styleProofIssues','itemsList','quickResults','historyList','templateVariables','backupPreview','draftList']) $(id).replaceChildren();
    $('styleIncludeExamples').checked=false;$('styleRetainExamples').checked=false;$('styleExampleReview').hidden=true;$('styleExampleList').replaceChildren();$('styleProofStatus').textContent='';$('styleAnalysisStatus').textContent='';$('styleUseStatus').textContent='';$('styleCount').textContent='0';$('styleAnalytics').hidden=true;
    $('draftRecovery').hidden=true;
    clearTimeout(toastTimer);$('toast').classList.remove('visible');
    $('toast').textContent = ''; $('bridgeStatus').textContent = '';
    for (const id of ['projectFilter','tagFilter']) $(id).replaceChildren(new Option('All', ''));
    for (const id of ['templateTitle','historyTitle','sectionTitle','sectionDescription','listInfo','crumbName']) $(id).textContent = '';
    for (const id of ['statTotal','statPinned','statTemplates','navCount','trashCount']) $(id).textContent = '—';
    $('bulkControls').hidden=true; $('selectedCount').textContent='0 selected'; $('selectPage').checked=false;
    $('editorError').textContent=''; $('passphraseError').textContent=''; $('preferencesNotice').textContent='';
    $('pairCodeWrap').hidden = true; importFile = null; $('backupFile').value = '';
    $('gateTitle').textContent = locked ? 'Welcome back.' : 'Your ideas deserve a home.';
    $('gateDescription').textContent = locked ? 'Unlock your private prompt library. Your data stays on this computer.' :
      'Create a secure local vault. Capture and cloud AI are off until you explicitly enable them. No tracking.';
    $('confirmWrap').hidden = locked; $('confirm').required = !locked;
    $('passphrase').autocomplete = locked ? 'current-password' : 'new-password';
    $('gateAction').textContent = locked ? 'Unlock vault ↗' : 'Create my vault ↗';
    $('gateError').textContent = ''; initialized = locked;
    setTimeout(() => $('passphrase').focus(), 0);
  }
  async function showApp() {
    uiUnlocked = true; $('gate').hidden = true; $('shell').hidden = false; wbMode();
    $('passphrase').value=''; $('confirm').value='';
    $('settingsView').hidden=true; $('writingView').hidden=true; $('libraryView').hidden=true; $('captureView').hidden=false;$('moreView').hidden=true; $('settingsNav').classList.remove('active');$('writingNav').classList.remove('active');
    section = 'all'; pageOffset=0; await loadPreferences(); await refresh(); await loadDrafts();
    if(uiUnlocked)chooseSection('capture');
    clearInterval(statusTimer); statusTimer=setInterval(() => void checkSession(),30000);
  }
  async function refresh() {
    await Promise.all([loadItems('stay'), loadSummary(), loadFacets()]);
  }
  async function loadSummary() {
    try {
      const result = await api('/api/summary');
      $('statTotal').textContent = result.library.all.toLocaleString();
      $('statTemplates').textContent = result.library.templates.toLocaleString();
      $('statPinned').textContent = result.library.pinned.toLocaleString();
      $('navCount').textContent = result.library.all.toLocaleString();
      $('trashCount').textContent = result.trash.toLocaleString();
    } catch (error) { notice(error.message); }
  }
  async function loadFacets() {
    try {
      const result = await api('/api/facets');
      for (const [id, allLabel, entries] of [
        ['projectFilter', 'Every project', result.projects], ['tagFilter', 'Every tag', result.tags]
      ]) {
        const select = $(id); const old = select.value;
        select.replaceChildren(new Option(allLabel, ''));
        for (const entry of entries.slice(0, 150)) select.append(new Option(`${entry.name} (${entry.count})`, entry.name));
        if ([...select.options].some(o => o.value === old)) select.value = old;
        else select.value = '';
      }
    } catch (error) { notice(error.message); }
  }
  function queryParams(offset) {
    const params = new URLSearchParams({ filter: section, q: $('searchInput').value.trim(),
      limit: String(PAGE_SIZE), offset: String(offset), sort: $('sortFilter').value, view:'preview' });
    if ($('projectFilter').value) params.set('project', $('projectFilter').value);
    if ($('tagFilter').value) params.set('tag', $('tagFilter').value);
    return params;
  }
  function updateNav() {
    const [title, description] = LABELS[section];
    $('sectionTitle').textContent = title; $('sectionDescription').textContent = description;
    if(!$('libraryView').hidden)$('crumbName').textContent = title;
    document.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', !$('libraryView').hidden && b.dataset.filter === section));
    const special = section === 'captured' || section === 'trash';
    $('filterPills').hidden = section === 'captured' || section === 'recent' || section === 'trash';
    document.querySelector('.advanced-filters').hidden = special;
    $('newButton').hidden = section === 'trash' || section === 'captured';
  }
  async function loadItems(append = false) {
    const request = ++queryCounter;
    if (append === true) pageOffset += PAGE_SIZE;
    else if (append === 'previous') pageOffset = Math.max(0,pageOffset-PAGE_SIZE);
    else if (append !== 'stay') pageOffset = 0;
    selected.clear();
    updateNav();
    const text = $('searchInput').value.trim();
    try {
      let result;
      if (section === 'captured') {
        const params=new URLSearchParams({q:text,limit:String(PAGE_SIZE),offset:String(pageOffset)});
        result = await api(`/api/captured?${params}`);
      } else result = await api(`/api/items?${queryParams(pageOffset)}`);
      if (request !== queryCounter) return;
      if (!result.items.length && result.total && pageOffset >= result.total) {
        pageOffset=Math.floor((result.total-1)/PAGE_SIZE)*PAGE_SIZE; return loadItems('stay');
      }
      currentItems = result.items; total = result.total;
      renderItems();
    } catch (error) { if (request === queryCounter) notice(error.message); }
  }
  function renderItems() {
    const list = $('itemsList'); list.replaceChildren(); list.dataset.layout=wbLayout;
    const pendingCards = document.createDocumentFragment();
    $('listInfo').textContent = `${total ? pageOffset+1 : 0}-${pageOffset+currentItems.length} of ${total} ${section === 'trash' ? 'deleted' : section === 'captured' ? 'captured' : 'saved'} items`;
    $('loadMoreButton').hidden = pageOffset+currentItems.length >= total;
    $('previousPage').hidden=pageOffset === 0;
    $('selectionRow').hidden=section==='captured' || !currentItems.length;
    updateSelection();
    $('emptyState').hidden = currentItems.length !== 0;
    if (!currentItems.length) {
      const search = $('searchInput').value.trim();
      $('emptyTitle').textContent = search ? 'No matches yet.' : section === 'captured' ? 'No captured prompts.' : section === 'trash' ? 'Nothing in trash.' : 'A fresh start.';
      $('emptyDescription').textContent = search ? 'Try a different search, project or tag filter.' : section === 'captured' ?
        'Connect an approved source from Capture, send a test prompt, then refresh. Original snapshots appear here.' : section === 'trash' ?
        'Deleted items will stay here until you permanently remove them.' : 'Save your first prompt or explore some starter templates.';
      $('demoButton').hidden = section !== 'all' || Boolean(search) || Boolean($('projectFilter').value) || Boolean($('tagFilter').value);
      $('emptyNew').hidden = section === 'trash' || section === 'captured';
      return;
    }
    for (const item of currentItems) {
      const captured = section === 'captured'; const trashed = section === 'trash';
      const card = node('article', 'item-card');card.dataset.itemId=item.id;
      const top = node('div', 'card-top');
      if (!captured) {
        const checkbox=node('input','item-select');checkbox.type='checkbox';checkbox.checked=selected.has(item.id);
        checkbox.setAttribute('aria-label',`Select ${item.title}`);
        checkbox.addEventListener('change',()=>{if(checkbox.checked)selected.add(item.id);else selected.delete(item.id);updateSelection();});
        top.append(checkbox);
      }
      top.append(node('span', `type-tag ${item.kind === 'template' ? 'template' : ''}`,
        captured ? item.quality.replaceAll('_',' ') : item.kind === 'template' ? '✧ Template' : '▤ Prompt'));
      const actions = node('div', 'card-actions');
      if (trashed) {
        actions.append(button('↶', 'Restore from trash', () => void restoreDeleted(item)));
      } else {
        if (!captured) actions.append(button(item.pinned ? '★' : '☆', item.pinned ? 'Unpin' : 'Pin', () => void pinItem(item), item.pinned ? 'pinned' : ''));
        actions.append(button('⧉', 'Copy prompt to clipboard', () => void copyItem(item, captured)));
        if (!captured) actions.append(button('✎', 'Edit saved prompt', () => openEditor(item)));
      }
      top.append(actions); card.append(top);
      const title = node('h3', '', captured ? (item.surface.title || item.surface.appId) : item.title);
      if(!captured&&!trashed){title.textContent='';const open=node('button','wb-title',item.title);open.type='button';open.addEventListener('click',()=>void wbInspect(item));title.append(open);}card.append(title);
      const text = captured ? item.text : item.body;
      const previewLimit=preferences.lowMemory?420:1600;
      card.append(node('p', 'card-body', text.length>previewLimit?text.slice(0,previewLimit)+'...':text));
      if(captured){
        const browser=item.deviceId==='browser-extension';
        const meaning=item.quality==='draft_snapshot'?'Composer snapshot near Send; delivery is unverified.':
          item.quality==='exact_submitted'?'Submission text from a direct source hook.':'Partial capture; check for missing text.';
        card.append(node('p','capture-receipt',`Capture receipt · ${browser?'Browser helper':item.deviceId} · ${item.sourceMethod.replaceAll('_',' ')} · ${localDate(item.recordedAt)}. ${meaning} You can delete this record below; linked editable copies are removed with it.`));
      }
      if (!captured && item.notes) card.append(node('p', 'card-note', item.notes));
      const tags = node('div', 'card-tags');
      if (!captured && item.project) tags.append(node('span', '', '◇ ' + item.project));
      if (!captured && item.source) tags.append(node('span', '', '⌁ ' + item.source));
      for (const tag of (captured ? [item.sourceMethod] : item.tags.slice(0,3))) tags.append(node('span', '', '# ' + tag));
      card.append(tags);
      const foot = node('div', 'card-footer');
      const date = captured ? item.recordedAt : trashed ? item.deletedAt : item.updatedAt;
      foot.append(node('span', '', `${captured ? item.surface.appId : trashed ? 'Deleted' : (item.useCount || 0) ? `${item.useCount} reuse${item.useCount === 1 ? '' : 's'}` : 'Local vault'} · ${localDate(date)}`));
      const controls = node('div');
      if (trashed) {
        controls.append(button('Restore', 'Restore deleted item', () => void restoreDeleted(item)));
        controls.append(button('Delete forever', 'Permanently delete', () => void purgeDeleted(item), 'danger-text'));
      } else {
        if (!captured && item.revision > 1) controls.append(button(`History (${item.revision})`, 'Version history', () => void openHistory(item)));
        if (!captured) { controls.append(button('Duplicate', 'Duplicate prompt', () => void duplicateItem(item)));
          controls.append(button('Export .md', 'Export plain Markdown file', () => exportMarkdown(item))); }
        controls.append(button(captured ? 'Delete' : 'Move to trash', captured ? 'Delete captured record' : 'Move item to trash', () => void removeItem(item, captured)));
      }
      foot.append(controls); card.append(foot); pendingCards.append(card);
    }
    // One DOM insertion per page: reduce layout/paint work on older integrated GPUs.
    list.append(pendingCards);
  }
  function templateVariables(body) { return parseTemplate(body); }
  function renderTemplate() {
    if (!templateItem) return;
    try {
      $('templatePreview').value = fillTemplate(templateItem.body,new Map(templateFields.map(entry=>[entry.name,entry.input.value])));
      $('templateForm').querySelector('[type="submit"]').disabled=false;
    } catch(error) {
      $('templatePreview').value=error.message; $('templateForm').querySelector('[type="submit"]').disabled=true;
    }
  }
  function openTemplate(item) {
    try { templateVariables(item.body); } catch(error) {notice(error.message);return;}
    templateItem = item; templateFields = [];
    $('templateTitle').textContent = item.title;
    const list = $('templateVariables'); list.replaceChildren();
    for (const [index, field] of templateVariables(item.body).entries()) {
      const id = `variable-${index}`;
      const label = node('label', '', field.name + (field.fallback ? ' · suggested value included' : ''));
      label.htmlFor = id;
      const input = node('textarea'); input.id = id; input.rows = 2;
      input.placeholder = `Enter ${field.name}`; input.value = field.fallback; input.maxLength=50000; input.required=!field.fallback;
      input.addEventListener('input', renderTemplate);
      list.append(label, input); templateFields.push({name:field.name,input});
    }
    if (!templateFields.length) list.append(node('p', 'muted', 'This template has no blanks; copy it as-is.'));
    renderTemplate();
    if ($('quickDialog').open) $('quickDialog').close();
    $('templateDialog').showModal();
    (templateFields[0]?.input || $('templatePreview')).focus();
  }
  async function completeItem(item) {
    if (!item?.preview) return item;
    const result = await api(`/api/items/${item.id}`);
    return result.item;
  }
  function wbClear(){wbRequest++;wbItem=null;for(const id of ['wbKind','wbTitle','wbMeta','wbBody','wbProject','wbSource','wbDate']){if($(id))$(id).textContent='';}if($('wbTags'))$('wbTags').replaceChildren();if($('wbFeedback'))$('wbFeedback').replaceChildren();if($('wbDetail'))$('wbDetail').hidden=true;if($('wbEmpty'))$('wbEmpty').hidden=false;document.querySelectorAll('.item-card.wb-selected').forEach(e=>e.classList.remove('wb-selected'));}
  function wbMode(){if(!$('wbInspector'))return;const library=uiUnlocked&&!$('libraryView').hidden;const show=library&&wbVisible&&!wbFocus;$('shell').classList.toggle('wb-inspector-visible',show);$('shell').classList.toggle('wb-focus',wbFocus);$('wbInspector').inert=!show;$('wbInspector').setAttribute('aria-hidden',String(!show));$('inspectorToggle').hidden=!library;$('focusToggle').hidden=!library;$('inspectorToggle').setAttribute('aria-pressed',String(wbVisible));$('focusToggle').setAttribute('aria-pressed',String(wbFocus));$('cardLayout').setAttribute('aria-pressed',String(wbLayout==='cards'));$('listLayout').setAttribute('aria-pressed',String(wbLayout==='list'));}
  async function wbInspect(preview){if(!uiUnlocked)return;const req=++wbRequest,epoch=sessionEpoch;try{const item=await completeItem(preview);if(!uiUnlocked||epoch!==sessionEpoch||req!==wbRequest)return;wbItem=item;wbFocus=false;wbVisible=true;wbMode();$('wbEmpty').hidden=true;$('wbDetail').hidden=false;$('wbKind').textContent=item.kind==='template'?'TEMPLATE':'SAVED PROMPT';$('wbTitle').textContent=item.title;$('wbMeta').textContent=`${item.useCount||0} uses · ${item.body.length.toLocaleString()} characters`;$('wbBody').textContent=item.body.slice(0,6000)+(item.body.length>6000?'\n… Open editor to view full content.':'');$('wbProject').textContent=item.project||'Unassigned';$('wbSource').textContent=item.source||'Manual';$('wbDate').textContent=localDate(item.updatedAt);$('wbTags').replaceChildren(...item.tags.map(tag=>node('span','',`#${tag}`)));showInspectorFeedback(item);document.querySelectorAll('.item-card').forEach(card=>card.classList.toggle('wb-selected',card.dataset.itemId===item.id));$('shell').classList.add('wb-inspector-open');}catch(error){if(req===wbRequest&&uiUnlocked){wbClear();notice(error.message);}}}
  function showInspectorFeedback(item){
    let holder=$('wbFeedback');
    if(!holder){holder=node('div','wb-feedback');holder.id='wbFeedback';$('wbTags').after(holder);}
    holder.replaceChildren();
    const label=node('label','',`Outcome for revision ${item.revision}`),select=node('select');
    for(const [value,text] of [['','No feedback'],['worked','Worked well'],['not-useful','Not useful'],['hidden','Hidden from related search']])
      select.append(new Option(text,value));
    select.value=item.feedback||'';label.append(select);
    const save=button('Save feedback','Save or clear feedback for this version',async()=>{
      const request=wbRequest,epoch=sessionEpoch;save.disabled=true;
      try{
        const result=await api(`/api/items/${item.id}/feedback`,'POST',{revision:item.revision,feedback:select.value||null},item.etag);
        if(request!==wbRequest||epoch!==sessionEpoch||!uiUnlocked)return;
        wbItem=result.item;showInspectorFeedback(result.item);
        notice('Feedback updated for this version. Hidden items remain in your library.');
      }catch(error){if(request===wbRequest&&uiUnlocked){notice(error.message);save.disabled=false;}}
    },'btn subtle');
    holder.append(label,save);
  }
  async function copyText(content, item) {
    try { await navigator.clipboard.writeText(content); }
    catch {
      // The manual fallback cannot know whether the user copied; do not count it as reuse.
      await ask('Clipboard access is unavailable. Select the text below and press Ctrl / Cmd + C.',{title:'Copy manually',input:content,readOnly:true,accept:'Done'});
      return;
    }
    if (item && section !== 'captured') {
      try { await api(`/api/items/${item.id}/use`, 'POST', {}); } catch { /* Clipboard was already written: don't hide success. */ }
    }
    notice('Copied. Paste into your AI tool when you are ready.');
    if ($('quickDialog').open) $('quickDialog').close();
    if ($('templateDialog').open) $('templateDialog').close();
    if (!$('shell').hidden) void Promise.all([loadItems(), loadSummary()]);
  }
  async function copyItem(item, captured = false) {
    try {
      if (!captured) item=await completeItem(item);
      if (!captured && item.kind === 'template' && templateVariables(item.body).length) return openTemplate(item);
      return copyText(captured ? item.text : item.body, captured ? null : item);
    } catch(error) {notice(error.message);}
  }
  async function exportMarkdown(item) {
    if (!(await ask('Export this prompt as an unencrypted Markdown file? Anyone with the file can read its content.'))) return;
    try { item=await completeItem(item); } catch(error) {notice(error.message);return;}
    const metadata = [item.project ? `Project: ${item.project}` : '',
      item.source ? `Used with: ${item.source}` : '', item.tags.length ? `Tags: ${item.tags.join(', ')}` : '',
      item.notes ? `Notes: ${item.notes}` : ''].filter(Boolean);
    const content = `# ${item.title}\n\n${metadata.join('\n')}\n\n---\n\n${item.body}\n`;
    const blob = new Blob([content],{type:'text/markdown;charset=utf-8'});
    const href = URL.createObjectURL(blob);
    const link = node('a');link.href=href;
    link.download = `${item.title.replace(/[^a-zA-Z0-9-]+/g,'-').slice(0,60) || 'prompt'}.md`;
    document.body.append(link);link.click();link.remove();setTimeout(() => URL.revokeObjectURL(href),30_000);
    notice('Exported as plain Markdown. Store this file securely.');
  }
  async function importMarkdownFile(file) {
    const epoch=sessionEpoch;
    if (!file || file.size > 100_000) {notice('Choose a text or Markdown file smaller than 100 KB.');return;}
    if (!/\.(md|markdown|txt)$/i.test(file.name)) {notice('Only .md, .markdown or .txt files are allowed.');return;}
    try {
      const content = await file.text();
      if(epoch!==sessionEpoch || !uiUnlocked)return;
      if (!content.trim()) throw new Error('The selected file is empty.');
      openEditor();
      $('entryTitle').value = file.name.replace(/\.(md|markdown|txt)$/i,'').replace(/[-_]/g,' ').slice(0,140);
      $('entryBody').value = content.slice(0,100000);
      $('entryProject').value = 'Imports';
      $('entrySource').value = 'Local file';
      $('entryTags').value = 'imported';
      scheduleDraft();
      notice('File loaded for review. Edit it, then choose Save to vault.');
    } catch (error) {notice(error.message);}
  }
  async function pinItem(item) {
    try {
      item=await completeItem(item);
      await api(`/api/items/${item.id}`, 'PUT', { title:item.title, body:item.body, kind:item.kind,
        project:item.project, tags:item.tags, pinned:!item.pinned, notes:item.notes || '', source:item.source || '' },item.etag);
      await refresh(); notice(item.pinned ? 'Unpinned.' : 'Pinned to favorites.');
    } catch (error) { notice(error.message); }
  }
  async function openEditor(item = null, forceTemplate = false) {
    if(!uiUnlocked)return;
    if(item) {
      try { item=await completeItem(item); } catch(error) {notice(error.message);return;}
      if(!uiUnlocked)return;
    }
    activeDraftId=createDraftId();
    editingId = item?.id || null; editingETag=item?.etag; $('editorError').textContent='';$('saveDraftAsNew').hidden=true;
    $('modalTitle').textContent = item ? 'Edit saved prompt' : 'Save a prompt';
    $('entryTitle').value = item?.title || ''; $('entryBody').value = item?.body || '';
    $('entryKind').value = item?.kind || (forceTemplate ? 'template' : 'prompt');
    $('entryProject').value = item?.project || ''; $('entryTags').value = item?.tags.join(', ') || '';
    $('entryPinned').checked = item?.pinned || false;
    $('entryNotes').value = item?.notes || ''; $('entrySource').value = item?.source || '';
    if ($('quickDialog').open) $('quickDialog').close();
    resetRecall();
    $('draftStatus').textContent='Recovery is encrypted locally after 1.3 seconds without typing.';
    editorInitial=editorFingerprint(); $('editorDialog').showModal(); $('entryTitle').focus();
  }
  function editorFingerprint() { return JSON.stringify(['entryTitle','entryBody','entryKind','entryProject','entryTags','entryNotes','entrySource'].map(id=>$(id).value).concat($('entryPinned').checked)); }
  function editorDirty() { return $('editorDialog').open && editorFingerprint()!==editorInitial; }
  async function closeEditor(force = false) {
    if (!force && editorDirty() && !(await ask('Discard your unsaved editor changes and any encrypted recovery copy?'))) return;
    const discardedId=activeDraftId; activeDraftId=null;clearTimeout(draftTimer);
    resetRecall();
    $('draftStatus').textContent='';
    $('editorDialog').close(); editingId=null; editingETag=undefined; editorInitial='';
    if(discardedId)void dropDraft(discardedId);
    for(const id of ['entryTitle','entryBody','entryProject','entryTags','entryNotes','entrySource'])$(id).value='';
  }
  function resetRecall() {
    recallRequest++;
    $('recallPanel').hidden=true;
    $('recallStatus').textContent='';
    $('recallResults').replaceChildren();
    $('findRelated').disabled=false;
  }
  async function findRelated() {
    if (!uiUnlocked || !$('editorDialog').open) return;
    const text=($('entryTitle').value+'\n'+$('entryBody').value).trim().slice(0,6000);
    if (text.length<3) {notice('Write a task or prompt first, then search your vault.');return;}
    const request=++recallRequest,epoch=sessionEpoch;
    $('recallPanel').hidden=false;$('recallResults').replaceChildren();
    $('recallStatus').textContent='Searching saved prompts on this device…';
    $('findRelated').disabled=true;
    try {
      const result=await api('/api/recall','POST',{text,project:$('entryProject').value,excludeId:editingId||''});
      if(request!==recallRequest||epoch!==sessionEpoch||!uiUnlocked||!$('editorDialog').open)return;
      $('recallStatus').textContent=result.matches.length ? 'Related sources from your vault. Review before adding anything.' :
        'No related saved prompts found. Try more specific words or save this as your first example.';
      for(const match of result.matches) {
        const row=node('article','recall-result');
        const detail=node('div','recall-result-detail');
        detail.append(node('strong','',match.title));
        detail.append(node('small','',`${match.provenance} · ${match.project||'Unassigned'} · ${match.source||'Manual'} · ${localDate(match.updatedAt)}`));
        detail.append(node('p','',match.preview));
        detail.append(node('small','',`Why shown: local keyword overlap (${match.matchedTerms.join(', ')}). Check whether the source fits this task.`));
        if(match.scope)detail.append(node('small','',`Reuse scope: ${match.scope}. Original source wording is retained in this copy.`));
        if(match.feedback)detail.append(node('small','',`Your feedback on revision ${match.revision}: ${match.feedback.replace('-', ' ')}.`));
        const addButton=button('Add editable copy','Add this saved prompt to the current draft',async()=>{
          if(addButton.disabled)return;
          addButton.disabled=true;
          const selected=recallRequest,selectionEpoch=sessionEpoch;
          try {
            const {item}=await api(`/api/items/${match.id}`);
            if(selected!==recallRequest||selectionEpoch!==sessionEpoch||!uiUnlocked||!$('editorDialog').open)return;
            if(item.deletedAt||item.etag!==match.etag){resetRecall();notice('That saved prompt changed. Search again before adding it.');return;}
            const body=$('entryBody').value;
            const combined=body.trim() ? body.trimEnd()+'\n\n'+item.body : item.body;
            if(combined.length>100000){notice('This draft would exceed the 100,000-character limit. Copy a shorter part instead.');return;}
            $('entryBody').value=combined;resetRecall();scheduleDraft();$('entryBody').focus();
            notice('Saved text added to your draft for review. Nothing was submitted.');
          }catch(error){if(uiUnlocked)notice(error.message);}
          finally{addButton.disabled=false;}
        },'btn outline');
        const controls=node('div','recall-controls');controls.append(addButton);
        controls.append(button('Copy exact original','Copy exact saved wording without changing this draft',async()=>{
          const selected=recallRequest,selectionEpoch=sessionEpoch;
          try{
            const {item}=await api(`/api/items/${match.id}`);
            if(selected!==recallRequest||selectionEpoch!==sessionEpoch||!uiUnlocked||!$('editorDialog').open)return;
            if(item.deletedAt||item.etag!==match.etag){resetRecall();notice('That saved prompt changed. Search again before copying it.');return;}
            await copyText(item.body,item);
          }catch(error){if(uiUnlocked)notice(error.message);}
        },'btn subtle'));
        if(match.project && match.project!==$('entryProject').value.trim())
          controls.append(button(`Use ${match.project}`,'Set this draft project to the selected source project',()=>{
            $('entryProject').value=match.project;resetRecall();scheduleDraft();
            notice(`Draft project set to ${match.project}. Review it before saving.`);
          },'btn subtle'));
        const feedbackLabel=node('label','recall-feedback-label','Outcome for this revision');
        const feedbackSelect=node('select');
        for(const [value,label] of [['','No feedback'],['worked','Worked well'],['not-useful','Not useful'],['hidden','Hide from related search']])
          feedbackSelect.append(new Option(label,value));
        feedbackSelect.value=match.feedback||'';feedbackLabel.append(feedbackSelect);
        const feedbackButton=button('Save feedback','Save feedback for this saved revision',async()=>{
          feedbackButton.disabled=true;
          try{
            await api(`/api/items/${match.id}/feedback`,'POST',{revision:match.revision,feedback:feedbackSelect.value||null},match.etag);
            if(request!==recallRequest||epoch!==sessionEpoch||!uiUnlocked||!$('editorDialog').open)return;
            notice('Feedback saved for this version. It is not treated as proof that a suggestion succeeded.');
            await findRelated();
          }catch(error){if(uiUnlocked){notice(error.message);if(error.status===412)resetRecall();}}
          finally{feedbackButton.disabled=false;}
        },'btn subtle');
        controls.append(feedbackLabel,feedbackButton);
        row.append(detail,controls);
        $('recallResults').append(row);
      }
    }catch(error){if(request===recallRequest&&uiUnlocked)$('recallStatus').textContent=error.message;}
    finally{if(request===recallRequest)$('findRelated').disabled=false;}
  }
  async function duplicateItem(item) {
    try { await api(`/api/items/${item.id}/duplicate`, 'POST', {}); await refresh(); notice('Copy saved to your library.'); }
    catch (error) { notice(error.message); }
  }
  async function openHistory(item) {
    try {
      const result = await api(`/api/items/${item.id}/history`);
      const list = $('historyList'); list.replaceChildren();
      $('historyTitle').textContent = `History · ${item.title}`;
      if (!result.revisions.length) list.append(node('p','muted','No older saved versions yet.'));
      for (const revision of result.revisions) {
        const row = node('div', 'history-row'); const details = node('div');
        details.append(node('strong','',`Version ${revision.revision}: ${revision.title}`));
        details.append(node('small','',localDate(revision.updatedAt)));
        details.append(node('p','',revision.body.length > 240 ? revision.body.slice(0,240)+'…' : revision.body));
        row.append(details);
        row.append(button('Restore ↶', 'Restore version', async () => {
          if (!(await ask(`Restore version ${revision.revision}? Your current version will remain in history.`))) return;
          try {
            await api(`/api/items/${item.id}/restore`,'POST',{revision:revision.revision},item.etag);
            $('historyDialog').close(); await refresh(); notice('Older version restored.');
          } catch (error) { notice(error.message); }
        },'btn outline'));
        list.append(row);
      }
      $('historyDialog').showModal();
    } catch (error) { notice(error.message); }
  }
  async function removeItem(item, captured) {
    const warning = captured ? 'Permanently delete this captured record and its linked library copy?' : `Move “${item.title}” to trash? You can restore it later.`;
    if (!(await ask(warning))) return;
    try {
      await api(`${captured ? '/api/captured/' : '/api/items/'}${item.id}`, 'DELETE',undefined,captured?undefined:item.etag);
      await refresh(); notice(captured ? 'Captured record removed.' : 'Moved to trash.');
    } catch (error) { notice(error.message); }
  }
  async function restoreDeleted(item) {
    try { await api(`/api/items/${item.id}/undelete`, 'POST', {}, item.etag); await refresh(); notice('Restored to your library.'); }
    catch (error) { notice(error.message); }
  }
  async function purgeDeleted(item) {
    if (!(await ask(`Permanently erase “${item.title}” and its history? This cannot be undone.`))) return;
    try { await api(`/api/items/${item.id}/purge`, 'DELETE',undefined,item.etag); await refresh(); notice('Permanently deleted.'); }
    catch (error) { notice(error.message); }
  }
  function chooseSection(next, confirmed = false) {
    if (!confirmed && next !== 'writing' && !$('writingView').hidden && styleHasUnsaved()) {
      void ask('Discard unsaved writing profile changes? Your sample text has not been saved.', {title:'Leave Writing Studio'}).then(accepted=>{if(accepted)chooseSection(next,true);});
      return;
    }
    $('writingView').hidden=next!=='writing';$('settingsView').hidden=next!=='settings';$('captureView').hidden=next!=='capture';$('moreView').hidden=next!=='more';$('libraryView').hidden=['writing','settings','capture','more'].includes(next);wbClear();wbMode();
    $('settingsNav').classList.toggle('active',next==='settings');$('writingNav').classList.toggle('active',next==='writing');
    $('captureNav').classList.toggle('active',next==='capture');$('moreNav').classList.toggle('active',next==='more');
    if(next==='capture'||next==='more'){
      $('crumbName').textContent=next==='capture'?'Capture':'More features';document.querySelectorAll('[data-filter]').forEach(el=>el.classList.remove('active'));
      if(next==='capture')void loadCaptureHome();
      else void assistant.loadSettings();
    }else if(next==='writing'){
      $('crumbName').textContent='Writing Studio';$('mainNav').querySelectorAll('[data-filter]').forEach(el=>el.classList.remove('active'));
      void loadStyleProfiles();
    }else if(next==='settings'){
      $('crumbName').textContent='Settings & privacy';$('mainNav').querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
      void loadBridgeStatus();void assistant.loadSettings();
    }else{
      section=next;$('searchInput').value='';$('projectFilter').value='';$('tagFilter').value='';$('sortFilter').value='updated';void loadItems();
    }
  }
  async function loadCaptureHome() {
    if(!uiUnlocked)return;
    const request=++captureRequest;
    $('captureRefresh').disabled=true;
    try{
      const [status,recent]=await Promise.all([api('/api/capture/status'),api('/api/captured?limit=5&offset=0')]);
      if(request!==captureRequest||!uiUnlocked)return;
      const paired=!!status.browser?.paired,authorized=!!status.browser?.authorized;
      const native=status.native||{},nativeRunning=native.state==='running';
      const state=status.state||'unpaired';
      $('captureIndicator').dataset.state=state;
      const labels={ready:'Capture pairing ready',paused:'Browser capture paused',unpaired:'Connect your first capture source',locked:'Vault locked'};
      $('captureStateTitle').textContent=nativeRunning?'Codex capture is running':native.state==='error'&&!authorized?'Codex capture needs attention':native.available&&state==='unpaired'?'Choose a source to start capturing':labels[state]||'Capture setup needed';
      $('captureStateDescription').textContent=nativeRunning?
        'New user prompts from local Codex session files are saved automatically while this source is enabled and the vault remains unlocked. Other desktop applications are not captured.':state==='ready'?
        'Browser access is paired and approved. Enable each chosen site in the helper, then confirm a saved acknowledgement with a test prompt.':
        state==='paused'?'The helper has no approved automatic capture sources. Set up a new pairing to approve send snapshots.':
        state==='locked'?'Unlock the vault and pair again to capture.':native.available?
        'Enable Codex capture below, or connect a browser source. Each source needs your approval and can be paused at any time.':
        'Browser capture needs pairing and per-site permission. Desktop application capture is still in development.';
      $('captureNavState').textContent=nativeRunning?'running':state==='ready'?'paired':state==='paused'?'paused':'setup';
      $('capturePause').disabled=!paired&&!native.enabled;
      $('captureSetupButton').textContent=paired&&authorized?'Manage browser setup':'Set up browser capture';
      const hosts=Array.isArray(status.browser?.hosts)?status.browser.hosts.filter(host=>['chatgpt.com','claude.ai','gemini.google.com'].includes(host)):[];
      $('captureBrowserDetail').textContent=paired?`${authorized?'Approved':'Manual-only'} pairing${hosts.length?' · '+hosts.join(', '):''}. Site approval is managed in the helper.`:'Not paired. Connect the helper and approve each site.';
      const nativeLabels={running:'Capturing new Codex prompts',starting:'Starting source',paused:'Paused',error:'Source needs attention',unavailable:'Coming soon'};
      $('captureNativeState').textContent=nativeLabels[native.state]||(native.available?'Ready to enable':'Coming soon');
      $('captureNativeDetail').textContent=!native.available?'Real Codex capture is disabled until private-session exclusions are verified. Other desktop applications are not captured.':
        native.state==='error'?'The local Codex source could not run. Pause it and try again after checking the source. No failed messages are queued.':
        nativeRunning?'Watching for new user prompts in local Codex session files. Existing history is excluded. Other apps and unsent typing are not recorded.':
        'Approve this source to save new user prompts from local Codex session files. Other apps and unsent typing are not recorded.';
      $('captureNativeControls').hidden=!native.available;
      $('captureNativeConsentWrap').hidden=!!native.enabled;$('captureNativeEnable').hidden=!!native.enabled;$('captureNativePause').hidden=!native.enabled;
      if(native.enabled){$('captureNativeConsent').checked=false;$('captureNativeEnable').disabled=true;}
      const items=Array.isArray(recent.items)?recent.items.slice(0,5):[];
      $('captureRecentCount').textContent=Number.isFinite(recent.total)?`(${recent.total.toLocaleString()})`:'';
      const list=$('captureRecentList');list.replaceChildren();$('captureEmpty').hidden=items.length>0;
      for(const item of items){
        const row=node('article','capture-recent-row');
        row.append(node('span','capture-record-mark','↳'));
        const detail=node('div');detail.append(node('h3','',item.surface?.title||item.surface?.appId||'Captured prompt'));
        const text=typeof item.text==='string'?item.text:'';
        detail.append(node('p','',text.slice(0,420)+(text.length>420?'…':'')));
        detail.append(node('small','',`${item.surface?.appId||'Source'} · ${localDate(item.recordedAt)} · ${String(item.quality||'snapshot').replaceAll('_',' ')}${item.quality==='draft_snapshot'?' · Delivery unverified':''}`));
        row.append(detail);list.append(row);
      }
    }catch(error){
      if(request===captureRequest&&uiUnlocked){$('captureStateTitle').textContent='Capture status unavailable';$('captureStateDescription').textContent=error.status===404?'Restart the application after updating to load capture status.':error.message;$('capturePause').disabled=true;}
    }finally{if(request===captureRequest)$('captureRefresh').disabled=false;}
  }
  function openCaptureSetup(){
    chooseSection('capture');$('captureSetup').hidden=false;
    void loadBridgeStatus();
    $('captureSetupTitle').focus();$('captureSetup').scrollIntoView({block:'start',behavior:preferences.lowMemory?'instant':'smooth'});
  }
  async function reviewCaptures(){
    const request=++captureReviewRequest;
    $('captureReview').disabled=true;$('captureReviewPanel').hidden=false;$('captureReviewList').replaceChildren();$('captureReviewStatus').textContent='Checking the five most recent snapshots locally…';
    $('captureReviewTitle').focus();$('captureReviewPanel').scrollIntoView({block:'start'});
    try{
      const result=await api('/api/capture/review?limit=5&offset=0');
      if(request!==captureReviewRequest||!uiUnlocked)return;
      const items=Array.isArray(result.items)?result.items.slice(0,5):[];
      $('captureReviewStatus').textContent=items.length?`Reviewed ${items.length} recent snapshot${items.length===1?'':'s'}. Originals remain unchanged.${result.more?' More snapshots are available in Original captures.':''}`:'No captured prompts to review yet.';
      for(const item of items){
        const row=node('article','capture-recent-row');const detail=node('div');
        detail.append(node('h3','',item.source||'Captured prompt'));
        const text=typeof item.text==='string'?item.text:'';detail.append(node('p','',text.slice(0,420)+(text.length>420?'…':'')));
        const issues=Array.isArray(item.suggestions)?item.suggestions:[];
        if(item.checkSkipped)detail.append(node('small','','This prompt exceeds the local check limit and was left unchanged.'));
        else if(!issues.length)detail.append(node('small','','No suggestions from these basic checks. This does not guarantee correct grammar.'));
        else{const list=node('ul','capture-review-suggestions');for(const issue of issues.slice(0,5))list.append(node('li','',issue.message||'Review wording.'));detail.append(list);if(issues.length>5)detail.append(node('small','',`${issues.length-5} additional suggestions are omitted from this preview.`));}
        row.append(detail);$('captureReviewList').append(row);
      }
    }catch(error){if(request===captureReviewRequest&&uiUnlocked)$('captureReviewStatus').textContent=error.message;}
    finally{if(request===captureReviewRequest)$('captureReview').disabled=false;}
  }
  async function lock(force = false) {
    if (!force && editorDirty() && !(await ask('Lock now? A successfully autosaved draft can be recovered after unlocking.'))) return;
    if (editorDirty()) await persistDraft();
    showGate(true); broadcast({type:'locked'});
    try {
      const response=await fetch('/api/lock',{method:'POST',headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
      if(!response.ok) throw new Error('Lock could not be confirmed.');
    } catch { $('gateError').textContent='Content is hidden, but service lock could not be confirmed. Stop the local service if it is still running.'; }
  }
  async function openQuick() {
    if ($('shell').hidden) return;
    $('quickSearch').value = ''; quickItems = []; quickIndex = 0;
    $('quickDialog').showModal(); $('quickSearch').setAttribute('aria-expanded','true'); $('quickSearch').focus();
    await loadQuick();
  }
  async function loadQuick() {
    const request = ++quickCounter;
    try {
      const params = new URLSearchParams({q:$('quickSearch').value.trim(),sort:'relevance',limit:'12',view:'preview'});
      const result = await api(`/api/items?${params}`);
      if (request !== quickCounter || !$('quickDialog').open) return;
      quickItems = result.items; quickIndex = 0; renderQuick();
    } catch (error) { notice(error.message); }
  }
  function renderQuick() {
    const list = $('quickResults'); list.replaceChildren();
    $('quickSearch').removeAttribute('aria-activedescendant');
    if(quickItems[quickIndex])$('quickSearch').setAttribute('aria-activedescendant',`quick-option-${quickIndex}`);
    if (!quickItems.length) { list.append(node('p','muted quick-empty','No matches. Try a simpler search.')); return; }
    quickItems.forEach((item, index) => {
      const result = button('', `Use ${item.title}`, () => void copyItem(item), `quick-result ${index === quickIndex ? 'selected' : ''}`);
      result.id=`quick-option-${index}`;result.setAttribute('role','option'); result.setAttribute('aria-selected',String(index === quickIndex));
      const details = node('span','quick-result-text'); details.append(node('strong','',item.title));
      details.append(node('small','',`${item.kind === 'template' ? 'Template' : 'Prompt'}${item.project ? ' · '+item.project : ''}${item.useCount ? ' · '+item.useCount+' uses' : ''}`));
      result.append(node('span','quick-result-icon',item.kind === 'template' ? '✧' : '▤'),details,node('span','quick-result-copy','↵'));
      result.addEventListener('mouseenter',() => {quickIndex = index; $('quickSearch').setAttribute('aria-activedescendant',`quick-option-${index}`); list.querySelectorAll('.quick-result').forEach((el,i) => {
        el.classList.toggle('selected', i === index); el.setAttribute('aria-selected',String(i === index));
      });});
      list.append(result);
    });
  }
  async function loadBridgeStatus() {
    try {
      const result = await api('/api/bridge/status');
      $('bridgeStatus').textContent = result.active ?
        `Helper paired (write-only) until ${new Date(result.expiresAt).toLocaleTimeString()}. Revoke here or lock your vault.` :
        'No browser helper is currently paired. Approve a source below, then pair the helper.';
    } catch (error) { $('bridgeStatus').textContent = error.message; }
  }
  async function generatePairing() {
    try {
      const result = await api('/api/bridge/start','POST',{autoCaptureHosts:$('bridgeAuto').checked?['chatgpt.com','claude.ai','gemini.google.com']:[]});
      $('pairCode').value = result.pairingCode; $('pairCodeWrap').hidden=false;
      if(!$('captureView').hidden)void loadCaptureHome();
      notice('Code generated. Paste it into the browser extension within 10 minutes.');
    } catch (error) { notice(error.message); }
  }
  async function revokePairing() {
    try {
      await api('/api/bridge/revoke','POST',{});
      $('pairCodeWrap').hidden=true;$('pairCode').value='';
      await loadBridgeStatus();notice('Browser helper access revoked.');
      if(!$('captureView').hidden)await loadCaptureHome();
    } catch (error) {notice(error.message);}
  }
  function openBackup(mode) {
    backupReviewed=false;pendingBackupData=null;$('backupPreview').hidden=true;$('backupPreview').textContent='';
    backupMode = mode; $('backupTitle').textContent = mode === 'export' ? 'Create an encrypted backup' : 'Restore an encrypted backup';
    $('backupExplain').textContent = mode === 'export' ?
      'Choose a strong, separate passphrase for the portable backup. No plaintext JSON files are created.' :
      'Import merges entries and history without overwriting existing IDs. Use the passphrase chosen when this backup was created.';
    $('backupConfirmWrap').hidden = mode !== 'export'; $('backupConfirm').required = mode === 'export';
    $('backupPassphrase').value = ''; $('backupConfirm').value = ''; $('backupError').textContent = '';
    $('doBackup').textContent = mode === 'export' ? 'Download encrypted file' : 'Preview restore';
    $('backupDialog').showModal(); $('backupPassphrase').focus();
  }
  async function finishBackup() {
    const passphrase = $('backupPassphrase').value;
    if (passphrase.length < 12) { $('backupError').textContent = 'Use at least 12 characters.'; return; }
    if (backupMode === 'export' && $('backupConfirm').value !== passphrase) {
      $('backupError').textContent = 'Passphrases do not match.'; return;
    }
    const epoch=sessionEpoch;
    $('doBackup').disabled = true; $('backupError').textContent = '';
    try {
      if (backupMode === 'export') {
        const response = await fetch('/api/backup/export', {method:'POST',cache:'no-store',
          headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },body:JSON.stringify({passphrase})});
        if (!response.ok) { const error = await response.json(); throw new Error(error.error || 'Backup failed.'); }
        const data = await response.blob(); if(epoch!==sessionEpoch)return; const href = URL.createObjectURL(data);
        const link = node('a'); link.href = href; link.download = `promteSaver-${new Date().toISOString().slice(0,10)}.pomte`;
        document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(href), 30_000);
        notice('Encrypted backup created. Keep the backup passphrase safe.');
      } else {
        if (!importFile) throw new Error('Choose a .pomte file first.');
        if (!pendingBackupData) {
          if (importFile.size > 12 * 1024 * 1024 + 512) throw new Error('Backup file is larger than 12 MiB.');
          const bytes = new Uint8Array(await importFile.arrayBuffer());
          if(epoch!==sessionEpoch){bytes.fill(0);return;}
          let binary='';for(let i=0;i<bytes.length;i+=16383)binary+=String.fromCharCode(...bytes.subarray(i,i+16383));
          pendingBackupData=btoa(binary);binary='';bytes.fill(0);
        }
        if (!backupReviewed) {
          const preview=await api('/api/backup/preview','POST',{backup:pendingBackupData,passphrase});
          $('backupPreview').hidden=false;
          $('backupPreview').textContent=`Ready to add ${preview.imported} saved prompts, ${preview.styles ?? 0} writing profiles, and ${preview.captures} captured records. ${preview.skipped} existing IDs will be kept (${preview.conflicts} have different content). ${preview.deletions} captured records will be deleted by saved deletion records. `+
            (preview.legacy?'This older backup may not include writing profiles; v1 also lacks capture-deletion records. ':'')+'Nothing has changed yet. Review these counts, then confirm.';
          backupReviewed=true;$('doBackup').textContent='Confirm restore';return;
        }
        const result = await api('/api/backup/import', 'POST', { backup:pendingBackupData, passphrase });
        notice(`Restored ${result.imported} entries; kept ${result.skipped} existing entries. ${result.captures} captured records imported.`);
        await refresh();
      }
      $('backupDialog').close(); $('backupPassphrase').value=''; $('backupConfirm').value=''; importFile=null; $('backupFile').value='';
    } catch (error) { if(epoch===sessionEpoch)$('backupError').textContent = error.message; }
    finally { $('doBackup').disabled = false; }
  }
  function updateSelection() {
    $('selectedCount').textContent=`${selected.size} selected`; $('bulkControls').hidden=!selected.size;
    $('selectPage').checked=!!currentItems.length && selected.size===currentItems.length;
    $('selectPage').indeterminate=selected.size>0 && selected.size<currentItems.length;
    for(const id of ['bulkPin','bulkUnpin','bulkMove','bulkTrash'])$(id).hidden=section==='trash';
    $('bulkRestore').hidden=section!=='trash';
  }
  async function bulk(operation) {
    const items=currentItems.filter(item=>selected.has(item.id));if(!items.length)return;
    const payload={operation,entries:items.map(item=>({id:item.id,etag:item.etag}))};
    if(operation==='move') {const project=await ask('Project name (leave empty to remove the project):',{input:'',title:'Move selected prompts'});if(project===null)return;payload.project=project;}
    if(operation==='trash' && !(await ask(`Move ${items.length} selected prompts to trash?`)))return;
    try {const result=await api('/api/items/batch','POST',payload);await refresh();notice(`Updated ${result.changed} prompts.`);}
    catch(error){notice(error.message);if(error.status===412)await refresh();}
  }
  function styleFields() {
    return { name:$('styleName').value.trim(), retain:$('styleRetainExamples').checked, tone:$('styleTone').value.trim(), audience:$('styleAudience').value.trim(),
      avoid:$('styleAvoid').value.split(',').map(s=>s.trim()).filter(Boolean).slice(0,30) };
  }
  function styleFingerprint() { return JSON.stringify(styleFields()); }
  function styleHasUnsaved() {
    return Boolean($('styleSamples').value.trim()) ||
      (activeStyle ? styleFingerprint() !== styleSavedFields : Boolean($('styleName').value.trim() || styleWork));
  }
  function styleStatus(message, isError=false, target='styleAnalysisStatus') {
    if (!uiUnlocked) return;
    $(target).textContent=message;$(target).classList.toggle('error',isError);
  }
  function resetStyleFields() {
    activeStyle=null;activeStyleId=null;activeStyleETag=null;styleWork=null;styleSavedFields='';styleAnalyzedSamples='';styleGeneration++;styleLoadGeneration++;
    $('styleName').value='';$('styleSamples').value='';$('styleTone').value='Natural, clear and direct';$('styleAudience').value='Adapt to the intended reader';$('styleAvoid').value='';
    $('styleInstructions').value='';$('styleTask').value='';$('styleIncludeExamples').checked=false;$('styleRetainExamples').checked=false;$('styleExampleReview').hidden=true;$('styleExampleList').replaceChildren();
    $('styleAnalytics').hidden=true;$('styleAnalytics').replaceChildren();$('styleDelete').hidden=true;
    styleStatus('Paste samples and select Analyze to create a profile.');styleStatus('Instructions are not an actual rewrite. Paste them into an AI tool to generate one.',false,'styleUseStatus');
  }
  function renderStyleMetrics(profile) {
    const area=$('styleAnalytics');area.replaceChildren();
    for(const [number,label] of [[profile.sampleCount,'Samples analyzed'],[profile.wordCount,'Words analyzed'],[profile.meanSentenceWords,'Avg. words / sentence']]){
      const item=node('div','writing-metric');item.append(node('strong','',String(number)),node('small','',label));area.append(item);
    }
    area.hidden=false;
    const sampleList=$('styleExampleList');sampleList.replaceChildren();
    for(const [index,text] of (profile.examples||[]).entries()){sampleList.append(node('p','',`Sample ${index+1}: ${text}`));}
    $('styleExampleReview').hidden=!profile.examples?.length;
  }
  async function loadStyleProfiles() {
    const request=++styleLoadGeneration;
    try{
      const data=await api('/api/styles');if(request!==styleLoadGeneration||!uiUnlocked)return;
      $('styleCount').textContent=String(data.profiles.length);
      const parent=$('styleProfileList');parent.replaceChildren();
      if(!data.profiles.length){parent.append(node('p','writing-help','No writing profiles yet. Create your first one.'));return;}
      for(const item of data.profiles){
        const entry=button(item.name,`Edit ${item.name}`,()=>void selectStyle(item.id),'writing-profile');
        entry.replaceChildren(node('strong','',item.name),node('small','',`${item.sampleCount} sample(s) · ${item.wordCount} words`));
        entry.classList.toggle('active',item.id===activeStyleId);parent.append(entry);
      }
    }catch(error){styleStatus(error.message,true);}
  }
  async function selectStyle(id) {
    if(activeStyleId===id)return;
    if(styleHasUnsaved() && !(await ask('Discard the unsaved writing samples and changes before opening another profile?',{title:'Change writing profile'})))return;
    const generation=++styleLoadGeneration;
    try{
      const result=await api(`/api/styles/${encodeURIComponent(id)}`);
      if(!uiUnlocked||generation!==styleLoadGeneration)return;
      resetStyleFields(); activeStyle=result.style;activeStyleId=result.style.id;activeStyleETag=result.etag;styleWork=structuredClone(result.style.profile);
      $('styleName').value=result.style.name;$('styleTone').value=styleWork.preferences.tone;
      $('styleAudience').value=styleWork.preferences.audience;$('styleAvoid').value=styleWork.preferences.avoid.join(', ');
      $('styleSamples').value='';$('styleRetainExamples').checked=Boolean(styleWork.examples.length);styleSavedFields=styleFingerprint();$('styleDelete').hidden=false;
      renderStyleMetrics(styleWork);styleStatus('Encrypted profile loaded. Add new samples and select Analyze to replace its analysis, or edit preferences and save.');
      await loadStyleProfiles();
    }catch(error){styleStatus(error.message,true);}
  }
  async function analyzeStyle() {
    const generation=++styleGeneration, activeId=activeStyleId;
    const before=$('styleSamples').value;
    const samples=before.split(/^\s*---\s*$/m).map(s=>s.trim()).filter(Boolean);
    if(!samples.length){styleStatus('Paste at least one writing sample before analyzing.',true);return;}
    $('styleAnalyze').disabled=true;
    try{
      const data=await api('/api/styles/analyze','POST',{samples,preferences:styleFields()});
      if(!uiUnlocked||generation!==styleGeneration||activeStyleId!==activeId||before!==$('styleSamples').value)return;
      styleWork=data.profile;styleAnalyzedSamples=before;renderStyleMetrics(styleWork);
      styleStatus(`Analyzed ${styleWork.sampleCount} sample(s). ${data.redactions?`${data.redactions} sensitive match(es) removed. `:''}Review and save the encrypted profile.`);
    }catch(error){styleStatus(error.message,true);}finally{$('styleAnalyze').disabled=false;}
  }
  async function saveStyle(event) {
    event.preventDefault();
    if(!styleWork){styleStatus('Analyze writing samples before saving this profile.',true);return;}
    if($('styleSamples').value.trim() && $('styleSamples').value!==styleAnalyzedSamples){styleStatus('Samples changed. Select Analyze again before saving.',true);return;}
    const fields=styleFields();
    if(!fields.name){styleStatus('Enter a profile name.',true);return;}
    const profile=structuredClone(styleWork);
    profile.preferences={tone:fields.tone,audience:fields.audience,avoid:fields.avoid};
    if(!fields.retain) profile.examples=[];
    $('styleSave').disabled=true;
    try{
      const result=await api(activeStyleId?`/api/styles/${activeStyleId}`:'/api/styles',activeStyleId?'PUT':'POST',{name:fields.name,profile},activeStyleETag);
      if(!uiUnlocked)return;
      activeStyle=result.style;activeStyleId=result.style.id;activeStyleETag=result.etag;styleWork=structuredClone(result.style.profile);
      styleSavedFields=styleFingerprint();styleAnalyzedSamples='';$('styleSamples').value='';$('styleDelete').hidden=false;
      $('styleRetainExamples').checked=Boolean(styleWork.examples.length);styleSavedFields=styleFingerprint();
      renderStyleMetrics(styleWork);await loadStyleProfiles();
      styleStatus(`Profile saved in your encrypted vault. ${result.style.redactions?`${result.style.redactions} total sensitive match(es) redacted.`:''}`);
    }catch(error){styleStatus(error.message,true);}
    finally{$('styleSave').disabled=false;}
  }
  async function deleteStyle() {
    if(!activeStyleId||!activeStyleETag)return;
    if(!(await ask(`Permanently remove “${activeStyle.name}”? It cannot be restored without an older encrypted backup.`,{title:'Delete writing profile'})))return;
    try{
      await api(`/api/styles/${activeStyleId}`,'DELETE',undefined,activeStyleETag);
      resetStyleFields();await loadStyleProfiles();notice('Writing profile permanently removed.');
    }catch(error){styleStatus(error.message,true);}
  }
  async function generateStyle() {
    if(!activeStyleId){styleStatus('Save a writing profile first.',true,'styleUseStatus');return;}
    const task=$('styleTask').value,includeExamples=$('styleIncludeExamples').checked,profileId=activeStyleId;
    if(!task.trim()){styleStatus('Describe what you want to write or rewrite.',true,'styleUseStatus');return;}
    const generation=++styleGeneration;
    $('styleGenerate').disabled=true;
    try{
      const result=await api(`/api/styles/${activeStyleId}/prompt`,'POST',{task,includeExamples});
      if(generation!==styleGeneration||!uiUnlocked||activeStyleId!==profileId||task!==$('styleTask').value)return;
      $('styleInstructions').value=result.prompt;
      styleStatus(`Instructions ready. ${includeExamples?'Saved excerpts and phrases included when available, with your permission.':'No writing excerpts included.'} Review before sending to any AI tool.`,false,'styleUseStatus');
    }catch(error){styleStatus(error.message,true,'styleUseStatus');}
    finally{$('styleGenerate').disabled=false;}
  }
  async function checkWriting() {
    const input=$('styleProofText').value;
    const request=++proofGeneration;
    $('styleProofIssues').replaceChildren();
    if(!input.trim()){styleStatus('Paste text to check first.',true,'styleProofStatus');return;}
    $('styleProofCheck').disabled=true;
    try{
      const result=await api('/api/writing/check','POST',{text:input});
      if(!uiUnlocked||proofGeneration!==request||$('styleProofText').value!==input)return;
      const issues=result.issues||[];
      styleStatus(issues.length?`${issues.length} possible improvement(s). Review each suggestion; some wording may be intentional.`:'No issues found by these basic checks. This does not guarantee correct grammar.',false,'styleProofStatus');
      const list=$('styleProofIssues');
      for(const issue of issues){
        const wrap=node('div','writing-issue');
        const description=node('div');description.append(node('p','',issue.message),node('small','',`Found: ${issue.before.slice(0,110)}`));wrap.append(description);
        if(typeof issue.replacement==='string'){
          const action=button(`Apply: ${issue.replacement||'remove'}`,'Apply this specific suggestion to the text above',()=>{
            const current=$('styleProofText').value;
            if(current.slice(issue.start,issue.end)!==issue.before){styleStatus('Text changed since the check. Run it again before applying.',true,'styleProofStatus');return;}
            $('styleProofText').value=current.slice(0,issue.start)+issue.replacement+current.slice(issue.end);
            proofGeneration++;$('styleProofIssues').replaceChildren();styleStatus('Suggestion applied to the editable draft. Run Check again to review remaining items.',false,'styleProofStatus');
            $('styleProofText').focus();$('styleProofText').setSelectionRange(issue.start+issue.replacement.length,issue.start+issue.replacement.length);
          },'btn subtle');wrap.append(action);
        }
        list.append(wrap);
      }
    }catch(error){styleStatus(error.message,true,'styleProofStatus');}
    finally{$('styleProofCheck').disabled=false;}
  }
  function saveStyleFile(filename,text,mime='text/plain') {
    if(!uiUnlocked)return;
    const url=URL.createObjectURL(new Blob([text],{type:mime}));
    styleDownloadUrls.add(url);
    const anchor=node('a');anchor.href=url;anchor.download=filename;anchor.click();
    setTimeout(()=>{URL.revokeObjectURL(url);styleDownloadUrls.delete(url);},30000);
  }
  function styleFilename(extension) {
    const label=(activeStyle?.name??'writing-profile').toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,50);
    return `${label||'writing-profile'}.${extension}`;
  }
  async function styleCopy() {
    if(!$('styleInstructions').value.trim()){styleStatus('Generate instructions first.',true,'styleUseStatus');return;}
    try{await navigator.clipboard.writeText($('styleInstructions').value);if(uiUnlocked)styleStatus('Instructions copied. Paste them into the AI tool of your choice.',false,'styleUseStatus');}
    catch{if(uiUnlocked){$('styleInstructions').focus();$('styleInstructions').select();styleStatus('Clipboard permission denied. Select the text and copy with Ctrl/Cmd+C.',true,'styleUseStatus');}}
  }
  function exportStyleJson() {
    if(!activeStyle){styleStatus('Save a profile first.',true);return;}
    const bundle={schema:'promtesaver-style-v1',warning:'UNENCRYPTED personal style profile. Review before sharing.',
      name:activeStyle.name,profile:{...activeStyle.profile,examples:$('styleIncludeExamples').checked?[...activeStyle.profile.examples]:[],
        preferredPhrases:$('styleIncludeExamples').checked?[...activeStyle.profile.preferredPhrases]:[]}};
    saveStyleFile(styleFilename('json'),JSON.stringify(bundle,null,2),'application/json');
    styleStatus(`Portable profile exported. ${$('styleIncludeExamples').checked?'Excerpts included; review carefully.':'Excerpts and recurring phrases excluded.'}`);
  }
  async function styleAsPrompt() {
    const text=$('styleInstructions').value, styleName=activeStyle?.name, profileId=activeStyleId, epoch=sessionEpoch;
    if(!activeStyle||!text.trim()){styleStatus('Generate your instructions before saving.',true,'styleUseStatus');return;}
    if(!(await ask('Save these reviewed instructions as a regular library prompt? This will make them searchable and included in encrypted backups.',{title:'Save writing instructions'})))return;
    if(!uiUnlocked||sessionEpoch!==epoch||activeStyleId!==profileId||$('styleInstructions').value!==text)return;
    try{
      await api('/api/items','POST',{title:`${styleName} · style instructions`.slice(0,140),body:text,kind:'prompt',project:'Writing Studio',tags:['writing','style'],source:'Writing Studio'});
      styleStatus('Instructions saved in your encrypted prompt library.',false,'styleUseStatus');
    }catch(error){styleStatus(error.message,true,'styleUseStatus');}
  }
  function setAuthBusy(busy) {
    $('gateForm').setAttribute('aria-busy', String(busy));
    $('gateAction').disabled=busy;$('passphrase').disabled=busy;$('confirm').disabled=busy;
    $('gateProgress').hidden=!busy;$('gateCancel').disabled=false;
    $('gateProgressText').textContent=initialized?'Unlocking securely on this device...':'Protecting your new vault...';
  }
  async function refreshHealth() {
    if(!uiUnlocked)return;
    const epoch=sessionEpoch;$('healthRefresh').disabled=true;
    $('healthStatus').textContent='Reading a local resource snapshot...';
    try {
      const report=await api('/api/diagnostics');
      if(!uiUnlocked||epoch!==sessionEpoch)return;
      runtimeReport=report;
      $('healthMemory').textContent=`${report.resources.serviceRssMiB.toFixed(1)} MiB`;
      $('healthProfile').textContent=report.resources.profile==='low-memory'?'Low memory':'Standard';
      $('healthStorage').textContent=report.storage.sizeMiB===null?'Unavailable':`${report.storage.sizeMiB.toFixed(1)} MiB`;
      $('healthRuntime').textContent=`v${report.version}`;
      $('healthRuntimeNote').textContent=`Node ${report.runtime.node} / ${report.runtime.platform} ${report.runtime.architecture}`;
      $('healthStatus').textContent=report.runtime.supportedNode?
        (report.resources.lowMemoryRecommended&&report.resources.profile!=='low-memory'?'Low-memory mode is worth trying on this device. This snapshot excludes your browser or WebView.':'Snapshot ready. Memory is sampled, not peak usage, and excludes your browser or WebView.'):
        'Development compatibility runtime detected. Use the supported Node 24.16+ (24.x) runtime for local acceptance tests.';
      $('healthExport').disabled=false;
    }catch(error){if(uiUnlocked)$('healthStatus').textContent=error.message;}
    finally{$('healthRefresh').disabled=false;}
  }
  function applyPreferences(value) {
    preferences=value;PAGE_SIZE=value.lowMemory?20:40;
    document.body.classList.toggle('low-memory',value.lowMemory);document.body.classList.toggle('compact',value.compactMode);
    $('prefIdle').value=String(value.idleMinutes);$('prefLowMemory').checked=value.lowMemory;
    $('prefCompact').checked=value.compactMode;$('prefHide').checked=value.lockOnHide;
    $('idleLabel').textContent=`The vault locks after ${value.idleMinutes} minutes of inactivity. Decrypted content is cleared from this tab when it locks.`;
  }
  function resetRetentionReview(message='No cleanup has been reviewed.') {
    retentionReview=null;$('retentionApply').disabled=true;$('retentionStatus').textContent=message;
  }
  async function loadPreferences(){applyPreferences(await api('/api/preferences'));}
  function clearPassphraseForm(){for(const id of ['currentPassphrase','newPassphrase','confirmNewPassphrase'])$(id).value='';$('passphraseError').textContent='';}
  function resetBackupReview(){backupReviewed=false;$('backupPreview').hidden=true;$('backupPreview').textContent='';if(backupMode==='import')$('doBackup').textContent='Preview restore';}
  function initActions() {
    $('capturePairingSlot').append(document.querySelector('.bridge-panel'));
    $('moreView').append(document.querySelector('.ai-connection'));
    $('captureNav').addEventListener('click',()=>chooseSection('capture'));
    $('moreNav').addEventListener('click',()=>chooseSection('more'));
    for(const id of ['captureSetupButton','captureEmptySetup','tipButton'])$(id).addEventListener('click',openCaptureSetup);
    $('captureSetupClose').addEventListener('click',()=>{$('captureSetup').hidden=true;$('captureSetupButton').focus();});
    $('captureRefresh').addEventListener('click',()=>void loadCaptureHome());
    $('captureReview').addEventListener('click',()=>void reviewCaptures());
    $('captureReviewClose').addEventListener('click',()=>{captureReviewRequest++;$('captureReview').disabled=false;$('captureReviewPanel').hidden=true;$('captureReviewList').replaceChildren();$('captureReviewStatus').textContent='';$('captureReview').focus();});
    for(const id of ['captureHistory','captureAll'])$(id).addEventListener('click',()=>chooseSection('captured'));
    $('capturePause').addEventListener('click',async()=>{
      if(!(await ask('Pause all capture sources? Browser pairing is revoked and the Codex source stops. Reconnect or approve each source again to resume.',{title:'Pause all capture',accept:'Pause all capture'})))return;
      $('capturePause').disabled=true;
      try{await api('/api/capture/pause','POST',{});$('pairCodeWrap').hidden=true;$('pairCode').value='';$('captureNativeConsent').checked=false;$('captureNativeEnable').disabled=true;await loadCaptureHome();notice('All capture sources paused.');}
      catch(error){notice(error.message);await loadCaptureHome();}
    });
    $('captureNativeConsent').addEventListener('change',()=>{$('captureNativeEnable').disabled=!$('captureNativeConsent').checked;});
    $('captureNativeEnable').addEventListener('click',async()=>{
      if(!$('captureNativeConsent').checked)return;
      $('captureNativeEnable').disabled=true;
      try{await api('/api/capture/native','POST',{enabled:true,consent:true});$('captureNativeConsent').checked=false;await loadCaptureHome();}
      catch(error){notice(error.message);if(uiUnlocked)$('captureNativeEnable').disabled=!$('captureNativeConsent').checked;}
    });
    $('captureNativePause').addEventListener('click',async()=>{
      $('captureNativePause').disabled=true;
      try{await api('/api/capture/native','POST',{enabled:false});await loadCaptureHome();notice('Codex capture paused.');}
      catch(error){notice(error.message);}finally{$('captureNativePause').disabled=false;}
    });
    $('refreshLibrary').addEventListener('click',async()=>{$('refreshLibrary').disabled=true;try{await refresh();}finally{$('refreshLibrary').disabled=false;}});
    $('topSettings').addEventListener('click',()=>chooseSection('settings'));
    $('cardLayout').addEventListener('click',()=>{wbLayout='cards';$('itemsList').dataset.layout='cards';wbMode();});
    $('listLayout').addEventListener('click',()=>{wbLayout='list';$('itemsList').dataset.layout='list';wbMode();});
    $('inspectorToggle').addEventListener('click',()=>{wbVisible=!wbVisible;wbMode();if(!wbVisible)$('shell').classList.remove('wb-inspector-open');});
    $('focusToggle').addEventListener('click',()=>{wbFocus=!wbFocus;wbMode();notice(wbFocus?'Focus mode on':'Focus mode off');});
    $('wbClose').addEventListener('click',()=>{wbClear();wbVisible=false;wbMode();$('shell').classList.remove('wb-inspector-open');});
    $('assistantNav').addEventListener('click',()=>void assistant.open());
    $('wbAi').addEventListener('click',()=>{if(wbItem)void assistant.open(wbItem.body,wbItem.title,wbItem);});
    $('wbCopy').addEventListener('click',()=>{if(wbItem)void copyItem(wbItem);});
    $('wbEdit').addEventListener('click',()=>{if(wbItem)void openEditor(wbItem);});
    document.querySelectorAll('[data-pane]').forEach(b=>b.addEventListener('click',()=>{if($('writingView').hidden)return;const h=$(b.dataset.pane);h?.scrollIntoView({behavior:'smooth',block:'start'});document.querySelectorAll('[data-pane]').forEach(other=>other.classList.toggle('active',other===b));}));

    $('actionForm').addEventListener('submit',event=>{event.preventDefault();answerDialog(true);});
    $('actionCancel').addEventListener('click',()=>answerDialog(false));
    $('actionDialog').addEventListener('cancel',event=>{event.preventDefault();answerDialog(false);});
    $('preferencesForm').addEventListener('submit',async event=>{
      event.preventDefault();$('savePreferences').disabled=true;
      try {applyPreferences(await api('/api/preferences','PUT',{idleMinutes:Number($('prefIdle').value),lowMemory:$('prefLowMemory').checked,compactMode:$('prefCompact').checked,lockOnHide:$('prefHide').checked}));
        pageOffset=0;await loadItems();$('preferencesNotice').textContent='Preferences saved in the encrypted vault.';}
      catch(error){if(uiUnlocked)$('preferencesNotice').textContent=error.message;}finally{$('savePreferences').disabled=false;}
    });
    $('retentionDays').addEventListener('change',()=>resetRetentionReview());
    $('retentionPreview').addEventListener('click',async()=>{
      resetRetentionReview('Checking captured snapshots…');$('retentionPreview').disabled=true;
      try{
        const review=await api('/api/captured/retention-preview','POST',{days:Number($('retentionDays').value)});
        if(!uiUnlocked)return;
        retentionReview=review;
        $('retentionStatus').textContent=review.count?`${review.count} captured snapshot${review.count===1?'':'s'} older than ${review.days} days, including linked editable copies and history. Oldest: ${localDate(review.oldest)}.`:'No captured snapshots match this window.';
        $('retentionApply').disabled=!review.count;
      }catch(error){if(uiUnlocked)resetRetentionReview(error.message);}
      finally{$('retentionPreview').disabled=false;}
    });
    $('retentionApply').addEventListener('click',async()=>{
      const review=retentionReview;if(!review?.count)return;
      if(!await ask(`Permanently delete ${review.count} reviewed captured snapshot${review.count===1?'':'s'} and any linked editable copies and history?`))return;
      $('retentionApply').disabled=true;
      try{const result=await api('/api/captured/retention-apply','POST',review);resetRetentionReview(`Deleted ${result.removed} captured snapshot${result.removed===1?'':'s'}.`);await refresh();}
      catch(error){if(uiUnlocked)resetRetentionReview(`${error.message} Preview again before deleting.`);}
    });
    $('changePassphrase').addEventListener('click',()=>{clearPassphraseForm();$('passphraseDialog').showModal();$('currentPassphrase').focus();});
    for(const id of ['closePassphrase','cancelPassphrase'])$(id).addEventListener('click',()=>{$('passphraseDialog').close();clearPassphraseForm();});
    $('passphraseDialog').addEventListener('close',clearPassphraseForm);
    $('passphraseForm').addEventListener('submit',async event=>{
      event.preventDefault();$('doPassphrase').disabled=true;
      try {await api('/api/passphrase','POST',{current:$('currentPassphrase').value,replacement:$('newPassphrase').value,confirm:$('confirmNewPassphrase').value});
        showGate(true);broadcast({type:'locked'});$('gateDescription').textContent='Passphrase updated. Unlock with your new passphrase. Browser-helper access has been revoked.';}
      catch(error){if(uiUnlocked)$('passphraseError').textContent=error.message;}finally{$('doPassphrase').disabled=false;}
    });
    $('selectPage').addEventListener('change',()=>{selected.clear();if($('selectPage').checked)currentItems.forEach(item=>selected.add(item.id));renderItems();});
    for(const [id,op]of [['bulkPin','pin'],['bulkUnpin','unpin'],['bulkMove','move'],['bulkTrash','trash'],['bulkRestore','restore']])$(id).addEventListener('click',()=>void bulk(op));
    $('bulkClear').addEventListener('click',()=>{selected.clear();renderItems();});
    $('previousPage').addEventListener('click',()=>void loadItems('previous'));
    $('editorDialog').addEventListener('cancel',event=>{event.preventDefault();closeEditor();});
    $('editorForm').addEventListener('input',event=>{if(['entryTitle','entryBody','entryProject'].includes(event.target.id))resetRecall();scheduleDraft();});
    $('editorForm').addEventListener('change',scheduleDraft);
    $('findRelated').addEventListener('click',()=>void findRelated());
    window.addEventListener('beforeunload',event=>{if(editorDirty()){event.preventDefault();event.returnValue='';}});
    $('saveDraftAsNew').addEventListener('click',()=>{editingId=null;editingETag=undefined;$('modalTitle').textContent='Save draft as a new prompt';$('editorError').textContent='';$('saveDraftAsNew').hidden=true;});
    $('backupPassphrase').addEventListener('input',resetBackupReview);
    $('backupDialog').addEventListener('close',()=>{pendingBackupData=null;backupReviewed=false;$('backupPassphrase').value='';$('backupConfirm').value='';$('backupPreview').textContent='';});
    $('quickDialog').addEventListener('close',()=>{$('quickSearch').setAttribute('aria-expanded','false');$('quickSearch').removeAttribute('aria-activedescendant');});

    $('healthRefresh').addEventListener('click',()=>void refreshHealth());
    $('healthExport').addEventListener('click',()=>{
      if(uiUnlocked&&runtimeReport)saveStyleFile('promteSaver-diagnostics.json',JSON.stringify(runtimeReport,null,2),'application/json');
    });
    $('gateCancel').addEventListener('click',async()=>{
      authAttempt++;$('gateCancel').disabled=true;
      try {
        await api('/api/lock','POST');
        const status=await api('/api/status');showGate(status.initialized);
        $('gateError').textContent='Cancelled. Your vault is locked.';
      }catch(error){showGate(initialized);$('gateError').textContent=`Could not confirm cancellation: ${error.message}`;}
      finally{setAuthBusy(false);}
    });
    $('gateForm').addEventListener('submit', async event => {
      event.preventDefault();
      const attempt=++authAttempt;
      const passphrase = $('passphrase').value; const confirm = $('confirm').value;
      $('gateError').textContent = ''; setAuthBusy(true);
      try {
        if (initialized) await api('/api/unlock','POST',{passphrase});
        else await api('/api/setup','POST',{passphrase,confirm});
        if(attempt!==authAttempt)return;
        await showApp();
      } catch (error) { if(attempt===authAttempt)$('gateError').textContent = error.message; }
      finally { if(attempt===authAttempt)setAuthBusy(false); }
    });
    document.querySelectorAll('[data-filter]').forEach(el => el.addEventListener('click',() => chooseSection(el.dataset.filter)));
    $('settingsNav').addEventListener('click',() => chooseSection('settings'));
    $('writingNav').addEventListener('click',() => chooseSection('writing'));
    $('styleNew').addEventListener('click',async()=>{if(styleHasUnsaved()&&!(await ask('Discard unsaved writing changes?',{title:'New writing profile'})))return;resetStyleFields();await loadStyleProfiles();$('styleName').focus();});
    $('styleAnalyze').addEventListener('click',()=>void analyzeStyle());
    $('styleForm').addEventListener('submit',event=>void saveStyle(event));
    $('styleDelete').addEventListener('click',()=>void deleteStyle());
    $('styleGenerate').addEventListener('click',()=>void generateStyle());
    $('styleProofCheck').addEventListener('click',()=>void checkWriting());
    $('styleProofClear').addEventListener('click',()=>{proofGeneration++;$('styleProofText').value='';$('styleProofIssues').replaceChildren();styleStatus('Text cleared. Nothing was saved.',false,'styleProofStatus');});
    $('styleProofText').addEventListener('input',()=>{proofGeneration++;$('styleProofIssues').replaceChildren();styleStatus('Draft changed. Select Check to analyze the new text.',false,'styleProofStatus');});
    $('styleCopy').addEventListener('click',()=>void styleCopy());
    $('styleDownload').addEventListener('click',()=>{if($('styleInstructions').value.trim())saveStyleFile(styleFilename('md'),$('styleInstructions').value,'text/markdown');else styleStatus('Prepare instructions first.',true,'styleUseStatus');});
    $('styleExport').addEventListener('click',exportStyleJson);
    $('styleSaveTemplate').addEventListener('click',()=>void styleAsPrompt());
    $('styleSamples').addEventListener('input',()=>{styleStatus('Samples changed. Select Analyze before saving.');});
    $('styleTask').addEventListener('input',()=>{styleGeneration++;$('styleInstructions').value='';});
    $('styleIncludeExamples').addEventListener('change',()=>{styleGeneration++;$('styleInstructions').value='';});
    $('settingsBack').addEventListener('click',() => chooseSection('all'));
    for (const id of ['lockButton','settingsLock']) $(id).addEventListener('click',() => void lock());
    for (const id of ['heroNew','newButton','emptyNew']) $(id).addEventListener('click',() => openEditor());
    for (const id of ['cancelDialog','closeDialog']) $(id).addEventListener('click',()=>closeEditor());
    for (const id of ['closeHistory','doneHistory']) $(id).addEventListener('click',() => $('historyDialog').close());
    $('searchInput').addEventListener('input',() => {clearTimeout(searchTimer);searchTimer=setTimeout(() => void loadItems(),240);});
    for (const id of ['projectFilter','tagFilter','sortFilter']) $(id).addEventListener('change',() => void loadItems());
    $('clearFilters').addEventListener('click',() => {$('searchInput').value='';$('projectFilter').value='';$('tagFilter').value='';$('sortFilter').value='updated';void loadItems();});
    $('loadMoreButton').addEventListener('click',() => void loadItems(true));
    $('quickButton').addEventListener('click',() => void openQuick());
    $('closeQuick').addEventListener('click',() => $('quickDialog').close());
    $('quickSearch').addEventListener('input',() => {clearTimeout(searchTimer);searchTimer=setTimeout(() => void loadQuick(),100);});
    $('quickSearch').addEventListener('keydown',event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); if (quickItems.length) quickIndex = (quickIndex + (event.key==='ArrowDown'?1:-1) + quickItems.length) % quickItems.length;
        renderQuick(); $('quickResults').querySelector('.selected')?.scrollIntoView({block:'nearest'});
      } else if(event.key==='Escape'){event.preventDefault();$('quickDialog').close();}
      else if (event.key === 'Enter' && quickItems[quickIndex]) {event.preventDefault(); void copyItem(quickItems[quickIndex]);}
    });
    $('closeTemplate').addEventListener('click',() => $('templateDialog').close());
    $('cancelTemplate').addEventListener('click',() => $('templateDialog').close());
    $('templateForm').addEventListener('submit',event => {
      event.preventDefault(); if (templateItem) void copyText($('templatePreview').value, templateItem);
    });
    $('generatePair').addEventListener('click',() => void generatePairing());
    $('revokePair').addEventListener('click',() => void revokePairing());
    $('copyPairCode').addEventListener('click',async () => {
      try { await navigator.clipboard.writeText($('pairCode').value); notice('One-time pairing code copied.'); }
      catch { $('pairCode').select(); notice('Clipboard unavailable. Select and copy the code manually.'); }
    });
    $('importMarkdown').addEventListener('click',() => $('markdownFile').click());
    $('markdownFile').addEventListener('change',() => {
      const file = $('markdownFile').files?.[0];$('markdownFile').value='';
      if (file) void importMarkdownFile(file);
    });
    $('pasteClipboard').addEventListener('click',async () => {
      const epoch=sessionEpoch;
      try { const content = await navigator.clipboard.readText();
        if(epoch!==sessionEpoch || !uiUnlocked)return;
        if (content.length > 100000) {notice('Clipboard text exceeds 100,000 characters.');return;}
        $('entryBody').value = content;resetRecall();scheduleDraft();notice('Clipboard text loaded for review. Nothing has been saved yet.');
      } catch {notice('Clipboard access unavailable. Paste normally with Ctrl / Cmd + V.');}
    });
    $('exportBackup').addEventListener('click',() => openBackup('export'));
    $('importBackup').addEventListener('click',() => $('backupFile').click());
    $('backupFile').addEventListener('change',() => {importFile=$('backupFile').files?.[0] || null; if (importFile) openBackup('import');});
    for (const id of ['closeBackup','cancelBackup']) $(id).addEventListener('click',() => { $('backupDialog').close();importFile=null;$('backupFile').value=''; });
    $('backupForm').addEventListener('submit',event => {event.preventDefault();void finishBackup();});
    $('demoButton').addEventListener('click',async () => {
      try {await api('/api/examples','POST',{});await refresh();notice('Nine starter prompts and templates added.');}
      catch (error) {notice(error.message);}
    });
    $('editorForm').addEventListener('submit', async event => {
      event.preventDefault();
      const payload = { title:$('entryTitle').value,body:$('entryBody').value,kind:$('entryKind').value,
        project:$('entryProject').value, tags:$('entryTags').value.split(',').map(tag=>tag.trim()).filter(Boolean).slice(0,12),
        pinned:$('entryPinned').checked,notes:$('entryNotes').value,source:$('entrySource').value };
      $('saveEntry').disabled = true;
      try {
        const result = await api(editingId?`/api/items/${editingId}`:'/api/items',editingId?'PUT':'POST',payload,editingETag);
        await closeEditor(true);await refresh();
        notice(result.redactions ? `Saved. ${result.redactions} sensitive match(es) redacted.` : 'Saved in your encrypted vault.');
      } catch (error) {if(uiUnlocked){$('editorError').textContent=error.message;$('saveDraftAsNew').hidden=error.status!==412;}} finally {$('saveEntry').disabled=false;}
    });
    let lastActivityPing=0;
    const activity=event=>{
      if(!uiUnlocked || !event.isTrusted || Date.now()-lastActivityPing<30000)return;
      lastActivityPing=Date.now();void api('/api/activity','POST',{}).catch(()=>{});
    };
    for(const event of ['input','pointerdown','keydown'])document.addEventListener(event,activity,{capture:true,passive:true});
    document.addEventListener('visibilitychange',()=>{
      if(!uiUnlocked)return;
      if(document.hidden && preferences.lockOnHide){void lock(true);return;}
      if(!document.hidden){if(localDeadline && Date.now()>=localDeadline){showGate(true);return;}void checkSession();}
    });
    window.addEventListener('focus',()=>void checkSession());
    window.addEventListener('pageshow',event=>{if(event.persisted)showGate(true);});
    document.addEventListener('keydown',event => {
      if ($('shell').hidden || event.defaultPrevented || event.altKey) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase()==='k') {
        event.preventDefault(); if (!$('quickDialog').open && !document.querySelector('dialog[open]')) void openQuick();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase()==='n') {
        event.preventDefault(); if (!document.querySelector('dialog[open]')) openEditor();
      }
    });
  }
  async function start() {
    initActions();
    if (!token || !/^[a-f0-9]{64}$/.test(token)) {
      showGate(false); $('gateForm').hidden=true;
      $('gateTitle').textContent='Open your private session link.';
      $('gateDescription').textContent='This tab has no valid session token. Restart the local service and open the URL in your terminal.';
      return;
    }
    try {
      const status = await api('/api/status');
      $('idleLabel').textContent=`The vault locks after ${status.idleMinutes} minutes without authenticated activity.`;
      if (status.unlocked) await showApp(); else {
        showGate(status.initialized);
        if(status.keyFormat===1)$('gateDescription').textContent='This older vault will upgrade its key metadata after a successful unlock. Stop the service and back up the complete vault folder before continuing. Older app versions cannot read the new key format.';
      }
    } catch (error) { showGate(false); $('gateForm').hidden=true; $('gateError').textContent=error.message; }
  }
  void start();
})();

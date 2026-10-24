#!/usr/bin/env python3
"""Chromium regression tests for actual UI/recorder source using synthetic pages and API fixtures.
Does not connect to real AI sites, Groq, or the local vault. No browser policy is changed.
"""
from pathlib import Path
import json, re, shutil, time, argparse, traceback
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/'apps/local-web/public'
EXT=ROOT/'apps/browser-helper'
def read(path):
    return path.read_text(encoding='utf-8')

def mount_app(page):
    html=re.sub(r'<script\b[^>]*>[\s\S]*?</script>','',read(WEB/'index.html'))
    html=re.sub(r'<link\b[^>]*>','',html)
    page.set_content(html)
    for name in ['app.css','features.css','reliability.css','recovery.css','writing.css','workbench.css','assistant.css']:
        page.add_style_tag(content=read(WEB/name))
    page.add_script_tag(content=read(ROOT/'tests/e2e/browser-fixture.js'))
    engine=read(WEB/'template-engine.js').replace('export function','function')
    assistant=read(WEB/'assistant.js').replace('export function','function')
    app=read(WEB/'app.js').replace("import { parseTemplate, fillTemplate } from './template-engine.js';",'').replace("import { initAssistant } from './assistant.js';",'')
    page.add_script_tag(content=engine+'\n'+assistant+'\n'+app)

MOCK='''window.__companion={enabled:true,hints:true,canCapture:true,events:[],stateCalls:0,fail:false,listener:null,holdState:false,states:[],holdCapture:false,captures:[]};
if(!crypto.randomUUID)crypto.randomUUID=()=>{const v=crypto.getRandomValues(new Uint8Array(16));v[6]=(v[6]&15)|64;v[8]=(v[8]&63)|128;const h=[...v].map(x=>x.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};
window.chrome={runtime:{sendMessage:async m=>{
 const s=window.__companion;
 if(m.type==='STATE'){s.stateCalls++;const result={enabled:s.enabled,hints:s.hints,canCapture:s.canCapture};if(s.holdState)return new Promise(r=>s.states.push(()=>r(result)));return result;}
 if(m.type==='CAPTURE'){s.events.push(m.event);if(s.holdCapture)return new Promise(r=>s.captures.push(r));return s.fail?{ok:false,error:'Vault unreachable. This prompt was not saved or queued.'}:{ok:true,saved:true};}
 if(m.type==='PAUSE_SITE'){s.enabled=false;return {ok:true};}
 return {ok:false};},onMessage:{addListener:fn=>window.__companion.listener=fn}}};'''

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',default=str(ROOT/'docs/verification/core-browser-v0.9'))
    parser.add_argument('--browser-executable',help='Explicit installed Chromium executable; otherwise use the Playwright default.')
    args=parser.parse_args();out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
    report={'scope':'Actual Chromium UI/content script; synthetic editor pages, mocked origin dependency, extension messaging and provider API. Not live site or provider validation.','passed':[],'errors':[]}
    def passed(name):report['passed'].append(name);print('PASS',name)
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path=args.browser_executable or shutil.which('chromium'))
        report['browser']=browser.version
        page=browser.new_page(viewport={'width':1440,'height':960});page.set_default_timeout(6000)
        page.on('pageerror',lambda err:report['errors'].append(str(err)))
        try:
            mount_app(page)
            password='Synthetic-UI-Core-Password-Only'
            page.fill('#passphrase',password);page.fill('#confirm',password);page.click('#gateAction');expect(page.locator('#shell')).to_be_visible()
            page.click('#moreNav');page.fill('#groqKey','gsk_SYNTHETIC_UI_TEST_123456789');page.check('#groqEnabled');page.click('#groqSave')
            expect(page.locator('#groqState')).to_contain_text('Configured.');assert page.input_value('#groqKey')==''
            passed('Local connection form clears API key after saving; only status is shown')
            page.click('#assistantNav');expect(page.locator('#aiDialog')).to_be_visible();page.fill('#aiInput','Explain this request. gsk_SYNTHETIC_REDACTION_123456789')
            page.click('#aiPreview');expect(page.locator('#aiPreviewWrap')).to_be_visible();assert '[REDACTED]' in page.input_value('#aiPreviewText')
            expect(page.locator('#aiSend')).to_be_disabled();assert page.evaluate('window.__fixture.aiCalls||0')==0
            passed('Outgoing preview is local and redacted; send requires independent consent')
            page.check('#aiConsent');expect(page.locator('#aiSend')).to_be_enabled()
            page.fill('#aiInput','Rewrite a clear project update.');expect(page.locator('#aiSend')).to_be_disabled();expect(page.locator('#aiPreviewWrap')).not_to_be_visible()
            passed('Editing source invalidates previous preview and consent')
            page.select_option('#aiAction','rewrite');page.click('#aiPreview');page.check('#aiConsent');page.click('#aiSend')
            expect(page.locator('#aiOutput')).to_have_value(re.compile('Synthetic AI draft:'))
            assert page.evaluate('window.__fixture.items.length')==0
            page.screenshot(path=str(out/'assistant-desktop.png'))
            page.click('#aiSave');expect(page.locator('#aiSave')).to_be_disabled()
            assert page.evaluate('window.__fixture.items.length')==1
            assert page.evaluate('window.__fixture.items[0].tags.includes("ai-generated")')
            passed('AI result requires explicit save and becomes a separate AI-labelled library item')
            page.click('#aiClose')
            page.locator('#mainNav [data-filter="all"]').click()
            page.evaluate('''()=>{window.__refinementFixtureId=__fixture.add({title:'Synthetic task source',
              body:'For this task only, do not run commands.\\nPreserve తెలుగు wording.',
              project:'Client',source:'Synthetic fixture'}).id;}''')
            page.click('#refreshLibrary')
            source_card=page.locator('.item-card').filter(has_text='Synthetic task source')
            source_card.locator('.wb-title').click()
            expect(page.locator('#wbTitle')).to_have_text('Synthetic task source')
            page.click('#wbAi')
            page.select_option('#aiAction','understand')
            expect(page.locator('#aiInput')).to_have_attribute('readonly','')
            expect(page.locator('#aiStyle')).to_be_disabled()
            expect(page.locator('#aiSend')).to_be_disabled()
            assert page.input_value('#aiInput').startswith('For this task only')
            passed('Saved source opens a read-only, revision-bound first refiner')
            calls_before=page.evaluate('window.__fixture.aiCalls')
            page.click('#aiPreview');expect(page.locator('#aiPreviewWrap')).to_be_visible()
            assert page.evaluate('window.__fixture.aiCalls')==calls_before
            page.check('#aiConsent');page.click('#aiSend')
            expect(page.locator('#aiReviewUnderstanding')).to_be_visible()
            assert page.evaluate('window.__fixture.aiCalls')==calls_before+1
            page.click('#aiReviewUnderstanding')
            expect(page.locator('#aiAction')).to_have_value('extract')
            expect(page.locator('#aiSend')).to_be_disabled()
            expect(page.locator('#aiPreviewWrap')).not_to_be_visible()
            assert page.evaluate('window.__fixture.aiCalls')==calls_before+1
            passed('Reviewed understanding moves to extraction without an automatic second send')
            page.click('#aiPreview');page.check('#aiConsent');page.click('#aiSend')
            expect(page.locator('#aiCandidates blockquote')).to_have_text('For this task only, do not run commands.')
            expect(page.locator('#aiCandidates select')).to_have_value('task')
            expect(page.locator('#aiSave')).to_be_disabled()
            assert page.evaluate('window.__fixture.aiCalls')==calls_before+2
            assert page.evaluate('window.__fixture.items.length')==2
            passed('Second provider fixture call returns an exact quote with task scope; no automatic save')
            page.locator('#aiCandidates button').filter(has_text='Save reviewed instruction').click()
            expect(page.locator('#aiCandidates button').filter(has_text='Saved as template')).to_be_visible()
            assert page.evaluate('''()=>{const items=__fixture.items;
              return items.length===3&&items[2].body==='For this task only, do not run commands.'&&
                items[2].tags.includes('scope-task')&&items.find(i=>i.id===__refinementFixtureId).body.includes('Preserve తెలుగు wording.')}''')
            passed('Explicit save creates an independent scoped template and preserves the source')
            page.set_viewport_size({'width':390,'height':844})
            assert page.locator('#aiDialog').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
            page.screenshot(path=str(out/'assistant-mobile.png'))
            page.set_viewport_size({'width':1440,'height':960})
            passed('Assistant dialog remains usable at narrow width without horizontal overflow')
            page.click('#aiClose');page.click('#moreNav');page.click('#assistantNav')
            page.fill('#aiInput','Synthetic pending request');page.click('#aiPreview');page.check('#aiConsent')
            page.evaluate('window.__fixture.aiDelay=900');page.click('#aiSend');page.click('#aiCancel');page.wait_for_timeout(1100)
            assert page.input_value('#aiOutput')==''
            passed('Cancel drops a late provider-fixture response')
            page.click('#aiPreview');page.check('#aiConsent');page.click('#aiSend')
            page.evaluate('''fetch('/api/lock',{method:'POST'}).then(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})))''')
            expect(page.locator('#gate')).to_be_visible();page.wait_for_timeout(1100)
            for field in ['aiInput','aiOutput','aiPreviewText','groqKey']:assert page.input_value('#'+field)==''
            expect(page.locator('#aiDialog')).not_to_be_visible()
            passed('Lock clears AI source, result, preview, connection key and stale response')

            # Popup is exercised as actual source with Chrome/storage/transport doubles.
            popup=browser.new_page(viewport={'width':420,'height':900})
            popup_html=re.sub(r'<script\b[^>]*>[\s\S]*?</script>','',read(EXT/'popup.html'))
            popup_html=re.sub(r'<link\b[^>]*>','',popup_html)
            popup.set_content(popup_html);popup.add_style_tag(content=read(EXT/'popup.css'))
            popup.add_script_tag(content="""window.__popup={store:{},origins:[],enabled:false,permissionGranted:false,fetches:[]};
              window.chrome={storage:{session:{get:async k=>({[k]:__popup.store[k]}),set:async v=>Object.assign(__popup.store,v),remove:async k=>delete __popup.store[k]}},
                tabs:{query:async()=>[{id:1,url:'https://chatgpt.com/',incognito:false}]},
                permissions:{contains:async()=>__popup.permissionGranted,request:async v=>{__popup.origins.push(...v.origins);__popup.permissionGranted=true;return true;}},
                runtime:{sendMessage:async m=>{if(m.type==='SET_SITE')__popup.enabled=m.enabled;return {ok:true,enabled:__popup.enabled,canCapture:!!__popup.store['promtesaver.bridge'],hints:false};}}};
              window.fetch=async(url,options)=>{if(options.redirect!=='error'||!options.signal)throw Error('Missing network controls');__popup.fetches.push(url);
                return new Response(JSON.stringify({writeToken:'b'.repeat(64),expiresAt:new Date(Date.now()+60000).toISOString(),allowedCaptureHosts:['chatgpt.com']}),{headers:{'Content-Type':'application/json'}});};""")
            popup.add_script_tag(content=read(EXT/'popup.js'))
            expect(popup.locator('#siteState')).to_contain_text('Site permission required')
            popup.fill('#pairCode','psv2:23456:'+'a'*64);popup.click('#pair')
            expect(popup.locator('#pairStatus')).to_contain_text('Paired until')
            assert popup.input_value('#pairCode')==''
            assert popup.evaluate("__popup.store['promtesaver.bridge'].allowedCaptureHosts[0]")=='chatgpt.com'
            popup.click('#enableSite');expect(popup.locator('#siteState')).to_contain_text('Site enabled')
            assert popup.evaluate('__popup.origins')==['https://chatgpt.com/*']
            assert popup.evaluate('__popup.fetches')==['http://127.0.0.1:23456/api/bridge/pair']
            popup.click('#pauseSite');expect(popup.locator('#siteState')).to_contain_text('Off for this site')
            popup.evaluate('''()=>{__popup.scripts=[];__popup.previewResult={host:'chatgpt.com',text:'Synthetic reviewed preview'};
              chrome.scripting={executeScript:async details=>{__popup.scripts.push(details.files||'focused-preview');return details.files?[]:[{result:__popup.previewResult}];}};}''')
            popup.click('#inspect');expect(popup.locator('#preview')).to_have_value('Synthetic reviewed preview')
            assert popup.evaluate('__popup.scripts')==[['editor-core.js'],'focused-preview']
            popup.evaluate("__popup.previewResult={host:'chatgpt.com',error:'Private, temporary or hidden page excluded. No text read.'}")
            popup.click('#inspect');expect(popup.locator('#result')).not_to_be_visible();assert popup.input_value('#preview')==''
            popup.evaluate("__popup.previewResult={host:'claude.ai',text:'Different tab text must be rejected'}")
            popup.click('#inspect');expect(popup.locator('#result')).not_to_be_visible();expect(popup.locator('#message')).to_contain_text('tab changed')
            popup.evaluate('''()=>{__popup.store['promtesaver.gaps']=[{host:'chatgpt.com',reason:'save-unconfirmed',at:new Date().toISOString(),text:'PRIVATE_PROMPT_CANARY'}];return showGapHistory();}''')
            expect(popup.locator('#gapList')).to_contain_text('Local save could not be confirmed')
            assert 'PRIVATE_PROMPT_CANARY' not in popup.locator('#gapList').inner_text()
            popup.click('#clearGaps');expect(popup.locator('#gapList')).to_contain_text('No recorded save gaps')
            assert popup.evaluate("__popup.store['promtesaver.gaps']") is None
            popup.close()
            passed('Companion popup pairs without redirects, clears code, retains host consent and requests only current-site permission')
            passed('Manual preview loads shared exclusions, clears stale previews on failure and rejects changed-tab provenance')
            passed('Companion popup shows and clears only content-free browser-session capture gaps')

            fixtures={
                'chatgpt.com':'<textarea id="prompt-textarea" aria-label="Prompt"></textarea><button data-testid="send-button">Send prompt</button>',
                'claude.ai':'<div class="ProseMirror" role="textbox" contenteditable="true" aria-label="Prompt"></div><button aria-label="Send message">Send</button>',
                'gemini.google.com':'<rich-textarea><div class="ql-editor" role="textbox" contenteditable="true" aria-label="Prompt"></div></rich-textarea><button class="send-button">Send</button>'}
            for host,body in fixtures.items():
                ctx=browser.new_context(viewport={'width':1200,'height':800})
                editor_page=ctx.new_page();editor_page.set_default_timeout(5000)
                editor_page.on('pageerror',lambda err:report['errors'].append(str(err)))
                html='<html><head><style>body{background:#f4f6f5;font:16px system-ui;padding:60px}textarea,[contenteditable]{display:block;width:600px;min-height:160px;border:1px solid #888;padding:16px;background:white;margin:20px 0}button{padding:12px}</style></head><body><h1>Synthetic '+host+' composer fixture</h1>'+body+'<input id="unrelated" placeholder="Search"></body></html>'
                # This environment blocks site/localhost navigation, even with request interception.
                # Use about:blank and explicitly mock only the origin dependency. No policy bypass.
                editor_page.set_content(html)
                editor_page.add_script_tag(content=MOCK)
                editor_page.add_script_tag(content=read(EXT/'editor-core.js'))
                editor_page.evaluate('''host=>{window.__fixtureUrl='https://'+host+'/fixture';
                  const original=window.PromteEditor;
                  window.PromteEditor={...original,adapters:{'':original.adapters[host]},privatePage:(_actual,doc)=>original.privatePage(window.__fixtureUrl,doc)};
                }''',host)
                editor_page.add_script_tag(content=read(EXT/'recorder.js'))
                editor=editor_page.locator('textarea,[contenteditable]').first
                editor.fill('This is is a synthetic prompt.');editor.press('End');editor.press('Space');editor_page.wait_for_timeout(1050)
                expect(editor_page.locator('[data-promtesaver-assistant]').get_by_text('Possible repeated word. Review before sending.')).to_be_visible()
                assert editor_page.evaluate('__companion.events.length')==0
                passed(host+': typing shows local hints without capture or cloud requests')
                editor.press('Shift+Enter');assert editor_page.evaluate('__companion.events.length')==0
                editor_page.locator('button').filter(has_text=re.compile('^Send')).first.click()
                assert editor_page.evaluate('__companion.events.length')==1, 'Send did not capture exactly once'
                first=editor_page.evaluate('__companion.events[0]');assert first['signal']=='send-click';assert 'synthetic prompt' in first['text']
                editor.press('Enter');assert editor_page.evaluate('__companion.events.length')==1
                passed(host+': trusted Send captures once; Shift+Enter and duplicate event do not')
                editor_page.locator('#unrelated').fill('A search that must not be captured');editor_page.locator('#unrelated').press('Enter');assert editor_page.evaluate('__companion.events.length')==1
                editor.evaluate("el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");assert editor_page.evaluate('__companion.events.length')==1
                editor.evaluate("el=>el.setAttribute('data-private','true')");editor.press('Enter');assert editor_page.evaluate('__companion.events.length')==1
                passed(host+': unrelated, synthetic-event and protected input exclusions')
                editor.evaluate("el=>el.removeAttribute('data-private')")
                # A pending hint must never read a former editor after focus changes.
                editor.fill('Pending pending hints');editor.press('Space');editor_page.locator('#unrelated').focus();editor_page.wait_for_timeout(1050)
                expect(editor_page.locator('[data-promtesaver-assistant]')).to_have_count(0)
                passed(host+': moving focus cancels delayed hints and clears their panel')

                # Exercise the producer exclusion before any value getter can run.
                editor.focus()
                for private_url in ['https://'+host+'/temporary-chat','https://'+host+'/?private=true','https://'+host+'/?temporary-chat=TRUE']:
                    result=editor_page.evaluate('''url=>{const el=document.activeElement;
                      const property=el.matches('textarea')?'value':'innerText',descriptor=Object.getOwnPropertyDescriptor(el,property);
                      Object.defineProperty(el,property,{configurable:true,get(){throw Error('Excluded text was read');}});
                      try{return PromteEditor.preview(url,document);}finally{if(descriptor)Object.defineProperty(el,property,descriptor);else delete el[property];}}''',private_url)
                    assert 'error' in result
                for attribute in ['data-sensitive','aria-disabled','inert']:
                    editor.evaluate('(el,attr)=>el.setAttribute(attr,"true")',attribute)
                    assert 'error' in editor_page.evaluate("url=>PromteEditor.preview(url,document)",'https://'+host+'/fixture')
                    editor.evaluate('(el,attr)=>el.removeAttribute(attr)',attribute)
                editor.evaluate('''el=>{const wrapper=document.createElement('div');wrapper.dataset.opacityFixture='';
                  wrapper.style.opacity='0';el.before(wrapper);wrapper.append(el);}''')
                assert 'error' in editor_page.evaluate("url=>PromteEditor.preview(url,document)",'https://'+host+'/fixture')
                editor_page.locator('[data-opacity-fixture]').evaluate('el=>{el.before(...el.childNodes);el.remove();}')
                editor.fill('తెలుగు में mixed language 😀')
                assert editor_page.evaluate("url=>PromteEditor.preview(url,document).text",'https://'+host+'/fixture')=='తెలుగు में mixed language 😀'
                passed(host+': manual preview shares private/protected checks before reading and preserves mixed-language text')
                protected_before=editor_page.evaluate('__companion.events.length')
                editor_page.evaluate('''()=>{const wrapper=document.createElement('div');wrapper.contentEditable='true';
                  wrapper.id='prompt-textarea';wrapper.className='ProseMirror ql-editor';wrapper.setAttribute('role','textbox');wrapper.dataset.nestedFixture='';
                  const input=document.createElement('input');input.type='password';input.id='nestedProtected';wrapper.append('Excluded ancestor fixture text.',input);document.body.append(wrapper);}''')
                editor_page.locator('#nestedProtected').focus();editor_page.locator('#nestedProtected').press('Enter')
                assert 'error' in editor_page.evaluate("url=>PromteEditor.preview(url,document)",'https://'+host+'/fixture')
                assert editor_page.evaluate('__companion.events.length')==protected_before
                editor_page.locator('[data-nested-fixture]').evaluate('el=>el.remove()')
                passed(host+': protected input nested inside a composer cannot fall back to reading its ancestor')

                # Composition state also blocks a plain Enter whose browser flag is absent.
                before=editor_page.evaluate('__companion.events.length')
                editor.focus()
                editor.evaluate("el=>el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'中'}))")
                editor.press('Enter');assert editor_page.evaluate('__companion.events.length')==before
                editor.evaluate("el=>el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'中'}))")
                editor.fill('After composition, explicit send intent');editor.press('Enter')
                assert editor_page.evaluate('__companion.events.length')==before+1
                passed(host+': simulated IME state suppresses Enter until composition ends')

                # Multiple composers without an unambiguous active editor fail closed.
                editor_page.evaluate('''()=>{const original=document.querySelector('textarea,[contenteditable]');
                  const clone=original.cloneNode(true);clone.setAttribute('data-ambiguous','');original.after(clone);}''')
                editor_page.locator('button').filter(has_text=re.compile('^Send')).first.click()
                assert editor_page.evaluate('__companion.events.length')==before+1
                editor_page.locator('[data-ambiguous]').evaluate('el=>el.remove()')
                passed(host+': Send does not guess from a stale editor when multiple composers are visible')
                editor_page.locator('button').filter(has_text=re.compile('^Send')).first.evaluate('''button=>{
                  const form=document.createElement('form');button.before(form);form.append(button);form.addEventListener('submit',e=>e.preventDefault());}''')
                editor_page.locator('button').filter(has_text=re.compile('^Send')).first.click()
                assert editor_page.evaluate('__companion.events.length')==before+1
                editor_page.locator('form').evaluate('form=>{form.before(...form.childNodes);form.remove();}')
                passed(host+': a Send button in another form cannot capture the lone unrelated composer')

                # A late enabled STATE reply must not override a newer disabled reply.
                editor_page.evaluate('__companion.holdState=true;__companion.listener({type:"STATE_CHANGED"})')
                editor_page.wait_for_function('__companion.states.length===1')
                editor_page.evaluate('__companion.enabled=false;__companion.listener({type:"STATE_CHANGED"})')
                editor_page.wait_for_function('__companion.states.length===2')
                editor_page.evaluate('__companion.states[1]();__companion.states[0]();__companion.holdState=false')
                editor.fill('Must stay paused despite stale enabled state');editor.press('Enter')
                assert editor_page.evaluate('__companion.events.length')==before+1
                editor_page.evaluate('__companion.enabled=true;__companion.listener({type:"STATE_CHANGED"})')
                editor_page.wait_for_timeout(30)
                passed(host+': newest extension state wins over out-of-order replies')

                # Pending old-session acknowledgement cannot recreate a panel after pause/re-enable.
                editor_page.evaluate('__companion.holdCapture=true')
                editor.fill('Synthetic delayed acknowledgement');editor.press('Enter')
                editor_page.wait_for_function('__companion.captures.length===1')
                editor_page.evaluate('__companion.enabled=false;__companion.listener({type:"STATE_CHANGED"})')
                editor_page.wait_for_timeout(30)
                editor_page.evaluate('__companion.enabled=true;__companion.listener({type:"STATE_CHANGED"})')
                editor_page.wait_for_timeout(30)
                editor_page.evaluate('__companion.captures[0]({ok:true,saved:true});__companion.holdCapture=false')
                expect(editor_page.locator('[data-promtesaver-assistant]')).to_have_count(0)
                passed(host+': old capture acknowledgement cannot reappear after a pause/resume boundary')

                before=editor_page.evaluate('__companion.events.length')
                editor_page.evaluate("window.__fixtureUrl='https://chatgpt.com/fixture?temporary-chat=true'");editor.fill('Another synthetic sample');editor.press('Enter');assert editor_page.evaluate('__companion.events.length')==before
                expect(editor_page.locator('[data-promtesaver-assistant]')).to_have_count(0)
                editor_page.evaluate("window.__fixtureUrl='https://chatgpt.com/fixture';__companion.fail=true")
                editor.fill('An offline capture attempt is not queued');editor.press('Enter')
                expect(editor_page.locator('[data-promtesaver-assistant]')).to_contain_text('Vault unreachable')
                before=editor_page.evaluate('__companion.events.length');time.sleep(1.6);assert editor_page.evaluate('__companion.events.length')==before
                passed(host+': recognized temporary page excluded; offline failure visible and no retries')
                # A normal send can unmount its composer before the vault responds.
                # The acknowledgement must remain visible without rereading that editor.
                editor_page.evaluate('__companion.fail=false;__companion.holdCapture=true')
                editor.fill('Send then remove this synthetic composer')
                editor_page.locator('button').filter(has_text=re.compile('^Send')).first.click()
                editor_page.wait_for_function('__companion.captures.length===2')
                editor_page.evaluate('''()=>{const el=document.querySelector('textarea,[contenteditable]');window.__detachedEditor=el;el.remove();
                  __companion.captures.at(-1)({ok:true,saved:true,redactions:2});__companion.holdCapture=false;}''')
                expect(editor_page.locator('[data-promtesaver-assistant]')).to_contain_text('2 sensitive match(es) redacted')
                editor_page.evaluate('''()=>{const button=document.querySelector('button');button.before(window.__detachedEditor);delete window.__detachedEditor;}''')
                passed(host+': saved receipt survives composer replacement and discloses redactions')
                before=editor_page.evaluate('__companion.events.length')
                if host=='chatgpt.com':editor_page.screenshot(path=str(out/'browser-companion.png'),full_page=True)
                editor_page.locator('[data-promtesaver-assistant]').get_by_role('button',name='Pause',exact=True).click()
                editor.fill('Paused text');editor.press('Enter');assert editor_page.evaluate('__companion.events.length')==before
                expect(editor_page.locator('[data-promtesaver-assistant]')).to_have_count(0)
                passed(host+': visible Pause stops capture and removes the assistant')
                ctx.close()
            report['result']='passed' if not report['errors'] else 'failed'
        except Exception as exc:
            report['errors'].append(traceback.format_exc());report['result']='failed'
        finally:
            browser.close();(out/'report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
    return 0 if report['result']=='passed' else 1
if __name__=='__main__':raise SystemExit(main())

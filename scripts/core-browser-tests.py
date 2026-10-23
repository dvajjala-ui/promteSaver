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

def mount_app(page):
    html=re.sub(r'<script\b[^>]*>[\s\S]*?</script>','',(WEB/'index.html').read_text())
    html=re.sub(r'<link\b[^>]*>','',html)
    page.set_content(html)
    for name in ['app.css','features.css','reliability.css','recovery.css','writing.css','workbench.css','assistant.css']:
        page.add_style_tag(content=(WEB/name).read_text())
    page.add_script_tag(content=(ROOT/'tests/e2e/browser-fixture.js').read_text())
    engine=(WEB/'template-engine.js').read_text().replace('export function','function')
    assistant=(WEB/'assistant.js').read_text().replace('export function','function')
    app=(WEB/'app.js').read_text().replace("import { parseTemplate, fillTemplate } from './template-engine.js';",'').replace("import { initAssistant } from './assistant.js';",'')
    page.add_script_tag(content=engine+'\n'+assistant+'\n'+app)

MOCK='''window.__companion={enabled:true,hints:true,canCapture:true,events:[],stateCalls:0,fail:false,listener:null};
if(!crypto.randomUUID)crypto.randomUUID=()=>{const v=crypto.getRandomValues(new Uint8Array(16));v[6]=(v[6]&15)|64;v[8]=(v[8]&63)|128;const h=[...v].map(x=>x.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};
window.chrome={runtime:{sendMessage:async m=>{
 const s=window.__companion;
 if(m.type==='STATE'){s.stateCalls++;return {enabled:s.enabled,hints:s.hints,canCapture:s.canCapture};}
 if(m.type==='CAPTURE'){s.events.push(m.event);return s.fail?{ok:false,error:'Vault unreachable. This prompt was not saved or queued.'}:{ok:true,saved:true};}
 if(m.type==='PAUSE_SITE'){s.enabled=false;return {ok:true};}
 return {ok:false};},onMessage:{addListener:fn=>window.__companion.listener=fn}}};'''

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',default=str(ROOT/'docs/verification/core-browser-v0.9'))
    args=parser.parse_args();out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
    report={'scope':'Actual Chromium UI/content script; synthetic editor pages, mocked origin dependency, extension messaging and provider API. Not live site or provider validation.','passed':[],'errors':[]}
    def passed(name):report['passed'].append(name);print('PASS',name)
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'))
        report['browser']=browser.version
        page=browser.new_page(viewport={'width':1440,'height':960});page.set_default_timeout(6000)
        page.on('pageerror',lambda err:report['errors'].append(str(err)))
        try:
            mount_app(page)
            password='Synthetic-UI-Core-Password-Only'
            page.fill('#passphrase',password);page.fill('#confirm',password);page.click('#gateAction');expect(page.locator('#shell')).to_be_visible()
            page.click('#settingsNav');page.fill('#groqKey','gsk_SYNTHETIC_UI_TEST_123456789');page.check('#groqEnabled');page.click('#groqSave')
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
            page.set_viewport_size({'width':390,'height':844})
            assert page.locator('#aiDialog').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
            page.screenshot(path=str(out/'assistant-mobile.png'))
            page.set_viewport_size({'width':1440,'height':960})
            passed('Assistant dialog remains usable at narrow width without horizontal overflow')
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
            popup_html=re.sub(r'<script\b[^>]*>[\s\S]*?</script>','',(EXT/'popup.html').read_text())
            popup_html=re.sub(r'<link\b[^>]*>','',popup_html)
            popup.set_content(popup_html);popup.add_style_tag(content=(EXT/'popup.css').read_text())
            popup.add_script_tag(content="""window.__popup={store:{},origins:[],enabled:false,permissionGranted:false,fetches:[]};
              window.chrome={storage:{session:{get:async k=>({[k]:__popup.store[k]}),set:async v=>Object.assign(__popup.store,v),remove:async k=>delete __popup.store[k]}},
                tabs:{query:async()=>[{id:1,url:'https://chatgpt.com/',incognito:false}]},
                permissions:{contains:async()=>__popup.permissionGranted,request:async v=>{__popup.origins.push(...v.origins);__popup.permissionGranted=true;return true;}},
                runtime:{sendMessage:async m=>{if(m.type==='SET_SITE')__popup.enabled=m.enabled;return {ok:true,enabled:__popup.enabled,canCapture:!!__popup.store['promtesaver.bridge'],hints:false};}}};
              window.fetch=async(url,options)=>{if(options.redirect!=='error'||!options.signal)throw Error('Missing network controls');__popup.fetches.push(url);
                return new Response(JSON.stringify({writeToken:'b'.repeat(64),expiresAt:new Date(Date.now()+60000).toISOString(),allowedCaptureHosts:['chatgpt.com']}),{headers:{'Content-Type':'application/json'}});};""")
            popup.add_script_tag(content=(EXT/'popup.js').read_text())
            expect(popup.locator('#siteState')).to_contain_text('Site permission required')
            popup.fill('#pairCode','psv2:23456:'+'a'*64);popup.click('#pair')
            expect(popup.locator('#pairStatus')).to_contain_text('Paired until')
            assert popup.input_value('#pairCode')==''
            assert popup.evaluate("__popup.store['promtesaver.bridge'].allowedCaptureHosts[0]")=='chatgpt.com'
            popup.click('#enableSite');expect(popup.locator('#siteState')).to_contain_text('Site enabled')
            assert popup.evaluate('__popup.origins')==['https://chatgpt.com/*']
            assert popup.evaluate('__popup.fetches')==['http://127.0.0.1:23456/api/bridge/pair']
            popup.click('#pauseSite');expect(popup.locator('#siteState')).to_contain_text('Off for this site')
            popup.close()
            passed('Companion popup pairs without redirects, clears code, retains host consent and requests only current-site permission')

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
                editor_page.add_script_tag(content=(EXT/'editor-core.js').read_text())
                editor_page.evaluate('''host=>{window.__fixtureUrl='https://'+host+'/fixture';
                  const original=window.PromteEditor;
                  window.PromteEditor={...original,adapters:{'':original.adapters[host]},privatePage:(_actual,doc)=>original.privatePage(window.__fixtureUrl,doc)};
                }''',host)
                editor_page.add_script_tag(content=(EXT/'recorder.js').read_text())
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
                editor_page.evaluate("window.__fixtureUrl='https://chatgpt.com/fixture?temporary-chat=true'");editor.fill('Another synthetic sample');editor.press('Enter');assert editor_page.evaluate('__companion.events.length')==1
                editor_page.evaluate("window.__fixtureUrl='https://chatgpt.com/fixture';__companion.fail=true")
                editor.fill('An offline capture attempt is not queued');editor.press('Enter')
                expect(editor_page.locator('[data-promtesaver-assistant]')).to_contain_text('Vault unreachable')
                before=editor_page.evaluate('__companion.events.length');time.sleep(1.6);assert editor_page.evaluate('__companion.events.length')==before
                passed(host+': recognized temporary page excluded; offline failure visible and no retries')
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

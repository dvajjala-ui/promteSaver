#!/usr/bin/env python3
"""Real Chromium UI tests, explicitly choosing isolated fixtures or a real local service.
Fixture mode does not validate network/CSP/crypto integration and never bypasses browser policy.
Requires the optional Python playwright package and a browser installed by the developer.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import argparse, json, os, re, shutil, subprocess, tempfile, time

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'apps/local-web/public'
PASSWORD = 'SyntheticBrowserTestPassword12'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=['fixture', 'live'], required=True)
    parser.add_argument('--browser', default=os.environ.get('CHROMIUM_EXECUTABLE'))
    parser.add_argument('--output', default=str(ROOT / 'docs/verification/browser'))
    args = parser.parse_args()
    output = Path(args.output).resolve(); output.mkdir(parents=True, exist_ok=True)
    report = {'mode': args.mode, 'scope': 'Actual UI with mocked in-page API; not live E2E' if args.mode == 'fixture' else 'Actual UI and real local HTTP service', 'passed': [], 'skipped': [], 'errors': []}
    service = None
    directory = tempfile.TemporaryDirectory(prefix='promte-browser-')
    try:
        with sync_playwright() as p:
            executable = args.browser or shutil.which('chromium') or shutil.which('google-chrome')
            options = {'headless': True}
            if executable: options['executable_path'] = executable
            browser = p.chromium.launch(**options)
            page = browser.new_page(viewport={'width': 1440, 'height': 960}, accept_downloads=True)
            page.set_default_timeout(5000)
            page.on('pageerror', lambda error: report['errors'].append(str(error)))
            if args.mode == 'fixture':
                html = re.sub(r'<script\b[^>]*>[\s\S]*?</script>', '', (WEB/'index.html').read_text())
                html = re.sub(r'<link\b[^>]*>', '', html)
                page.set_content(html)
                for name in ['app.css', 'features.css', 'reliability.css', 'recovery.css', 'writing.css', 'workbench.css', 'assistant.css']: page.add_style_tag(content=(WEB/name).read_text())
                page.add_script_tag(content=(ROOT/'tests/e2e/browser-fixture.js').read_text())
                engine = (WEB/'template-engine.js').read_text().replace('export function', 'function')
                app = (WEB/'app.js').read_text().replace("import { parseTemplate, fillTemplate } from './template-engine.js';", '')
                assistant = (WEB/'assistant.js').read_text().replace('export function', 'function')
                app=app.replace("import { initAssistant } from './assistant.js';",'')
                page.add_script_tag(content=engine+'\n'+assistant+'\n'+app)
            else:
                env = {**os.environ, 'POMTE_E2E_DIRECTORY': directory.name}
                service = subprocess.Popen(['node', '--experimental-strip-types', str(ROOT/'tests/e2e/server.ts')], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
                # All paths and test data are temporary. Never log the readiness URL/session token.
                ready = json.loads(service.stdout.readline())
                page.goto(ready['url'], wait_until='networkidle')
            report['browser'] = browser.version
            def passed(name): report['passed'].append(name); print('PASS', name)
            def cards(): return page.locator('.item-card')
            def card(title): return cards().filter(has=page.get_by_role('heading', name=title, exact=True)).first
            def invoke(path, method='GET', payload=None, etag=None):
                return page.evaluate('''async ({path,method,payload,etag})=>{const response=await fetch(path,{method,headers:{Authorization:'Bearer '+sessionStorage.getItem('promtesaver.session'),...(payload===null?{}:{'Content-Type':'application/json'}),...(etag?{'If-Match':etag}:{})},...(payload===null?{}:{body:JSON.stringify(payload)})});if(!response.ok)throw Error('Test request failed: '+response.status);return response.json();}''', {'path':path,'method':method,'payload':payload,'etag':etag})
            def unlock(password=PASSWORD):
                page.fill('#passphrase', password);page.click('#gateAction');expect(page.locator('#shell')).to_be_visible()
            def new_item(title, body, kind='prompt'):
                if not page.locator('#libraryView').is_visible(): page.locator('#mainNav [data-filter="all"]').click()
                page.click('#newButton');page.fill('#entryTitle', title);page.fill('#entryBody', body);page.select_option('#entryKind', kind);page.click('#saveEntry');expect(page.locator('#editorDialog')).not_to_be_visible()
            expect(page.locator('#gate')).to_be_visible()
            if args.mode == 'fixture':
                page.emulate_media(reduced_motion='reduce')
                page.evaluate('window.__fixture.delayAuth=900')
                page.fill('#passphrase', PASSWORD);page.fill('#confirm', PASSWORD);page.click('#gateAction')
                expect(page.locator('#gateProgress')).to_be_visible()
                expect(page.locator('#gateAction')).to_be_disabled()
                assert page.get_attribute('#gateForm','aria-busy')=='true'
                assert page.locator('.secure-spinner').evaluate("el=>getComputedStyle(el).animationName")=='none'
                page.click('#gateCancel')
                expect(page.locator('#gateError')).to_contain_text('Cancelled')
                page.wait_for_timeout(1000)
                expect(page.locator('#shell')).not_to_be_visible()
                assert page.evaluate('window.__fixture.initialized') is False
                page.evaluate('window.__fixture.delayAuth=0')
                page.emulate_media(reduced_motion='no-preference')
                passed('Cancelable setup respects reduced motion and discards late responses')
            page.fill('#passphrase', PASSWORD);page.fill('#confirm', PASSWORD);page.click('#gateAction')
            expect(page.locator('#shell')).to_be_visible()
            expect(page.locator('#captureView')).to_be_visible()
            expect(page.locator('#captureStateTitle')).to_have_text('Connect your first capture source')
            expect(page.locator('#captureEmpty')).to_be_visible()
            expect(page.locator('#writingNav')).not_to_be_visible()
            expect(page.locator('#assistantNav')).not_to_be_visible()
            expect(page.locator('#libraryView')).not_to_be_visible()
            passed('Capture is the default workspace; additional tools stay outside primary navigation')
            if args.mode == 'fixture':
                page.evaluate('''()=>{__fixture.captureStatus={state:'ready',browser:{paired:true,authorized:true,hosts:['chatgpt.com'],expiresAt:Date.now()+100000},native:{available:false}};__fixture.captures=Array.from({length:8},(_,i)=>({id:'capture-home-'+i,text:i===0?'<img src=x onerror="window.__unsafeCapture=true">'+'x'.repeat(900):'Synthetic captured prompt '+i,quality:'draft_snapshot',surface:{appId:'chatgpt.com',title:'Synthetic capture '+i},sourceMethod:'browser_composer',recordedAt:new Date().toISOString()}));}''')
                page.click('#captureRefresh');expect(page.locator('#captureRecentList article')).to_have_count(5)
                expect(page.locator('#captureStateTitle')).to_have_text('Capture pairing ready')
                assert page.locator('#captureRecentList img').count()==0
                assert len(page.locator('#captureRecentList p').first.inner_text())<=421
                assert page.evaluate('window.__unsafeCapture') is None
                page.set_viewport_size({'width':390,'height':844})
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), 'Capture home must fit narrow screens'
                page.locator('#captureView').screenshot(path=str(output/'capture-home-mobile.png'))
                page.set_viewport_size({'width':1440,'height':960})
                page.locator('#captureView').screenshot(path=str(output/'capture-home.png'))
                page.click('#capturePause');expect(page.locator('#actionDialog')).to_be_visible();page.click('#actionAccept')
                expect(page.locator('#captureStateTitle')).to_have_text('Connect your first capture source')
                expect(page.locator('#capturePause')).to_be_disabled()
                page.click('#captureSetupButton');expect(page.locator('#captureSetup')).to_be_visible()
                assert not page.is_checked('#bridgeAuto')
                page.click('#captureSetupClose')
                page.evaluate("__fixture.captureStatus={state:'unpaired',browser:{paired:false,authorized:false,hosts:[]},native:{available:true,source:'codex-local-session',enabled:false,state:'paused'}}")
                page.click('#captureRefresh');expect(page.locator('#captureNativeControls')).to_be_visible()
                expect(page.locator('#captureNativeEnable')).to_be_disabled()
                assert not page.is_checked('#captureNativeConsent')
                assert page.evaluate("__fixture.requests.filter(r=>r.path==='/api/capture/native').length")==0
                page.check('#captureNativeConsent');page.click('#captureNativeEnable')
                expect(page.locator('#captureStateTitle')).to_have_text('Codex capture is running')
                expect(page.locator('#captureNativePause')).to_be_visible()
                assert not page.is_checked('#captureNativeConsent')
                page.click('#capturePause');page.click('#actionAccept')
                expect(page.locator('#captureNativeState')).to_have_text('Paused')
                expect(page.locator('#captureNativeEnable')).to_be_disabled()
                assert page.evaluate("__fixture.requests.filter(r=>r.path==='/api/capture/review').length")==0
                page.evaluate("__fixture.captures[1].text='Synthetic  captured prompt 1';window.__reviewBefore=JSON.stringify(__fixture.captures)")
                page.click('#captureReview');expect(page.locator('#captureReviewPanel')).to_be_visible()
                expect(page.locator('#captureReviewList article')).to_have_count(5)
                expect(page.locator('#captureReviewList')).to_contain_text('Extra spaces between words')
                assert page.evaluate('JSON.stringify(__fixture.captures)===window.__reviewBefore')
                assert page.evaluate('window.__fixture.aiCalls||0')==0
                page.click('#captureReviewClose');expect(page.locator('#captureReviewList article')).to_have_count(0)
                page.evaluate('window.__fixture.captures=[]')
                passed('Capture home bounds previews, treats saved text as data, fits mobile, requires native source consent and pauses actual sources')
                passed('Recent wording review runs only on request, uses bounded local checks and preserves raw captures without cloud AI')
            page.locator('#mainNav [data-filter="all"]').click();page.click('#demoButton');expect(cards()).to_have_count(9)
            assert page.input_value('#passphrase') == ''
            passed('Setup, sample prompts, and password-field clearing')
            page.click('#settingsNav')
            expect(page.locator('#runtimeTitle')).to_be_visible()
            expect(page.locator('#healthExport')).to_be_disabled()
            page.click('#healthRefresh')
            expect(page.locator('#healthMemory')).to_have_text(re.compile(r'\d+\.\d MiB'))
            expect(page.locator('#healthRuntime')).to_have_text('v0.9.0')
            with page.expect_download() as health_download: page.click('#healthExport')
            report_file=health_download.value.path()
            health=json.loads(Path(report_file).read_text())
            assert health['schema']=='promtesaver-diagnostics-v1'
            assert health['privacy']['telemetry'] is False
            assert 'promtesaver.session' not in json.dumps(health) and 'a'*64 not in json.dumps(health)
            expect(page.locator('#toast')).not_to_have_class(re.compile(r'visible'),timeout=5000)
            page.locator('.runtime-panel').screenshot(path=str(output/'device-health.png'))
            passed('On-demand device health and prompt-free diagnostic download')
            page.set_viewport_size({'width':390,'height':844})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'), 'Health panel must not overflow on mobile'
            page.locator('.runtime-panel').screenshot(path=str(output/'device-health-mobile.png'))
            page.set_viewport_size({'width':1440,'height':960})
            passed('Device health fits a narrow viewport without horizontal overflow')
            page.click('#lockButton');expect(page.locator('#healthExport')).to_be_disabled()
            expect(page.locator('#healthMemory')).to_have_text('Not checked')
            if args.mode == 'fixture':
                page.evaluate('window.__fixture.delayAuth=900')
                page.fill('#passphrase', PASSWORD);page.click('#gateAction')
                expect(page.locator('#gateProgress')).to_be_visible();page.click('#gateCancel')
                expect(page.locator('#gateError')).to_contain_text('Cancelled');page.wait_for_timeout(1000)
                expect(page.locator('#shell')).not_to_be_visible()
                assert page.evaluate('window.__fixture.initialized') is True
                assert page.evaluate('window.__fixture.unlocked') is False
                page.evaluate('window.__fixture.delayAuth=0')
                passed('Canceling unlock preserves existing vault and cannot reopen from a late response')
            unlock();page.locator('#mainNav [data-filter="all"]').click()

            if args.mode == 'fixture':
                cards().first.locator('.wb-title').click()
                expect(page.locator('#wbInspector')).to_be_visible()
                expect(page.locator('#wbDetail')).to_be_visible()
                assert len(page.inner_text('#wbBody')) > 8
                page.click('#listLayout')
                assert page.get_attribute('#itemsList','data-layout') == 'list'
                page.click('#cardLayout')
                assert page.get_attribute('#itemsList','data-layout') == 'cards'
                page.click('#focusToggle')
                expect(page.locator('.sidebar')).not_to_be_visible()
                page.click('#focusToggle')
                expect(page.locator('.sidebar')).to_be_visible()
                passed('v0.7 inspector, adaptive list and focus mode')

            if args.mode == 'fixture':
                page.click('#moreNav');page.click('#writingNav')
                expect(page.locator('#writingView')).to_be_visible()
                page.fill('#styleName','Product updates tone')
                page.fill('#styleSamples',"I'm writing product updates. I don't add hype!\n\n---\n\nI care about users and careful details.")
                page.fill('#styleTone','Warm and precise')
                page.click('#styleAnalyze')
                expect(page.locator('#styleAnalysisStatus')).to_contain_text('Analyzed 2 sample')
                expect(page.locator('#styleAnalytics')).to_be_visible()
                page.check('#styleRetainExamples')
                page.click('#styleSave')
                expect(page.locator('#styleAnalysisStatus')).to_contain_text('Profile saved')
                expect(page.locator('#styleCount')).to_have_text('1')
                assert page.input_value('#styleSamples')==''
                page.fill('#styleProofText','This  line has extra spacing.')
                page.click('#styleProofCheck')
                expect(page.locator('.writing-issue')).to_have_count(1)
                page.locator('.writing-issue button').click()
                expect(page.locator('#styleProofText')).to_have_value('This line has extra spacing.')
                page.click('#styleProofClear')
                expect(page.locator('#styleProofText')).to_have_value('')
                page.fill('#styleTask','Rewrite my sprint summary with no invented details.')
                page.click('#styleGenerate')
                expect(page.locator('#styleInstructions')).to_have_value(re.compile('Rewrite my sprint summary'))
                assert "I'm writing" not in page.input_value('#styleInstructions'), 'Samples should not be exported by default'
                page.check('#styleIncludeExamples')
                page.click('#styleGenerate')
                expect(page.locator('#styleInstructions')).to_have_value(re.compile("I.m writing"))
                with page.expect_download() as download_info: page.click('#styleExport')
                downloaded=download_info.value
                content_path=downloaded.path()
                exported=json.loads(Path(content_path).read_text())
                assert exported['schema']=='promtesaver-style-v1' and len(exported['profile']['examples'])==2
                page.uncheck('#styleIncludeExamples')
                with page.expect_download() as download_info: page.click('#styleExport')
                exported=json.loads(Path(download_info.value.path()).read_text())
                assert exported['profile']['examples']==[], 'Portable file defaults to no sample excerpts'
                page.click('#styleNew')
                expect(page.locator('#styleName')).to_have_value('')
                page.fill('#styleName','Private metrics only')
                page.fill('#styleSamples','A short personal sample I chose to analyze.')
                page.click('#styleAnalyze')
                expect(page.locator('#styleAnalysisStatus')).to_contain_text('Analyzed 1 sample')
                assert not page.is_checked('#styleRetainExamples'), 'Retaining raw excerpts must default off'
                page.click('#styleSave')
                expect(page.locator('#styleCount')).to_have_text('2')
                assert page.evaluate('window.__fixture.styles.find(x=>x.name==="Private metrics only").profile.examples.length')==0
                page.fill('#styleTask','Rewrite these notes with my preferences')
                page.check('#styleIncludeExamples')
                page.click('#styleGenerate')
                expect(page.locator('#styleInstructions')).to_have_value(re.compile('Rewrite these notes'))
                assert 'short personal sample' not in page.input_value('#styleInstructions')
                page.click('#styleNew')
                expect(page.locator('#styleName')).to_have_value('')
                page.locator('.writing-profile').first.click()
                expect(page.locator('#styleName')).to_have_value('Product updates tone')
                page.fill('#styleTone','Brief, natural and direct')
                page.click('#styleSave')
                expect(page.locator('#styleAnalysisStatus')).to_contain_text('Profile saved')
                page.fill('#styleTask','Write a recap without assumptions')
                page.click('#styleGenerate')
                page.click('#lockButton')
                expect(page.locator('#gate')).to_be_visible()
                assert page.input_value('#styleTask')=='' and page.input_value('#styleInstructions')=='', 'Lock must remove writing text from hidden DOM'
                unlock()
                page.click('#moreNav');page.click('#writingNav')
                expect(page.locator('#styleCount')).to_have_text('2')
                page.locator('.writing-profile').filter(has_text='Product updates tone').click()
                expect(page.locator('#styleTone')).to_have_value('Brief, natural and direct')
                passed('Writing Studio profile create/edit, opt-in versus sample-free storage/export, proofreading suggestions and lock cleanup')
                page.locator('#mainNav [data-filter="all"]').click()

            new_item('Browser lifecycle canary', 'Synthetic browser content with no real credentials.')
            expect(card('Browser lifecycle canary')).to_be_visible()
            card('Browser lifecycle canary').get_by_role('button',name='Edit saved prompt').click()
            page.fill('#entryBody', 'My unsaved draft must survive a conflict.')
            saved = invoke('/api/items?q=Browser%20lifecycle')['items'][0]
            invoke('/api/items/'+saved['id'], 'PUT', {
                'title':saved['title'],'body':'A parallel edit from a different window.',
                'kind':saved['kind'],'project':saved['project'],'tags':saved['tags'],
                'pinned':saved['pinned'],'notes':saved.get('notes',''),'source':saved.get('source','')
            }, saved['etag'])
            page.click('#saveEntry');expect(page.locator('#saveDraftAsNew')).to_be_visible()
            assert page.input_value('#entryBody') == 'My unsaved draft must survive a conflict.'
            page.click('#saveDraftAsNew');page.fill('#entryTitle','Recovered browser draft');page.click('#saveEntry')
            expect(card('Recovered browser draft')).to_be_visible();passed('Stale-edit conflict preserves draft and supports save-as-new')

            new_item('Literal template canary', 'First {{a}} / second {{b|World}}', 'template')
            card('Literal template canary').get_by_role('button',name='Copy prompt to clipboard').click()
            page.fill('#variable-0','{{b}}');page.fill('#variable-1','Actual')
            assert page.input_value('#templatePreview') == 'First {{b}} / second Actual'
            page.click('#cancelTemplate');passed('Template inserted values remain literal in the UI')
            page.click('#newButton');page.fill('#entryTitle','Unsaved draft');page.keyboard.press('Escape')
            expect(page.locator('#actionDialog')).to_be_visible();page.click('#actionCancel')
            assert page.input_value('#entryTitle') == 'Unsaved draft'
            page.click('#cancelDialog');page.click('#actionAccept');expect(page.locator('#editorDialog')).not_to_be_visible()
            passed('Dirty-editor discard confirmation is keyboard accessible and cancellable')

            page.check('#selectPage');page.click('#bulkMove');page.fill('#actionInput','Browser QA');page.click('#actionAccept')
            expect(page.locator('#selectedCount')).to_have_text('0 selected')
            assert all(i['project']=='Browser QA' for i in invoke('/api/items?limit=100')['items'])
            passed('Bounded bulk move updates selected prompts')
            for i in range(45): invoke('/api/items','POST',{'title':f'Synthetic page item {i:02d}','body':'Bounded UI pagination fixture','project':'Pagination'})
            page.click('#clearFilters');expect(cards()).to_have_count(40)
            page.click('#loadMoreButton');expect(cards()).to_have_count(17)
            assert '41-57' in page.inner_text('#listInfo')
            page.click('#previousPage');expect(cards()).to_have_count(40)
            passed('Previous/next pagination replaces rather than appends cards')

            page.click('#settingsNav');page.check('#prefLowMemory');page.check('#prefCompact');page.fill('#prefIdle','2');page.click('#savePreferences')
            expect(page.locator('#preferencesNotice')).to_contain_text('Preferences saved')
            page.locator('#mainNav [data-filter="all"]').click();expect(cards()).to_have_count(20)
            assert 'low-memory' in page.locator('body').get_attribute('class')
            page.keyboard.press('Control+k');expect(page.locator('#quickDialog')).to_be_visible();page.fill('#quickSearch','Recovered browser')
            expect(page.locator('#quickResults .quick-result')).to_have_count(1)
            page.keyboard.press('ArrowDown');assert page.get_attribute('#quickSearch','aria-activedescendant')
            page.keyboard.press('Escape');passed('Low-memory/compact preferences and keyboard quick finder')
            if args.mode == 'fixture':
                # List API deliberately truncates long content, but editing and template expansion
                # must fetch the whole original text before acting on it.
                long_body='Private synthetic ' * 150 + ' final proof'
                invoke('/api/items','POST',{'title':'Long hydrated prompt','body':long_body,'project':'Stress'})
                page.click('#clearFilters')
                expect(card('Long hydrated prompt')).to_be_visible()
                assert len(invoke('/api/items?view=preview')['items'][0]['body']) <= 420
                card('Long hydrated prompt').get_by_role('button',name='Edit saved prompt').click()
                expect(page.locator('#entryBody')).to_have_value(long_body)
                page.fill('#entryBody',long_body+' updated')
                page.click('#saveEntry')
                result=invoke('/api/items?q=Long%20hydrated')['items'][0]
                assert result['body']==long_body+' updated'
                template_body='Synthetic long template ' * 120 + ' {{late_variable}}'
                invoke('/api/items','POST',{'title':'Long hydrated template','body':template_body,'kind':'template'})
                page.click('#clearFilters')
                card('Long hydrated template').get_by_role('button',name='Copy prompt to clipboard').click()
                expect(page.locator('#templateDialog')).to_be_visible()
                expect(page.locator('#variable-0')).to_be_visible()
                page.click('#cancelTemplate')
                passed('Preview projection rehydrates full edit and template text on demand')

            # Backup UI integration. Fixture files are deliberately mock JSON, never claimed encrypted.
            page.click('#settingsNav')
            if args.mode == 'fixture':
                items=invoke('/api/items?limit=100')['items'];backup=json.dumps({'items':items}).encode()
            else:
                backup=bytes(page.evaluate('''async passphrase=>{const r=await fetch('/api/backup/export',{method:'POST',headers:{Authorization:'Bearer '+sessionStorage.getItem('promtesaver.session'),'Content-Type':'application/json'},body:JSON.stringify({passphrase})});if(!r.ok)throw Error('Export failed');return [...new Uint8Array(await r.arrayBuffer())];}''', PASSWORD))
            page.locator('#backupFile').set_input_files({'name':'synthetic-smoke.pomte','mimeType':'application/octet-stream','buffer':backup})
            expect(page.locator('#backupDialog')).to_be_visible();page.fill('#backupPassphrase',PASSWORD)
            before=invoke('/api/summary')['library']['all'];page.click('#doBackup')
            expect(page.locator('#backupPreview')).to_contain_text('Nothing has changed yet')
            assert invoke('/api/summary')['library']['all']==before
            page.click('#doBackup');expect(page.locator('#backupDialog')).not_to_be_visible()
            assert page.input_value('#backupPassphrase')=='';passed('Restore preview, explicit confirmation, and secret clearing')

            page.click('#changePassphrase');page.fill('#currentPassphrase','WrongSyntheticCurrentPassword')
            page.fill('#newPassphrase','ProposedSyntheticBrowserPassword');page.fill('#confirmNewPassphrase','ProposedSyntheticBrowserPassword');page.click('#doPassphrase')
            expect(page.locator('#passphraseError')).to_contain_text('Could not unlock')
            expect(page.locator('#shell')).to_be_visible();expect(page.locator('#passphraseDialog')).to_be_visible()
            passed('Incorrect current passphrase preserves the authenticated settings dialog')
            page.fill('#currentPassphrase',PASSWORD)
            replacement='ChangedSyntheticBrowserPassword13';page.fill('#newPassphrase',replacement);page.fill('#confirmNewPassphrase',replacement);page.click('#doPassphrase')
            expect(page.locator('#gate')).to_be_visible();assert page.input_value('#currentPassphrase')==''
            unlock(replacement);expect(cards()).to_have_count(20);passed('Passphrase change locks UI and replacement unlocks')
            # Visible layout checks use real Chromium DOM/layout, not pixel predictions.
            page.set_viewport_size({'width':390,'height':844});page.evaluate('window.scrollTo(0,0);document.activeElement?.blur()')
            expect(page.locator('#topSettings')).to_be_visible()
            page.click('#topSettings');expect(page.locator('#preferencesForm')).to_be_visible()
            page.locator('#mainNav [data-filter="all"]').click();expect(cards()).to_have_count(20)
            page.evaluate('window.scrollTo(0,0);document.activeElement?.blur()')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'), 'Mobile horizontal overflow'
            page.screenshot(path=str(output/'mobile-library.png'),full_page=False)
            page.set_viewport_size({'width':1440,'height':960});page.evaluate('window.scrollTo(0,0);document.activeElement?.blur()')
            page.screenshot(path=str(output/'desktop-library.png'),full_page=False)
            page.click('#settingsNav');page.evaluate('window.scrollTo(0,0);document.activeElement?.blur()')
            page.screenshot(path=str(output/'privacy-settings.png'),full_page=True)
            if args.mode=='fixture':
                page.click('#moreNav');page.click('#writingNav')
                expect(page.locator('#writingView')).to_be_visible()
                page.locator('.writing-profile').first.click()
                page.screenshot(path=str(output/'writing-desktop.png'),full_page=True)
                page.set_viewport_size({'width':390,'height':844})
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'), 'Writing Studio mobile horizontal overflow'
                page.screenshot(path=str(output/'writing-mobile.png'),full_page=True)
                page.set_viewport_size({'width':1440,'height':960})
                page.locator('#mainNav [data-filter="all"]').click()
            passed('Desktop/mobile responsive layout and screenshots')

            # Explicit local recall uses the current editor draft and preserves user control.
            page.locator('#mainNav [data-filter="all"]').click()
            source=invoke('/api/items','POST',{'title':'Synthetic React authentication source',
                'body':'Review React authentication flow and preserve existing tests',
                'project':'Recall QA','source':'Manual'})['item']
            page.click('#newButton')
            page.fill('#entryTitle','Improve React authentication')
            page.fill('#entryBody','Review React auth flow with tests')
            page.fill('#entryProject','Recall QA')
            page.click('#findRelated')
            expect(page.locator('#recallPanel')).to_be_visible()
            expect(page.locator('#recallResults')).to_contain_text('Synthetic React authentication source')
            source_result=page.locator('.recall-result').filter(has_text='Synthetic React authentication source')
            expect(source_result).to_contain_text('Why shown: local keyword overlap')
            expect(source_result.get_by_role('button',name='Copy exact saved wording without changing this draft')).to_be_visible()
            expect(source_result.get_by_role('button',name='Add this saved prompt to the current draft')).to_be_visible()
            source_result.locator('select').select_option('not-useful')
            source_result.get_by_role('button',name='Save feedback for this saved revision').click()
            expect(page.locator('.recall-result').filter(has_text='Synthetic React authentication source')).to_contain_text('Your feedback on revision 1: not useful')
            passed('Related result explains keyword match and saves revision-bound outcome feedback')
            invoke('/api/items/'+source['id'],'PUT',{
                'title':source['title'],'body':'Review React authentication flow and preserve updated tests',
                'kind':source['kind'],'project':source['project'],'tags':source['tags'],
                'pinned':source['pinned'],'notes':source.get('notes',''),'source':source.get('source','')
            },source['etag'])
            page.locator('.recall-result').filter(has_text='Synthetic React authentication source').get_by_role('button',name='Add this saved prompt to the current draft').click()
            expect(page.locator('#entryBody')).to_have_value('Review React auth flow with tests')
            expect(page.locator('#recallPanel')).not_to_be_visible()
            page.click('#findRelated')
            page.locator('.recall-result').filter(has_text='Synthetic React authentication source').get_by_role('button',name='Add this saved prompt to the current draft').click()
            expect(page.locator('#entryBody')).to_have_value(re.compile('preserve updated tests'))
            expect(page.locator('#recallPanel')).not_to_be_visible()
            page.fill('#entryBody','Review React auth flow with tests')
            page.fill('#entryProject','')
            page.click('#findRelated')
            page.locator('.recall-result').filter(has_text='Synthetic React authentication source').get_by_role('button',name='Set this draft project to the selected source project').click()
            expect(page.locator('#entryProject')).to_have_value('Recall QA')
            expect(page.locator('#recallPanel')).not_to_be_visible()
            passed('Project is suggested from a source only after an explicit correction click')
            page.click('#findRelated')
            source_result=page.locator('.recall-result').filter(has_text='Synthetic React authentication source')
            source_result.locator('select').select_option('hidden')
            source_result.get_by_role('button',name='Save feedback for this saved revision').click()
            expect(page.locator('.recall-result').filter(has_text='Synthetic React authentication source')).to_have_count(0)
            passed('Hidden feedback removes this revision from related results without deleting its library source')
            page.click('#cancelDialog');page.click('#actionAccept')
            expect(page.locator('#editorDialog')).not_to_be_visible()
            passed('Explicit vault recall adds a reviewed source to the draft and clears results')

            page.fill('#searchInput','Synthetic React authentication source')
            page.locator('.item-card').filter(has_text='Synthetic React authentication source').locator('.wb-title').click()
            expect(page.locator('#wbFeedback select')).to_have_value('hidden')
            page.locator('#wbFeedback select').select_option('')
            page.locator('#wbFeedback').get_by_role('button',name='Save or clear feedback for this version').click()
            expect(page.locator('#wbFeedback select')).to_have_value('')
            passed('Inspector can undo hidden feedback without deleting or editing the saved source')
            page.fill('#searchInput','')

            if args.mode=='fixture':
                page.evaluate('''()=>__fixture.captures.push({id:'synthetic-capture',deviceId:'browser-extension',
                  recordedAt:new Date().toISOString(),surface:{appId:'chatgpt.com',title:''},
                  text:'Synthetic captured prompt',quality:'draft_snapshot',sourceMethod:'editor_snapshot'})''')
                page.locator('#mainNav [data-filter="captured"]').click()
                receipt=page.locator('.capture-receipt')
                expect(receipt).to_contain_text('Browser helper')
                expect(receipt).to_contain_text('delivery is unverified')
                expect(page.locator('.item-card')).to_contain_text('Synthetic captured prompt')
                passed('Captured record shows a source, quality and deletion receipt without claiming delivery')

            page.locator('#mainNav [data-filter="all"]').click();expect(cards()).to_have_count(20)
            if args.mode=='fixture':
                # Simulate an interrupted edit after encrypted autosave, followed by unlock.
                page.click('#newButton')
                page.fill('#entryTitle','Recovered after interruption')
                page.fill('#entryBody','Synthetic draft that should recover after a vault lock')
                page.wait_for_timeout(1550)
                assert len(page.evaluate('window.__fixture.drafts'))==1, 'Expected one persisted synthetic draft'
                page.evaluate('window.__fixture.unlocked=false; window.dispatchEvent(new Event("focus"))')
                expect(page.locator('#gate')).to_be_visible()
                assert page.input_value('#entryBody')==''
                unlock(replacement)
                page.locator('#mainNav [data-filter="all"]').click()
                expect(page.locator('#draftRecovery')).to_be_visible()
                page.get_by_role('button',name='Recover encrypted draft as a new prompt').click()
                expect(page.locator('#entryBody')).to_have_value('Synthetic draft that should recover after a vault lock')
                page.click('#saveEntry')
                expect(page.locator('#draftRecovery')).not_to_be_visible()
                expect(card('Recovered after interruption')).to_be_visible()
                passed('Encrypted autosave, interrupted-edit recovery, and explicit commit to library')
                page.evaluate('window.__fixture.delayItems=500')
                page.fill('#searchInput','Browser');page.wait_for_timeout(300)
                page.click('#lockButton');page.wait_for_timeout(600)
                page.evaluate('window.__fixture.delayItems=0')
            else: page.click('#lockButton')
            expect(page.locator('#gate')).to_be_visible();expect(cards()).to_have_count(0)
            expect(page.locator('#captureRecentList article')).to_have_count(0)
            expect(page.locator('#captureReviewList article')).to_have_count(0)
            assert not page.is_checked('#captureNativeConsent')
            assert page.input_value('#entryBody')=='' and page.input_value('#searchInput')==''
            passed('Lock purges decrypted DOM' + (' and discards late responses' if args.mode=='fixture' else ''))
            unlock(replacement)
            if args.mode=='fixture':
                page.evaluate('window.__fixture.idleMs=160;window.__fixture.deadline=Date.now()+160')
                page.evaluate("window.dispatchEvent(new Event('focus'))")
                expect(page.locator('#gate')).to_be_visible(timeout=2500);expect(cards()).to_have_count(0)
                passed('Idle deadline clears visible content without periodic activity renewal')
            else: report['skipped'].append('Accelerated idle UI test (fixture-only; real timer covered by HTTP tests)')
            assert not report['errors'], report['errors']
            browser.close()
    except Exception as error:
        # Do not log readiness URLs or capability tokens on failures.
        report['errors'].append(re.sub(r'#[a-f0-9]{64}', '#REDACTED', str(error)))
    finally:
        if service is not None:
            service.terminate()
            try: service.wait(timeout=5)
            except subprocess.TimeoutExpired: service.kill();service.wait()
        directory.cleanup()
        report['result']='passed' if not report['errors'] else 'failed'
        (output/'report.json').write_text(json.dumps(report,indent=2)+'\n')
        print(json.dumps(report,indent=2))
    return 0 if report['result']=='passed' else 1

if __name__=='__main__': raise SystemExit(main())

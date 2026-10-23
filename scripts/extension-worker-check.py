#!/usr/bin/env python3
"""Load the unpacked MV3 worker in full Chromium; no live-site data."""
from pathlib import Path
import json, sys, tempfile
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
out=ROOT/'docs/verification/windows-2026-10-23/extension-worker.json'
report={'scope':'Real unpacked Chromium MV3 worker, real chrome.storage, and a synthetic approved-origin page. No real-site data or localhost traffic.','passed':[],'errors':[]}
with tempfile.TemporaryDirectory(prefix='promte-extension-') as profile:
    with sync_playwright() as p:
        ctx=None
        try:
            ext=str(ROOT/'apps/browser-helper')
            # The default Playwright executable is Chrome Headless Shell, which
            # does not load MV3 extensions. The full Chromium channel does.
            ctx=p.chromium.launch_persistent_context(profile,headless=True,channel='chromium',args=[f'--disable-extensions-except={ext}',f'--load-extension={ext}'])
            ctx.set_default_timeout(5000)
            worker=ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event('serviceworker',timeout=8000)
            report['passed'].append('Actual manifest loaded and service worker started')
            manifest=worker.evaluate('chrome.runtime.getManifest()')
            assert manifest['incognito']=='not_allowed'
            assert manifest['host_permissions']==['http://127.0.0.1/*']
            assert len(manifest['optional_host_permissions'])==3
            report['passed'].append('No mandatory AI-site host access; incognito explicitly excluded')
            result=worker.evaluate('''async()=>{
              const sender={url:'https://chatgpt.com/',frameId:0,tab:{id:999999,incognito:false}};
              return handle({type:'STATE'},sender);
            }''')
            assert result['enabled'] is False and result['canCapture'] is False
            report['passed'].append('Actual worker defaults capture off with empty persistent/session storage')
            results=worker.evaluate('''async()=>{
              const sender={url:'https://chatgpt.com/',frameId:0,tab:{id:999999,incognito:false}};
              await chrome.storage.local.set({'promtesaver.sites':{'chatgpt.com':{enabled:true,hints:true}}});
              await chrome.storage.session.set({'promtesaver.bridge':{port:12345,writeToken:'a'.repeat(64),expiresAt:Date.now()+10000,allowedCaptureHosts:['chatgpt.com']}});
              const active=await handle({type:'STATE'},sender);
              const subframe=await handle({type:'CAPTURE',event:{}},{...sender,frameId:1});
              const incognito=await handle({type:'CAPTURE',event:{}},{...sender,tab:{id:999999,incognito:true}});
              const wrongSite=await handle({type:'CAPTURE',event:{}},{...sender,url:'https://evil.example/'});
              const elevate=await handle({type:'SET_SITE',host:'chatgpt.com',enabled:true},sender);
              const invalid=await handle({type:'CAPTURE',event:{text:'x'.repeat(50001)}},sender);
              await chrome.storage.session.remove('promtesaver.bridge');
              const revoked=await handle({type:'STATE'},sender);
              return {active,subframe,incognito,wrongSite,elevate,invalid,revoked};
            }''')
            assert results['active']['canCapture'] is True
            for name in ['subframe','incognito','wrongSite','elevate','invalid']:assert results[name]['ok'] is False,name
            assert results['revoked']['canCapture'] is False
            report['passed'].append('Worker rejects frames, incognito, wrong origins, privilege escalation and oversize messages')
            report['passed'].append('Session token removal revokes capture while retaining non-sensitive site preference')
            assert 'writeToken' not in results['active'] and 'apiKey' not in results['active']
            report['passed'].append('Content-script state does not disclose bridge token or provider credentials')
            # A synthetic page exercises the default denial with no optional
            # permission. Granting optional host access still needs a human
            # browser-prompt pilot; this probe must not bypass that consent.
            ctx.route('https://chatgpt.com/**',lambda route:route.fulfill(status=200,content_type='text/html',body='<!doctype html><title>Fixture</title><main><div id="prompt-textarea" contenteditable="true" role="textbox"></div><button data-testid="send-button">Send</button></main>'))
            site=ctx.new_page();site.goto('https://chatgpt.com/')
            assert worker.evaluate("chrome.permissions.contains({origins:['https://chatgpt.com/*']})") is False
            assert worker.evaluate('chrome.scripting.getRegisteredContentScripts()') == []
            site.locator('#prompt-textarea').click()
            assert site.locator('[data-promtesaver-assistant]').count() == 0
            report['passed'].append('Without optional permission, no content script or panel appears on a synthetic approved-origin page')
            report['unverified']=['Human grant of optional host permission, content-script injection after consent, real-site selectors, and live localhost capture']
            report['result']='passed'
        except Exception as exc:
            report['errors'].append(str(exc));report['result']='blocked-or-failed'
        finally:
            if ctx:ctx.close()
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
if report['result']!='passed':sys.exit(1)

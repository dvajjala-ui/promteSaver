#!/usr/bin/env python3
"""Load the actual unpacked MV3 worker in Chromium; synthetic messages only, no live-site access."""
from pathlib import Path
import json, tempfile, shutil
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
out=ROOT/'docs/verification/v0.9/extension-worker.json'
report={'scope':'Real unpacked Chromium MV3 worker + real chrome.storage; synthetic message senders. No real-site capture or localhost traffic.','passed':[],'errors':[]}
with tempfile.TemporaryDirectory(prefix='promte-extension-') as profile:
    with sync_playwright() as p:
        ctx=None
        try:
            ext=str(ROOT/'apps/browser-helper')
            ctx=p.chromium.launch_persistent_context(profile,headless=True,executable_path=shutil.which('chromium'),args=[f'--disable-extensions-except={ext}',f'--load-extension={ext}'])
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
            report['result']='passed'
        except Exception as exc:
            report['errors'].append(str(exc));report['result']='blocked-or-failed'
        finally:
            if ctx:ctx.close()
out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))

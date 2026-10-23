#!/usr/bin/env python3
"""Real Chromium UI rendering/interaction profile with a synthetic in-page API.
NOT a native desktop, networked UI-to-service, or hardware performance guarantee.
Uses installed Playwright and Chromium. No real vault, no capture, no telemetry.
"""
import argparse, json, os, re, shutil, time
from pathlib import Path
from statistics import median
from playwright.sync_api import sync_playwright, expect
import psutil

ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--root', default=str(ROOT))
    parser.add_argument('--items',type=int,default=2000)
    parser.add_argument('--low-memory',action='store_true')
    parser.add_argument('--cpu-throttle',type=int,default=4,help='Chromium CPU slowdown factor')
    parser.add_argument('--output',default='')
    args=parser.parse_args()
    if not 100 <= args.items <= 20000:parser.error('items: 100-20000')
    root=Path(args.root).resolve();web=root/'apps/local-web/public'
    timings=[]; errors=[]; idle_cpu=None
    start=time.perf_counter()
    with sync_playwright() as playwright:
        exe=os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium') or shutil.which('google-chrome')
        browser=playwright.chromium.launch(headless=True,**({'executable_path':exe} if exe else {}))
        page=browser.new_page(viewport={'width':1250,'height':860})
        page.set_default_timeout(10000)
        page.on('pageerror', lambda e: errors.append(str(e)))
        cdp=page.context.new_cdp_session(page)
        cdp.send('Performance.enable')
        if args.cpu_throttle>1:cdp.send('Emulation.setCPUThrottlingRate',{'rate':args.cpu_throttle})
        html=re.sub(r'<script\b[^>]*>[\s\S]*?</script>','',(web/'index.html').read_text())
        html=re.sub(r'<link\b[^>]*>','',html)
        page.set_content(html)
        for name in ['app.css','features.css','reliability.css','recovery.css','writing.css','workbench.css','assistant.css']:
            if (web/name).is_file():page.add_style_tag(content=(web/name).read_text())
        page.add_script_tag(content=(root/'tests/e2e/browser-fixture.js').read_text())
        page.evaluate('''({items,lowMemory})=>{
          window.__fixture.preferences.lowMemory=lowMemory;
          window.__fixture.preferences.compactMode=lowMemory;
          for(let i=0;i<items;i++)window.__fixture.add({title:`Synthetic ${i} performance prompt`,
            body:`Review latency and failure mode cohort${i%19} record ${i}. `+'An invented sample, not user content. '.repeat(5),
            project:`Project-${i%12}`,tags:[`tag-${i%37}`],pinned:i%27===0});
        }''',{'items':args.items,'lowMemory':args.low_memory})
        engine=(web/'template-engine.js').read_text().replace('export function','function')
        app=(web/'app.js').read_text().replace("import { parseTemplate, fillTemplate } from './template-engine.js';",'')
        assistant=(web/'assistant.js').read_text().replace('export function','function')
        app=app.replace("import { initAssistant } from './assistant.js';",'')
        page.add_script_tag(content=engine+'\n'+assistant+'\n'+app)
        page.fill('#passphrase','Synthetic-Performance-Passphrase-12');page.fill('#confirm','Synthetic-Performance-Passphrase-12')
        page.click('#gateAction');expect(page.locator('#shell')).to_be_visible()
        expected_cards=20 if args.low_memory else 40
        expect(page.locator('.item-card')).to_have_count(expected_cards)
        setup_ms=(time.perf_counter()-start)*1000
        for cohort in range(6):
            startQuery=time.perf_counter();page.fill('#searchInput',f'cohort{cohort}')
            expect(page.locator('#listInfo')).to_contain_text('of')
            page.wait_for_timeout(360)
            # Confirm newly rendered matches are displayed, not merely that the input changed.
            expect(page.locator('.item-card')).to_have_count(expected_cards)
            assert page.locator('.item-card').first.inner_text().find('cohort')!=-1
            timings.append((time.perf_counter()-startQuery)*1000)
        page.fill('#searchInput','');page.wait_for_timeout(370)
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Desktop overflow'
        page.set_viewport_size({'width':390,'height':844})
        page.wait_for_timeout(100)
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Mobile overflow'
        page.set_viewport_size({'width':1250,'height':860})
        page.keyboard.press('Control+k');expect(page.locator('#quickDialog')).to_be_visible()
        page.fill('#quickSearch','cohort8');page.wait_for_timeout(400)
        assert page.locator('#quickResults .quick-result').count()<=20
        page.keyboard.press('Escape')
        metrics={m['name']:m['value'] for m in cdp.send('Performance.getMetrics')['metrics']}
        # CDP CPU throttling itself burns host CPU in some headless builds. Reset before idle measurements.
        if args.cpu_throttle > 1:cdp.send('Emulation.setCPUThrottlingRate',{'rate':1})
        page.wait_for_timeout(200)
        sample_processes=psutil.Process(os.getpid()).children(recursive=True)
        chrome_rss=round(sum(p.memory_info().rss for p in sample_processes if p.is_running())/1048576,2)
        # Chromium is mostly idle between interactions. This is a brief sample, not a leak test.
        def total_cpu():
            return sum((x.user+x.system) for p in sample_processes if p.is_running() for x in [p.cpu_times()])
        before=total_cpu();time.sleep(2);after=total_cpu();idle_cpu=round(100*(after-before)/2,2)
        summary={'scope':'Real Chromium rendering + mocked synthetic API; not full-stack E2E',
          'chromium':browser.version,'items':args.items,'lowMemory':args.low_memory,'cpuThrottle':args.cpu_throttle,
          'pageCards':expected_cards,'coldPageAndSetupMs':round(setup_ms,2),
          'searchMedianMsIncludingDebounce':round(median(timings),2),
          'searchMaxMsIncludingDebounce':round(max(timings),2),
          'JSHeapUsedMiB':round(metrics.get('JSHeapUsedSize',0)/1048576,2),
          'chromiumProcessTreeRSSMiB':chrome_rss,'chromiumIdleCpuPercentOfOneCore':idle_cpu,
          'horizontalOverflow':False,'pageErrors':errors,'passed':not errors,
          'limitations':['Synthetic in-page API keeps fixture records in renderer memory',
            'Times include fixed UI debounce and a sampling delay, not solely CPU time',
            'Chromium process tree excludes separately hosted Node service',
            'Environment-specific headless sample, not representative Windows/macOS hardware']}
        browser.close()
    output=json.dumps(summary,indent=2)+'\n'
    if args.output:Path(args.output).write_text(output)
    print(output)
    if errors:return 1
    return 0

if __name__=='__main__':raise SystemExit(main())

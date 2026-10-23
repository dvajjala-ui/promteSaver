#!/usr/bin/env python3
"""Measure one isolated local service process on Windows/macOS/Linux.
No real vault is read; no extension, recorder, telemetry, network API or AI is used.
Requires developer-only psutil (pip install psutil); not an application dependency.
"""
import argparse, json, os, subprocess, tempfile, time
from pathlib import Path
from statistics import median
from urllib.request import Request, urlopen
import psutil

ROOT = Path(__file__).resolve().parents[1]
PASSWORD='Synthetic-Only-Resource-Test-Passphrase'

def timed(fn):
    t=time.perf_counter();r=fn();return (time.perf_counter()-t)*1000,r

def main():
    parser=argparse.ArgumentParser(description='Measure a fresh synthetic vault, never a user directory.')
    parser.add_argument('--root',default=str(ROOT))
    parser.add_argument('--records',type=int,default=250)
    parser.add_argument('--idle-seconds',type=float,default=4)
    parser.add_argument('--output',default='')
    args=parser.parse_args()
    if not 10<=args.records<=10000 or not 1<=args.idle_seconds<=60:parser.error('records: 10-10000; idle-seconds: 1-60')
    root=Path(args.root).resolve()
    entry=root/'tests/e2e/server.ts'
    if not entry.is_file():parser.error('Missing synthetic server fixture')
    start=time.perf_counter()
    with tempfile.TemporaryDirectory(prefix='promtesaver-resource-profile-') as directory:
        env={**os.environ,'POMTE_E2E_DIRECTORY':directory}
        cmd=['node']
        major=int(subprocess.check_output(['node','-p','process.versions.node.split(".")[0]'],text=True).strip())
        if major==22:cmd+=['--experimental-strip-types']
        cmd.append(str(entry))
        child=subprocess.Popen(cmd,cwd=root,env=env,text=True,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
        try:
            if child.stdout is None:raise RuntimeError('No readiness output')
            raw=child.stdout.readline()
            ready=json.loads(raw)
            startup_ms=(time.perf_counter()-start)*1000
            process=psutil.Process(child.pid)
            # Never log/copy the URL; it contains an access capability in the fragment.
            origin=ready['origin'];token=ready['token']
            def api(path,method='GET',data=None):
                content=None if data is None else json.dumps(data).encode('utf8')
                headers={'Authorization':'Bearer '+token,'Origin':origin}
                if content is not None:headers['Content-Type']='application/json'
                req=Request(origin+path,data=content,headers=headers,method=method)
                with urlopen(req,timeout=20) as response:return json.loads(response.read())
            status_ms,status=timed(lambda:api('/api/status'))
            setup_ms,_=timed(lambda:api('/api/setup','POST',{'passphrase':PASSWORD,'confirm':PASSWORD}))
            for i in range(args.records):
                api('/api/items','POST',{'title':f'Synthetic memory benchmark {i}',
                    'body':('Stable privacy-first local prompt for performance validation. '*8)+f'cohort{i%31} marker{i}',
                    'project':f'Project-{i%14}','tags':[f'tag-{i%23}']})
            warm_ms,_=timed(lambda:api('/api/items?limit=20'))
            list_times=[];query_times=[]
            for i in range(12):
                elapsed,_=timed(lambda:api('/api/items?limit=20&offset='+str((i%5)*20)));list_times.append(elapsed)
                elapsed,_=timed(lambda:api('/api/items?limit=20&q=cohort'+str(i%31)));query_times.append(elapsed)
            def sample():
                children=process.children(recursive=True)
                return {'rssMiB':round(sum(p.memory_info().rss for p in [process,*children] if p.is_running())/1048576,2),
                    'cpuSeconds':sum((c.user+c.system) for p in [process,*children] if p.is_running() for c in [p.cpu_times()]),
                    'processCount':1+sum(p.is_running() for p in children)}
            before=sample();time.sleep(args.idle_seconds);after=sample()
            lock_ms,_=timed(lambda:api('/api/lock','POST',{}))
            report={'version':'resource-profile-v1','node':subprocess.check_output(['node','-v'],text=True).strip(),
                'platform':os.name,'records':args.records,'startupReadinessMs':round(startup_ms,2),
                'firstStatusMs':round(status_ms,2),'setupWithKdfMs':round(setup_ms,2),
                'warmPageMs':round(warm_ms,2),'pagedReadMedianMs':round(median(list_times),2),
                'uncachedTextQueryMedianMs':round(median(query_times),2),
                'idleSeconds':args.idle_seconds,'idleCpuPercentOfOneCore':round(100*(after['cpuSeconds']-before['cpuSeconds'])/args.idle_seconds,3),
                'idleRSSMiB':after['rssMiB'],'idleProcessCount':after['processCount'],'lockMs':round(lock_ms,2),
                'notes':['Temporary synthetic vault only','Node and its descendants, no Chromium/WebView process','RSS is a snapshot and not peak memory','This script measures Linux here; Windows and macOS remain unverified']}
            output=json.dumps(report,indent=2)+'\n'
            if args.output:Path(args.output).write_text(output)
            print(output)
        finally:
            child.terminate()
            try:child.wait(timeout=5)
            except subprocess.TimeoutExpired:child.kill();child.wait()

if __name__=='__main__':main()

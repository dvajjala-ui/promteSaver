/** Explicit desktop-source consent, scoped to one unlocked session. Never starts at construction. */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { CodexTranscriptSource, type CodexSourceSnapshot, type CodexSourceStatus } from '../desktop/codex-source.ts';
import type { LocalVault } from './vault.ts';

export class NativeCaptureSession {
  readonly available: boolean;
  readonly #vault: LocalVault;
  readonly #directory: string;
  #producer: CodexTranscriptSource | undefined;
  #generation = 0;
  #enabled = false;
  #state: 'unavailable'|'paused'|'starting'|'running'|'error';
  #code: string | undefined;
  #lastSavedAt: string | null = null;
  #writes: number[] = [];
  constructor(vault:LocalVault, options:{desktop?:boolean;directory?:string}) {
    this.#vault=vault;
    // The Codex JSONL producer has no verified private/protected-session signal yet.
    // Keep it available only to isolated injected-directory tests; a desktop launch
    // alone must never authorize watching real user sessions.
    this.available=!!options.directory;
    this.#directory=options.directory??join(homedir(),'.codex','sessions');
    this.#state=this.available?'paused':'unavailable';
  }
  status() { return {available:this.available,source:'codex-local-session' as const,enabled:this.#enabled,
    state:this.#state,code:this.#code??null,lastSavedAt:this.#lastSavedAt}; }
  async enable():Promise<void> {
    if(!this.available)throw new Error('Native capture requires the Windows desktop host');
    if(!this.#vault.status().unlocked)throw new Error('Vault is locked');
    this.pause();
    const generation=++this.#generation;const epoch=this.#vault.sessionVersion;
    this.#enabled=true;this.#state='starting';this.#code=undefined;
    const current=()=>generation===this.#generation&&epoch===this.#vault.sessionVersion&&this.#enabled&&this.#vault.status().unlocked;
    const producer=new CodexTranscriptSource({directory:this.#directory,
      onSnapshot:(snapshot:CodexSourceSnapshot)=>{
        if(!current())return;
        const now=Date.now();while(this.#writes.length&&this.#writes[0]!<now-60_000)this.#writes.shift();
        if(this.#writes.length>=60){this.#code='SOURCE_RATE_LIMIT';return;}
        const result=this.#vault.archive.saveNativeCapture({schemaVersion:1,id:'codex-'+snapshot.eventId,
          deviceId:'desktop-codex-transcript',sourceSequence:1,recordedAt:snapshot.observedAt,
          surface:{surfaceId:'codex-local-session',appId:'codex-local-session',editorId:'approved-session-transcript',
            classification:'prompt',protection:'normal',privateMode:false},
          text:snapshot.text,quality:'draft_snapshot',sourceMethod:'local_transcript',origin:'user',redactions:0});
        if(result.saved){this.#writes.push(now);this.#lastSavedAt=snapshot.observedAt;}
      },
      onStatus:(status:CodexSourceStatus)=>{
        if(!current())return;
        if(status.state==='running')this.#state='running';
        if(status.state==='error'){this.#state='error';this.#enabled=false;}
        if(status.code)this.#code=status.code;
      }});
    this.#producer=producer;
    try { await producer.start(); }
    catch {
      if(generation===this.#generation&&epoch===this.#vault.sessionVersion){
        this.#enabled=false;this.#state='error';this.#code??='SOURCE_UNAVAILABLE';
      }
      await producer.stop();return;
    }
    if(!current()){await producer.stop();return;}
    if(!producer.running){this.#state='error';this.#enabled=false;this.#code??='SOURCE_UNAVAILABLE';}
  }
  /** Invalidate synchronously before asynchronous source cleanup; late events cannot write. */
  pause():void {
    ++this.#generation;this.#enabled=false;this.#state=this.available?'paused':'unavailable';this.#code=undefined;
    const old=this.#producer;this.#producer=undefined;
    if(old)void old.stop().catch(()=>{});
    this.#writes=[];this.#lastSavedAt=null;
  }
}

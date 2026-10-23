import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireVaultLease } from './process-lease.ts';
import { LocalVault } from './vault.ts';
import { diagnosticSnapshot } from './diagnostics.ts';
import { APP_VERSION } from '../../packages/contracts/app-info.ts';
import { libraryETag, styleETag, LibraryConflictError, StyleConflictError, type LibraryEntry, type BatchInput, type LibraryInput, type LibraryFilter } from '../../packages/local-store/archive.ts';
import { decryptBackupAsync, encryptBackupAsync } from './backup.ts';
import { WorkGate, OperationBusyError, OperationCancelledError, checkCancelled, type SecureOperation } from './work-gate.ts';
import { DEFAULT_PREFERENCES, type VaultPreferences } from '../../packages/local-store/preferences.ts';
import { analyzeWriting, createStylePrompt } from '../../packages/writing-style/profile.ts';
import { proofreadWriting } from '../../packages/writing-style/proofread.ts';
import { redactText } from '../../packages/capture-core/redact.ts';

import { GroqRunner, prepareAI, AIProblem, type AITransport } from './ai.ts';
import { DEFAULT_GROQ_MODEL } from '../../packages/local-store/ai-settings.ts';
import { AUTO_CAPTURE_HOSTS, browserCapture } from './browser-capture.ts';

const webRoot = fileURLToPath(new URL('./public/', import.meta.url));
const publicFiles: Record<string, [string, string]> = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/app.css': ['app.css', 'text/css; charset=utf-8'],
  '/features.css': ['features.css', 'text/css; charset=utf-8'],
  '/template-engine.js': ['template-engine.js', 'text/javascript; charset=utf-8'],
  '/assistant.js': ['assistant.js', 'text/javascript; charset=utf-8'],
  '/assistant.css': ['assistant.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/reliability.css': ['reliability.css', 'text/css; charset=utf-8'],
  '/recovery.css': ['recovery.css', 'text/css; charset=utf-8'],
  '/writing.css': ['writing.css', 'text/css; charset=utf-8'],
  '/workbench.css': ['workbench.css', 'text/css; charset=utf-8'],
  '/favicon.svg': ['favicon.svg', 'image/svg+xml']
};
const assets = new Map(Object.entries(publicFiles).map(([route, [name, type]]) => [route, { body: readFileSync(join(webRoot, name)), type }]));

class HttpProblem extends Error { readonly status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}
async function readJson(req: IncomingMessage, maxBytes = 512_000): Promise<Record<string, unknown>> {
  if (req.headers['content-type']?.toLowerCase().split(';')[0]?.trim() !== 'application/json') throw new HttpProblem(415, 'JSON content type required');
  const chunks: Buffer[] = []; let length = 0;
  for await (const chunk of req) {
    length += (chunk as Buffer).length;
    if (length > maxBytes) throw new HttpProblem(413, 'Request is too large');
    chunks.push(chunk as Buffer);
  }
  let value: unknown;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpProblem(400, 'Malformed JSON'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpProblem(400, 'Expected JSON object');
  return value as Record<string, unknown>;
}
function authorized(received: string | undefined, expected: string): boolean {
  const prefix = 'Bearer ';
  if (!received?.startsWith(prefix)) return false;
  const token = received.slice(prefix.length);
  const left = Buffer.from(token); const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
function tagged(item: LibraryEntry) { return { ...item, etag: libraryETag(item) }; }
export interface LocalWebOptions { directory: string; port?: number; idleMinutes?: number; aiTransport?: AITransport; aiTimeoutMs?: number; }
export async function startLocalWeb(options: LocalWebOptions) {
  const vault = new LocalVault(options.directory);
  const token = randomBytes(32).toString('hex');
  if (options.idleMinutes !== undefined && (!Number.isFinite(options.idleMinutes) || options.idleMinutes <= 0 || options.idleMinutes > 120))
    throw new Error('Invalid idle time');
  const releaseLease = acquireVaultLease(vault.directory);
  const secureWork = new WorkGate();
  const ai = new GroqRunner(options.aiTransport,options.aiTimeoutMs);
  let aiSettingsVersion = 0;
  let allowedCaptureHosts = new Set<string>();
  let offeredCaptureHosts = new Set<string>();
  let preferences: VaultPreferences = { ...DEFAULT_PREFERENCES };
  let lastActivity = Date.now();
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const idleMs = () => (options.idleMinutes ?? preferences.idleMinutes) * 60_000;
  const lockVault = () => {
    secureWork.cancel(); ai.cancel(); allowedCaptureHosts.clear(); offeredCaptureHosts.clear();
    clearTimeout(idleTimer); idleTimer = undefined;
    try { vault.lock(); } finally { writerToken = undefined; writerOrigin = undefined; writerExpiresAt = 0;
      pairSecret = undefined; pairExpiresAt = 0; }
  };
  const touch = () => {
    lastActivity = Date.now(); clearTimeout(idleTimer);
    if (vault.status().unlocked) { idleTimer = setTimeout(lockVault, idleMs()); idleTimer.unref(); }
  };
  let origin = '';
  let pairSecret: string | undefined;
  let pairExpiresAt = 0;
  let writerToken: string | undefined;
  let writerOrigin: string | undefined;
  let writerExpiresAt = 0;
  const bridgeWrites: number[] = [];
  const bridgeHosts = new Set(['chatgpt.com','chat.openai.com','claude.ai','gemini.google.com',
    'perplexity.ai','www.perplexity.ai','copilot.microsoft.com','poe.com',
    'aistudio.google.com','chat.deepseek.com','grok.com']);
  const server = createServer(async (req, res) => {
    const csp = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    try {
      if (!req.url || !req.method) throw new HttpProblem(400, 'Invalid request');
      // Prevent DNS rebinding and cross-origin browser requests. Loopback alone is not authentication.
      if (req.headers.host !== origin.replace(/^http:\/\//, '')) throw new HttpProblem(403, 'Invalid host');
      const url = new URL(req.url, origin);
      if (url.origin !== origin) throw new HttpProblem(403, 'Invalid target origin');
      let requestEpoch = vault.sessionVersion;
      const assertSession = () => {
        if (requestEpoch !== vault.sessionVersion || res.destroyed) {
          if (url.pathname.startsWith('/api/bridge/')) throw new HttpProblem(401, 'Browser helper session expired');
          throw new OperationCancelledError();
        }
      };
      const readBody = async (maxBytes = 512_000) => {
        const payload = await readJson(req, maxBytes);
        assertSession(); return payload;
      };
      const runSecure = <T>(kind: SecureOperation, task: (signal: AbortSignal) => Promise<T>) =>
        secureWork.run(kind, async signal => {
          const disconnected = () => { if (!res.writableEnded) secureWork.cancel(); };
          res.once('close', disconnected);
          try { assertSession(); return await task(signal); }
          finally { res.removeListener('close', disconnected); }
        });
      const bridgePath = ['/api/bridge/pair','/api/bridge/save','/api/bridge/capture'].includes(url.pathname);
      const extensionOrigin = typeof req.headers.origin === 'string' && /^chrome-extension:\/\/[a-p]{32}$/.test(req.headers.origin);
      if (req.headers.origin && req.headers.origin !== origin && !(bridgePath && extensionOrigin))
        throw new HttpProblem(403, 'Cross-origin access denied');
      if (bridgePath && extensionOrigin) {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin as string);
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
        res.setHeader('Vary', 'Origin');
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      }
      if (bridgePath) {
        if (vault.status().unlocked && Date.now() - lastActivity >= idleMs()) lockVault();
        if (!extensionOrigin || req.method !== 'POST') throw new HttpProblem(403, 'Browser helper origin required');
        if (!vault.status().unlocked) throw new HttpProblem(423, 'Vault is locked');
        if (url.pathname === '/api/bridge/pair') {
          const payload = await readBody();
          if (!pairSecret || Date.now() > pairExpiresAt ||
              !authorized(`Bearer ${payload.code}`, pairSecret)) throw new HttpProblem(401, 'Pairing code expired or invalid');
          // Single-use pairing code grants write-only access to the explicitly paired extension session.
          pairSecret = undefined; pairExpiresAt = 0;
          if (!vault.status().unlocked) throw new HttpProblem(423, 'Vault is locked');
          writerOrigin = req.headers.origin;
          allowedCaptureHosts = new Set(offeredCaptureHosts); offeredCaptureHosts.clear();
          writerToken = randomBytes(32).toString('hex'); writerExpiresAt = Date.now() + 8 * 60 * 60_000;
          return json(res, 200, { writeToken: writerToken, expiresAt: new Date(writerExpiresAt).toISOString(), allowedCaptureHosts:[...allowedCaptureHosts] });
        }
        if (!writerToken || writerOrigin !== req.headers.origin || Date.now() > writerExpiresAt || !authorized(req.headers.authorization, writerToken))
          throw new HttpProblem(401, 'Browser helper is not paired');
        const payload = await readBody();
        if (!vault.status().unlocked) throw new HttpProblem(423, 'Vault is locked');
        if (!writerToken || writerOrigin !== req.headers.origin || Date.now() > writerExpiresAt || !authorized(req.headers.authorization, writerToken))
          throw new HttpProblem(401, 'Browser helper is not paired');
        // Admission and the synchronous archive write must share one event-loop turn.
        // Checking before readBody lets concurrent slow requests all pass the limit.
        const now = Date.now();
        while (bridgeWrites.length && bridgeWrites[0]! < now - 60_000) bridgeWrites.shift();
        if (bridgeWrites.length >= 15) throw new HttpProblem(429, 'Capture limit reached; retry in a minute');
        if(url.pathname === '/api/bridge/capture') {
          let evidence;
          try { evidence=browserCapture(payload,allowedCaptureHosts); }
          catch {throw new HttpProblem(400,'Invalid browser capture or site not approved for this session');}
          const result=vault.archive.saveBrowserCapture(evidence);bridgeWrites.push(now);
          return json(res,result.saved?201:200,{...result,quality:'draft_snapshot'});
        }
        if (typeof payload.host !== 'string' || !bridgeHosts.has(payload.host) ||
            typeof payload.text !== 'string' || !payload.text.trim() || payload.text.length > 50_000 ||
            typeof payload.title !== 'string' || !payload.title.trim() || payload.title.length > 140)
          throw new HttpProblem(400, 'Invalid focused-editor preview');
        const { redactions } = vault.archive.saveLibrary({ title: payload.title, body: payload.text,
          kind: 'prompt', project: 'Browser inbox', source: payload.host, notes: 'Manually saved from a focused browser editor.', tags: ['browser-save'] });
        bridgeWrites.push(now);
        return json(res, 201, { saved: true, redactions });
      }
      if (!url.pathname.startsWith('/api/')) {
        const asset = assets.get(url.pathname);
        if (req.method !== 'GET' || !asset) throw new HttpProblem(404, 'Not found');
        res.writeHead(200, { 'Content-Type': asset.type }); res.end(asset.body); return;
      }
      if (!authorized(req.headers.authorization, token)) throw new HttpProblem(401, 'Unauthorized session');
      if (vault.status().unlocked && Date.now() - lastActivity >= idleMs()) lockVault();
      requestEpoch = vault.sessionVersion;
      const path = url.pathname;
      // Health/status polling is observational and MUST NOT extend an idle session.
      if (!['/api/status', '/api/diagnostics'].includes(path) && vault.status().unlocked) touch();
      const deadlineHeaders = () => {
        res.setHeader('X-Vault-Lock-At', vault.status().unlocked ? String(lastActivity + idleMs()) : '0');
        res.setHeader('X-Vault-Now', String(Date.now()));
      };
      deadlineHeaders();
      if (path === '/api/status' && req.method === 'GET') return json(res, 200, {
        ...vault.status(), idleMinutes: idleMs() / 60_000,
        lockAt: vault.status().unlocked ? lastActivity + idleMs() : null, version: APP_VERSION, operation: secureWork.operation
      });
      if (path === '/api/setup' && req.method === 'POST') {
        await runSecure('setup', async signal => {
          const data = await readBody(); checkCancelled(signal);
          if (typeof data.passphrase !== 'string' || data.passphrase !== data.confirm) throw new HttpProblem(400, 'Passphrases do not match');
          await vault.setupAsync(data.passphrase, signal);
        });
        preferences = vault.archive.preferences(); touch(); deadlineHeaders(); return json(res, 201, { ok: true });
      }
      if (path === '/api/unlock' && req.method === 'POST') {
        await runSecure('unlock', async signal => {
          const data = await readBody(); checkCancelled(signal);
          await vault.unlockAsync(data.passphrase as string, signal);
        });
        preferences = vault.archive.preferences(); touch(); deadlineHeaders(); return json(res, 200, { ok: true });
      }
      if (path === '/api/lock' && req.method === 'POST') { lockVault(); deadlineHeaders(); return json(res, 200, { ok: true }); }
      if (!vault.status().unlocked) throw new HttpProblem(423, 'Vault is locked');
      const archive = vault.archive;
      if(path === '/api/ai/settings' && req.method === 'GET') {
        const config=archive.aiSettings();return json(res,200,{configured:!!config,enabled:config?.enabled??false,
          model:config?.model??DEFAULT_GROQ_MODEL,provider:'groq',busy:ai.busy});
      }
      if(path === '/api/ai/settings' && req.method === 'PUT') {
        const payload=await readBody(4000);const previous=archive.aiSettings();
        if(Object.keys(payload).some(k=>!['apiKey','model','enabled'].includes(k)))throw new HttpProblem(400,'Invalid Groq settings');
        archive.setAISettings({apiKey:payload.apiKey||previous?.apiKey,model:payload.model,enabled:payload.enabled});
        ai.cancel();aiSettingsVersion++;return json(res,200,{saved:true});
      }
      if(path === '/api/ai/settings' && req.method === 'DELETE') {
        ai.cancel();aiSettingsVersion++;archive.deleteAISettings();return json(res,200,{removed:true});
      }
      if(path === '/api/ai/cancel' && req.method === 'POST') {ai.cancel();return json(res,200,{cancelled:true});}
      if(['/api/ai/preview','/api/ai/run'].includes(path) && req.method === 'POST') {
        const payload=await readBody(65_000);
        let style='';
        if(payload.styleId!==undefined && payload.styleId!=='') {
          if(typeof payload.styleId!=='string')throw new HttpProblem(400,'Invalid writing profile');
          const found=archive.getStyle(payload.styleId);if(!found)throw new HttpProblem(404,'Writing profile not found');
          // User preferences only; raw sample excerpts/learned phrases are never sent by this integration.
          style=JSON.stringify({preferences:found.profile.preferences,meanSentenceWords:found.profile.meanSentenceWords,meanParagraphWords:found.profile.meanParagraphWords,tendencies:found.profile.tendencies});
        }
        const prepared=prepareAI(payload,style);
        const config=archive.aiSettings();
        // The approved payload must still match when a different tab edits a style/model.
        const reviewDigest=createHash('sha256').update(JSON.stringify({messages:prepared.messages,
          model:config?.model??DEFAULT_GROQ_MODEL,epoch:requestEpoch,settingsVersion:aiSettingsVersion})).digest('hex');
        if(path.endsWith('/preview'))return json(res,200,{text:prepared.text,style:prepared.style,redactions:prepared.redactions,
          action:prepared.action,messages:prepared.messages,destination:'Groq cloud',sampleExcerptsIncluded:false,reviewDigest});
        if(payload.consent!==true)throw new HttpProblem(400,'Review the preview and explicitly consent before sending text to Groq.');
        if(!config)throw new HttpProblem(400,'Configure Groq locally in Settings first.');
        if(payload.reviewDigest!==reviewDigest)throw new HttpProblem(409,'The text, model, profile or session changed. Review a fresh preview before sending.');
        const onClose=()=>{if(!res.writableEnded)ai.cancel();};res.once('close',onClose);
        try {const result=await ai.run(prepared,config);assertSession();return json(res,200,result);}
        finally {res.removeListener('close',onClose);}
      }
      if (path === '/api/diagnostics' && req.method === 'GET') return json(res, 200, diagnosticSnapshot({
        directory: vault.directory, lowMemory: preferences.lowMemory,
        keyFormat: vault.status().keyFormat, operation: secureWork.operation,
        browserCaptureAuthorized: !!writerToken && Date.now() < writerExpiresAt && allowedCaptureHosts.size > 0,
        externalAIEnabled: archive.aiSettings()?.enabled === true
      }));
      if (path === '/api/activity' && req.method === 'POST') return json(res, 200, { ok: true });
      if (path === '/api/preferences' && req.method === 'GET') return json(res, 200, archive.preferences());
      if (path === '/api/preferences' && req.method === 'PUT') {
        const payload = await readBody();
        preferences = vault.archive.setPreferences(payload); touch(); deadlineHeaders();
        return json(res, 200, preferences);
      }
      if (path === '/api/passphrase' && req.method === 'POST') {
        await runSecure('passphrase', async signal => {
          const payload = await readBody(); checkCancelled(signal);
          if (payload.replacement !== payload.confirm) throw new HttpProblem(400, 'Passphrases do not match');
          await vault.changePassphraseAsync(payload.current as string, payload.replacement as string, signal);
        });
        lockVault(); deadlineHeaders(); return json(res, 200, { changed: true, locked: true });
      }
      // Only an unlocked, authenticated session may read/save temporary editor drafts.
      // Drafts are stored as encrypted metadata and excluded from portable archive exports.
      if (path === '/api/drafts' && req.method === 'GET') return json(res, 200, { drafts: archive.listDrafts() });
      const draftId = /^\/api\/drafts\/([a-fA-F0-9-]{36})$/.exec(path)?.[1];
      if (draftId && req.method === 'PUT') {
        const payload = await readBody(150_000);
        if (payload.id !== draftId) throw new HttpProblem(400, 'Invalid editor draft');
        return json(res, 200, { draft: archive.saveDraft(payload as unknown as import('../../packages/local-store/archive.ts').DraftInput) });
      }
      if (draftId && req.method === 'DELETE') return json(res, 200, { deleted: archive.deleteDraft(draftId) });
      // Explicit writing-style workflows. Analysis is CPU-only and never calls a model or sends writing elsewhere.
      if (path === '/api/writing/check' && req.method === 'POST') {
        const payload=await readBody(52_000);
        if(typeof payload.text !== 'string' || payload.text.length>12_000)throw new HttpProblem(400,'Invalid writing check');
        return json(res,200,{issues:proofreadWriting(payload.text),engine:'lightweight-heuristics-v1',language:'en'});
      }
      if (path === '/api/styles' && req.method === 'GET')
        return json(res, 200, { profiles:archive.listStyles() });
      if (path === '/api/styles/analyze' && req.method === 'POST') {
        const payload=await readBody(512_000);
        if (!Array.isArray(payload.samples) || !payload.samples.length || payload.samples.length > 12 ||
            payload.samples.some(sample=>typeof sample !== 'string' || !sample.trim() || sample.length > 10_000) ||
            (payload.preferences !== undefined && (!payload.preferences || typeof payload.preferences !== 'object' || Array.isArray(payload.preferences))))
          throw new HttpProblem(400,'Invalid writing samples');
        let redactions=0;
        const samples=(payload.samples as string[]).map(sample=>{const result=redactText(sample);redactions+=result.count;return result.text;});
        const profile=analyzeWriting(samples,payload.preferences as Parameters<typeof analyzeWriting>[1] ?? {});
        return json(res,200,{profile,redactions});
      }
      if (path === '/api/styles' && req.method === 'POST') {
        const payload=await readBody(45_000);
        const style=archive.saveStyle(payload as unknown as {name:string;profile:unknown});
        return json(res,201,{style,etag:styleETag(style)});
      }
      const stylePromptId=/^\/api\/styles\/([a-zA-Z0-9_-]{1,100})\/prompt$/.exec(path)?.[1];
      if (stylePromptId && req.method === 'POST') {
        const payload=await readBody(15_000);
        if (typeof payload.task !== 'string' || !payload.task.trim() || payload.task.length > 12_000 ||
            (payload.includeExamples !== undefined && typeof payload.includeExamples !== 'boolean'))
          throw new HttpProblem(400,'Invalid writing task');
        const style=archive.getStyle(stylePromptId);
        if (!style) throw new HttpProblem(404,'Writing profile not found');
        const selected=payload.includeExamples ? style.profile : {...style.profile,examples:[],preferredPhrases:[]};
        return json(res,200,{prompt:createStylePrompt(selected,payload.task), includesExamples:payload.includeExamples===true});
      }
      const styleId=/^\/api\/styles\/([a-zA-Z0-9_-]{1,100})$/.exec(path)?.[1];
      if (styleId) {
        if(req.method==='GET') {
          const style=archive.getStyle(styleId);
          if(!style)throw new HttpProblem(404,'Writing profile not found');
          res.setHeader('ETag',styleETag(style));return json(res,200,{style,etag:styleETag(style)});
        }
        if(req.method==='PUT'){
          const payload=await readBody(45_000);
          // A write must have a current ETag. This prevents stale windows from overwriting profiles.
          if (!req.headers['if-match'])throw new HttpProblem(428,'Profile version required');
          archive.checkStyleEdit(styleId,req.headers['if-match']);
          const style=archive.saveStyle(payload as unknown as {name:string;profile:unknown},styleId);
          return json(res,200,{style,etag:styleETag(style)});
        }
        if(req.method==='DELETE'){
          if(!req.headers['if-match'])throw new HttpProblem(428,'Profile version required');
          archive.checkStyleEdit(styleId,req.headers['if-match']);
          return json(res,200,{deleted:archive.deleteStyle(styleId)});
        }
      }
      if (path === '/api/items/batch' && req.method === 'POST') {
        const payload = await readBody();
        return json(res, 200, vault.archive.batchLibrary(payload as unknown as BatchInput));
      }
      const conditionalId = /^\/api\/items\/([a-zA-Z0-9_-]{1,100})(?:\/(?:restore|undelete|purge))?$/.exec(path)?.[1];
      if (conditionalId && ['PUT','DELETE','POST'].includes(req.method) && req.headers['if-match'])
        archive.checkEdit(conditionalId, req.headers['if-match']);

      if (path === '/api/bridge/status' && req.method === 'GET')
        return json(res, 200, { active: !!writerToken && Date.now() < writerExpiresAt, expiresAt: writerExpiresAt ? new Date(writerExpiresAt).toISOString() : null });
      if (path === '/api/bridge/start' && req.method === 'POST') {
        const payload=await readBody(3000);
        if(payload.autoCaptureHosts!==undefined && (!Array.isArray(payload.autoCaptureHosts)||payload.autoCaptureHosts.some(h=>!AUTO_CAPTURE_HOSTS.includes(h as typeof AUTO_CAPTURE_HOSTS[number]))))
          throw new HttpProblem(400,'Invalid browser capture sites');
        offeredCaptureHosts=new Set((payload.autoCaptureHosts as string[]|undefined)??[]);
        pairSecret = randomBytes(32).toString('hex'); pairExpiresAt = Date.now() + 10 * 60_000;
        const port = new URL(origin).port;
        return json(res, 200, { pairingCode: `psv2:${port}:${pairSecret}`, expiresAt: new Date(pairExpiresAt).toISOString() });
      }
      if (path === '/api/bridge/revoke' && req.method === 'POST') {
        writerToken = undefined; writerOrigin = undefined; writerExpiresAt = 0; pairSecret = undefined; pairExpiresAt = 0;allowedCaptureHosts.clear();offeredCaptureHosts.clear();
        return json(res, 200, { revoked: true });
      }
      if (path === '/api/summary' && req.method === 'GET') return json(res, 200, {
        library: archive.libraryStats(), trash: archive.trashCount(), captured: archive.stats().records, network: ai.busy, recording: !!writerToken && Date.now() < writerExpiresAt && allowedCaptureHosts.size>0, autoCaptureHosts:[...allowedCaptureHosts]
      });
      if (path === '/api/recall' && req.method === 'POST') {
        const payload = await readBody(30_000);
        if (Object.keys(payload).some(key => !['text','project','excludeId'].includes(key)) ||
            typeof payload.text !== 'string' || !payload.text.trim() || payload.text.length > 6000 ||
            (payload.project !== undefined && (typeof payload.project !== 'string' || payload.project.length > 80)) ||
            (payload.excludeId !== undefined && (typeof payload.excludeId !== 'string' ||
              !!payload.excludeId && !/^[a-zA-Z0-9_-]{1,100}$/.test(payload.excludeId))))
          throw new HttpProblem(400,'Invalid recall request');
        const matches = archive.recallLibrary(payload.text,payload.project as string | undefined,payload.excludeId as string | undefined);
        return json(res,200,{matches:matches.map(({item,matchedTerms})=>{
          const lower=item.body.toLowerCase();
          const first=Math.min(...matchedTerms.map(term=>lower.indexOf(term)).filter(index=>index>=0));
          const start=Number.isFinite(first)?Math.max(0,first-60):0;
          const end=Math.min(item.body.length,start+240);
          return {id:item.id,etag:libraryETag(item),title:item.title,kind:item.kind,project:item.project,source:item.source ?? '',
            provenance:item.captureId?'Editable copy of browser snapshot':item.kind==='template'?'Template':'Saved prompt',
            updatedAt:item.updatedAt,matchedTerms,
            preview:(start?'…':'')+item.body.slice(start,end)+(end<item.body.length?'…':'')};
        })});
      }
      if (path === '/api/items' && req.method === 'GET') {
        const query = url.searchParams.get('q') ?? '';
        const filter = url.searchParams.get('filter') ?? 'all';
        const limit = Number(url.searchParams.get('limit') ?? 40);
        const offset = Number(url.searchParams.get('offset') ?? 0);
        const page = archive.queryLibrary({ query, filter: filter as LibraryFilter,
          project: url.searchParams.get('project') ?? '', tag: url.searchParams.get('tag') ?? '',
          sort: (url.searchParams.get('sort') ?? 'updated') as 'updated', limit, offset });
        const view = url.searchParams.get('view');
        if (view !== null && view !== 'preview') throw new HttpProblem(400, 'Invalid library view');
        // Only return short list previews to the WebView. Full text stays on demand in GET /api/items/:id.
        // The ETag must be computed from the original item before projection.
        const previewLength = preferences.lowMemory ? 420 : 1600;
        return json(res, 200, { ...page, items: page.items.map(item => {
          const full = tagged(item);
          if (view !== 'preview') return full;
          const shortened = item.body.length > previewLength || (item.notes ?? '').length > 240;
          return shortened ? { ...full, body:item.body.slice(0,previewLength), notes:(item.notes ?? '').slice(0,240), preview:true } : full;
        }) });
      }
      if (path === '/api/facets' && req.method === 'GET') return json(res, 200, archive.libraryFacets());
      if (path === '/api/items' && req.method === 'POST') {
        const payload = await readBody();
        const saved = vault.archive.saveLibrary(payload as unknown as LibraryInput);
        return json(res, 201, { ...saved, item: tagged(saved.item) });
      }
      if (path === '/api/backup/export' && req.method === 'POST') {
        const backup = await runSecure('backup-export', async signal => {
          const payload = await readBody(); checkCancelled(signal);
          return encryptBackupAsync(() => {
            assertSession();
            if (!vault.status().unlocked || vault.archive !== archive) throw new OperationCancelledError();
            return archive.exportSnapshot();
          }, payload.passphrase as string, signal);
        });
        res.writeHead(200, { 'Content-Type': 'application/octet-stream',
          'Content-Disposition': 'attachment; filename="promteSaver-backup.pomte"',
          'Content-Length': backup.length }); res.end(backup); return;
      }
      if (['/api/backup/import','/api/backup/preview'].includes(path) && req.method === 'POST') {
        const result = await runSecure(path.endsWith('/preview') ? 'backup-preview' : 'backup-import', async signal => {
          const payload = await readBody(20 * 1024 * 1024); checkCancelled(signal);
          if (typeof payload.backup !== 'string' || payload.backup.length > 18 * 1024 * 1024 ||
              !/^[a-zA-Z0-9+/]+={0,2}$/.test(payload.backup)) throw new HttpProblem(400, 'Invalid backup data');
          const snapshot = await decryptBackupAsync(Buffer.from(payload.backup, 'base64'), payload.passphrase as string, signal);
          assertSession(); checkCancelled(signal);
          if (!vault.status().unlocked || vault.archive !== archive) throw new OperationCancelledError();
          return path.endsWith('/preview') ? archive.previewSnapshot(snapshot) : archive.importSnapshot(snapshot);
        });
        return json(res, 200, result);
      }
      const useId = /^\/api\/items\/([a-zA-Z0-9_-]{1,100})\/use$/.exec(path)?.[1];
      if (useId && req.method === 'POST') return json(res, 200, { item: tagged(archive.recordUse(useId)) });
      const undeleteId = /^\/api\/items\/([a-zA-Z0-9_-]{1,100})\/undelete$/.exec(path)?.[1];
      if (undeleteId && req.method === 'POST') return json(res, 200, { item: tagged(archive.undeleteLibrary(undeleteId)) });
      const purgeId = /^\/api\/items\/([a-zA-Z0-9_-]{1,100})\/purge$/.exec(path)?.[1];
      if (purgeId && req.method === 'DELETE') return json(res, 200, { deleted: archive.purgeLibrary(purgeId) });
      const duplicateId = /^\/api\/items\/([a-zA-Z0-9_-]{1,100})\/duplicate$/.exec(path)?.[1];
      if (duplicateId && req.method === 'POST') {
        const original = archive.getLibrary(duplicateId);
        if (!original || original.deletedAt) throw new HttpProblem(404, 'Library item not found');
        return json(res, 201, archive.saveLibrary({ title: `Copy of ${original.title}`.slice(0,140), body: original.body,
          kind: original.kind, project: original.project, tags: original.tags, notes: original.notes ?? '',
          source: original.source ?? '', pinned: false }));
      }
      const historyId = /^\/api\/items\/([a-zA-Z0-9_-]{1,100})\/history$/.exec(path)?.[1];
      if (historyId && req.method === 'GET') return json(res, 200, { revisions: archive.libraryHistory(historyId) });
      const restoreId = /^\/api\/items\/([a-zA-Z0-9_-]{1,100})\/restore$/.exec(path)?.[1];
      if (restoreId && req.method === 'POST') {
        const payload = await readBody();
        vault.archive.checkEdit(restoreId, req.headers['if-match']);
        return json(res, 200, { item: tagged(vault.archive.restoreLibrary(restoreId, payload.revision as number)) });
      }
      const id = /^\/api\/items\/([a-zA-Z0-9_-]{1,100})$/.exec(path)?.[1];
      if (id) {
        if (req.method === 'GET') {
          const item = archive.getLibrary(id);
          if (!item) throw new HttpProblem(404, 'Item not found');
          res.setHeader('ETag', libraryETag(item)); return json(res, 200, { item: tagged(item) });
        }
        if (req.method === 'PUT') {
          const payload = await readBody();
          vault.archive.checkEdit(id, req.headers['if-match']);
          const saved = vault.archive.saveLibrary(payload as unknown as LibraryInput, id);
          return json(res, 200, { ...saved, item: tagged(saved.item) });
        }
        if (req.method === 'DELETE') return json(res, 200, { deleted: archive.deleteLibrary(id) });
      }
      if (path === '/api/captured' && req.method === 'GET') return json(res, 200, { items: archive.recentCaptures() });
      const capturedId = /^\/api\/captured\/([a-zA-Z0-9_-]{1,100})$/.exec(path)?.[1];
      if (capturedId && req.method === 'DELETE') { archive.deleteCaptureWithCopies(capturedId); return json(res, 200, { deleted: true }); }
      if (path === '/api/examples' && req.method === 'POST') {
        if (archive.libraryStats().all > 0) throw new HttpProblem(409, 'Examples are only available for an empty library');
        const examples: LibraryInput[] = [
          { title: 'Explain a bug clearly', kind: 'template', project: 'Development', tags: ['debugging','engineering'], pinned: true,
            body: 'Act as a pragmatic debugging partner. Analyze this error: {{error}}\n\nEnvironment: {{environment}}\nExpected behavior: {{expected}}\nActual behavior: {{actual}}\n\nSuggest root causes, the smallest diagnostic steps, and a safe fix with tests.' },
          { title: 'Summarize a meeting into actions', kind: 'template', project: 'Everyday', tags: ['meetings','planning'], pinned: false,
            body: 'Summarize these meeting notes: {{notes}}\n\nReturn decisions, action items (owner and date if known), open questions, and risks. Do not invent details.' },
          { title: 'Review a pull request', kind: 'prompt', project: 'Development', tags: ['review','coding'], pinned: false,
            body: 'Review this change for correctness, regressions, security, error handling, and performance. Rank findings by severity, include exact file references, and distinguish confirmed bugs from hypotheses.' },
          { title: 'Architecture decision review', kind: 'template', project: 'Development', tags: ['architecture','design'], pinned: true,
            body: 'Evaluate this architecture proposal: {{proposal}}\n\nConstraints: {{constraints}}\nTraffic and scale assumptions: {{scale|unknown}}\n\nReturn tradeoffs, failure modes, security risks, lower-cost alternatives, migration plan, and a concise decision record. Mark unknowns clearly.' },
          { title: 'Test plan for a feature', kind: 'template', project: 'Development', tags: ['qa','testing'], pinned: false,
            body: 'Feature: {{feature}}\nExpected behavior: {{expected}}\nRisky boundaries: {{boundaries|identify likely edge cases}}\n\nPropose unit, integration, end-to-end, accessibility, and failure-mode tests. Distinguish mockable tests from tests requiring real devices.' },
          { title: 'Explain something simply', kind: 'template', project: 'Learning', tags: ['learning','education'], pinned: false,
            body: 'Explain {{topic}} for someone with this background: {{background|a curious beginner}}. Start with a plain-language intuition, one relevant analogy, a concrete example, and 3 questions to check understanding. Define any jargon.' },
          { title: 'Turn feedback into an action plan', kind: 'template', project: 'Everyday', tags: ['planning','communication'], pinned: false,
            body: 'Here is some feedback: {{feedback}}\n\nSummarize the underlying concern without defensiveness. Propose specific actions ranked by impact and effort, clarifying questions, and a respectful response draft. Do not invent facts.' },
          { title: 'Write a clear professional email', kind: 'template', project: 'Everyday', tags: ['writing','email'], pinned: false,
            body: 'Draft a concise, warm, professional email to {{recipient}} about {{topic}}. Desired outcome: {{outcome}}. Tone: {{tone|direct and respectful}}. Include an informative subject line and a concrete next step.' },
          { title: 'Research claims with sources', kind: 'template', project: 'Research', tags: ['research','verification'], pinned: false,
            body: 'Research this question: {{question}}. Separate established facts from speculation. Prefer primary sources and recent, dated evidence. Provide links, explain contradictions and limitations, and say clearly what you could not verify.' }
        ];
        return json(res, 201, { items: examples.map(item => archive.saveLibrary(item).item) });
      }
      throw new HttpProblem(404, 'Not found');
    } catch (error) {
      if (res.destroyed) return;
      if (error instanceof AIProblem) { json(res,error.status,{error:error.message}); return; }
      if (error instanceof OperationBusyError) {
        res.setHeader('Retry-After', '1'); json(res, 503, { error: error.message, code: 'SECURE_OPERATION_BUSY' }); return;
      }
      if (error instanceof OperationCancelledError) {
        json(res, 423, { error: error.message, code: 'SESSION_CHANGED' }); return;
      }
      if (res.headersSent) { res.end(); return; }
      if (error instanceof LibraryConflictError || error instanceof StyleConflictError) { json(res, 412, { error: error.message, code: 'EDIT_CONFLICT' }); return; }
      const problem = error instanceof HttpProblem ? error : undefined;
      const message = problem?.message ?? (error instanceof Error && /^(Invalid editor draft|Editor draft limit|Invalid writing profile|Writing profile not found|Writing profile limit|Invalid writing samples|Invalid writing task|Invalid writing check|Encrypted editor draft|Invalid preferences|Invalid library|Library item not found|Restore item|Item is not in trash|Revision not found|Invalid result limit|Invalid backup|Backup |Passphrase must|Vault is already|Vault must|Vault is locked|Vault database is missing|Could not unlock|Too many attempts)/.test(error.message) ? error.message : 'Operation failed');
      const status = problem?.status ?? (message === 'Vault is locked' ? 423 : message === 'Could not unlock vault' || message.startsWith('Too many attempts') ? 401 : (message === 'Library item not found' || message === 'Writing profile not found' || message === 'Revision not found' || message === 'Item is not in trash') ? 404 : message === 'Vault is already initialized' ? 409 : message === 'Operation failed' ? 500 : 400);
      json(res, status, { error: message });
    }
  });
  server.requestTimeout = 15_000; server.headersTimeout = 10_000; server.maxConnections = 32;
  server.setTimeout(20_000, socket => socket.destroy());
  try { await new Promise<void>((resolveReady, rejectReady) => {
    server.once('error', rejectReady);
    server.listen(options.port ?? 0, '127.0.0.1', () => resolveReady());
  }); } catch(error) { releaseLease(); throw error; }
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('Local server failed to start');
  origin = `http://127.0.0.1:${addr.port}`;
  let closePromise: Promise<void> | undefined;
  return {
    origin, lock: lockVault, url: `${origin}/#${token}`, token, vault,
    close() {
      if (!closePromise) {
        lockVault();
        closePromise = Promise.all([
          new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())),
          secureWork.whenIdle()
        ]).then(() => {}).finally(releaseLease);
      }
      return closePromise;
    }
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const flag = (name: string) => { const i = argv.indexOf(name); return i === -1 ? undefined : argv[i + 1]; };
  const directory = flag('--data-dir') ?? process.env.PROMTESAVER_DATA_DIR ?? join(homedir(), '.promtesaver-local');
  const requestedPort = flag('--port');
  const port = requestedPort === undefined ? 0 : Number(requestedPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');
  const app = await startLocalWeb({ directory, port });
  console.log('\n  promteSaver · Local Vault (optional browser companion)');
  console.log(`  Open in your browser: ${app.url}`);
  console.log('  Your data stays on this computer. Press Ctrl+C to stop.\n');
  const shutdown = () => { void app.close().then(() => process.exit(0)); };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
}

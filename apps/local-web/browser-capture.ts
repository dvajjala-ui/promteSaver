import type { PromptRecord } from '../../packages/contracts/generated.ts';
export const AUTO_CAPTURE_HOSTS = ['chatgpt.com','claude.ai','gemini.google.com'] as const;
export interface BrowserCapture {eventId:string;host:string;text:string;recordedAt:string;signal:'send-click'|'enter';}
export function browserCapture(input: unknown, allowed: ReadonlySet<string>): PromptRecord {
  const v=input as BrowserCapture;
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['eventId','host','text','recordedAt','signal'].includes(k)) ||
    typeof v.eventId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v.eventId)||
    !AUTO_CAPTURE_HOSTS.includes(v.host as typeof AUTO_CAPTURE_HOSTS[number])||!allowed.has(v.host)||
    typeof v.text!=='string'||!v.text.trim()||v.text.length>50_000||
    !['send-click','enter'].includes(v.signal)||typeof v.recordedAt!=='string'||
    !Number.isFinite(Date.parse(v.recordedAt))||Math.abs(Date.now()-Date.parse(v.recordedAt))>300_000)
    throw new Error('Invalid browser capture or site not approved for this session');
  return {schemaVersion:1,id:v.eventId,deviceId:'browser-extension',sourceSequence:1,recordedAt:v.recordedAt,
    surface:{surfaceId:v.host,appId:v.host,editorId:`composer-${v.signal}`,classification:'prompt',protection:'normal',privateMode:false},
    text:v.text,quality:'draft_snapshot',sourceMethod:'editor_snapshot',origin:'unknown',redactions:0};
}

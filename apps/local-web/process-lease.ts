import { closeSync, fstatSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

const name = '.vault-session.lock';
/** An exclusive service lease. Never guess that another instance is safe to replace. */
export function acquireVaultLease(directory: string): () => void {
  const path = join(directory, name);
  const record = JSON.stringify({version:1,pid:process.pid,nonce:randomBytes(16).toString('hex')});
  let fd: number;
  try { fd = openSync(path, 'wx', 0o600); }
  catch(error) {
    if((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('This vault already has a service lease. Close the other app; after a crash, use the documented stale-lock recovery command.');
    throw error;
  }
  try { writeFileSync(fd, record); }
  catch(error) { try { unlinkSync(path); } finally { closeSync(fd); } throw error; }
  closeSync(fd);
  let released = false;
  return () => {
    if(released)return; released=true;
    try { if(readFileSync(path,'utf8') === record)unlinkSync(path); }
    catch(error) { if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error; }
  };
}

/** Explicit operator recovery only. Live, ambiguous, malformed or replaced leases fail closed. */
export function recoverStaleVaultLease(directory: string): void {
  const path=join(directory,name); const fd=openSync(path,'r');
  let original:string;
  try { const st=fstatSync(fd); if(!st.isFile()||st.size>256)throw new Error('Invalid lease; manual review required'); original=readFileSync(fd,'utf8'); }
  finally { closeSync(fd); }
  const value:unknown=JSON.parse(original);
  if(!value||typeof value!=='object'||!('pid' in value)||!Number.isInteger(value.pid)||Number(value.pid)<=0)
    throw new Error('Invalid lease; manual review required');
  let absent=false;
  try { process.kill(Number(value.pid),0); }
  catch(error) { if((error as NodeJS.ErrnoException).code==='ESRCH')absent=true; else throw new Error('Cannot establish whether the owning process has stopped'); }
  if(!absent)throw new Error('Refusing recovery: the recorded process is still running');
  if(readFileSync(path,'utf8')!==original)throw new Error('Lease changed; recovery cancelled');
  // Do not run recovery concurrently with application startup. This is an explicit operator command.
  unlinkSync(path);
}

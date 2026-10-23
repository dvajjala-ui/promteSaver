/** Synthetic browser-test fixture. Never uses the user's real vault directory. */
import { startLocalWeb } from '../../apps/local-web/server.ts';
const directory = process.env.POMTE_E2E_DIRECTORY;
if (!directory) throw new Error('A temporary test directory is required');
const idle = process.env.POMTE_E2E_IDLE;
const app = await startLocalWeb({directory,...(idle ? {idleMinutes:Number(idle)} : {})});
console.log(JSON.stringify({url:app.url,origin:app.origin,token:app.token}));
const stop = () => { void app.close().then(()=>process.exit(0)); };
process.on('SIGTERM',stop);process.on('SIGINT',stop);

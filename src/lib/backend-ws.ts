import type { Backend, Row, Table } from './store';
import { b64, unb64 } from './crypto';

/** test only: talks to test/server.ts, which hosts a MemServer shared by several browser pages */
export async function wsBackend(url: string): Promise<Backend> {
  let ws: WebSocket, n = 0; const wait = new Map<number, [(v: any) => void, (e: any) => void]>();
  let onRow: ((t: Table, r: Row) => void) | null = null, onSt: ((l: boolean) => void) | null = null;
  const connect = () => new Promise<void>(ok => {
    ws = new WebSocket(url);
    ws.onopen = () => { ok(); onSt?.(true); };
    ws.onclose = () => { wait.forEach(([, no]) => no(Object.assign(new TypeError('Failed to fetch'), { status: 0 }))); wait.clear(); onSt?.(false); setTimeout(connect, 500); };
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.ev) onRow?.(m.t, m.r); else { const w = wait.get(m.id); wait.delete(m.id); if (!w) return; m.err ? w[1](Object.assign(m.net ? new TypeError(m.err) : new Error(m.err), { status: m.net ? 0 : 400 })) : w[0](m.res); } };
  });
  await connect();
  const call = (op: string, ...a: any[]) => new Promise<any>((ok, no) => { if (ws.readyState !== 1) return no(Object.assign(new TypeError('Failed to fetch'), { status: 0 })); const id = ++n; wait.set(id, [ok, no]); ws.send(JSON.stringify({ id, op, a })); });
  return {
    pull: (t, s) => call('pull', t, s), push: (t, r) => call('push', t, r),
    subscribe(r, s) { onRow = r; onSt = s; setTimeout(() => s(ws.readyState === 1), 0); return () => { onRow = null; }; },
    upload: (p, b) => call('upload', p, b64(b)),
    download: async p => unb64(await call('download', p)).buffer,
    remove: (t, ids) => call('remove', t, ids), removeFiles: ps => call('removeFiles', ps),
  };
}

import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { MemServer } from '../src/lib/backend-memory';
import { b64, unb64 } from '../src/lib/crypto';

/* serves dist/ and a fake shared database over WebSocket; /ctl?fail=0.3&lat=50,800&down=1 changes the network */
export function start(port = 5180) {
  const srv = new MemServer(); const be = srv.client(); const socks = new Set<any>();
  srv.subs.add((t, r) => socks.forEach(s => s.send(JSON.stringify({ ev: 1, t, r }))));
  const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.map': 'application/json' };
  const http = createServer((q, s) => {
    const u = new URL(q.url!, 'http://x');
    if (u.pathname === '/ctl') { const p = u.searchParams; if (p.has('fail')) srv.fail = +p.get('fail')!; if (p.has('lostAck')) srv.lostAck = +p.get('lostAck')!; if (p.has('lat')) srv.lat = p.get('lat')!.split(',').map(Number) as any; if (p.has('down')) srv.down = p.get('down') === '1'; s.end(JSON.stringify({ deals: [...srv.rows.deals.values()], tasks: [...srv.rows.tasks.values()], docs: [...srv.rows.docs.values()], settings: [...srv.rows.settings.values()], files: srv.files.size, pushes: srv.pushes })); return; }
    const f = join('dist', u.pathname === '/' ? 'index.html' : u.pathname);
    if (existsSync(f)) { s.setHeader('content-type', types[extname(f)] || 'application/octet-stream'); s.end(readFileSync(f)); } else { s.statusCode = 404; s.end(); }
  });
  const wss = new WebSocketServer({ server: http });
  wss.on('connection', ws => {
    socks.add(ws); ws.on('close', () => socks.delete(ws));
    ws.on('message', async (m: any) => {
      const { id, op, a } = JSON.parse(String(m));
      try {
        let res: any;
        if (op === 'pull') res = await be.pull(a[0], a[1]); else if (op === 'push') res = await be.push(a[0], a[1]);
        else if (op === 'upload') res = await be.upload(a[0], unb64(a[1])); else if (op === 'download') res = b64(await be.download(a[0]));
        ws.send(JSON.stringify({ id, res: res ?? null }));
      } catch (e: any) { ws.send(JSON.stringify({ id, err: String(e?.message || e), net: e?.status === 0 })); }
    });
  });
  return new Promise<{ srv: MemServer; close: () => void }>((ok, no) => { http.once('error', no); http.listen(port, () => ok({ srv, close: () => { wss.close(); http.close(); } })); });
}
if (process.argv[1]?.endsWith('server.ts')) start().then(() => console.log('test server on 5180'));

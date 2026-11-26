import { describe, it, expect } from 'vitest';
import { Store } from '../src/lib/store';
import { memLocal } from '../src/lib/localdb';
import { MemServer } from '../src/lib/backend-memory';
import { newDeal, planTasks, DEF_TPL, jvCalc, ics, type Deal, type Task } from '../src/lib/domain';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function settle(srv: MemServer, ...st: Store[]) {
  const save = [srv.fail, srv.lostAck, srv.down]; srv.fail = 0; srv.lostAck = 0; srv.down = false;
  for (let i = 0; i < 400; i++) { st.forEach(s => s.wake()); await sleep(25); if (st.every(s => s.pend.size === 0)) break; }
  await sleep(srv.lat[1] * 2 + 50); await Promise.all(st.map(s => s.pullAll()));
  [srv.fail, srv.lostAck, srv.down] = save;
}
const dev = async (srv: MemServer, persist: any = {}) => { const s = new Store(memLocal(persist), srv.client()); await s.start(); return s; };

describe('sync engine', () => {
  it('creates a deal with tasks and both devices see it', async () => {
    const srv = new MemServer(); const A = await dev(srv), B = await dev(srv);
    const d = newDeal(); d.cust = 'Teszt Elek'; d.delivery = '2026-12-20';
    A.insert('deals', d); planTasks(d, DEF_TPL, []).upsert.forEach(t => A.insert('tasks', t));
    await settle(srv, A, B);
    expect(B.get<Deal>('deals', d.id)?.cust).toBe('Teszt Elek');
    expect(B.list<Task>('tasks').length).toBe(A.list('tasks').length);
    expect(srv.rows.tasks.size).toBeGreaterThan(10);
  });

  it('two devices editing different fields at the same time keep both', async () => {
    const srv = new MemServer(); srv.lat = [20, 200]; const A = await dev(srv), B = await dev(srv);
    const d = newDeal(); A.insert('deals', d); await settle(srv, A, B);
    A.mutate('deals', d.id, { phone: '+36 70 111 2222' }); B.mutate('deals', d.id, { model: 'Juke Hybrid' });
    await settle(srv, A, B);
    for (const s of [A, B]) { const x = s.get<Deal>('deals', d.id)!; expect(x.phone).toBe('+36 70 111 2222'); expect(x.model).toBe('Juke Hybrid'); }
  });

  it('typing fast while syncing over a flaky network loses nothing', async () => {
    const srv = new MemServer(); srv.lat = [10, 300]; srv.fail = 0.3; srv.lostAck = 0.2;
    const A = await dev(srv), B = await dev(srv);
    const d = newDeal(); A.insert('deals', d);
    const text = 'Kovács <b>Anna</b> "teszt" & \'x\' 😀 árvíztűrő tükörfúrógép';
    for (let i = 1; i <= text.length; i++) { A.mutate('deals', d.id, { cust: text.slice(0, i) }); if (i % 5 === 0) await sleep(15); }
    expect(A.get<Deal>('deals', d.id)!.cust).toBe(text);
    await settle(srv, A, B);
    expect(srv.rows.deals.get(d.id)!.cust).toBe(text);
    expect(B.get<Deal>('deals', d.id)!.cust).toBe(text);
  });

  it('rapid ticking of many tasks on two devices converges', async () => {
    const srv = new MemServer(); srv.lat = [5, 150]; srv.fail = 0.2;
    const A = await dev(srv), B = await dev(srv);
    const d = newDeal(); d.delivery = '2026-12-20'; A.insert('deals', d); const ts = planTasks(d, DEF_TPL, []).upsert; ts.forEach(t => A.insert('tasks', t));
    await settle(srv, A, B);
    ts.slice(0, 8).forEach(t => A.mutate('tasks', t.id, { done: true }));
    ts.slice(8).forEach(t => B.mutate('tasks', t.id, { done: true }));
    A.mutate('tasks', ts[0].id, { done: false }); A.mutate('tasks', ts[0].id, { done: true });
    await settle(srv, A, B);
    for (const s of [A, B]) expect(s.list<Task>('tasks').filter(t => t.done).length).toBe(ts.length);
  });

  it('works offline, survives a reload, and uploads when back online', async () => {
    const srv = new MemServer(); srv.down = true; const disk: any = {};
    let A = await dev(srv, disk);
    const d = newDeal(); d.cust = 'Offline Olga'; A.insert('deals', d); A.mutate('deals', d.id, { phone: '06301234567' });
    await sleep(50); A.stop();
    A = await dev(srv, disk);                       // app closed and opened again, still offline
    expect(A.get<Deal>('deals', d.id)!.cust).toBe('Offline Olga');
    srv.down = false; await settle(srv, A);
    expect(srv.rows.deals.get(d.id)!.phone).toBe('06301234567');
  });

  it('an old snapshot arriving late does not overwrite a newer local edit', async () => {
    const srv = new MemServer(); const A = await dev(srv);
    const d = newDeal(); d.note = 'első'; A.insert('deals', d); await settle(srv, A);
    const old = structuredClone(srv.rows.deals.get(d.id)!);
    A.mutate('deals', d.id, { note: 'második' }); await settle(srv, A);
    (A as any).ingest('deals', [old]);             // stale realtime echo
    expect(A.get<Deal>('deals', d.id)!.note).toBe('második');
  });

  it('edit made while a write is in flight is sent again', async () => {
    const srv = new MemServer(); srv.lat = [100, 120]; const A = await dev(srv);
    const d = newDeal(); A.insert('deals', d); await settle(srv, A);
    A.mutate('deals', d.id, { model: 'Qash' }); await sleep(30); A.mutate('deals', d.id, { model: 'Qashqai' });
    await settle(srv, A);
    expect(srv.rows.deals.get(d.id)!.model).toBe('Qashqai');
  });

  it('heavy load: 60 deals with tasks from two devices over a bad network', async () => {
    const srv = new MemServer(); srv.lat = [1, 40]; srv.fail = 0.15; srv.lostAck = 0.1;
    const A = await dev(srv), B = await dev(srv);
    const ids: string[] = [];
    for (let i = 0; i < 60; i++) { const s = i % 2 ? A : B; const d = newDeal(); d.cust = 'Vevő ' + i; d.delivery = '2027-01-' + String(1 + i % 28).padStart(2, '0'); d.fin = i % 3 === 0; ids.push(d.id); s.insert('deals', d); planTasks(d, DEF_TPL, []).upsert.forEach(t => s.insert('tasks', t)); }
    await settle(srv, A, B);
    expect(srv.rows.deals.size).toBe(60);
    for (const s of [A, B]) { expect(s.list('deals').length).toBe(60); expect(s.list('tasks').length).toBe(srv.rows.tasks.size); }
  }, 30000);
});

describe('domain', () => {
  it('template follows deal flags and keeps ticks', () => {
    const d = newDeal(); d.contract = '2026-11-01'; d.delivery = '2026-12-20';
    const a = planTasks(d, DEF_TPL, []).upsert;
    expect(a.find(t => t.tpl_key === 'u7')).toBeUndefined();   // lízing step only if fin
    expect(a.find(t => t.tpl_key === 'u14')!.sub!.some(x => x.t === 'Cégkivonat')).toBe(false);
    a[0].done = true;
    d.fin = true; d.ceg = true;
    const b = planTasks(d, DEF_TPL, a);
    expect(b.upsert.some(t => t.tpl_key === 'u7')).toBe(true);
    expect(b.remove).toContain(a.find(t => t.tpl_key === 'u6')!.id); // készpénzes step leaves
    expect(b.upsert.find(t => t.tpl_key === 'u14')!.sub!.some(x => x.t === 'Cégkivonat')).toBe(true);
    expect(b.upsert.find(t => t.id === a[0].id)?.done ?? true).toBe(true);
    const u16 = a.find(t => t.tpl_key === 'u16')!; expect(u16.due).toBe('2026-12-20');
  });
  it('jóváírás like the Excel', () => {
    const r = jvCalc({ b2: 8000000, b3: 200000, c2: 8500000, c3: 200000, c6: -300000 });
    expect(r.B.r4).toBeCloseTo(-615000); expect(r.net).toBeCloseTo((8700000 - 652500 - 300000) - (8200000 - 615000));
    expect(r.gross).toBeCloseTo(r.net * 1.27);
  });
  it('ics lines stay within 75 bytes', () => {
    const d = newDeal(); d.cust = 'Árvíztűrő Tükörfúrógép Kft. nagyon hosszú nevű ügyfél'; d.delivery = '2026-12-20';
    const ts = planTasks(d, DEF_TPL, []).upsert; const { n, text } = ics([{ d, ts }]);
    expect(n).toBe(ts.length);
    for (const l of text.split('\r\n')) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
  });
});

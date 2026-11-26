import { it, expect } from 'vitest';
import { Store } from '../src/lib/store';
import { memLocal } from '../src/lib/localdb';
import { MemServer } from '../src/lib/backend-memory';
import { App } from '../src/lib/actions';
import { purgeOn, type Deal } from '../src/lib/domain';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
it('closed deals are deleted with tasks and files after 1 year, on every device', async () => {
  const srv = new MemServer(); const A = new Store(memLocal(), srv.client()), B = new Store(memLocal(), srv.client());
  await A.start(); await B.start();
  const a = new App(A, 'u1'), b = new App(B, 'u1');
  const old = a.createDeal({ cust: 'Régi', delivery: '2025-01-10', handed: '2025-01-10' });
  const gone = a.createDeal({ cust: 'Elállt', cancel: true, cancel_at: '2025-03-01' });
  const keep = a.createDeal({ cust: 'Friss', delivery: '2026-12-20' });
  const binned = a.createDeal({ cust: 'Kuka' }); a.removeDeal(binned);
  a.key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await a.addDoc(old, new Blob(['%PDF teszt'], { type: 'application/pdf' }), 'szerz.pdf', 'Számla');
  for (let i = 0; i < 50 && (A.pend.size || A.state.files); i++) { A.wake(); await sleep(20); }
  await B.pullAll();
  expect(srv.files.size).toBe(1);
  expect(purgeOn(A.get<Deal>('deals', old)!)).toBe('2026-01-10');
  expect(b.soonPurged('2025-12-30').map(x => x.d.cust)).toEqual(['Régi']);
  expect(await a.purgeExpired('2026-04-01')).toBe(2); // the binned one was deleted today, it stays 30 days
  expect(srv.rows.deals.has(old)).toBe(false); expect(srv.rows.deals.has(gone)).toBe(false); expect(srv.rows.deals.has(keep)).toBe(true);
  expect([...srv.rows.tasks.values()].some(t => t.deal_id === old)).toBe(false);
  expect(srv.files.size).toBe(0);
  expect(A.get('deals', old)).toBeUndefined();
  // the other device still has a copy: it applies the same rule to its own cache
  expect(B.get('deals', old)).toBeDefined();
  await b.purgeExpired('2026-04-01');
  expect(B.get('deals', old)).toBeUndefined(); expect(B.list('tasks').some((t: any) => t.deal_id === old)).toBe(false);
  expect(B.get('deals', keep)).toBeDefined();
});

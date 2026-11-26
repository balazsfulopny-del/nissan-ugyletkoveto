import { openDB, type IDBPDatabase } from 'idb';
import type { LocalDB, Pend, Row, Table } from './store';

/** IndexedDB cache; one database per signed in user */
export async function idbLocal(user: string): Promise<LocalDB> {
  const db: IDBPDatabase = await openDB('ugyletkoveto-' + user, 1, {
    upgrade(d) { d.createObjectStore('rows'); d.createObjectStore('pending'); d.createObjectStore('meta'); d.createObjectStore('files'); },
  });
  return {
    async loadAll() {
      const tx = db.transaction(['rows', 'pending', 'meta']);
      const [rk, rv, pv, mk, mv] = await Promise.all([tx.objectStore('rows').getAllKeys(), tx.objectStore('rows').getAll(), tx.objectStore('pending').getAll(), tx.objectStore('meta').getAllKeys(), tx.objectStore('meta').getAll()]);
      const meta: Record<string, any> = {}; mk.forEach((k, i) => meta[String(k)] = mv[i]);
      return { rows: rk.map((k, i) => [String(k).split(':')[0] as Table, rv[i] as Row]), pending: pv as Pend[], meta };
    },
    async putRows(items) { const tx = db.transaction('rows', 'readwrite'); items.forEach(([t, r]) => tx.store.put(r, t + ':' + r.id)); await tx.done; },
    async delRows(items) { const tx = db.transaction('rows', 'readwrite'); items.forEach(([t, id]) => tx.store.delete(t + ':' + id)); await tx.done; },
    async putPending(p) { await db.put('pending', p, p.key); },
    async delPending(k) { await db.delete('pending', k); },
    async setMeta(k, v) { await db.put('meta', v, k); },
    async putFile(p, b) { await db.put('files', b, p); },
    async getFile(p) { return db.get('files', p); },
    async delFile(p) { await db.delete('files', p); },
    async listFiles() { return (await db.getAllKeys('files')).map(String); },
    async clear() { for (const s of ['rows', 'pending', 'meta', 'files']) await db.clear(s); },
  };
}

/** in memory version for tests; `persist` keeps data across "reloads" */
export function memLocal(persist: any = {}): LocalDB {
  const P = persist; P.rows ||= new Map(); P.pending ||= new Map(); P.meta ||= {}; P.files ||= new Map();
  const c = (x: any) => structuredClone(x);
  return {
    async loadAll() { return { rows: [...P.rows.entries()].map(([k, r]: any) => [k.split(':')[0], c(r)]), pending: [...P.pending.values()].map(c), meta: c(P.meta) }; },
    async putRows(items) { items.forEach(([t, r]) => P.rows.set(t + ':' + r.id, c(r))); },
    async delRows(items) { items.forEach(([t, id]) => P.rows.delete(t + ':' + id)); },
    async putPending(p) { P.pending.set(p.key, c(p)); },
    async delPending(k) { P.pending.delete(k); },
    async setMeta(k, v) { P.meta[k] = c(v); },
    async putFile(p, b) { P.files.set(p, b.slice()); },
    async getFile(p) { return P.files.get(p); },
    async delFile(p) { P.files.delete(p); },
    async listFiles() { return [...P.files.keys()]; },
    async clear() { P.rows.clear(); P.pending.clear(); P.files.clear(); P.meta = {}; },
  };
}

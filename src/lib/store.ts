/* Offline first sync engine.
 *
 * Every row lives in a local cache (IndexedDB) so the app opens and works without network.
 * Local edits go to an outbox per row and per field ("pending"). The view of a row is
 * server state + pending fields on top, so an incoming sync can never wipe text that has
 * not reached the server yet. A field is dropped from the outbox only when the server
 * acknowledged exactly that edit (sequence number), so a later edit made while a write was
 * in flight is sent again. Rows are never hard deleted, only marked deleted_at.
 */
export type Table = 'settings' | 'deals' | 'tasks' | 'docs';
export const TABLES: Table[] = ['settings', 'deals', 'tasks', 'docs'];
export type Row = { id: string; updated_at?: string; [k: string]: any };

export interface Backend {
  pull(table: Table, since: string | null): Promise<Row[]>;
  /** upsert rows that all have the same keys; returns the stored rows */
  push(table: Table, rows: Row[]): Promise<Row[]>;
  subscribe(onRow: (t: Table, r: Row) => void, onStatus: (live: boolean) => void): () => void;
  upload(path: string, bytes: Uint8Array): Promise<void>;
  download(path: string): Promise<ArrayBuffer>;
}

export interface LocalDB {
  loadAll(): Promise<{ rows: [Table, Row][]; pending: Pend[]; meta: Record<string, any> }>;
  putRows(items: [Table, Row][]): Promise<void>;
  putPending(p: Pend): Promise<void>;
  delPending(key: string): Promise<void>;
  setMeta(k: string, v: any): Promise<void>;
  putFile(path: string, bytes: Uint8Array): Promise<void>;
  getFile(path: string): Promise<Uint8Array | undefined>;
  delFile(path: string): Promise<void>;
  listFiles(): Promise<string[]>;
  clear(): Promise<void>;
}

export type Pend = { key: string; t: Table; id: string; f: Record<string, { v: any; s: number }>; err?: string };
export type SyncState = { online: boolean; live: boolean; pending: number; files: number; error: string | null; loaded: boolean; lastSync: number; pulled: boolean };

const ORDER: Record<Table, number> = { settings: 0, deals: 1, tasks: 2, docs: 3 };
const OVERLAP_MS = 30000;
/** server timestamps can arrive as "2026-11-26T18:33:15.12+00:00" or "2026-11-26 18:33:15.123456+00"; make them comparable */
export const normTs = (s?: string | null) => { if (!s) return ''; const m = String(s).match(/^(\d{4}-\d\d-\d\d)[T ](\d\d:\d\d:\d\d)(?:\.(\d+))?/); return m ? m[1] + 'T' + m[2] + '.' + (m[3] || '').padEnd(6, '0').slice(0, 6) : String(s); };
const clone = <T>(x: T): T => x == null ? x : structuredClone(x);
const isNet = (e: any) => !e || e.name === 'TypeError' || /fetch|network|Failed|timeout|abort/i.test(String(e.message || e)) || e.status === 0 || e.status >= 500 || e.status === 429;

export class Store {
  rows: Record<Table, Map<string, Row>> = { settings: new Map(), deals: new Map(), tasks: new Map(), docs: new Map() };
  pend = new Map<string, Pend>();
  cursor: Record<string, string | null> = {};
  seq = 0;
  ver = 0;
  state: SyncState = { online: true, live: false, pending: 0, files: 0, error: null, loaded: false, lastSync: 0, pulled: false };
  private subs = new Set<() => void>();
  private pushing = false; private again = false; private retryT: any = null; private backoff = 1000;
  private unsub: (() => void) | null = null; private pullT: any = null; private filesBusy = false;
  private view = new Map<string, Row>(); private pullRetry: any = null;

  constructor(public local: LocalDB, public be: Backend | null) {}

  /* ---------- reading ---------- */
  on(fn: () => void) { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
  private emit() { this.ver++; this.view.clear(); this.state = { ...this.state, pending: this.pend.size }; this.subs.forEach(f => f()); }
  get<T = Row>(t: Table, id: string): T | undefined {
    const k = t + ':' + id; const c = this.view.get(k); if (c) return c as T;
    const s = this.rows[t].get(id), p = this.pend.get(k);
    if (!s && !p) return undefined;
    const r: Row = { ...(clone(s) || { id }) }; if (p) for (const [f, x] of Object.entries(p.f)) r[f] = clone(x.v);
    this.view.set(k, r); return r as T;
  }
  list<T = Row>(t: Table, withDeleted = false): T[] {
    const ids = new Set<string>([...this.rows[t].keys()]); this.pend.forEach(p => { if (p.t === t) ids.add(p.id); });
    const out: Row[] = []; ids.forEach(id => { const r = this.get(t, id)!; if (withDeleted || !r.deleted_at) out.push(r); });
    return out as T[];
  }

  /* ---------- writing ---------- */
  /** change fields of a row (creates it if new); only the given fields are sent */
  mutate(t: Table, id: string, fields: Record<string, any>) {
    const k = t + ':' + id; const p = this.pend.get(k) || { key: k, t, id, f: {} };
    const cur = this.get(t, id);
    let changed = !cur;
    for (const [f, v] of Object.entries(fields)) {
      if (f === 'updated_at' || f === 'owner' || f === 'created_at' || f === 'rev') continue;
      if (cur && JSON.stringify(cur[f]) === JSON.stringify(v) && !p.f[f]) continue;
      p.f[f] = { v: clone(v), s: ++this.seq }; changed = true;
    }
    if (!cur) p.f.id = { v: id, s: ++this.seq };
    if (!changed) return;
    delete p.err; this.pend.set(k, p); this.local.putPending(p).catch(() => {});
    this.emit(); this.kick();
  }
  /** insert a full row */
  insert(t: Table, row: Row) { this.mutate(t, row.id, row); }

  /* ---------- lifecycle ---------- */
  async start() {
    try {
      const { rows, pending, meta } = await this.local.loadAll();
      rows.forEach(([t, r]) => this.rows[t]?.set(r.id, r));
      pending.forEach(p => { this.pend.set(p.key, p); Object.values(p.f).forEach(x => { if (x.s > this.seq) this.seq = x.s; }); });
      this.cursor = meta.cursor || {};
    } catch (e) { console.warn('local load failed', e); }
    this.state.loaded = true; this.emit();
    if (!this.be) return;
    this.unsub = this.be.subscribe((t, r) => this.ingest(t, [r]), live => {
      const was = this.state.live; this.state = { ...this.state, live }; this.emit();
      if (live && !was) { this.pullAll(); this.kick(); }
    });
    await this.pullAll();
    this.kick(); this.syncFiles();
    this.pullT = setInterval(() => { if (typeof document === 'undefined' || !document.hidden) this.pullAll(); }, 60000);
  }
  stop() { this.unsub?.(); clearInterval(this.pullT); clearTimeout(this.retryT); clearTimeout(this.pullRetry); }

  /** called when the device comes back online or the app comes to the foreground */
  wake() { this.backoff = 1000; this.pullAll(); this.kick(); this.syncFiles(); }

  private ingest(t: Table, rs: Row[]) {
    const save: [Table, Row][] = []; let cur = this.cursor[t] || null, ch = false;
    for (const r of rs) {
      if (!r || !r.id) continue;
      const old = this.rows[t].get(r.id);
      if (old && old.updated_at && r.updated_at && normTs(old.updated_at) > normTs(r.updated_at)) continue; // stale echo
      this.rows[t].set(r.id, r); save.push([t, r]); ch = true;
      if (r.updated_at && (!cur || normTs(r.updated_at) > normTs(cur))) cur = r.updated_at;
    }
    if (!ch) return;
    this.cursor[t] = cur; this.local.putRows(save).catch(() => {}); this.local.setMeta('cursor', this.cursor).catch(() => {});
    this.emit();
  }

  private pulling: Promise<void> | null = null;
  pullAll(): Promise<void> {
    if (!this.be) return Promise.resolve();
    if (this.pulling) return this.pulling;
    this.pulling = (async () => {
      try {
        for (const t of TABLES) {
          const c = this.cursor[t]; const since = c ? new Date(Date.parse(normTs(c) + 'Z') - OVERLAP_MS).toISOString() : null;
          const rs = await this.be!.pull(t, since); this.ingest(t, rs);
        }
        this.state = { ...this.state, online: true, lastSync: Date.now(), pulled: true }; this.emit();
      } catch (e: any) { this.state = { ...this.state, online: !isNet(e) }; this.emit(); clearTimeout(this.pullRetry); this.pullRetry = setTimeout(() => this.pullAll(), 5000); }
      finally { this.pulling = null; }
    })();
    return this.pulling;
  }

  /* ---------- outbox ---------- */
  kick() { if (!this.be) return; if (this.pushing) { this.again = true; return; } this.pushLoop(); }
  private async pushLoop() {
    this.pushing = true;
    try {
      do {
        this.again = false;
        const all = [...this.pend.values()].sort((a, b) => ORDER[a.t] - ORDER[b.t]);
        for (const t of TABLES) {
          const ps = all.filter(p => p.t === t); if (!ps.length) continue;
          const groups = new Map<string, Pend[]>();
          ps.forEach(p => { const sig = Object.keys(p.f).sort().join(','); (groups.get(sig) || groups.set(sig, []).get(sig)!).push(p); });
          for (const g of groups.values()) {
            for (let i = 0; i < g.length; i += 100) await this.pushGroup(t, g.slice(i, i + 100));
          }
        }
      } while (this.again);
      this.backoff = 1000; this.state = { ...this.state, online: true, error: null, lastSync: Date.now() }; this.emit();
    } catch (e: any) {
      const net = isNet(e);
      this.state = { ...this.state, online: !net ? this.state.online : false, error: net ? null : String(e?.message || e) }; this.emit();
      clearTimeout(this.retryT); this.retryT = setTimeout(() => this.kick(), this.backoff); this.backoff = Math.min(this.backoff * 2, net ? 30000 : 60000);
    } finally { this.pushing = false; }
  }
  private async pushGroup(t: Table, g: Pend[]) {
    const sent = g.map(p => ({ p, f: Object.fromEntries(Object.entries(p.f).map(([k, x]) => [k, x.s])) }));
    const rows = g.map(p => { const r: Row = { id: p.id }; for (const [k, x] of Object.entries(p.f)) r[k] = clone(x.v); return r; });
    let res: Row[];
    try { res = await this.be!.push(t, rows); }
    catch (e: any) { if (!isNet(e)) g.forEach(p => { p.err = String(e?.message || e); this.local.putPending(p).catch(() => {}); }); throw e; }
    // acknowledge only the exact edits that were sent
    for (const { p, f } of sent) {
      const cur = this.pend.get(p.key); if (!cur) continue;
      for (const [k, s] of Object.entries(f)) if (cur.f[k] && cur.f[k].s === s) delete cur.f[k];
      if (!Object.keys(cur.f).length || (Object.keys(cur.f).length === 1 && cur.f.id)) { this.pend.delete(p.key); this.local.delPending(p.key).catch(() => {}); }
      else this.local.putPending(cur).catch(() => {});
    }
    this.ingest(t, res);
    this.emit();
  }

  /* ---------- files (encrypted documents) ---------- */
  async saveFile(path: string, bytes: Uint8Array) { await this.local.putFile(path, bytes); this.state = { ...this.state, files: this.state.files + 1 }; this.emit(); this.syncFiles(); }
  async readFile(path: string): Promise<ArrayBuffer> {
    const l = await this.local.getFile(path); if (l) return l.slice().buffer;
    if (!this.be) throw new Error('offline');
    return this.be.download(path);
  }
  async syncFiles() {
    if (!this.be || this.filesBusy) return; this.filesBusy = true;
    try {
      const fs = await this.local.listFiles(); this.state = { ...this.state, files: fs.length }; this.emit();
      for (const p of fs) { const b = await this.local.getFile(p); if (b) { await this.be.upload(p, b); await this.local.delFile(p); this.state = { ...this.state, files: Math.max(0, this.state.files - 1) }; this.emit(); } }
    } catch { setTimeout(() => this.syncFiles(), 15000); }
    finally { this.filesBusy = false; }
  }
}

import type { Backend, Row, Table } from './store';

/** A fake server with the same semantics as the Supabase setup: partial upsert merges
 *  only the sent columns, the server sets updated_at, changes are broadcast. Used for tests,
 *  with optional latency, random failures and dropped acknowledgements (write ok, reply lost). */
export class MemServer {
  rows: Record<Table, Map<string, Row>> = { settings: new Map(), deals: new Map(), tasks: new Map(), docs: new Map() };
  files = new Map<string, Uint8Array>();
  subs = new Set<(t: Table, r: Row) => void>();
  clock = Date.parse('2026-01-01T00:00:00Z');
  lat: [number, number] = [0, 0]; fail = 0; lostAck = 0; down = false; pushes = 0;
  stamp() { this.clock = Math.max(this.clock + 1, Date.now()); return new Date(this.clock).toISOString().replace('Z', '+00:00'); }
  async wait() { const [a, b] = this.lat; if (b) await new Promise(r => setTimeout(r, a + Math.random() * (b - a))); }
  check() { if (this.down || Math.random() < this.fail) throw Object.assign(new TypeError('Failed to fetch'), { status: 0 }); }
  client(): Backend {
    const S = this;
    return {
      async pull(t, since) { await S.wait(); S.check(); const out = [...S.rows[t].values()].filter(r => !since || Date.parse(r.updated_at!) > Date.parse(since)); await S.wait(); return structuredClone(out); },
      async push(t, rows) {
        await S.wait(); S.check(); S.pushes++;
        const out = rows.map(r => {
          const cur = S.rows[t].get(r.id);
          if (!cur && t === 'tasks' && !S.rows.deals.has(r.deal_id)) throw Object.assign(new Error('deal not owned'), { status: 400 });
          if (!cur && t === 'tasks' && (r.title == null || r.deal_id == null)) throw Object.assign(new Error('null value in column'), { status: 400 });
          const n = { ...(cur || {}), ...structuredClone(r), updated_at: S.stamp() };
          S.rows[t].set(r.id, n); return n;
        });
        out.forEach(r => S.subs.forEach(f => setTimeout(() => f(t, structuredClone(r)), S.lat[1] ? S.lat[0] + Math.random() * (S.lat[1] - S.lat[0]) : 0)));
        if (Math.random() < S.lostAck) { await S.wait(); throw Object.assign(new TypeError('Failed to fetch'), { status: 0 }); }
        await S.wait(); return structuredClone(out);
      },
      subscribe(onRow, onStatus) { S.subs.add(onRow); setTimeout(() => onStatus(true), 0); return () => { S.subs.delete(onRow); }; },
      async upload(p, b) { await S.wait(); S.check(); S.files.set(p, b.slice()); },
      async remove(t, ids) { await S.wait(); S.check(); ids.forEach(id => { S.rows[t].delete(id); if (t === 'deals') (['tasks', 'docs'] as Table[]).forEach(x => S.rows[x].forEach((r, k) => { if (r.deal_id === id) S.rows[x].delete(k); })); }); },
      async removeFiles(ps) { await S.wait(); S.check(); ps.forEach(p => S.files.delete(p)); },
      async download(p) { await S.wait(); S.check(); const b = S.files.get(p); if (!b) throw Object.assign(new Error('not found'), { status: 404 }); return b.slice().buffer; },
    };
  }
}

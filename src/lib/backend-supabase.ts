import type { SupabaseClient } from '@supabase/supabase-js';
import type { Backend, Row, Table } from './store';

const BUCKET = 'docs';
/** settings rows use the owner as key; the engine sees them with id = owner */
const toRow = (t: Table, r: any): Row => t === 'settings' ? { ...r, id: r.owner } : r;
const err = (e: any) => Object.assign(new Error(e?.message || 'db error'), { status: e?.status ?? (e?.code ? 400 : 0), code: e?.code });

export function supabaseBackend(sb: SupabaseClient, uid: string): Backend {
  return {
    async pull(t, since) {
      const out: Row[] = [];
      for (let from = 0; ; from += 1000) {
        let q = sb.from(t).select('*').order('updated_at', { ascending: true }).range(from, from + 999);
        if (since) q = q.gt('updated_at', since);
        const { data, error, status } = await q;
        if (error) throw Object.assign(err(error), { status });
        out.push(...(data || []).map(r => toRow(t, r)));
        if (!data || data.length < 1000) break;
      }
      return out;
    },
    async push(t, rows) {
      const body = rows.map(r => { const x: any = { ...r }; if (t === 'settings') { delete x.id; x.owner = uid; } return x; });
      const { data, error, status } = await sb.from(t).upsert(body, { onConflict: t === 'settings' ? 'owner' : 'id', defaultToNull: false }).select('*');
      if (error) throw Object.assign(err(error), { status });
      return (data || []).map(r => toRow(t, r));
    },
    subscribe(onRow, onStatus) {
      const ch = sb.channel('u-' + uid);
      (['deals', 'tasks', 'docs', 'settings'] as Table[]).forEach(t =>
        ch.on('postgres_changes' as any, { event: '*', schema: 'public', table: t, filter: 'owner=eq.' + uid }, (p: any) => { if (p.new && p.new.owner) onRow(t, toRow(t, p.new)); }));
      ch.subscribe(s => onStatus(s === 'SUBSCRIBED'));
      return () => { sb.removeChannel(ch); };
    },
    async upload(path, bytes) {
      const { error } = await sb.storage.from(BUCKET).upload(path, new Blob([bytes as any], { type: 'application/octet-stream' }), { upsert: true, contentType: 'application/octet-stream' });
      if (error && !/exists/i.test(error.message)) throw err(error);
    },
    async download(path) {
      const { data, error } = await sb.storage.from(BUCKET).download(path);
      if (error || !data) throw err(error);
      return data.arrayBuffer();
    },
  };
}

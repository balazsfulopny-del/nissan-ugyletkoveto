import type { App } from './actions';
import { newDeal, type Deal, type Task } from './domain';
import { numv } from './util';

/** stable UUID from an old id, so loading the same old file twice does not duplicate */
export function idFrom(old: string) {
  let h1 = 0x811c9dc5, h2 = 0x01000193, h3 = 0x12345678, h4 = 0x9e3779b9;
  for (let i = 0; i < old.length; i++) { const c = old.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822519); h3 = Math.imul(h3 ^ c, 3266489917); h4 = Math.imul(h4 ^ c, 668265263); }
  const hx = [h1, h2, h3, h4].map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
  return `${hx.slice(0, 8)}-${hx.slice(8, 12)}-4${hx.slice(13, 16)}-a${hx.slice(17, 20)}-${hx.slice(20, 32)}`;
}
const d8 = (v: any) => typeof v === 'string' && /^\d{4}-\d\d-\d\d$/.test(v) ? v : null;

/** take deals, tasks and settings from the old (claude.ai) Ügyletkövető backup file */
export function importOld(app: App, j: any) {
  let n = 0;
  for (const o of Object.values<any>(j.deals || {})) {
    if (!o || !o.id) continue;
    const id = idFrom(o.id);
    const d: Deal = { ...newDeal(), id, cust: String(o.cust || ''), phone: String(o.phone || ''), model: String(o.model || ''), vin: String(o.vin || ''),
      contract: d8(o.contract), delivery: d8(o.delivery), handed: d8(o.handed), paid: !!o.paid, cancel: !!o.cancel,
      ceg: !!o.ceg, fin: !!o.fin, trade: !!o.trade, ins: !!o.ins, acc: !!o.acc,
      price: numv(o.price), downpay: numv(o.downpay), margin: numv(o.margin), accv: numv(o.accv), adj: numv(o.adj),
      promise: String(o.promise || ''), note: String(o.note || ''), jv: o.jv && typeof o.jv === 'object' ? o.jv : {}, source: 'import' };
    app.st.mutate('deals', id, d);
    (o.tasks || []).forEach((t: any, i: number) => {
      const tid = idFrom(o.id + '/' + t.id);
      const task: Task = { id: tid, deal_id: id, tpl_key: t.own ? null : String(t.id), title: String(t.t || ''), due: d8(t.due), done: !!t.done, done_at: d8(t.at), sub: Array.isArray(t.sub) ? t.sub.map((x: any) => ({ t: String(x.t), done: !!x.done })) : null, man: !!t.man || !!t.own, sort: i, deleted_at: null };
      app.st.mutate('tasks', tid, task);
    });
    n++;
  }
  if (j.set) { const s = j.set; const patch: any = {}; if (Array.isArray(s.tpl)) patch.tpl = s.tpl; if (s.rules) patch.rules = s.rules; if (s.name) patch.name = s.name; app.setData(patch); }
  return n;
}

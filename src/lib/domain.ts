import { addD, diff, today, uuid } from './util';

export type Deal = {
  id: string; cust: string; phone: string; model: string; vin: string;
  contract: string | null; delivery: string | null; handed: string | null;
  paid: boolean; cancel: boolean; ceg: boolean; fin: boolean; trade: boolean; ins: boolean; acc: boolean;
  price: number | null; downpay: number | null; margin: number | null; accv: number | null; adj: number | null;
  promise: string; note: string; jv: Record<string, any>;
  trade_model: string; trade_year: number | null; trade_km: number | null; trade_price: number | null;
  offer_ref: string | null; offer_no: string | null; cust_email: string; cust_addr: string; source: string;
  tpl_version: number; deleted_at: string | null; cancel_at?: string | null; created_at?: string; updated_at?: string;
};
export type Sub = { t: string; done: boolean };
export type Task = {
  id: string; deal_id: string; tpl_key: string | null; title: string; due: string | null;
  done: boolean; done_at: string | null; sub: Sub[] | null; man: boolean; sort: number; deleted_at: string | null; updated_at?: string;
};
export type Doc = {
  id: string; deal_id: string; kind: string; name: string; path: string; mime: string; size: number;
  pages: number | null; deleted_at: string | null; created_at?: string; updated_at?: string;
};
export type TplStep = { id: string; t: string; b: 'k' | 'a'; o: number; c: string; s: string };
export type Rules = { base: number; marginPct: number; finBonus: number; insBonus: number; accPct: number; tradeBonus: number; tiers: { min: number; per: number }[] };
export type SettingsData = { name: string; tplv: number; tpl: TplStep[]; rules: Rules; soon: number };
export type PinBox = { salt: string; iv: string; w: string; it: number; v: number; len: number };
export type Settings = { owner?: string; data: SettingsData; pin: PinBox | null; updated_at?: string };

export const COND: Record<string, string> = { all: 'Mindig', priv: 'Ha magánszemély', ceg: 'Ha cég vásárol', cash: 'Ha készpénzes', fin: 'Ha lízinges / hitel', trade: 'Ha van beszámítás', ins: 'Ha biztosítást köt', acc: 'Ha van kiegészítő' };
export const BASE = { k: 'szerződés után', a: 'átadás előtt/után' };
export const condOk = (d: Partial<Deal>, c?: string) => !c || c === 'all' ? true : c === 'priv' ? !d.ceg : c === 'cash' ? !d.fin : !!(d as any)[c];
export const CATS = ['Adásvételi szerződés', 'Számla', 'Előlegszámla', 'Hitel, lízing', 'Biztosítás', 'Forgalmi, okmányok', 'Beszámítás', 'Átadás-átvételi jkv', 'Személyes iratok', 'Egyéb'];

/* A felhasználó ügymenetlistája alapján (kollégák neve nélkül, mert a kód nyilvános; a Beállításokban kiegészíthető). A napok eltolása becslés. */
export const DEF_TPL: TplStep[] = ([
  ['u1', 'Ajánlat elkészítése, átadása a vevőnek', 'k', 0, 'all'],
  ['u2', 'Szerződés megkötése', 'k', 0, 'all'],
  ['u3', 'Személyes okmányok másolata', 'k', 0, 'priv'],
  ['u4', 'Cég: aláírási címpéldány és az aláíró személyi igazolványának másolata', 'k', 0, 'ceg'],
  ['u5', 'Megjegyzés, ígéret rögzítése a vevőnek', 'k', 0, 'all'],
  ['u6', 'Kifizetés: tényleges vételár egyeztetése (készpénzes)', 'k', 1, 'cash'],
  ['u7', 'Kifizetés: önerő egyeztetése, lízing elindítása', 'k', 1, 'fin'],
  ['u8', '0-revízió és tartozékok megrendelése', 'k', 3, 'all'],
  ['u9', 'Autó ára beérkezett', 'a', -21, 'all'],
  ['u10', 'Autó papírjainak lekérése (2-3 hét)', 'a', -21, 'all'],
  ['u11', 'Beérkeztek a papírok', 'a', -7, 'all'],
  ['u12', 'Regadó intézése', 'a', -7, 'all'],
  ['u13', 'Kötelező felelősségbiztosítás, igazolás bekérése', 'a', -5, 'all'],
  ['u14', 'Okmányiroda: forgalomba helyezés', 'a', -3, 'all', 'Jármű kísérőlap; Jármű műszaki adatlap; Műszaki vizsgálati bizonylat; Bejövő import számla; Kimenő számla, végszámla; Biztosítás visszaigazolás; Okmányirodai meghatalmazás; Aláírási címpéldány [ceg]; Cégkivonat [ceg]; Okmányirodai bélyegző [fin]; Lízingszerződés [fin]'],
  ['u15', 'Garancia megkötése (átadás előtt, forgalmi engedéllyel)', 'a', -1, 'all'],
  ['u16', 'Átadás, átadás-átvételi jegyzőkönyv', 'a', 0, 'all'],
  ['u17', 'Elégedettségi telefon a vevőnek', 'a', 3, 'all'],
  ['u18', 'Jutalékelszámolás leadása', 'a', 5, 'all'],
] as [string, string, 'k' | 'a', number, string, string?][]).map(([id, t, b, o, c, s]) => ({ id, t, b, o, c, s: s || '' }));
export const TPLV = 2;
export const DEF_RULES: Rules = { base: 40000, marginPct: 5, finBonus: 25000, insBonus: 10000, accPct: 10, tradeBonus: 15000, tiers: [{ min: 8, per: 10000 }, { min: 12, per: 20000 }] };
export const defSettings = (): SettingsData => ({ name: '', tplv: TPLV, tpl: structuredClone(DEF_TPL), rules: structuredClone(DEF_RULES), soon: 3 });
export const parseSub = (str: string) => String(str || '').split(';').map(x => x.trim()).filter(Boolean).map(x => { const m = x.match(/^(.*?)\s*\[(\w+)\]$/); return m ? { t: m[1], c: m[2] } : { t: x, c: 'all' }; });

export const newDeal = (): Deal => ({
  id: uuid(), cust: '', phone: '', model: '', vin: '', contract: today(), delivery: null, handed: null,
  paid: false, cancel: false, ceg: false, fin: false, trade: false, ins: false, acc: false,
  price: null, downpay: null, margin: null, accv: null, adj: null, promise: '', note: '', jv: {},
  trade_model: '', trade_year: null, trade_km: null, trade_price: null,
  offer_ref: null, offer_no: null, cust_email: '', cust_addr: '', source: 'kézi', tpl_version: TPLV, deleted_at: null,
});

const dueOf = (d: Deal, t: TplStep) => t.b === 'k' ? addD(d.contract, +t.o) : addD(d.delivery, +t.o);

/** Changes needed so the deal's template tasks match its current flags and dates.
 *  Keeps done state, manual due dates and own (non template) tasks; never hard deletes. */
export function planTasks(d: Deal, tpl: TplStep[], cur: Task[]): { upsert: Task[]; remove: string[] } {
  const live = cur.filter(t => !t.deleted_at);
  const byKey = new Map(live.filter(t => t.tpl_key).map(t => [t.tpl_key!, t]));
  const want = tpl.filter(t => condOk(d, t.c));
  const upsert: Task[] = [], remove: string[] = [];
  want.forEach((s, i) => {
    const o = byKey.get(s.id);
    const subs = parseSub(s.s).filter(x => condOk(d, x.c));
    const old = new Map((o?.sub || []).map(x => [x.t, x.done]));
    const sub = subs.length ? subs.map(x => ({ t: x.t, done: !!old.get(x.t) })) : null;
    const due = o && o.man ? o.due : dueOf(d, s);
    const n: Task = o ? { ...o, title: s.t, due, sub, sort: i } : { id: uuid(), deal_id: d.id, tpl_key: s.id, title: s.t, due, done: false, done_at: null, sub, man: false, sort: i, deleted_at: null };
    if (!o || o.title !== n.title || o.due !== n.due || o.sort !== n.sort || JSON.stringify(o.sub) !== JSON.stringify(n.sub)) upsert.push(n);
  });
  const wantKeys = new Set(want.map(s => s.id));
  live.forEach(t => { if (t.tpl_key && !wantKeys.has(t.tpl_key)) remove.push(t.id); });
  return { upsert, remove };
}

export const sortTasks = (a: Task, b: Task) => (a.due || '9').localeCompare(b.due || '9') || a.sort - b.sort;
export type St = 'act' | 'done' | 'cancel';
export const status = (d: Deal): St => d.cancel ? 'cancel' : d.handed ? 'done' : 'act';
/* Megőrzés: az átadott vagy elállt ügylet 1 év után mindenestül törlődik (dokumentumokkal együtt);
   a törölt (kukába tett) ügylet 30 nap után. Figyelmeztetés 14 nappal előtte. */
export const KEEP_DAYS = 365, BIN_DAYS = 30, WARN_DAYS = 14;
export function purgeOn(d: Deal): string | null {
  if (d.deleted_at) return addD(d.deleted_at.slice(0, 10), BIN_DAYS);
  const base = d.handed || (d.cancel ? (d.cancel_at || (d.updated_at || '').slice(0, 10) || null) : null);
  return base ? addD(base, KEEP_DAYS) : null;
}
export const prog = (ts: Task[]) => ts.length ? Math.round(100 * ts.filter(t => t.done).length / ts.length) : 0;
export type Col = 'g' | 'y' | 'r' | '';
export const tSt = (t: Task, soon = 3, now = today()): Col => { if (t.done) return ''; if (!t.due) return 'g'; const n = diff(t.due, now); return n <= 0 ? 'r' : n <= soon ? 'y' : 'g'; };
export const dSt = (d: Deal, ts: Task[], soon = 3): Col => { if (status(d) !== 'act') return ''; const a = ts.map(t => tSt(t, soon)); return a.includes('r') ? 'r' : a.includes('y') ? 'y' : 'g'; };

export function commMonth(deals: Deal[], r: Rules, m: string) {
  const ds = deals.filter(d => d.handed && !d.cancel && !d.deleted_at && d.handed.slice(0, 7) === m).sort((a, b) => a.handed!.localeCompare(b.handed!));
  let tier: { min: number; per: number } | null = null;
  (r.tiers || []).forEach(t => { if (ds.length >= +t.min && (!tier || +t.min > +tier.min)) tier = t; });
  const rows = ds.map(d => {
    const p: Record<string, number> = { base: +r.base || 0, margin: (+d.margin! || 0) * (+r.marginPct || 0) / 100, fin: d.fin ? +r.finBonus || 0 : 0, ins: d.ins ? +r.insBonus || 0 : 0, acc: (+d.accv! || 0) * (+r.accPct || 0) / 100, trade: d.trade ? +r.tradeBonus || 0 : 0, tier: tier ? +(tier as any).per || 0 : 0, adj: +d.adj! || 0 };
    p.sum = Object.values(p).reduce((a, b) => a + b, 0); return { d, p };
  });
  const tot: Record<string, number> = {}; rows.forEach(x => Object.entries(x.p).forEach(([k, v]) => tot[k] = (tot[k] || 0) + v));
  return { rows, tier: tier as { min: number; per: number } | null, tot, n: ds.length, paid: ds.length > 0 && ds.every(d => d.paid) };
}

/* Jóváírás számítás (a főnök Excel táblájának logikája).
   4. sor = -(alapár + fényezés) * árrés% (feltételezés, az Excelben üres volt), 7. = 2..6. sorok összege, 8. = C7 - B7, 9. = 8. * 1,27 */
export const JVR: [string, string][] = [['2', 'Alapár + felszereltség'], ['3', 'Fényezés (nettó)'], ['4', 'Árrés (%-)'], ['5', 'Piacfejlesztési alap'], ['6', 'Privát kedvezmény (GACE kampány, nettó)']];
export function jvCalc(j: Record<string, any> = {}) {
  const n = (k: string) => +j[k] || 0;
  const col = (x: string) => { const pct = j['p' + x] === undefined || j['p' + x] === '' || j['p' + x] === null ? 7.5 : +j['p' + x]; const r4 = -(n(x + '2') + n(x + '3')) * pct / 100; return { pct, r4, sum: n(x + '2') + n(x + '3') + r4 + n(x + '5') + n(x + '6') }; };
  const B = col('b'), C = col('c'), net = C.sum - B.sum;
  return { B, C, net, gross: net * 1.27, any: ['b2', 'c2'].some(k => n(k)) };
}

export function ics(items: { d: Deal; ts: Task[] }[]) {
  const e = (x: string) => String(x || '').replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const st = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ugyletkoveto//HU', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']; let n = 0;
  items.forEach(({ d, ts }) => ts.forEach(t => {
    if (t.done || !t.due || t.deleted_at) return; n++;
    const a = t.due.replace(/-/g, ''), b = addD(t.due, 1)!.replace(/-/g, '');
    L.push('BEGIN:VEVENT', 'UID:' + t.id + '@ugyletkoveto', 'DTSTAMP:' + st, 'DTSTART;VALUE=DATE:' + a, 'DTEND;VALUE=DATE:' + b, 'SUMMARY:' + e(t.title + ' (' + (d.cust || 'vevő') + ')'), 'DESCRIPTION:' + e((d.model || '') + (d.phone ? '\nTel: ' + d.phone : '')), 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + e(t.title), 'TRIGGER:-PT15H', 'END:VALARM', 'END:VEVENT');
  }));
  L.push('END:VCALENDAR');
  const enc = new TextEncoder();
  /* RFC 5545: lines at most 75 octets; fold on character boundaries (accented letters are 2 bytes) */
  const fold = (l: string) => { const out: string[] = []; let cur = '', bytes = 0, lim = 75; for (const ch of l) { const n = enc.encode(ch).length; if (bytes + n > lim) { out.push(cur); cur = ''; bytes = 0; lim = 74; } cur += ch; bytes += n; } out.push(cur); return out.join('\r\n '); };
  return { n, text: L.map(fold).join('\r\n') };
}

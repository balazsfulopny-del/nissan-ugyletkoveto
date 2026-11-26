import { useState } from 'preact/hooks';
import type { App } from '../lib/actions';
import { commMonth, jvCalc, dSt, prog, status, tSt, type Col, type Deal, type Task } from '../lib/domain';
import { addD, ft, hd, today } from '../lib/util';
import { Check } from './fields';

export const go = (h: string) => { location.hash = h; };
export const Bang = ({ c }: { c: Col }) => c === 'r' ? <span class="bang" aria-label="Sürgős">!</span> : null;
export const Legend = ({ soon }: { soon: number }) => <div class="legend"><span><i style="border-color:var(--ok)" />Rendben</span><span><i style="border-color:#e0a800" />Határidő {soon} napon belül</span><span><i style="border-color:var(--red)" />Ma esedékes vagy lejárt</span></div>;

export function Today({ app }: { app: App }) {
  const t0 = today(), w = addD(t0, 7)!, soon = app.settings().data.soon;
  const act = app.deals().filter(d => status(d) === 'act'); const by = app.allTasks();
  const all: { d: Deal; t: Task }[] = []; act.forEach(d => (by.get(d.id) || []).forEach(t => { if (!t.done && !t.deleted_at) all.push({ d, t }); }));
  const late = all.filter(x => x.t.due && x.t.due < t0), now = all.filter(x => x.t.due === t0), next = all.filter(x => x.t.due && x.t.due > t0 && x.t.due <= w);
  const sf = (a: any, b: any) => a.t.due.localeCompare(b.t.due);[late, now, next].forEach(a => a.sort(sf));
  const c = commMonth(app.deals(), app.settings().data.rules, t0.slice(0, 7));
  const soonN = act.filter(d => d.delivery && d.delivery >= t0 && d.delivery <= addD(t0, 14)!).length;
  const row = (x: { d: Deal; t: Task }) => { const col = tSt(x.t, soon); return <div key={x.t.id} class={`task st-${col} ${x.t.due! < t0 ? 'late' : ''}`}><Bang c={col} />
    <input type="checkbox" aria-label="Kész" data-tk={x.t.id} checked={x.t.done} onChange={e => app.tick(x.t.id, (e.currentTarget as HTMLInputElement).checked)} />
    <div class="t"><b>{x.t.title}{x.t.sub ? ` (${x.t.sub.filter(y => y.done).length}/${x.t.sub.length})` : ''}</b><span class="m"><a href={'#/deal/' + x.d.id}>{x.d.cust || 'Névtelen vevő'}</a> · {x.d.model || 'modell?'}</span></div>
    <span class="d">{hd(x.t.due)}</span></div>; };
  const grp = (cls: string, ttl: string, arr: typeof all, empty: string) => <>
    <div class={'grp ' + cls}>{ttl}<em>{arr.length}</em></div>{arr.length ? arr.map(row) : <p class="note">{empty}</p>}</>;
  return <section>
    <h1>Mai teendők</h1>
    <div class="kpi"><div><b>{act.length}</b><span>aktív ügylet</span></div><div><b>{late.length}</b><span>lejárt feladat</span></div><div><b>{soonN}</b><span>átadás 14 napon belül</span></div><div><b>{ft(c.tot.sum || 0)}</b><span>jutalék ebben a hónapban ({c.n} db)</span></div></div>
    {!act.length ? <div class="empty"><h2>Még nincs aktív ügylet</h2><p class="note">Vegyél fel egy szerződést, és az app a sablon alapján létrehozza az összes feladatot határidővel az átadásig.</p><p class="row" style="justify-content:center"><button class="b" data-new onClick={() => go('#/deal/' + app.createDeal())}>Új ügylet</button></p></div>
      : <><Legend soon={soon} />{grp('late', 'Lejárt', late, 'Nincs lejárt feladat.')}{grp('', 'Ma', now, 'Mára nincs több feladat.')}{grp('', 'Következő 7 nap', next, 'A következő héten nincs határidő.')}</>}
  </section>;
}

export function Deals({ app }: { app: App }) {
  const [q, setQ] = useState(''); const [filt, setFilt] = useState('act');
  const soon = app.settings().data.soon, by = app.allTasks();
  const ql = q.trim().toLowerCase();
  const ds = app.deals().filter(d => (filt === 'all' || status(d) === filt) && (!ql || [d.cust, d.model, d.vin, d.phone, d.offer_no].join(' ').toLowerCase().includes(ql)))
    .sort((a, b) => (a.delivery || '9').localeCompare(b.delivery || '9'));
  return <section>
    <div class="row" style="justify-content:space-between"><h1>Ügyletek</h1><button class="b" data-new onClick={() => go('#/deal/' + app.createDeal())}>+ Új ügylet</button></div>
    <div class="row" style="margin-bottom:12px"><input id="q" style="flex:2;margin:0" placeholder="Keresés: vevő, modell, alvázszám" value={q} onInput={e => setQ((e.currentTarget as HTMLInputElement).value)} />
      <select id="filt" style="flex:1;margin:0" value={filt} onChange={e => setFilt((e.currentTarget as HTMLSelectElement).value)}><option value="act">Folyamatban</option><option value="done">Átadva</option><option value="cancel">Visszalépett</option><option value="all">Mind</option></select></div>
    <Legend soon={soon} />
    {ds.length ? <div class="deals">{ds.map(d => { const ts = (by.get(d.id) || []).filter(t => !t.deleted_at); const c = dSt(d, ts, soon), late = ts.filter(t => !t.done && t.due && t.due < today()).length;
      return <button key={d.id} class={'deal st-' + c} data-open={d.id} onClick={() => go('#/deal/' + d.id)}>
        <div class="row" style="justify-content:space-between"><b>{d.cust || 'Névtelen vevő'}</b><Bang c={c} /></div>
        <div class="m">{d.model || 'modell?'}{d.offer_no ? ' · ' + d.offer_no : ''}</div>
        <div class="bar"><i style={{ width: prog(ts) + '%' }} /></div>
        <div class="m">{status(d) === 'act' ? <>Átadás: {hd(d.delivery)} · {prog(ts)}% kész{late ? <> · <span class="tag late">{late} lejárt</span></> : ''}</> : status(d) === 'done' ? <span class="tag ok">Átadva {hd(d.handed)}</span> : <span class="tag off">Visszalépett</span>}</div>
      </button>; })}</div> : <p class="note">Nincs a szűrésnek megfelelő ügylet.</p>}
  </section>;
}

export function Comm({ app }: { app: App }) {
  const [mon, setMon] = useState(today().slice(0, 7));
  const s = app.settings().data, c = commMonth(app.deals(), s.rules, mon);
  const L: [string, string][] = [['base', 'Alap'], ['margin', 'Árrés'], ['fin', 'Finanszírozás'], ['ins', 'Biztosítás'], ['acc', 'Kiegészítő'], ['trade', 'Beszámítás'], ['tier', 'Sáv'], ['adj', 'Korrekció']];
  const jvs = app.deals().filter(d => d.jv && (d.jv.b2 || d.jv.c2));
  return <section>
    <h1>Jutalék</h1>
    <div class="row" style="margin-bottom:12px"><label>Hónap<input id="mon" type="month" value={mon} onChange={e => setMon((e.currentTarget as HTMLInputElement).value)} /></label></div>
    <p class="note">A szabályok a Beállításokban módosíthatók. Az alapértékek csak példák, amíg nem adod meg a sajátodat.</p>
    <div class="kpi"><div><b>{ft(c.tot.sum || 0)}</b><span>{c.n} átadott autó</span></div><div><b>{c.tier ? '+' + ft(c.tier.per) : 'nincs'}</b><span>sávbónusz autónként</span></div></div>
    {c.n ? <div class="scroll"><table class="stack"><thead><tr><th>Vevő</th>{L.map(([, l]) => <th class="n">{l}</th>)}<th class="n">Összesen</th><th>Kifizetve</th></tr></thead>
      <tbody>{c.rows.map(({ d, p }) => <tr><td data-l="Vevő"><a href={'#/deal/' + d.id}>{d.cust || 'Névtelen'}</a></td>{L.map(([k, l]) => <td class="n" data-l={l}>{ft(p[k])}</td>)}<td class="n" data-l="Összesen"><b>{ft(p.sum)}</b></td><td data-l="Kifizetve"><input type="checkbox" checked={d.paid} onChange={e => app.updateDeal(d.id, { paid: (e.currentTarget as HTMLInputElement).checked })} aria-label="Kifizetve" /></td></tr>)}</tbody>
      <tfoot><tr><td>Összesen</td>{L.map(([k, l]) => <td class="n" data-l={l}>{ft(c.tot[k])}</td>)}<td class="n" data-l="Összesen">{ft(c.tot.sum)}</td><td /></tr></tfoot></table></div>
      : <p class="note">Ebben a hónapban nincs átadott autó.</p>}
    <h2>Jóváírások</h2>
    {jvs.length ? <div class="scroll"><table class="stack"><thead><tr><th>Vevő</th><th class="n">Jóváírás (nettó)</th><th>Igényelve</th><th>Megérkezett</th></tr></thead><tbody>
      {jvs.map(d => { const r = jvCalc(d.jv); return <tr><td data-l="Vevő"><a href={'#/deal/' + d.id}>{d.cust || 'Névtelen'}</a></td><td class="n" data-l="Jóváírás">{ft(r.net)}</td>
        <td data-l="Igényelve"><Check label="" checked={!!d.jv.claimed} onChange={v => app.updateDeal(d.id, { jv: { ...d.jv, claimed: v, claimedAt: v ? today() : null } })} /></td>
        <td data-l="Megérkezett"><Check label="" checked={!!d.jv.got} onChange={v => app.updateDeal(d.id, { jv: { ...d.jv, got: v } })} /></td></tr>; })}</tbody></table></div>
      : <p class="note">Még nincs jóváírás számítás egyik ügyletnél sem.</p>}
  </section>;
}

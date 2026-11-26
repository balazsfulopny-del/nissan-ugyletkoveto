import { useState } from 'preact/hooks';
import type { App } from '../lib/actions';
import { CATS, ics, JVR, jvCalc, prog, status, tSt, type Deal, type Doc } from '../lib/domain';
import { fmtD, ft, today } from '../lib/util';
import { Check, DateField, Field, toast } from './fields';
import { Bang, go } from './views';
import { download, scanToPdf, shrinkImage } from './files';

export function DealView({ app, id }: { app: App; id: string }) {
  const d = app.deal(id);
  const [sure, setSure] = useState(false);
  const [nt, setNt] = useState(''); const [ntd, setNtd] = useState<string | null>(null);
  if (!d) return <section><p><button class="s" onClick={() => go('#/deals')}>← Ügyletek</button></p><p>Az ügylet nem található (lehet, hogy törölted).</p></section>;
  const st = status(d), ts = app.tasks(id).filter(t => !t.deleted_at), soon = app.settings().data.soon;
  const up = (f: Partial<Deal>) => app.updateDeal(id, f);
  const F = (k: keyof Deal, l: string, ex: any = {}) => <Field label={l} data-f={k} value={d[k] as any} onSave={v => up({ [k]: v } as any)} {...ex} />;
  const N = (k: keyof Deal, l: string) => <Field label={l} data-f={k} num value={d[k] as any} onSave={v => up({ [k]: v } as any)} />;
  const C = (k: keyof Deal, l: string) => <Check label={l} data-f={k} checked={!!d[k]} onChange={v => up({ [k]: v } as any)} />;

  return <section>
    <p><button class="s" data-back onClick={() => go('#/deals')}>← Ügyletek</button></p>
    <div class="row" style="justify-content:space-between"><h1>{d.cust || 'Új ügylet'}</h1>
      <span>{st === 'done' ? <span class="tag ok">Átadva {fmtD(d.handed)}</span> : st === 'cancel' ? <span class="tag off">Elállt</span> : <span class="tag">{prog(ts)}% kész</span>}</span></div>
    <div class="two"><div>
      <fieldset><legend>VEVŐ ÉS AUTÓ</legend><div class="g">
        {F('cust', 'Vevő neve', { autoComplete: 'off' })}{F('phone', 'Telefon', { type: 'tel', inputMode: 'tel' })}{F('cust_email', 'E-mail', { type: 'email', inputMode: 'email' })}{F('cust_addr', 'Cím')}
        {F('model', 'Modell, kivitel', { placeholder: 'pl. Qashqai N-Connecta' })}{F('vin', 'Alvázszám')}{F('offer_no', 'Ajánlatszám (ha van)')}
      </div></fieldset>
      <fieldset><legend>DÁTUMOK</legend><div class="g">
        <DateField label="Szerződéskötés" data-f="contract" value={d.contract} onSave={v => up({ contract: v })} />
        <DateField label="Tervezett átadás" data-f="delivery" value={d.delivery} onSave={v => up({ delivery: v })} quick={[['+1 hét', 7], ['+2 hét', 14], ['+3 hét', 21], ['+1 hónap', 30], ['+2 hónap', 61]]} />
      </div><p class="note">Ha az átadás dátuma változik, a nem kézzel módosított határidők automatikusan átállnak.</p></fieldset>
      <fieldset><legend>ÜGYLET JELLEMZŐI (ezektől függ a feladatlista és a jutalék)</legend>
        <div style="display:grid;gap:8px">{C('ceg', 'A vevő cég')}{C('fin', 'Lízinges / hiteles (nem készpénzes)')}{C('trade', 'Van beszámított autó')}{C('ins', 'Nálunk köt biztosítást')}{C('acc', 'Van kiegészítő')}</div>
        <div class="g" style="margin-top:10px">{N('price', 'Tényleges vételár (Ft)')}{N('downpay', 'Önerő (Ft, lízingnél)')}{N('margin', 'Árrés, jutalékalap (Ft)')}{N('accv', 'Kiegészítők értéke (Ft)')}{N('adj', 'Egyedi jutalék korrekció (Ft, lehet negatív)')}</div>
      </fieldset>
      <Jv app={app} d={d} />
      <Docs app={app} d={d} />
      <fieldset><legend>MEGJEGYZÉS, ÍGÉRET</legend>
        <Field label="Amit megígértél a vevőnek" data-f="promise" multiline value={d.promise} onSave={v => up({ promise: v })} />
        <div style="margin-top:8px"><Field label="Egyéb megjegyzés" data-f="note" multiline value={d.note} onSave={v => up({ note: v })} /></div>
      </fieldset>
    </div><div>
      <fieldset><legend>FELADATOK AZ ÁTADÁSIG</legend>
        {ts.length ? ts.map(t => { const c = st === 'act' ? tSt(t, soon) : ''; return <div key={t.id} class={`task ${t.done ? 'done' : ''} ${c ? 'st-' + c : ''} ${c === 'r' ? 'late' : ''}`}>
          <Bang c={c} />
          <input type="checkbox" aria-label="Kész" data-tk={t.id} checked={t.done} onChange={e => app.tick(t.id, (e.currentTarget as HTMLInputElement).checked)} />
          <div class="t"><b>{t.title}</b>
            {t.sub && <div class="subs">{t.sub.map((x, j) => <label class="ck"><input type="checkbox" checked={x.done} data-sub={t.id} onChange={e => { if (app.tickSub(t.id, j, (e.currentTarget as HTMLInputElement).checked)) toast('Minden papír megvan: ' + t.title); }} />{x.t}</label>)}</div>}
            <span class="m">{t.done ? 'Kész: ' + fmtD(t.done_at) : t.man && t.tpl_key ? 'Kézzel módosított határidő' : ''}</span></div>
          <DateField class="dd" aria-label="Határidő" value={t.due} placeholder="Határidő" onSave={v => app.setDue(t.id, v)} />
          {!t.tpl_key && <button class="s x" style="padding:4px 8px" aria-label="Törlés" onClick={() => app.removeTask(t.id)}>✕</button>}
        </div>; }) : <p class="note">Nincs feladat.</p>}
        <div class="row" style="margin-top:8px"><input id="nt" placeholder="Saját feladat hozzáadása" style="flex:1;margin:0" value={nt} onInput={e => setNt((e.currentTarget as HTMLInputElement).value)} />
          <DateField value={ntd} placeholder="Határidő" onSave={setNtd} aria-label="Új feladat határideje" />
          <button class="s" data-addtask onClick={() => { if (!nt.trim()) return toast('Írd be a feladatot'); app.addTask(id, nt.trim(), ntd); setNt(''); setNtd(null); }}>Hozzáad</button></div>
        <p class="row" style="margin-top:8px"><button class="s" data-ics onClick={() => { const r = ics([{ d, ts }]); if (!r.n) return toast('Nincs nyitott, dátummal rendelkező feladat'); download('hataridok-' + (d.cust || 'ugylet').replace(/[^\wÁ-ű]+/g, '-') + '.ics', new Blob([r.text], { type: 'text/calendar' })); }}>Határidők a naptárba</button></p>
        <p class="note">Naptárfájlt (.ics) ad, ami Google, Outlook és iPhone naptárba is bekerül, előző napi emlékeztetővel. Ha a dátumok változnak, töltsd le újra: a meglévő bejegyzések frissülnek.</p>
      </fieldset>
      <fieldset><legend>ÁTADÁS ÉS JUTALÉK</legend>
        {st === 'done' ? <><div class="g"><DateField label="Átadás napja (ebben a hónapban számol a jutalék)" value={d.handed} onSave={v => up({ handed: v || today() })} /></div>
          <div style="margin-top:8px">{C('paid', 'A jutalékot kifizették')}</div><p class="row" style="margin-top:10px"><button class="s" onClick={() => up({ handed: null, paid: false })}>Átadás visszavonása</button></p></>
          : st === 'cancel' ? <p class="row"><button class="s" onClick={() => up({ cancel: false })}>Visszaállítás folyamatban lévőre</button></p>
            : <><p class="row"><button class="b" data-hand onClick={() => up({ handed: today() })}>Autó átadva</button><button class="s x" onClick={() => up({ cancel: true })}>Vevő elállt</button></p><p class="note">Az átadás után az ügylet bekerül az adott havi jutalékelszámolásba.</p></>}
      </fieldset>
      <p class="row"><button class="s x" data-del onClick={() => { if (!sure) { setSure(true); setTimeout(() => setSure(false), 4000); return; } app.removeDeal(id); go('#/deals'); toast('Ügylet törölve. A Beállításokban visszaállítható.'); }}>{sure ? 'Biztosan törlöd? Koppints újra' : 'Ügylet törlése'}</button></p>
    </div></div>
  </section>;
}

function Jv({ app, d }: { app: App; d: Deal }) {
  const j = d.jv || {}, r = jvCalc(j);
  const set = (k: string, v: any) => app.updateDeal(d.id, { jv: { ...(app.deal(d.id)?.jv || {}), [k]: v } });
  const inp = (k: string) => <Field num value={j[k] ?? null} onSave={v => set(k, v)} aria-label={k} inputMode="decimal" />;
  const pct = (k: string, v: number) => <div class="row" style="flex-wrap:nowrap;gap:4px"><span style="width:70px"><Field num value={j[k] ?? v} onSave={x => set(k, x)} aria-label={'Árrés % ' + k} /></span>%</div>;
  return <fieldset><legend>JÓVÁÍRÁS SZÁMÍTÁS</legend>
    <div class="scroll"><table class="jv"><thead><tr><th class="l" /><th>Nettó számlázási ár (beszerzési számla)</th><th>Nettó jóváírt ár (kampány szerint)</th></tr></thead><tbody>
      {JVR.map(([n, l]) => <>
        <tr class="lab"><td colSpan={3}>{l}</td></tr>
        {n === '4' ? <tr><td class="l">{l}</td><td>{pct('pb', r.B.pct)}<div class="cv">{ft(r.B.r4)}</div></td><td>{pct('pc', r.C.pct)}<div class="cv">{ft(r.C.r4)}</div></td></tr>
          : <tr><td class="l">{l}</td><td>{inp('b' + n)}</td><td>{inp('c' + n)}</td></tr>}</>)}
      <tr class="lab"><td colSpan={3}><b>Összesen</b></td></tr>
      <tr class="sum"><td class="l">Összesen</td><td class="cv">{ft(r.B.sum)}</td><td class="cv">{ft(r.C.sum)}</td></tr>
    </tbody></table></div>
    <div class="jvres"><div><span>Igénylendő jóváírás, nettó</span><br /><b>{ft(r.net)}</b></div><div style="text-align:right"><span>bruttó (× 1,27)</span><br /><b>{ft(r.gross)}</b></div></div>
    <div class="g" style="margin-top:10px"><DateField label="Számla dátuma" value={j.bd || null} onSave={v => set('bd', v)} /><DateField label="Kampány érvényes ettől" value={j.cd || null} onSave={v => set('cd', v)} /></div>
    <div style="display:grid;gap:6px;margin-top:10px"><Check label="Elküldve ellenőrzésre a beszerzési számlával" checked={!!j.sent} onChange={v => set('sent', v)} /><Check label="Jóváírás igényelve" checked={!!j.claimed} onChange={v => set('claimed', v)} /></div>
    <p class="note">A B oszlop a beszerzési (GACE) számláról jön, összesen = a számla nettó végösszege. A C oszlop az eladási kampány és az árlista szerinti nettó ár. Az árrés % mindkét oszlopban külön állítható (alapból 7,5%, ezt még egyeztetni kell). Kedvezményt negatív számként írj be.</p>
  </fieldset>;
}

function Docs({ app, d }: { app: App; d: Deal }) {
  const [cat, setCat] = useState(CATS[0]); const [scan, setScan] = useState<{ url: string; w: number; h: number }[]>([]); const [busy, setBusy] = useState(''); const [view, setView] = useState<{ url: string; doc: Doc; blob: Blob } | null>(null);
  const docs = app.docs(d.id).sort((a, b) => CATS.indexOf(a.kind) - CATS.indexOf(b.kind) || (a.created_at || '').localeCompare(b.created_at || ''));
  const name = () => (cat + ' ' + (d.cust || '')).trim();
  async function save(blob: Blob, nm: string, pages: number | null = null) {
    setBusy('Mentés: ' + nm + '…');
    try { await app.addDoc(d.id, blob, nm, cat, pages); toast('Dokumentum mentve'); } catch (e: any) { toast('A mentés nem sikerült' + (e?.message === 'locked' ? ': zárolva' : '')); }
    setBusy('');
  }
  async function onFiles(fs: FileList | null) {
    for (const f of Array.from(fs || [])) {
      if (/^image\//.test(f.type)) { const x = await shrinkImage(f).catch(() => null); if (x) await save(await (await fetch(x.url)).blob(), f.name.replace(/\.[^.]+$/, '') + '.jpg'); else toast(f.name + ': a képet nem sikerült beolvasni'); }
      else if (f.type === 'application/pdf') { if (f.size > 20 * 1024 * 1024) { toast(f.name + ': túl nagy (max. 20 MB)'); continue; } await save(f, f.name); }
      else toast(f.name + ': csak PDF vagy kép tölthető fel');
    }
  }
  async function open(x: Doc) {
    setBusy('Megnyitás…');
    try { const b = await app.openDoc(x); setView({ url: URL.createObjectURL(b), doc: x, blob: b }); } catch { toast('A dokumentumot nem sikerült megnyitni (internet kell hozzá, ha ezen az eszközön még nem volt megnyitva)'); }
    setBusy('');
  }
  return <fieldset><legend>DOKUMENTUMOK ({docs.length})</legend>
    <div class="g"><label>Dokumentum típusa<select value={cat} onChange={e => setCat((e.currentTarget as HTMLSelectElement).value)}>{CATS.map(c => <option>{c}</option>)}</select></label></div>
    <p class="row" style="margin-top:8px">
      <label class="upl"><span class="b" style="display:inline-block">Szkennelés kamerával</span><input type="file" accept="image/*" capture="environment" hidden onChange={async e => { const f = (e.currentTarget as HTMLInputElement).files?.[0]; (e.currentTarget as HTMLInputElement).value = ''; if (f) { const x = await shrinkImage(f).catch(() => null); if (x) setScan(s => [...s, x]); else toast('A képet nem sikerült beolvasni'); } }} /></label>
      <label class="upl"><span class="s" style="display:inline-block">Fájl feltöltése (PDF, kép)</span><input type="file" accept="image/*,application/pdf" multiple hidden onChange={e => { const fs = (e.currentTarget as HTMLInputElement).files; onFiles(fs).then(() => {}); }} /></label>
    </p>
    {scan.length > 0 && <div class="card" style="margin:8px 0 0"><b>{scan.length} oldal beszkennelve</b><div class="pages">{scan.map(x => <img src={x.url} alt="" />)}</div>
      <p class="row" style="margin-top:8px"><label class="upl"><span class="s" style="display:inline-block">+ Következő oldal</span><input type="file" accept="image/*" capture="environment" hidden onChange={async e => { const f = (e.currentTarget as HTMLInputElement).files?.[0]; (e.currentTarget as HTMLInputElement).value = ''; if (f) { const x = await shrinkImage(f).catch(() => null); if (x) setScan(s => [...s, x]); } }} /></label>
        <button class="b" onClick={async () => { setBusy('PDF készítése…'); const pdf = await scanToPdf(scan); const n = scan.length; setScan([]); await save(pdf, name() + '.pdf', n); }}>Mentés egy PDF-be</button>
        <button class="s x" onClick={() => setScan([])}>Elvetés</button></p></div>}
    {busy && <p class="note">{busy}</p>}
    {docs.length ? <div class="docs">{docs.map(x => <div class="doc" key={x.id}><a href="#" class="pdf" onClick={e => { e.preventDefault(); open(x); }} aria-label="Megnyitás">{/^image\//.test(x.mime) ? 'KÉP' : 'PDF'}</a><div><b>{x.kind}</b>{x.name}<br /><span class="note">{fmtD((x.created_at || '').slice(0, 10)) || 'feltöltés alatt'}</span></div><button onClick={() => { app.removeDoc(x.id); toast('Dokumentum törölve'); }}>Törlés</button></div>)}</div>
      : <p class="note">Még nincs feltöltött dokumentum ehhez az ügylethez.</p>}
    {view && <div id="viewer"><div class="vb"><button class="s" style="color:#fff" onClick={() => download(view.doc.name, view.blob)}>Letöltés</button><button class="b" onClick={() => { URL.revokeObjectURL(view.url); setView(null); }}>Bezárás</button></div>
      <div class="vc">{/^image\//.test(view.doc.mime) ? <img alt="" src={view.url} /> : <iframe title="Dokumentum" src={view.url} />}</div></div>}
  </fieldset>;
}

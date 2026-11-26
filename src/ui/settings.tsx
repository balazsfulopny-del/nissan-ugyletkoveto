import { useState } from 'preact/hooks';
import type { App } from '../lib/actions';
import { BASE, COND, DEF_TPL, type Deal, type Task, type TplStep } from '../lib/domain';
import { unwrap, wrapRaw } from '../lib/crypto';
import { today, uuid } from '../lib/util';
import { Field, toast } from './fields';
import { download } from './files';
import { importOld } from '../lib/migrate';

export function SettingsView({ app, onSignOut, email }: { app: App; onSignOut: () => void; email: string }) {
  const s = app.settings().data, r = s.rules;
  const setR = (k: string, v: any) => app.setData({ rules: { ...app.settings().data.rules, [k]: v ?? 0 } });
  const tpl = s.tpl;
  const setTpl = (i: number, f: Partial<TplStep>) => { const t = app.settings().data.tpl.map((x, j) => j === i ? { ...x, ...f } : x); app.setData({ tpl: t }); };
  const [op, setOp] = useState(''); const [np, setNp] = useState(''); const [np2, setNp2] = useState('');
  const gone = app.st.list<Deal>('deals', true).filter(d => d.deleted_at);

  async function chPin() {
    if (!/^\d{4,6}$/.test(np)) return toast('Az új PIN 4-6 számjegy legyen'); if (np !== np2) return toast('Az új PIN két példánya nem egyezik');
    try { const raw = await unwrap(op, app.settings().pin!); app.setPin(await wrapRaw(np, raw)); setOp(''); setNp(''); setNp2(''); toast('PIN-kód módosítva'); } catch { toast('A jelenlegi PIN hibás'); }
  }
  function backup() {
    const data = { app: 'ugyletkoveto', v: 2, at: new Date().toISOString(), settings: app.settings().data, deals: app.st.list('deals', true), tasks: app.st.list('tasks', true), docs: app.st.list('docs', true) };
    download('ugyletkoveto-mentes-' + today() + '.json', new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
  }
  async function restore(f: File) {
    try {
      const j = JSON.parse(await f.text());
      if (j.app === 'ugyletkoveto' && j.v === 2) {
        (j.deals as Deal[]).forEach(d => app.st.mutate('deals', d.id, d)); (j.tasks as Task[]).forEach(t => app.st.mutate('tasks', t.id, t));
        if (j.settings) app.setData(j.settings); toast(`Visszatöltve: ${j.deals.length} ügylet`);
      } else if (j.deals) { const n = importOld(app, j); toast(`Átvéve a régi appból: ${n} ügylet`); }
      else throw 0;
    } catch { toast('Ez nem érvényes mentésfájl'); }
  }
  const sy = app.st.state;
  return <section>
    <h1>Beállítások</h1>
    <fieldset><legend>FIÓK ÉS SZINKRON</legend>
      <p>Bejelentkezve: <b>{email}</b></p>
      <p class="note">{sy.pending ? `${sy.pending} változás vár feltöltésre. ` : 'Minden változás a felhőben van. '}{sy.files ? `${sy.files} dokumentum vár feltöltésre. ` : ''}{sy.lastSync ? 'Utolsó szinkron: ' + new Date(sy.lastSync).toLocaleTimeString('hu-HU') : ''}{sy.error ? ' Hiba: ' + sy.error : ''}</p>
      <div class="g"><Field label="Neved (a fejlécben)" value={s.name} onSave={v => app.setData({ name: v })} /><Field label="Sárga jelzés ennyi nappal a határidő előtt" num value={s.soon} onSave={v => app.setData({ soon: Math.max(0, Math.min(30, v ?? 3)) })} /></div>
      <p class="row" style="margin-top:10px"><button class="s" onClick={() => app.st.wake()}>Szinkron most</button><button class="s x" onClick={onSignOut}>Kijelentkezés ezen az eszközön</button></p>
    </fieldset>
    <fieldset><legend>PIN-KÓD</legend><div class="g">
      <label>Jelenlegi PIN<input type="password" inputMode="numeric" value={op} onInput={e => setOp((e.currentTarget as HTMLInputElement).value)} /></label>
      <label>Új PIN<input type="password" inputMode="numeric" value={np} onInput={e => setNp((e.currentTarget as HTMLInputElement).value)} /></label>
      <label>Új PIN még egyszer<input type="password" inputMode="numeric" value={np2} onInput={e => setNp2((e.currentTarget as HTMLInputElement).value)} /></label></div>
      <p class="row" style="margin-top:8px"><button class="s" onClick={chPin}>PIN módosítása</button></p></fieldset>
    <fieldset><legend>JUTALÉK SZABÁLYOK (példa értékek, írd át a sajátodra)</legend><div class="g">
      <Field label="Alap autónként (Ft)" num value={r.base} onSave={v => setR('base', v)} />
      <Field label="Árrés része (%)" num value={r.marginPct} onSave={v => setR('marginPct', v)} />
      <Field label="Finanszírozás bónusz (Ft)" num value={r.finBonus} onSave={v => setR('finBonus', v)} />
      <Field label="Biztosítás bónusz (Ft)" num value={r.insBonus} onSave={v => setR('insBonus', v)} />
      <Field label="Kiegészítő (%)" num value={r.accPct} onSave={v => setR('accPct', v)} />
      <Field label="Beszámítás bónusz (Ft)" num value={r.tradeBonus} onSave={v => setR('tradeBonus', v)} /></div>
      <h2>Havi sávok</h2>
      {r.tiers.map((t, i) => <div class="row" style="margin-bottom:6px"><span style="width:120px"><Field num aria-label="Legalább ennyi autó" value={t.min} onSave={v => setR('tiers', r.tiers.map((x, j) => j === i ? { ...x, min: v ?? 0 } : x))} /></span> autótól <span style="width:140px"><Field num aria-label="Ft autónként" value={t.per} onSave={v => setR('tiers', r.tiers.map((x, j) => j === i ? { ...x, per: v ?? 0 } : x))} /></span> Ft/autó <button class="s x" onClick={() => setR('tiers', r.tiers.filter((_, j) => j !== i))}>✕</button></div>)}
      <button class="s" onClick={() => setR('tiers', [...r.tiers, { min: 0, per: 0 }])}>+ Sáv</button>
    </fieldset>
    <fieldset><legend>ÜGYMENET SABLON</legend>
      <p class="note">Új ügyletnél ezekből lesznek a feladatok. A nap: hány nappal a szerződés vagy az átadás után (negatív = előtte). Az al-lista elemeit pontosvesszővel válaszd el, a [ceg] vagy [fin] végű csak cégnél vagy lízingnél jelenik meg.</p>
      {tpl.map((t, i) => <div class="tpl" key={t.id}>
        <span class="tn"><Field aria-label="Feladat" value={t.t} onSave={v => setTpl(i, { t: v })} /></span>
        <select aria-label="Mihez képest" value={t.b} onChange={e => setTpl(i, { b: (e.currentTarget as HTMLSelectElement).value as any })}>{Object.entries(BASE).map(([k, l]) => <option value={k}>{l}</option>)}</select>
        <Field num aria-label="Nap" value={t.o} onSave={v => setTpl(i, { o: v ?? 0 })} />
        <select aria-label="Feltétel" value={t.c} onChange={e => setTpl(i, { c: (e.currentTarget as HTMLSelectElement).value })}>{Object.entries(COND).map(([k, l]) => <option value={k}>{l}</option>)}</select>
        <button class="s x" aria-label="Törlés" onClick={() => app.setData({ tpl: app.settings().data.tpl.filter((_, j) => j !== i) })}>✕</button>
        {t.s && <span class="tn"><Field aria-label="Al-lista" value={t.s} onSave={v => setTpl(i, { s: v })} /></span>}
      </div>)}
      <p class="row"><button class="s" onClick={() => app.setData({ tpl: [...tpl, { id: 'c' + uuid().slice(0, 8), t: 'Új lépés', b: 'a', o: -1, c: 'all', s: '' }] })}>+ Lépés</button>
        <button class="s" onClick={() => { app.setData({ tpl: structuredClone(DEF_TPL) }); toast('Visszaállítva az ügymenetlistára'); }}>Alap ügymenetlista</button>
        <button class="s" onClick={() => { app.deals().forEach(d => app.replan(d.id)); toast('A sablon alkalmazva a folyamatban lévő ügyletekre'); }}>Alkalmazás a meglévő ügyletekre</button></p>
    </fieldset>
    <fieldset><legend>MENTÉS ÉS ÁTKÖLTÖZÉS</legend>
      <p class="note">A felhő mentése mellett letölthetsz egy saját másolatot is. Ugyanitt töltheted be a régi Ügyletkövető mentésfájlját.</p>
      <p class="row"><button class="s" onClick={backup}>Mentés letöltése</button><label class="upl"><span class="s" style="display:inline-block">Mentés vagy régi app fájl betöltése</span><input type="file" accept="application/json,.json" hidden onChange={e => { const f = (e.currentTarget as HTMLInputElement).files?.[0]; (e.currentTarget as HTMLInputElement).value = ''; if (f) restore(f); }} /></label></p>
    </fieldset>
    {gone.length > 0 && <fieldset><legend>TÖRÖLT ÜGYLETEK</legend>{gone.map(d => <div class="row" style="justify-content:space-between;margin-bottom:6px"><span>{d.cust || 'Névtelen'} · {d.model}</span><button class="s" onClick={() => { app.restoreDeal(d.id); toast('Visszaállítva'); }}>Visszaállítás</button></div>)}</fieldset>}
  </section>;
}

import { useEffect, useRef, useState } from 'preact/hooks';
import { addD, fmtD, fmtPhone, fmtThousands, numv, parseDate, today } from '../lib/util';

/* Inputs keep their own text while the person types; the value is saved after a short pause,
   on leaving the field and when the app goes to the background. A sync arriving meanwhile
   never replaces what is being typed. */
const flushers = new Set<() => void>();
export const flushAll = () => flushers.forEach(f => f());
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushAll(); });
  window.addEventListener('pagehide', flushAll);
}

type TP = { value: string | number | null; onSave: (v: any) => void; label?: string; type?: string; multiline?: boolean; num?: boolean; money?: boolean; phone?: boolean; placeholder?: string; inputMode?: string; autoComplete?: string; class?: string; 'data-f'?: string; 'aria-label'?: string };
export function Field(p: TP) {
  const fmt = p.money ? fmtThousands : p.phone ? fmtPhone : null;
  const show = (v: any) => v == null ? '' : fmt ? fmt(String(v)) : String(v);
  const shown = show(p.value);
  const [txt, setTxt] = useState(shown);
  const dirty = useRef(false), focused = useRef(false), timer = useRef<any>(null), last = useRef(p.onSave);
  last.current = p.onSave;
  const commit = () => { clearTimeout(timer.current); timer.current = null; if (!dirty.current) return; dirty.current = false; const v = cur.current; last.current(p.num || p.money ? numv(v) : p.phone ? (v.replace(/\D/g, '').length <= 2 ? '' : v.trim()) : v); };
  const cur = useRef(txt); cur.current = txt;
  useEffect(() => { flushers.add(commit); return () => { flushers.delete(commit); commit(); }; }, []);
  // take outside changes (other device) only when nothing is being typed here
  useEffect(() => { if (!dirty.current && !focused.current) setTxt(shown); }, [shown]);
  const onInput = (e: any) => {
    const el = e.currentTarget as HTMLInputElement; let v = el.value;
    if (fmt) { // reformat and keep the caret after the same number of digits
      const pos = el.selectionStart ?? v.length, nd = v.slice(0, pos).replace(/\D/g, '').length, f = fmt(v);
      if (f !== v) { v = f; el.value = f; let i = 0, c = 0; if (nd) { while (i < f.length) { if (/\d/.test(f[i])) c++; i++; if (c === nd) break; } } else i = p.phone ? Math.min(4, f.length) : 0; try { el.setSelectionRange(i, i); } catch { } }
    }
    setTxt(v); cur.current = v; dirty.current = true; clearTimeout(timer.current); timer.current = setTimeout(commit, 500); };
  const common = { value: txt, onInput, onFocus: (e: any) => { focused.current = true; if (p.phone && !e.currentTarget.value) { setTxt('+36 '); cur.current = '+36 '; } }, onBlur: () => { focused.current = false; commit(); if (!dirty.current) setTxt(show(p.value)); }, placeholder: p.placeholder, 'aria-label': p['aria-label'], 'data-f': p['data-f'], class: p.class } as any;
  const el = p.multiline ? <textarea {...common} /> : <input {...common} type={p.type || 'text'} inputMode={(p.inputMode || (p.num || p.money ? 'decimal' : p.phone ? 'tel' : undefined)) as any} autoComplete={p.autoComplete || 'off'} />;
  return p.label ? <label>{p.label}{el}</label> : el;
}

export function Check(p: { label: string; checked: boolean; onChange: (v: boolean) => void; 'data-f'?: string }) {
  return <label class="ck"><input type="checkbox" checked={p.checked} data-f={p['data-f']} onChange={e => p.onChange((e.currentTarget as HTMLInputElement).checked)} />{p.label}</label>;
}

/* ---------- own date picker: same in every browser, no keyboard pops up ---------- */
type DPReq = { title: string; value: string | null; quick: [string, number][]; done: (v: string | null) => void };
let openDP: (r: DPReq) => void = () => {};
export function DateField(p: { value: string | null; onSave: (v: string | null) => void; label?: string; placeholder?: string; quick?: [string, number][]; class?: string; 'data-f'?: string; 'aria-label'?: string }) {
  const btn = <button type="button" class={'dpi ' + (p.class || '')} data-f={p['data-f']} data-v={p.value || ''} aria-label={p['aria-label'] || p.label}
    onClick={() => openDP({ title: p.label || p['aria-label'] || 'Dátum', value: p.value, quick: p.quick || [['Ma', 0], ['Holnap', 1], ['+1 hét', 7]], done: p.onSave })}>
    {p.value ? fmtD(p.value) : <span class="ph">{p.placeholder || 'Válassz dátumot'}</span>}</button>;
  return p.label ? <label>{p.label}{btn}</label> : btn;
}
const MON = ['január', 'február', 'március', 'április', 'május', 'június', 'július', 'augusztus', 'szeptember', 'október', 'november', 'december'];
export function DatePicker() {
  const [r, setR] = useState<DPReq | null>(null); const [m, setM] = useState(''); const [typed, setTyped] = useState(''); const [err, setErr] = useState('');
  openDP = (q) => { setR(q); setM((q.value || today()).slice(0, 7)); setTyped(''); setErr(''); };
  useEffect(() => { if (!r) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setR(null); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [r]);
  if (!r) return null;
  const pick = (v: string | null) => { const d = r.done; setR(null); d(v); };
  const [y, mm] = m.split('-').map(Number);
  const off = (new Date(y, mm - 1, 1).getDay() + 6) % 7, n = new Date(y, mm, 0).getDate(), t = today();
  const move = (k: number) => { const d = new Date(y, mm - 1 + k, 1); setM(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); };
  const days = []; for (let i = 0; i < off; i++) days.push(<span />);
  for (let d = 1; d <= n; d++) { const iso = y + '-' + String(mm).padStart(2, '0') + '-' + String(d).padStart(2, '0'), wd = (off + d - 1) % 7; days.push(<button type="button" data-dpd={iso} class={[iso === r.value && 'sel', iso === t && 'td', wd > 4 && 'we'].filter(Boolean).join(' ')} onClick={() => pick(iso)}>{d}</button>); }
  const ok = () => { const v = parseDate(typed); if (!v) return setErr('Formátum: 2026.12.20'); pick(v); };
  return <div id="dp" onClick={e => { if ((e.target as HTMLElement).id === 'dp') setR(null); }}>
    <div class="sh" role="dialog" aria-label="Dátum választása">
      <p class="note" style="margin:0 0 6px">{r.title}</p>
      <div class="hd"><button type="button" data-dpm="-1" aria-label="Előző hónap" onClick={() => move(-1)}>‹</button><b>{y}. {MON[mm - 1]}</b><button type="button" data-dpm="1" aria-label="Következő hónap" onClick={() => move(1)}>›</button></div>
      <div class="wk">{['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'].map(x => <span>{x}</span>)}</div>
      <div class="dd2">{days}</div>
      <div class="q">{r.quick.map(([l, k]) => <button type="button" class="s" data-dpq={k} onClick={() => pick(addD(t, k))}>{l}</button>)}</div>
      <div class="ty"><input id="dpin" inputMode="numeric" placeholder="vagy írd be: 2026.12.20" aria-label="Dátum beírása" value={typed} onInput={e => { setTyped((e.currentTarget as HTMLInputElement).value); setErr(''); }} onKeyDown={e => { if (e.key === 'Enter') ok(); }} /><button type="button" class="s" data-dpok onClick={ok}>OK</button></div>
      {err && <p class="err-t">{err}</p>}
      <p class="row" style="margin:10px 0 0;justify-content:space-between"><button type="button" class="s x" data-dpclr onClick={() => pick(null)}>Dátum törlése</button><button type="button" class="b" data-dpx onClick={() => setR(null)}>Mégse</button></p>
    </div></div>;
}

/* ---------- toast ---------- */
let showToast: (t: string) => void = () => {};
export const toast = (t: string) => showToast(t);
export function Toast() {
  const [t, setT] = useState(''); const h = useRef<any>(null);
  showToast = (x) => { setT(x); clearTimeout(h.current); h.current = setTimeout(() => setT(''), 2800); };
  return t ? <div id="msg" role="status">{t}</div> : null;
}

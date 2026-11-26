import { useEffect, useRef, useState } from 'preact/hooks';
import type { App } from '../lib/actions';
import { newRaw, unwrap, useRaw, wrapRaw } from '../lib/crypto';

/* PIN screen. First start: set a PIN (it creates the document key). Later: unlock.
   Locks again after 5 minutes idle or more than 1 minute in the background. */
export function Lock({ app, onOpen }: { app: App; onOpen: () => void }) {
  const pin = app.settings().pin;
  const [mode, setMode] = useState<'set' | 'set2' | 'unlock' | 'busy'>(pin ? 'unlock' : 'set');
  const [buf, setBuf] = useState(''); const [first, setFirst] = useState(''); const [err, setErr] = useState('');
  const fails = useRef(0), waitTill = useRef(0); const [sure, setSure] = useState(false);
  useEffect(() => { if (mode === 'set' && pin) setMode('unlock'); }, [!!pin]);
  const len = mode === 'unlock' && pin ? pin.len || 6 : Math.max(4, buf.length);

  async function submit(b: string) {
    if (b.length < 4) { if (b.length) setErr('Legalább 4 számjegy kell'); return; }
    if (mode === 'set') { setFirst(b); setBuf(''); setMode('set2'); return; }
    if (mode === 'set2') {
      if (b !== first) { setBuf(''); setMode('set'); setErr('A két PIN nem egyezik, kezdd újra'); return; }
      setMode('busy'); const raw = newRaw(); app.setPin(await wrapRaw(b, raw)); app.key = await useRaw(raw); setBuf(''); onOpen(); return;
    }
    if (mode === 'unlock') {
      if (Date.now() < waitTill.current) { setBuf(''); setErr('Túl sok próbálkozás, várj ' + Math.ceil((waitTill.current - Date.now()) / 1000) + ' mp-et'); return; }
      setMode('busy');
      try { app.key = await useRaw(await unwrap(b, app.settings().pin!)); fails.current = 0; setBuf(''); onOpen(); }
      catch { fails.current++; setBuf(''); setMode('unlock'); if (fails.current >= 5) waitTill.current = Date.now() + 30000 * (fails.current - 4); setErr(fails.current >= 5 ? 'Hibás PIN. Várj ' + 30 * (fails.current - 4) + ' mp-et' : 'Hibás PIN-kód'); }
    }
  }
  function key(k: string) {
    if (mode === 'busy') return;
    if (k !== 'ok') setErr('');
    if (k === 'del') return setBuf(buf.slice(0, -1));
    if (/^\d$/.test(k)) { if (buf.length >= 6) return; const b = buf + k; setBuf(b); if (mode === 'unlock' && pin && b.length === (pin.len || 6)) submit(b); return; }
    if (k === 'ok') submit(buf);
  }
  useEffect(() => { const h = (e: KeyboardEvent) => { if (/^\d$/.test(e.key)) key(e.key); else if (e.key === 'Backspace') key('del'); else if (e.key === 'Enter') key('ok'); }; addEventListener('keydown', h); return () => removeEventListener('keydown', h); });
  const T = { set: ['PIN-kód beállítása', 'Adj meg egy 4-6 számjegyű PIN-kódot. Ezzel nyílik az app, és ez titkosítja a dokumentumokat.'], set2: ['PIN-kód még egyszer', 'Ismételd meg a PIN-kódot.'], unlock: ['Ügyletkövető zárolva', 'Add meg a PIN-kódodat.'], busy: ['Ellenőrzés…', ''] }[mode];
  return <div id="lock">
    <img alt="Nissan" src="./logo.png" /><h2 id="lt">{T[0]}</h2><p id="ls">{T[1]}</p>
    {mode !== 'busy' && <div class="dots">{Array.from({ length: len }, (_, i) => <i class={i < buf.length ? 'f' : ''} />)}</div>}
    <p class="err" id="le" role="alert">{err}</p>
    {mode !== 'busy' && <div class="pad" id="lp">{['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'].map(k => <button type="button" data-k={k} class={k.length > 1 ? 'sm' : ''} onClick={() => key(k)}>{k === 'del' ? 'Törlés' : k === 'ok' ? 'OK' : k}</button>)}</div>}
    {mode === 'unlock' && <a href="#" onClick={e => { e.preventDefault(); if (!sure) return setSure(true); setSure(false); app.setPin(null); setMode('set'); setBuf(''); }}>{sure ? 'Új PIN beállítása: a titkosított dokumentumok nem lesznek többé megnyithatók. Koppints újra a folytatáshoz.' : 'Elfelejtettem a PIN-t'}</a>}
  </div>;
}

export function useAutoLock(locked: boolean, lock: () => void) {
  useEffect(() => {
    if (locked) return;
    let last = Date.now(), hiddenAt = 0;
    const act = () => { last = Date.now(); };
    const vis = () => { if (document.hidden) hiddenAt = Date.now(); else if (hiddenAt && Date.now() - hiddenAt > 60000) lock(); };
    const iv = setInterval(() => { if (Date.now() - last > 5 * 60000) lock(); }, 15000);
    ['pointerdown', 'keydown', 'touchstart'].forEach(t => addEventListener(t, act, { passive: true }));
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(iv); ['pointerdown', 'keydown', 'touchstart'].forEach(t => removeEventListener(t, act)); document.removeEventListener('visibilitychange', vis); };
  }, [locked]);
}

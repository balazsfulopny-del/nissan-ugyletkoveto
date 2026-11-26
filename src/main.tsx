import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import './style.css';
import { SUPABASE_KEY, SUPABASE_URL } from './config';
import { Store, type Backend, type LocalDB } from './lib/store';
import { idbLocal, memLocal } from './lib/localdb';
import { supabaseBackend } from './lib/backend-supabase';
import { App } from './lib/actions';
import { DatePicker, Toast, flushAll } from './ui/fields';
import { Lock, useAutoLock } from './ui/lock';
import { Login } from './ui/login';
import { Comm, Deals, Today } from './ui/views';
import { DealView } from './ui/deal';
import { SettingsView } from './ui/settings';

type Ctx = { app: App; email: string; signOut: () => void };

function useHash() { const [h, setH] = useState(location.hash); useEffect(() => { const f = () => { setH(location.hash); scrollTo(0, 0); }; addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []); return h; }

function Shell({ ctx }: { ctx: Ctx }) {
  const { app } = ctx; const [, force] = useState(0); const [locked, setLocked] = useState(true);
  // subscribe, then re-render once: changes that happened before this mounted must not be missed
  useEffect(() => { const off = app.st.on(() => force(x => x + 1)); force(x => x + 1); return off; }, []);
  useAutoLock(locked, () => { flushAll(); app.key = null; setLocked(true); });
  const h = useHash(); const page = h.split('/')[1] || 'today';
  const st = app.st.state, s = app.settings();
  const ready = st.loaded && (st.pulled || !!app.st.get('settings', app.uid)); // never offer a new PIN before the real settings are known
  useEffect(() => { if (st.pulled) app.ensureSettings(); }, [st.pulled]);
  const syncTxt = !st.online ? `Offline${st.pending ? `, ${st.pending} változás vár` : ''}` : st.error ? 'Mentési hiba, újrapróbálom' : st.pending || st.files ? 'Mentés…' : st.lastSync ? 'Felhőben mentve' : 'Kapcsolódás…';
  if (!ready) return <div id="lock"><img alt="Nissan" src="./logo.png" /><h2>Betöltés…</h2><p>{st.online ? '' : 'Nincs internet. Az első indításhoz kapcsolat kell.'}</p></div>;
  if (locked) return <Lock app={app} onOpen={() => setLocked(false)} />;
  const tab = (p: string, icon: string, label: string) => <button data-p={p} class={page === p || (p === 'deals' && page === 'deal') ? 'on' : ''} onClick={() => { location.hash = '#/' + p; }}><i>{icon}</i>{label}</button>;
  return <>
    <header><div class="hw"><img alt="Nissan" src="./logo.png" /><div><b>Ügyletkövető</b><small>{s.data.name || 'Feladatok a szerződéstől az átadásig, jutalék'}</small></div><span class="sp" /><span id="sync" class={st.online ? '' : 'off'}>{syncTxt}</span></div></header>
    <nav>{tab('today', '●', 'Teendők')}{tab('deals', '▤', 'Ügyletek')}{tab('comm', 'Ft', 'Jutalék')}{tab('set', '⚙', 'Beállítások')}</nav>
    <main>
      {page === 'today' && <Today app={app} />}
      {page === 'deals' && <Deals app={app} />}
      {page === 'deal' && <DealView key={h.split('/')[2]} app={app} id={h.split('/')[2]} />}
      {page === 'comm' && <Comm app={app} />}
      {page === 'set' && <SettingsView app={app} email={ctx.email} onSignOut={ctx.signOut} />}
    </main>
    <DatePicker /><Toast />
  </>;
}

async function makeCtx(uid: string, email: string, be: Backend | null, local: LocalDB, signOut: () => void): Promise<Ctx> {
  const st = new Store(local, be); const app = new App(st, uid);
  st.start();
  const wake = () => st.wake();
  addEventListener('online', wake); document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
  addEventListener('offline', () => { st.state = { ...st.state, online: false }; });
  (window as any).__app = app;
  return { app, email, signOut };
}

function Root() {
  const [ctx, setCtx] = useState<Ctx | null>(null); const [sb, setSb] = useState<SupabaseClient | null>(null); const [need, setNeed] = useState<'login' | 'setup' | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    // test mode: a fake server over WebSocket (only on localhost)
    if (q.get('be') && /^(localhost|127\.0\.0\.1|app\.test)$/.test(location.hostname)) {
      import('./lib/backend-ws').then(async m => { const uid = q.get('uid') || '00000000-0000-4000-a000-000000000001'; const be = await m.wsBackend(q.get('be')!); setCtx(await makeCtx(uid, 'teszt@pelda.hu', be, q.get('mem') ? memLocal() : await idbLocal(uid + (q.get('dev') || '')), () => {})); });
      return;
    }
    if (!SUPABASE_URL) { setNeed('setup'); return; }
    const c = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'ugyletkoveto-auth' } }); setSb(c);
    let cur = '';
    const use = async (s: any) => {
      if (!s) { cur = ''; setCtx(null); setNeed('login'); return; }
      if (cur === s.user.id) return; cur = s.user.id; setNeed(null);
      const signOut = async () => { flushAll(); await c.auth.signOut({ scope: 'local' }); location.hash = ''; location.reload(); };
      setCtx(await makeCtx(s.user.id, s.user.email || '', supabaseBackend(c, s.user.id), await idbLocal(s.user.id), signOut));
    };
    c.auth.getSession().then(({ data }) => use(data.session));
    c.auth.onAuthStateChange((_e, s) => { if (s || _e === 'SIGNED_OUT') use(s); });
  }, []);
  if (ctx) return <Shell ctx={ctx} />;
  if (need === 'login' && sb) return <Login sb={sb} />;
  if (need === 'setup') return <div id="lock"><img alt="Nissan" src="./logo.png" /><h2>Beállítás szükséges</h2><p>Az adatbázis címe még nincs megadva.</p></div>;
  return <div id="lock"><img alt="Nissan" src="./logo.png" /><h2>Betöltés…</h2></div>;
}

render(<Root />, document.getElementById('root')!);
if ('serviceWorker' in navigator && location.protocol === 'https:' && !/localhost|app\.test/.test(location.hostname)) navigator.serviceWorker.register('./sw.js').catch(() => {});

import { useState } from 'preact/hooks';
import type { SupabaseClient } from '@supabase/supabase-js';

export function Login({ sb }: { sb: SupabaseClient }) {
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function go(e: Event) {
    e.preventDefault(); setBusy(true); setErr('');
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: pw });
    setBusy(false);
    if (error) setErr(/invalid/i.test(error.message) ? 'Hibás e-mail cím vagy jelszó' : /fetch|network/i.test(error.message) ? 'Nincs internet. Az első belépéshez kapcsolat kell.' : 'A belépés nem sikerült: ' + error.message);
  }
  return <div id="lock"><img alt="Nissan" src="./logo.png" /><h2>Ügyletkövető</h2><p>Lépj be egyszer ezen az eszközön. Utána a PIN-kóddal nyílik.</p>
    <form onSubmit={go} style="display:grid;gap:10px;width:min(320px,100%)">
      <input type="email" autoComplete="username" placeholder="E-mail cím" value={email} onInput={e => setEmail((e.currentTarget as HTMLInputElement).value)} required />
      <input type="password" autoComplete="current-password" placeholder="Jelszó" value={pw} onInput={e => setPw((e.currentTarget as HTMLInputElement).value)} required />
      <button class="b" disabled={busy}>{busy ? 'Belépés…' : 'Belépés'}</button>
    </form><p class="err" role="alert">{err}</p></div>;
}

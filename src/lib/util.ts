export const iso = (d: Date | number | string) => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
export const today = () => iso(new Date());
export const addD = (s: string | null | undefined, n: number) => { if (!s) return null; const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };
export const diff = (a: string, b: string) => Math.round((+new Date(a + 'T12:00:00') - +new Date(b + 'T12:00:00')) / 864e5);
export const fmtD = (s?: string | null) => { if (!s) return ''; const d = new Date(s + 'T12:00:00'); return isNaN(+d) ? s : d.getFullYear() + '. ' + d.toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleDateString('hu-HU', { weekday: 'short' }); };
export const hd = (s?: string | null) => { if (!s) return 'nincs dátum'; return new Date(s + 'T12:00:00').toLocaleDateString('hu-HU', { month: 'short', day: 'numeric', weekday: 'short' }); };
export const ft = (n: unknown) => Math.round(+(n as number) || 0).toLocaleString('hu-HU') + ' Ft';
/** parse a typed number; '' or junk or absurd values become null */
export const numv = (v: unknown): number | null => { if (v === '' || v == null) return null; const n = +String(v).replace(/\s/g, '').replace(',', '.'); return !isFinite(n) || Math.abs(n) > 1e11 ? null : n; };
export const uuid = () => crypto.randomUUID();
/** parse "2026.12.20", "2026-12-20", "2026. 12. 20." → ISO or null */
export const parseDate = (t: string): string | null => { const m = t.trim().match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})/); if (!m) return null; const v = m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0'); const d = new Date(v + 'T12:00:00'); return isNaN(+d) || iso(d) !== v ? null : v; };

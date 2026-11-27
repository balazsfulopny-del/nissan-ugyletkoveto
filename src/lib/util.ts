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

/** "1250000" → "1 250 000" (keeps a leading minus and decimals) while typing */
export function fmtThousands(s: string) {
  const t = String(s ?? '').replace(/[\s ]/g, '');
  const m = t.match(/^(-?)(\d*)([.,]\d*)?/); if (!m) return t;
  const [, sign, int, dec] = m; if (!int && !dec) return sign;
  return sign + int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (dec ? ',' + dec.slice(1).replace(/\D/g, '') : '');
}
/** Hungarian phone format: +36 30 123 4567, Budapest +36 1 234 5678; foreign numbers stay as typed */
export function fmtPhone(s: string) {
  const raw = String(s ?? '').trim(); if (!raw) return '';
  let rest: string;
  if (raw.startsWith('+36')) rest = raw.slice(3); else if (raw.startsWith('0036')) rest = raw.slice(4);
  else if (raw.startsWith('+') || raw.startsWith('00')) return raw;                    // foreign number
  else rest = raw.replace(/\D/g, '').length >= 11 && raw.startsWith('36') ? raw.slice(2) : raw;
  if (/^\s*\+3?$/.test(rest)) return '+36 ' + rest.trim();                                  // typing "+36" again after the prefix
  rest = rest.replace(/^\s*\+36/, '');                                                   // "+36" typed again after the prefix
  let d = rest.replace(/\D/g, '');
  if (d === '0' || d === '06') return '+36 ' + d;                                        // still typing the 06
  if (d.startsWith('06')) d = d.slice(2); else if (d.startsWith('0')) d = d.slice(1);
  if (!d) return '+36 ';
  const a = d[0] === '1' ? 1 : 2, area = d.slice(0, a), r = d.slice(a, a + 7);
  return '+36 ' + [area, r.slice(0, 3), r.slice(3, 7)].filter(Boolean).join(' ');
}

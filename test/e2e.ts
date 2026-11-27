/* Browser test: two devices (phone + laptop) on one fake cloud with a bad network. Run: npx tsx test/e2e.ts */
import { chromium, devices, type Page } from 'playwright';
import { start } from './server';
import { writeFileSync, readFileSync } from 'fs';

const R: [boolean, string, string?][] = [];
const log = (ok: boolean, name: string, info = '') => { R.push([ok, name, info]); console.log((ok ? 'OK   ' : 'HIBA ') + name + (info ? '  [' + info + ']' : '')); };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const BASE = 'http://localhost:5180/?be=ws://localhost:5180';
const ctl = async (q = '') => (await fetch('http://localhost:5180/ctl?' + q)).json();
async function until(f: () => Promise<boolean>, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await f()) return true; } catch { } await sleep(150); } return false; }

(async () => {
  const { close } = await start();
  const br = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const errs: Record<string, string[]> = { A: [], B: [] };
  const mk = async (name: string, opts: any) => { const c = await br.newContext({ ...opts, acceptDownloads: true }); const p = await c.newPage(); p.on('pageerror', e => errs[name].push(String(e))); p.on('console', m => { if (m.type() === 'error') errs[name].push(m.text()); }); await p.goto(BASE + '&dev=' + name); return p; };
  const A = await mk('A', { ...devices['Pixel 7'] });
  const B = await mk('B', { viewport: { width: 1280, height: 900 } });
  const pin = async (p: Page, code: string, ok = true) => { for (const k of code) await p.click(`#lp [data-k="${k}"]`); if (ok) await p.click('#lp [data-k="ok"]').catch(() => { }); };

  await A.waitForSelector('#lt'); log((await A.textContent('#lt')) === 'PIN-kód beállítása', 'Telefon: PIN beállítás első induláskor');
  await pin(A, '2580'); await pin(A, '2580');
  log(await until(async () => !!(await A.$('nav'))), 'Telefon: PIN után megnyílik');
  log(await until(async () => (await B.textContent('#lt').catch(() => '')) === 'Ügyletkövető zárolva'), 'Gép: a beállított PIN-t kéri');
  await pin(B, '1111', false); await sleep(1500);
  log(((await B.textContent('#le')) || '').includes('Hibás'), 'Gép: hibás PIN elutasítva');
  await pin(B, '2580', false); log(await until(async () => !!(await B.$('nav'))), 'Gép: helyes PIN-nel nyílik');

  // new deal on the phone, typed fast
  await A.click('nav [data-p=deals]'); await A.click('[data-new]');
  const vals: Record<string, string> = { cust: 'Kovács <b>Anna</b> "teszt" & \'x\'', phone: '+36 30 555 1234', model: 'Qashqai 😀 N-Connecta', vin: 'SJNFAAJ11U0000001' };
  for (const [f, v] of Object.entries(vals)) { await A.tap(`input[data-f=${f}]`); await A.keyboard.type(v, { delay: 8 }); }
  await A.tap('[data-f=delivery]'); log(await A.isVisible('#dp'), 'Átadás mezőre koppintva megnyílik a naptár');
  log(await A.evaluate(() => document.activeElement?.tagName !== 'INPUT'), 'Nem jön fel a billentyűzet a dátumnál');
  const v1 = await A.$$eval('input[data-f=cust],input[data-f=phone]', x => x.map(e => (e as HTMLInputElement).value)); log(v1[0] === vals.cust && v1[1] === vals.phone, 'Beírt ügyféladat megmarad a naptár megnyitásakor', v1.join(' | '));
  await A.tap('#dp [data-dpm="1"]'); await A.tap('#dp [data-dpd$="-20"]');
  const dv = await A.getAttribute('[data-f=delivery]', 'data-v'); log(/^\d{4}-\d\d-20$/.test(dv || ''), 'Dátum kiválasztva', dv || '');
  const v2 = await A.$$eval('input[data-f=cust],input[data-f=phone]', x => x.map(e => (e as HTMLInputElement).value)); log(v2[0] === vals.cust && v2[1] === vals.phone, 'Ügyféladat megmarad dátumválasztás után');
  const due = await A.$$eval('.task .dd', x => x.filter(e => (e as HTMLElement).dataset.v).length), all = await A.$$eval('.task .dd', x => x.length); log(all > 10 && due === all, 'Minden feladat kapott határidőt', due + '/' + all);
  await A.tap('[data-f=contract]'); await A.fill('#dpin', '2026.11.3'); await A.tap('#dp [data-dpok]'); log((await A.getAttribute('[data-f=contract]', 'data-v')) === '2026-11-03', 'Dátum beírása szöveggel');
  await A.tap('textarea[data-f=note]'); await A.keyboard.type('Hosszú megjegyzés '.repeat(30)); await A.tap('textarea[data-f=promise]');
  log(!(await A.$('h1 b')), 'XSS: HTML a névben nem értelmeződik');
  // amounts, phone, trade-in
  await A.tap('input[data-f=price]'); await A.keyboard.type('1250000', { delay: 15 });
  log((await A.inputValue('input[data-f=price]')) === '1 250 000', 'Összeg ezres tagolással gépelés közben', await A.inputValue('input[data-f=price]'));
  await A.fill('input[data-f=phone]', ''); await A.tap('input[data-f=cust]'); await A.tap('input[data-f=phone]');
  log((await A.inputValue('input[data-f=phone]')) === '+36 ', 'Telefon mező +36 előtaggal indul');
  await A.keyboard.type('06305551234', { delay: 15 });
  log((await A.inputValue('input[data-f=phone]')) === '+36 30 555 1234', 'Telefonszám magyar tagolással', await A.inputValue('input[data-f=phone]'));
  log(!(await A.$('input[data-f=trade_model]')), 'Beszámítás mezői rejtve, amíg nincs bepipálva');
  await A.tap('input[data-f=trade]');
  log(await until(async () => !!(await A.$('input[data-f=trade_model]'))), 'Beszámítás pipára megjelennek a mezők');
  await A.tap('input[data-f=trade_model]'); await A.keyboard.type('Opel Astra 1.4', { delay: 10 });
  await A.tap('input[data-f=trade_year]'); await A.keyboard.type('2017', { delay: 10 });
  await A.tap('input[data-f=trade_km]'); await A.keyboard.type('145000', { delay: 10 });
  await A.tap('input[data-f=trade_price]'); await A.keyboard.type('3200000', { delay: 10 });
  await A.tap('input[data-f=cust]');
  log(await until(async () => { const d = (await ctl()).deals[0]; return d && d.price === 1250000 && d.phone === '+36 30 555 1234' && d.trade_model === 'Opel Astra 1.4' && d.trade_year === 2017 && d.trade_km === 145000 && d.trade_price === 3200000; }), 'Összeg, telefon és beszámítás a felhőben');
  const ok1 = await until(async () => { const s = await ctl(); const d = s.deals[0]; return d && d.cust === vals.cust && d.phone === vals.phone && d.model === vals.model && d.vin === vals.vin && d.note.length > 400 && s.tasks.length > 10; });
  log(ok1, 'Minden beírt adat és feladat a felhőben');

  await B.click('nav [data-p=deals]');
  log(await until(async () => (await B.$$eval('.deal b', x => x.map(e => e.textContent))).some(t => t?.includes('Kovács <b>Anna</b>'))), 'Gép: az új ügylet megjelent');
  const id = (await ctl()).deals[0].id; await B.click(`[data-open="${id}"]`);
  // both edit different fields at once
  await A.fill('input[data-f=phone]', '+36 70 111 2222'); await B.fill('input[data-f=model]', 'Juke Hybrid');
  await A.press('input[data-f=phone]', 'Tab'); await B.press('input[data-f=model]', 'Tab');
  log(await until(async () => { const d = (await ctl()).deals[0]; return d.phone === '+36 70 111 2222' && d.model === 'Juke Hybrid'; }), 'Egyidejű szerkesztés két eszközön');
  log(await until(async () => (await A.inputValue('input[data-f=model]')) === 'Juke Hybrid' && (await B.inputValue('input[data-f=phone]')) === '+36 70 111 2222'), 'Mindkét eszköz látja a másik módosítását');

  // typing on one device while the other's change arrives
  await B.click('input[data-f=vin]'); await B.press('input[data-f=vin]', 'End'); await B.keyboard.type('XYZ', { delay: 30 });
  await A.fill('input[data-f=cust]', 'Kovács Anna'); await A.press('input[data-f=cust]', 'Tab');
  await sleep(1200); await B.keyboard.type('123', { delay: 30 });
  log((await B.inputValue('input[data-f=vin]')).endsWith('XYZ123'), 'Gépelés közben érkező szinkron nem viszi el a beírt szöveget', await B.inputValue('input[data-f=vin]'));
  await B.press('input[data-f=vin]', 'Tab');
  log(await until(async () => (await ctl()).deals[0].vin.endsWith('XYZ123') && (await ctl()).deals[0].cust === 'Kovács Anna'), 'Mindkét változás a felhőben');

  // rapid ticks on a bad network
  await ctl('fail=0.3&lat=30,600&lostAck=0.15');
  const boxes = A.locator('.task input[type=checkbox][data-tk]'); for (let i = 0; i < 6; i++) { await boxes.nth(i).tap(); console.log('   tick', i, await A.$$eval('.task input[data-tk]', x => x.map(e => (e as HTMLInputElement).checked ? 1 : 0).join(''))); }
  await ctl('fail=0&lat=0,0&lostAck=0');
  log(await until(async () => (await ctl()).tasks.filter((t: any) => t.done).length === 6, 20000), 'Rossz hálózat: 6 gyors pipa mind a felhőben', String((await ctl()).tasks.filter((t: any) => t.done).length) + ' / local ' + await A.$$eval('.task input[data-tk]:checked', x => x.length));
  log(await until(async () => (await B.$$eval('.task input[data-tk]:checked', x => x.length)) === 6), 'Gép: a pipák megjelentek');

  // offline on the phone, then the app is closed and reopened
  await ctl('down=1');
  await A.fill('textarea[data-f=promise]', 'Téli gumi ajándékba'); await A.press('textarea[data-f=promise]', 'Tab');
  await boxes.nth(6).tap(); await sleep(800);
  log(((await A.textContent('#sync')) || '').startsWith('Offline'), 'Telefon: offline jelzés', await A.textContent('#sync') || '');
  await A.reload(); await pin(A, '2580', false);
  log(await until(async () => !!(await A.$('textarea[data-f=promise]'))) && (await A.inputValue('textarea[data-f=promise]')) === 'Téli gumi ajándékba', 'Offline szerkesztés megmarad újraindítás után');
  await ctl('down=0');
  log(await until(async () => { const s = await ctl(); return s.deals[0].promise === 'Téli gumi ajándékba' && s.tasks.filter((t: any) => t.done).length === 7; }, 20000), 'Net visszatérése után minden feltöltődik');

  // documents: upload a PDF on the laptop, open it on the phone (encrypted end to end)
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 200 200]/Parent 2 0 R>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
  await B.setInputFiles('input[type=file][accept="image/*,application/pdf"]', { name: 'szerzodes.pdf', mimeType: 'application/pdf', buffer: pdf });
  log(await until(async () => { const s = await ctl(); return s.docs.length === 1 && s.files === 1; }), 'Gép: PDF feltöltve a felhőbe');
  log(await until(async () => (await A.$$('.doc')).length === 1), 'Telefon: a dokumentum megjelent');
  await A.tap('.doc a'); log(await until(async () => !!(await A.$('#viewer iframe'))), 'Telefon: a titkosított PDF megnyílik');
  await A.tap('#viewer .b');

  // calendar export
  const [dl] = await Promise.all([B.waitForEvent('download'), B.click('[data-ics]')]);
  const txt = readFileSync(await dl.path(), 'utf8'); log((txt.match(/BEGIN:VEVENT/g) || []).length > 5, 'Naptár export', (txt.match(/BEGIN:VEVENT/g) || []).length + ' esemény');

  // load: 30 deals from the laptop quickly over a flaky network
  await ctl('fail=0.2&lat=20,300');
  await B.evaluate(() => { const app = (window as any).__app; for (let i = 0; i < 30; i++) app.createDeal({ cust: 'Terhelés ' + i, delivery: '2027-01-' + String(1 + i % 28).padStart(2, '0'), fin: i % 2 === 0 }); });
  await ctl('fail=0&lat=0,0');
  log(await until(async () => (await ctl()).deals.length === 31, 30000), 'Terhelés: 30 új ügylet a felhőben');
  await A.tap('nav [data-p=deals]'); await A.selectOption('#filt', 'all');
  log(await until(async () => (await A.$$('.deal')).length === 31, 20000), 'Telefon: mind a 31 ügylet látszik');

  log(errs.A.length === 0 && errs.B.length === 0, 'Nincs JavaScript hiba', JSON.stringify(errs).slice(0, 300));
  await A.screenshot({ path: 'test/shot-phone.png' }); await B.screenshot({ path: 'test/shot-desktop.png', fullPage: false });
  writeFileSync('test/e2e-result.json', JSON.stringify(R));
  console.log(`\n${R.filter(r => r[0]).length}/${R.length} rendben`);
  await br.close(); close(); process.exit(R.every(r => r[0]) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });

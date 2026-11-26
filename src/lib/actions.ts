import { Store } from './store';
import { WARN_DAYS, defSettings, purgeOn, newDeal, planTasks, sortTasks, TPLV, DEF_TPL, type Deal, type Doc, type Settings, type SettingsData, type Task } from './domain';
import { addD, today, uuid } from './util';
import { encBlob, decBlob } from './crypto';

/* One place for every change the screens make, so rules (task re-planning, soft delete) live together. */
export class App {
  key: CryptoKey | null = null;
  constructor(public st: Store, public uid: string) {}

  /* ---- reading ---- */
  settings(): Settings {
    const s = this.st.get<Settings>('settings', this.uid);
    const data: SettingsData = Object.assign(defSettings(), s?.data || {});
    return { data, pin: s?.pin || null };
  }
  deals() { return this.st.list<Deal>('deals'); }
  deal(id: string) { const d = this.st.get<Deal>('deals', id); return d && !d.deleted_at ? d : undefined; }
  tasks(dealId: string) { return this.st.list<Task>('tasks').filter(t => t.deal_id === dealId).sort(sortTasks); }
  allTasks() { const by = new Map<string, Task[]>(); this.st.list<Task>('tasks').forEach(t => { (by.get(t.deal_id) || by.set(t.deal_id, []).get(t.deal_id)!).push(t); }); by.forEach(a => a.sort(sortTasks)); return by; }
  docs(dealId: string) { return this.st.list<Doc>('docs').filter(x => x.deal_id === dealId); }

  /* ---- settings ---- */
  setData(patch: Partial<SettingsData>) { const s = this.settings(); this.st.mutate('settings', this.uid, { data: { ...s.data, ...patch } }); }
  setPin(pin: Settings['pin']) { this.st.mutate('settings', this.uid, { pin }); }
  ensureSettings() {
    const s = this.st.get<Settings>('settings', this.uid);
    if (!s) this.st.insert('settings', { id: this.uid, data: defSettings() });
    else if ((s.data?.tplv || 1) < TPLV) this.setData({ tpl: structuredClone(DEF_TPL), tplv: TPLV });
  }

  /* ---- deals ---- */
  createDeal(init: Partial<Deal> = {}) {
    const d = { ...newDeal(), ...init }; this.st.insert('deals', d); this.replan(d.id); return d.id;
  }
  /** change deal fields; dates and flags re-plan the template tasks */
  updateDeal(id: string, f: Partial<Deal>) {
    this.st.mutate('deals', id, f);
    if (['contract', 'delivery', 'ceg', 'fin', 'trade', 'ins', 'acc'].some(k => k in f)) this.replan(id);
  }
  replan(id: string) {
    const d = this.deal(id); if (!d) return;
    const { upsert, remove } = planTasks(d, this.settings().data.tpl, this.tasks(id));
    upsert.forEach(t => { const cur = this.st.get<Task>('tasks', t.id); if (!cur) this.st.insert('tasks', t); else this.st.mutate('tasks', t.id, { title: t.title, due: t.due, sub: t.sub, sort: t.sort }); });
    remove.forEach(tid => this.st.mutate('tasks', tid, { deleted_at: new Date().toISOString() }));
  }
  removeDeal(id: string) {
    const now = new Date().toISOString(); this.st.mutate('deals', id, { deleted_at: now });
  }
  restoreDeal(id: string) { this.st.mutate('deals', id, { deleted_at: null }); }

  /** 1 year retention: delete closed deals (and bin items after 30 days) with their tasks and documents */
  private purging = false;
  async purgeExpired(now = today()) {
    if (this.purging) return 0; this.purging = true;
    try {
      const due = this.st.list<Deal>('deals', true).filter(d => { const p = purgeOn(d); return p && p <= now; });
      if (!due.length) return 0;
      const ids = new Set(due.map(d => d.id));
      const tasks = this.st.list<Task>('tasks', true).filter(t => ids.has(t.deal_id));
      const docs = this.st.list<Doc>('docs', true).filter(x => ids.has(x.deal_id));
      await this.st.purge([...docs.map(x => ({ t: 'docs' as const, id: x.id })), ...tasks.map(t => ({ t: 'tasks' as const, id: t.id })), ...due.map(d => ({ t: 'deals' as const, id: d.id }))], docs.map(x => x.path));
      return due.length;
    } catch { return 0; } finally { this.purging = false; }
  }
  /** deals that will be deleted within the warning period */
  soonPurged(now = today()) { return this.st.list<Deal>('deals').map(d => ({ d, on: purgeOn(d) })).filter(x => x.on && !x.d.deleted_at && x.on > now && x.on <= addD(now, WARN_DAYS)!) as { d: Deal; on: string }[]; }

  /* ---- tasks ---- */
  tick(id: string, done: boolean) {
    const t = this.st.get<Task>('tasks', id); if (!t) return;
    const f: Partial<Task> = { done, done_at: done ? today() : null };
    if (t.sub && done) f.sub = t.sub.map(x => ({ ...x, done: true }));
    this.st.mutate('tasks', id, f);
  }
  tickSub(id: string, j: number, done: boolean) {
    const t = this.st.get<Task>('tasks', id); if (!t || !t.sub) return;
    const sub = t.sub.map((x, i) => i === j ? { ...x, done } : x); const all = sub.every(x => x.done);
    this.st.mutate('tasks', id, { sub, done: all, done_at: all ? (t.done_at || today()) : null });
    return all && !t.done;
  }
  setDue(id: string, due: string | null) { this.st.mutate('tasks', id, { due, man: true }); }
  addTask(dealId: string, title: string, due: string | null) {
    const t: Task = { id: uuid(), deal_id: dealId, tpl_key: null, title, due, done: false, done_at: null, sub: null, man: true, sort: 999, deleted_at: null };
    this.st.insert('tasks', t);
  }
  removeTask(id: string) { this.st.mutate('tasks', id, { deleted_at: new Date().toISOString() }); }

  /* ---- documents (encrypted before they leave the device) ---- */
  async addDoc(dealId: string, blob: Blob, name: string, kind: string, pages: number | null = null) {
    if (!this.key) throw new Error('locked');
    const id = uuid(), path = `${this.uid}/${dealId}/${id}.bin`;
    const enc = await encBlob(this.key, await blob.arrayBuffer());
    await this.st.saveFile(path, enc);
    const doc: Doc = { id, deal_id: dealId, kind, name, path, mime: blob.type || 'application/octet-stream', size: blob.size, pages, deleted_at: null };
    this.st.insert('docs', doc); return id;
  }
  async openDoc(doc: Doc) {
    if (!this.key) throw new Error('locked');
    const raw = await this.st.readFile(doc.path);
    return new Blob([await decBlob(this.key, raw) as any], { type: doc.mime });
  }
  removeDoc(id: string) { this.st.mutate('docs', id, { deleted_at: new Date().toISOString() }); }
}

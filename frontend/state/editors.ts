import type { AppStore } from "./store";
import type { Entry, NotesState, NoteDraft, WorkState, WorkFields, WorkDraft } from "./types";
import { emptyNotes, emptyWork } from "./defaults";
import { requestId } from "../lib/format";
import { ApiError, errorMessage, isAbort } from "./errors";

const values = (entry: Entry): WorkFields => ({ workStatus: entry.workStatus || "OPEN", responsibleTeam: entry.responsibleTeam || "", nextStep: entry.nextStep || "" });
export class NotesController {
  private drafts = new Map<number, NoteDraft>();
  private version = 0;
  constructor(private app: AppStore) {}
  get state() { return this.app.getSnapshot().notes; }
  private set(patch: Partial<NotesState>) { this.app.patch({ notes: { ...this.state, ...patch } }); }
  dirty = () => [...this.drafts.values()].some(draft => Boolean(draft.body.trim()));
  snapshot = () => [...this.drafts.values()].filter(draft => draft.body.trim()).map(draft => ({ ...draft }));
  restore(items: NoteDraft[]) { this.drafts = new Map(items.map(item => [item.id, item])); }
  reset() { this.version++; this.drafts.clear(); this.app.patch({ notes: emptyNotes() }); }
  async open(item: Pick<Entry, "id" | "title">, readOnly = false) {
    if (this.state.busy) return;
    this.version++;
    const draft = this.drafts.get(item.id);
    this.app.patch({ observation: null, notes: { ...emptyNotes(), active: { ...item, readOnly }, text: draft?.body || "", hasDraft: Boolean(draft?.body.trim()) } });
    await this.load();
  }
  close = () => {
    if (this.state.busy || !this.state.active) return;
    this.version++; this.app.patch({ notes: emptyNotes() });
  };
  changeText(text: string) {
    const { active, busy } = this.state;
    if (!active || busy || active.readOnly || !this.state.data?.canWrite) return;
    this.drafts.set(active.id, { id: active.id, title: active.title, body: text, requestId: requestId() });
    this.set({ text, hasDraft: Boolean(text.trim()) });
  }
  discard = () => {
    if (!this.state.active || this.state.busy) return;
    this.drafts.delete(this.state.active.id); this.set({ text: "", hasDraft: false });
  };
  async load(page = 1, clearMessage = true): Promise<void> {
    const { active, busy } = this.state;
    if (!active || busy) return;
    const version = ++this.version;
    this.set({ loading: true, ...(clearMessage ? { message: null } : {}) });
    try {
      const data = await this.app.read<NonNullable<NotesState["data"]>>("/operations/entries/" + active.id + "/updates?page=" + page);
      if (version !== this.version || this.state.active !== active) return;
      const valid = Math.min(data.page, Math.max(1, Math.ceil(data.total / 20)));
      if (valid !== data.page) return this.load(valid, clearMessage);
      this.set({ data });
    } catch (error) { if (version === this.version && !isAbort(error)) this.set({ message: errorMessage(error) }); }
    finally { if (version === this.version) this.set({ loading: false }); }
  }
  async save() {
    const { active, busy, loading, data, text } = this.state;
    if (!active || busy || loading || active.readOnly || !data?.canWrite) return;
    if (!text.trim()) return this.set({ message: { key: "UPDATE_INVALID_INPUT", error: true } });
    let draft = this.drafts.get(active.id);
    if (!draft || draft.body !== text) {
      draft = { id: active.id, title: active.title, body: text, requestId: requestId() }; this.drafts.set(active.id, draft);
    }
    const version = this.version;
    this.set({ busy: true, message: null });
    try {
      await this.app.json("/operations/entries/" + active.id + "/updates", "POST", { body: draft.body, requestId: draft.requestId });
      if (version !== this.version || this.state.active !== active) return;
      this.drafts.delete(active.id); this.set({ text: "", hasDraft: false, busy: false, message: { key: "updateSaved" } });
      await this.load(1, false);
      if (this.state.active === active) await this.app.refreshVisible();
    } catch (error) {
      if (version === this.version && !isAbort(error)) {
        this.set({ message: errorMessage(error) });
        if (error instanceof ApiError && error.code === "UPDATE_ENTRY_CLOSED") { this.set({ busy: false }); await this.load(data.page, false); }
      }
    } finally { if (this.state.active === active) this.set({ busy: false }); }
  }
}

export class WorkController {
  private drafts = new Map<number, WorkDraft>();
  private version = 0;
  constructor(private app: AppStore) {}
  get state() { return this.app.getSnapshot().work; }
  private set(patch: Partial<WorkState>) { this.app.patch({ work: { ...this.state, ...patch } }); }
  dirty = () => this.drafts.size > 0;
  snapshot = () => [...this.drafts.values()].map(draft => ({ ...draft }));
  restore(items: WorkDraft[]) { this.drafts = new Map(items.map(item => [item.id, item])); }
  reset() { this.version++; this.drafts.clear(); this.app.patch({ work: emptyWork() }); }
  async open(item: Pick<Entry, "id" | "title">, readOnly = false) {
    if (this.state.busy) return;
    this.version++;
    const draft = this.drafts.get(item.id);
    this.app.patch({ observation: null, work: { ...emptyWork(), active: { ...item, readOnly }, ...(draft ? { fields: draft, hasDraft: true } : {}) } });
    await this.load();
  }
  close = () => {
    if (this.state.busy || !this.state.active) return;
    this.version++; this.app.patch({ work: emptyWork() });
  };
  changeFields(patch: Partial<WorkFields>) {
    const { active, data, busy, loading, fields } = this.state;
    if (!active || !data?.canWrite || active.readOnly || busy || loading) return;
    const next = { ...fields, ...patch } as WorkFields;
    const previous = this.drafts.get(active.id);
    if (JSON.stringify(next) === JSON.stringify(values(data.entry))) this.drafts.delete(active.id);
    else this.drafts.set(active.id, { ...next, id: active.id, title: active.title, version: previous?.version ?? data.entry.workVersion ?? 0 });
    this.set({ fields: next, hasDraft: this.drafts.has(active.id) });
  }
  private fill() {
    const { active, data } = this.state;
    if (!active) return;
    const draft = this.drafts.get(active.id), entry = data?.entry;
    if (draft) this.set({ fields: { workStatus: draft.workStatus, responsibleTeam: draft.responsibleTeam, nextStep: draft.nextStep }, hasDraft: true });
    else if (entry) this.set({ fields: { ...values(entry), ...(entry.closedAt ? { workStatus: "CLOSED" as const } : {}) }, hasDraft: false });
  }
  async load(page = 1, discard = false): Promise<void> {
    const { active, busy } = this.state;
    if (!active || busy) return;
    const version = ++this.version;
    this.set({ loading: true, message: null });
    try {
      const data = await this.app.read<NonNullable<WorkState["data"]>>("/operations/entries/" + active.id + "/work?page=" + page);
      if (version !== this.version || this.state.active !== active) return;
      if (!data.entry || !Array.isArray(data.items)) throw new Error(this.app.t("failed"));
      const valid = Math.min(data.page, Math.max(1, Math.ceil(data.total / 20)));
      if (valid !== data.page) return this.load(valid, discard);
      if (discard) this.drafts.delete(active.id);
      this.set({ data }); this.fill();
    } catch (error) { if (version === this.version && !isAbort(error)) this.set({ message: errorMessage(error) }); }
    finally { if (version === this.version) this.set({ loading: false }); }
  }
  discard = () => {
    if (!this.state.active || this.state.busy || this.state.loading || !confirm(this.app.t("workReloadConfirm"))) return;
    this.drafts.delete(this.state.active.id); this.fill();
  };
  reload = () => {
    if (this.state.active && (!this.drafts.has(this.state.active.id) || confirm(this.app.t("workReloadConfirm")))) void this.load(1, true);
  };
  async save() {
    const { active, busy, loading, data, fields } = this.state;
    if (!active || busy || loading || active.readOnly || !data?.canWrite) return;
    const version = this.version, draft = this.drafts.get(active.id);
    this.set({ busy: true, message: null });
    try {
      const entry = await this.app.json<Entry>("/operations/entries/" + active.id + "/work", "PATCH", { ...fields, version: draft?.version ?? data.entry.workVersion ?? 0 });
      if (version !== this.version || this.state.active !== active) return;
      this.drafts.delete(active.id); this.set({ data: { ...data, entry }, busy: false, hasDraft: false });
      await this.load();
      if (this.state.active === active) { this.set({ message: { key: "workSaved" } }); await this.app.refreshVisible(); }
    } catch (error) {
      if (version === this.version && !isAbort(error)) {
        this.set({ message: errorMessage(error) });
        if (error instanceof ApiError && error.code === "WORK_CLOSED") this.set({ data: { ...data, canWrite: false } });
      }
    } finally { if (this.state.active === active) this.set({ busy: false }); }
  }
}

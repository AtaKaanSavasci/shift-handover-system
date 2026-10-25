import { translate, translateApiError, type Language } from "../lib/i18n";
import { currentSchedule, boardKinds } from "../lib/format";
import { preparePhoto } from "../lib/photo-upload";
import { defaults, emptyEntry } from "./defaults";
import { aborted, ApiError, errorMessage, isAbort } from "./errors";
import { AiController } from "./ai";
import { NotesController, WorkController } from "./editors";
import type { AppState, EntryDraft, Entry, Page, PageResult, Shift, Summary, User, Message, Theme, Equipment, EquipmentStatus, Kind } from "./types";

const same = <T>(previous: T, next: T): T => JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
const query = (fields: Record<string, string>) => new URLSearchParams(Object.entries(fields).filter(([, value]) => value.trim())).toString();
export const pageFromHash = (hash = location.hash): Page => {
  const value = hash.replace(/^#/, "");
  return value === "board-title" ? "handover" : ["overview", "new-record", "handover", "history"].includes(value) ? value as Page : "overview";
};
export class AppStore {
  state = defaults();
  private listeners = new Set<() => void>();
  private token: string | null = null;
  private session = new AbortController();
  private epoch = 0;
  private authVersion = 0;
  private currentVersion = 0;
  private operationsVersion = 0;
  private shiftsVersion = 0;
  private entryVersion = 0;
  private photoVersion = 0;
  private contactVersion = 0;
  private contacts = new Map<string, number>();
  private interrupted: { owner: number; entry: EntryDraft; files: File[]; ai: ReturnType<AiController["snapshot"]>; notes: ReturnType<NotesController["snapshot"]>; work: ReturnType<WorkController["snapshot"]> } | null = null;
  readonly ai = new AiController(this);
  readonly notes = new NotesController(this);
  readonly work = new WorkController(this);
  constructor() {
    let language: Language = "tr", preference: Theme | null = null;
    try {
      language = localStorage.getItem("vardiya-language") === "en" ? "en" : "tr";
      const saved = localStorage.getItem("vardiya-theme"); preference = saved === "light" || saved === "dark" ? saved : null;
    } catch { /* Preferences still work when storage is unavailable. */ }
    this.state = { ...this.state, language, themePreference: preference, theme: preference || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") };
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  patch = (patch: Partial<AppState>) => { this.state = { ...this.state, ...patch }; this.listeners.forEach(listener => listener()); };
  t = (key: string, vars: Record<string, string | number> = {}) => translate(this.state.language, key, vars);
  message = (message: Message | null) => !message ? "" : message.key ? this.t(message.key) : message.api ? translateApiError(this.state.language, message.api) : message.text || this.t("failed");
  notify(message: Message | null) { this.patch(this.state.user ? { dashboardMessage: message } : { authMessage: message }); }
  showError(error: unknown) { if (!isAbort(error)) this.notify(errorMessage(error)); }
  setLanguage = (language: Language) => {
    try { localStorage.setItem("vardiya-language", language); } catch { /* Keep in-memory preference. */ }
    this.patch({ language, dashboardMessage: null, authMessage: null, entryMessage: this.state.entrySending ? { key: "saveProgress" } : null });
    this.ai.changeLanguage();
  };
  toggleTheme = () => {
    const theme = this.state.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("vardiya-theme", theme); } catch { /* Keep in-memory preference. */ }
    this.patch({ theme, themePreference: theme });
  };
  systemTheme = (dark: boolean) => { if (!this.state.themePreference) this.patch({ theme: dark ? "dark" : "light" }); };
  storageTheme = (value: string | null) => {
    const preference = value === "dark" || value === "light" ? value : null;
    this.patch({ themePreference: preference, theme: preference || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") });
  };
  private contact(key: string, version: number, read: boolean, status?: number) {
    if (this.contacts.get(key) !== version) return;
    const failures = new Set(this.state.connection.failures);
    if (read) { if (status === undefined || status >= 500) failures.add(key); else failures.delete(key); }
    this.patch({ connection: { ...this.state.connection, failures: [...failures], reachable: status !== undefined,
      ...(status !== undefined ? { lastResponse: new Date().toISOString() } : {}) } });
  }
  async api(path: string, options: RequestInit = {}) {
    const epoch = this.epoch, signal = this.session.signal, key = path.split("?")[0]!, version = ++this.contactVersion;
    this.contacts.set(key, version);
    const read = (!options.method || ["GET", "HEAD"].includes(options.method)) && !path.startsWith("/ai/");
    let response: Response;
    try {
      response = await fetch(path, { ...options, signal, headers: { "Accept-Language": this.state.language, ...options.headers, Authorization: "Bearer " + this.token } });
    } catch (error) {
      if (epoch !== this.epoch || isAbort(error)) throw aborted();
      this.contact(key, version, read); throw new ApiError("connection", this.t("connection"));
    }
    if (epoch !== this.epoch || signal.aborted) throw aborted();
    this.contact(key, version, read, response.status);
    if (response.status === 401) {
      const dirty = this.dirty(); this.logout(true); this.patch({ authMessage: { key: dirty ? "expiredDraft" : "expired", error: true } }); throw aborted();
    }
    if (!response.ok) {
      let code = "failed";
      try { const body: unknown = await response.json(); if (body && typeof body === "object" && "error" in body && typeof body.error === "string") code = body.error; } catch { /* Non-JSON gateway response. */ }
      throw new ApiError(code, translateApiError(this.state.language, code));
    }
    return response;
  }
  async read<T>(path: string): Promise<T> { return (await this.api(path)).json() as Promise<T>; }
  async json<T = unknown>(path: string, method: string, body: unknown): Promise<T> {
    return (await this.api(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json() as Promise<T>;
  }
  async login(input: { email: string; password: string; name?: string; registrationCode?: string }, register: boolean) {
    if (this.state.authBusy) return false;
    const attempt = ++this.authVersion;
    this.patch({ authBusy: true, authMessage: { key: register ? "signupProgress" : "loginProgress" } });
    try {
      const response = await fetch(register ? "/register" : "/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      if (attempt !== this.authVersion) throw aborted();
      if (!response.ok) {
        let code = "failed"; try { code = (await response.json()).error || code; } catch { /* Generic failure. */ }
        throw new ApiError(code, translateApiError(this.state.language, code));
      }
      if (register) { this.patch({ authMessage: { key: "signupDone" } }); return true; }
      const data = await response.json() as { token: string; user: User };
      if (attempt !== this.authVersion) throw aborted();
      this.epoch++; this.session.abort(); this.session = new AbortController(); this.contacts.clear(); this.token = data.token;
      this.patch({ user: data.user, page: pageFromHash(), current: undefined, dashboardMessage: null,
        connection: { browserOnline: navigator.onLine, reachable: null, lastResponse: null, failures: [], busy: false } });
      if (this.interrupted) {
        const saved = this.interrupted; this.interrupted = null;
        if (saved.owner === data.user.id) {
          this.patch({ entry: saved.entry }); this.addPhotos(saved.files); this.ai.restore(saved.ai); this.notes.restore(saved.notes); this.work.restore(saved.work);
          this.patch({ dashboardMessage: { key: "draftRestored" } });
        }
      }
      await Promise.all([this.refreshVisible(), this.ai.load()]);
      return attempt === this.authVersion && this.state.user?.id === data.user.id;
    } catch (error) { if (attempt === this.authVersion) this.showError(error instanceof TypeError ? new ApiError("connection", this.t("connection")) : error); return false; }
    finally { if (attempt === this.authVersion) this.patch({ authBusy: false }); }
  }
  entryDirty = () => {
    const e = this.state.entry;
    return Boolean(e.title.trim() || e.description.trim() || e.responsibleTeam.trim() || e.nextStep.trim() || e.workStatus !== "OPEN" || this.state.photos.length);
  };
  dirty = () => this.entryDirty() || this.ai.dirty() || this.notes.dirty() || this.work.dirty();
  logout(preserve = false) {
    const old = this.state;
    if (preserve && old.user && this.dirty()) this.interrupted = { owner: old.user.id, entry: { ...old.entry }, files: old.photos.map(item => item.file), ai: this.ai.snapshot(), notes: this.notes.snapshot(), work: this.work.snapshot() };
    if (!preserve) this.interrupted = null;
    this.epoch++; this.authVersion++; this.currentVersion++; this.operationsVersion++; this.shiftsVersion++; this.entryVersion++; this.photoVersion++;
    this.session.abort(); this.session = new AbortController(); this.token = null; this.contacts.clear();
    old.photos.forEach(item => URL.revokeObjectURL(item.url)); if (old.photoUrl) URL.revokeObjectURL(old.photoUrl);
    this.ai.reset(); this.notes.reset(); this.work.reset();
    this.patch({ ...defaults(), language: old.language, theme: old.theme, themePreference: old.themePreference, authReset: old.authReset + 1, navigationVersion: old.navigationVersion + 1 });
    history.replaceState(null, "", location.pathname + location.search + "#overview");
  }
  requestLogout = () => { if (this.dirty() && !confirm(this.t("discardDraft"))) return; this.logout(); this.patch({ authMessage: { key: "signedOut" } }); };
  navigate = (hash: string) => {
    if (!this.state.user) return;
    const page = pageFromHash(hash), changed = page !== this.state.page;
    this.patch({ page, navigationVersion: this.state.navigationVersion + 1 });
    if (changed) void this.refreshVisible();
  };
  go = (page: Page) => { if (location.hash === "#" + page) this.navigate("#" + page); else location.hash = page; };
  async loadCurrent() {
    const version = ++this.currentVersion, epoch = this.epoch;
    try {
      const { currentShift } = await this.read<{ currentShift: Shift | null }>("/shifts/current");
      if (version !== this.currentVersion || epoch !== this.epoch) return;
      const previous = this.state.current;
      const schedule = currentShift ? { date: currentShift.shiftDate || currentSchedule().date, slot: currentShift.scheduledStart && currentShift.scheduledEnd ? currentShift.scheduledStart + "-" + currentShift.scheduledEnd : "" }
        : previous ? currentSchedule() : this.state.schedule;
      this.patch({ current: same(previous, currentShift), currentStale: false, schedule });
    } catch (error) { if (version === this.currentVersion && epoch === this.epoch && !isAbort(error)) { this.patch({ currentStale: true }); this.showError(error); } }
  }
  async toggleShift() {
    if (this.state.shiftBusy) return;
    if (this.state.current === undefined) return this.loadCurrent();
    const ending = Boolean(this.state.current), epoch = this.epoch, schedule = this.state.schedule;
    this.patch({ shiftBusy: true });
    try {
      const [scheduledStart, scheduledEnd] = schedule.slot.split("-");
      await this.json(ending ? "/shifts/end" : "/shifts/start", "POST", ending ? {} : { shiftDate: schedule.date, scheduledStart, scheduledEnd });
      if (epoch === this.epoch) this.notify({ key: ending ? "shiftEnded" : "shiftStarted" });
    } catch (error) { if (epoch === this.epoch) this.showError(error); }
    finally { if (epoch === this.epoch) { this.patch({ shiftBusy: false, shifts: { ...this.state.shifts, page: 1 } }); await this.refreshVisible(); } }
  }
  async loadOperations(options: { scope?: Page | "board"; boardPage?: number; historyPage?: number; boardQuery?: string } = {}): Promise<void> {
    const scope = options.scope || this.state.page;
    if (scope === "new-record" || !this.state.user) return;
    const version = ++this.operationsVersion, epoch = this.epoch;
    const needSummary = scope === "overview" || scope === "handover", needBoard = scope === "handover" || scope === "board", needHistory = scope === "history";
    const boardQuery = options.boardQuery ?? this.state.boardFilters;
    const open = new URLSearchParams(boardQuery); open.set("view", "open"); open.set("page", String(options.boardPage ?? this.state.board.page));
    const historyQuery = new URLSearchParams(this.state.operationFilters);
    historyQuery.set("view", this.state.operationFilters ? "all" : "history"); historyQuery.set("page", String(options.historyPage ?? this.state.operations.page));
    this.patch({ operationsBusy: true });
    try {
      const [summary, board, operations] = await Promise.all([
        needSummary ? this.read<Summary>("/operations/summary") : null,
        needBoard ? this.read<PageResult<Entry>>("/operations/entries?" + open) : null,
        needHistory ? this.read<PageResult<Entry>>("/operations/entries?" + historyQuery) : null
      ]);
      if (version !== this.operationsVersion || epoch !== this.epoch) return;
      const boardPage = board ? Math.min(board.page, Math.max(1, Math.ceil(board.total / 20))) : options.boardPage;
      const historyPage = operations ? Math.min(operations.page, Math.max(1, Math.ceil(operations.total / 20))) : options.historyPage;
      if ((board && boardPage !== board.page) || (operations && historyPage !== operations.page)) return this.loadOperations({ scope, boardPage, historyPage, boardQuery });
      const patch: Partial<AppState> = {};
      if (summary) Object.assign(patch, { summary: same(this.state.summary, summary), checkedAt: new Date().toISOString(), summaryStale: false });
      if (board) Object.assign(patch, { board: same(this.state.board, board), boardFilters: boardQuery });
      if (operations) patch.operations = same(this.state.operations, operations);
      this.patch(patch);
    } catch (error) {
      if (version === this.operationsVersion && epoch === this.epoch && !isAbort(error)) {
        this.showError(error);
        const applied = new URLSearchParams(this.state.boardFilters);
        this.patch({ ...(needSummary ? { summaryStale: true } : {}), ...(needBoard ? { boardFilterDraft: { kind: applied.get("kind") || "", equipment: applied.get("equipment") || "", priority: applied.get("priority") || "" } } : {}) });
      }
    } finally { if (version === this.operationsVersion && epoch === this.epoch) this.patch({ operationsBusy: false }); }
  }
  refreshVisible = async () => {
    if (!this.state.user || this.state.page === "new-record") return;
    await Promise.all([this.loadOperations(), this.state.page === "history" ? this.loadShifts() : this.loadCurrent()]);
  };
  private refreshing = false;
  async refreshLive() {
    if (!this.state.user || this.refreshing || document.visibilityState !== "visible" || !["overview", "handover"].includes(this.state.page)) return;
    this.refreshing = true; try { await this.refreshVisible(); } finally { this.refreshing = false; }
  }
  async retryConnection() {
    if (this.state.connection.busy || !navigator.onLine || !this.state.user) return;
    this.patch({ connection: { ...this.state.connection, busy: true } });
    const epoch = this.epoch;
    try { if (this.state.page === "new-record") await this.loadCurrent(); else await this.refreshVisible(); }
    finally { if (epoch === this.epoch) this.patch({ connection: { ...this.state.connection, busy: false } }); }
  }
  online = (online: boolean) => {
    this.patch({ connection: { ...this.state.connection, browserOnline: online, ...(online ? { reachable: null } : {}) } });
    if (online) void this.retryConnection();
  };
  applyBoard = () => this.loadOperations({ scope: "board", boardPage: 1, boardQuery: query(this.state.boardFilterDraft) });
  clearBoard = () => { this.patch({ boardFilterDraft: { kind: "", equipment: "", priority: "" } }); return this.loadOperations({ scope: "board", boardPage: 1, boardQuery: "" }); };
  applyOperations = () => {
    const { from, to } = this.state.operationFilterDraft;
    if (from && to && from > to) return this.notify({ key: "invalidRange", error: true });
    this.patch({ operationFilters: query(this.state.operationFilterDraft) }); return this.loadOperations({ scope: "history", historyPage: 1 });
  };
  clearOperations = () => { this.patch({ operationFilters: "", operationFilterDraft: defaults().operationFilterDraft }); return this.loadOperations({ scope: "history", historyPage: 1 }); };
  shiftParams = () => {
    const { from, to, scope } = this.state.shiftFilterDraft;
    return query({ from, to, ...(this.state.user?.role === "MANAGER" && scope === "all" ? { scope } : {}) });
  };
  changeShiftFilters(patch: Partial<AppState["shiftFilterDraft"]>) {
    this.patch({ shiftFilterDraft: { ...this.state.shiftFilterDraft, ...patch } });
    if (this.shiftParams() !== this.state.shiftFilters) this.notify({ key: "applyFirst" });
  }
  applyShifts = () => {
    const { from, to } = this.state.shiftFilterDraft;
    if (from && to && from > to) return this.notify({ key: "invalidRange", error: true });
    this.patch({ shiftFilters: this.shiftParams(), dashboardMessage: null }); return this.loadShifts(1);
  };
  clearShifts = () => { this.patch({ shiftFilterDraft: { from: "", to: "", scope: "own" }, shiftFilters: "", dashboardMessage: null }); return this.loadShifts(1); };
  async loadShifts(page = this.state.shifts.page): Promise<void> {
    const version = ++this.shiftsVersion, epoch = this.epoch, params = new URLSearchParams(this.state.shiftFilters); params.set("page", String(page));
    this.patch({ shiftsLoading: true, shiftsFailed: false });
    try {
      const data = await this.read<PageResult<Shift>>("/shifts?" + params);
      if (version !== this.shiftsVersion || epoch !== this.epoch) return;
      const valid = Math.min(data.page, Math.max(1, Math.ceil(data.total / 20)));
      if (valid !== data.page) return this.loadShifts(valid);
      this.patch({ shifts: data });
    } catch (error) { if (version === this.shiftsVersion && epoch === this.epoch && !isAbort(error)) { this.patch({ shiftsFailed: true }); this.showError(error); } }
    finally { if (version === this.shiftsVersion && epoch === this.epoch) this.patch({ shiftsLoading: false }); }
  }
  async exportShifts() {
    if (this.state.exporting || this.state.shiftsLoading || this.shiftParams() !== this.state.shiftFilters) return;
    const epoch = this.epoch; this.patch({ exporting: true }); this.notify({ key: "exporting" });
    try {
      const response = await this.api("/shifts/export?" + this.state.shiftFilters), blob = await response.blob();
      if (epoch !== this.epoch) return;
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") || "")?.[1] || "vardiyalar.xlsx";
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); this.notify({ key: "exportReady" });
    } catch (error) { if (epoch === this.epoch) this.showError(error); }
    finally { if (epoch === this.epoch) this.patch({ exporting: false }); }
  }
  changeEntry(patch: Partial<EntryDraft>) {
    if (this.state.entrySending) return;
    if ("title" in patch || "description" in patch) this.ai.changeSource();
    this.patch({ entry: { ...this.state.entry, ...patch }, entryMessage: null });
  }
  quickEntry(kind: Kind) { this.changeEntry({ kind, ...(kind === "ATTENTION" ? { priority: "HIGH" as const } : {}) }); this.patch({ entryFocus: this.state.entryFocus + 1 }); }
  addPhotos(files: File[]) {
    if (this.state.entrySending) return;
    if (this.state.photos.length + files.length > 3 || files.some(file => file.size > 5 * 1024 * 1024)) {
      this.patch({ entryMessage: { key: "photoLimit", error: true } }); this.notify({ key: "photoLimit", error: true }); return;
    }
    this.patch({ photos: [...this.state.photos, ...files.map(file => ({ file, url: URL.createObjectURL(file) }))] });
  }
  removePhoto(url: string) { if (this.state.entrySending) return; URL.revokeObjectURL(url); this.patch({ photos: this.state.photos.filter(item => item.url !== url) }); }
  resetEntry() {
    this.state.photos.forEach(item => URL.revokeObjectURL(item.url)); this.ai.invalidate();
    this.patch({ entry: emptyEntry(), photos: [], entryReset: this.state.entryReset + 1 });
  }
  async saveEntry() {
    if (this.state.entrySending) return;
    this.ai.invalidate();
    const epoch = this.epoch, version = ++this.entryVersion, entry = { ...this.state.entry }, files = this.state.photos.map(item => item.file);
    const body = new FormData();
    for (const key of ["kind", "priority", "equipmentCode", "title", "description"] as const) body.set(key, entry[key]);
    if (boardKinds.includes(entry.kind)) for (const key of ["workStatus", "responsibleTeam", "nextStep"] as const) body.set(key, entry[key]);
    this.patch({ entrySending: true, entryMessage: { key: files.length ? "photosPreparing" : "saveProgress" } });
    const active = () => epoch === this.epoch && version === this.entryVersion;
    try {
      for (const file of files) { const prepared = await preparePhoto(file); if (!active()) throw aborted(); body.append("photos", prepared); }
      if (!active()) return;
      this.patch({ entryMessage: { key: "saveProgress" } });
      await this.api("/operations/entries", { method: "POST", body });
      if (!active()) return;
      this.resetEntry();
      this.patch({ board: { ...this.state.board, page: 1 }, operations: { ...this.state.operations, page: 1 }, entryMessage: { key: "entrySaved" } });
      this.notify({ key: "entrySaved" }); await this.loadOperations({ scope: this.state.page === "new-record" ? "overview" : this.state.page });
    } catch (error) { if (active() && !isAbort(error)) { this.patch({ entryMessage: errorMessage(error) }); this.showError(error); } }
    finally { if (active()) this.patch({ entrySending: false }); }
  }
  openEquipment(item: Equipment) { this.patch({ equipmentDialog: { item, status: item.status, note: item.note || "", busy: false, message: null } }); }
  changeEquipment(patch: { status?: EquipmentStatus; note?: string }) { if (this.state.equipmentDialog) this.patch({ equipmentDialog: { ...this.state.equipmentDialog, ...patch } }); }
  async saveEquipment() {
    const dialog = this.state.equipmentDialog, epoch = this.epoch;
    if (!dialog || dialog.busy) return;
    this.patch({ equipmentDialog: { ...dialog, busy: true, message: null } });
    try {
      await this.json("/operations/equipment/" + dialog.item.code, "PUT", { status: dialog.status, note: dialog.note, version: dialog.item.version });
      if (epoch === this.epoch) { this.patch({ equipmentDialog: null }); this.notify({ key: "updated" }); }
    } catch (error) { if (epoch === this.epoch && !isAbort(error)) this.patch({ equipmentDialog: { ...dialog, busy: false, message: errorMessage(error) } }); }
    finally { if (epoch === this.epoch) { if (this.state.equipmentDialog) this.patch({ equipmentDialog: { ...this.state.equipmentDialog, busy: false } }); await this.loadOperations(); } }
  }
  openClose(item: Entry) { this.patch({ closeDialog: { id: item.id, title: item.title, note: "", busy: false, message: null } }); }
  async saveClose() {
    const dialog = this.state.closeDialog, epoch = this.epoch;
    if (!dialog || dialog.busy) return;
    this.patch({ closeDialog: { ...dialog, busy: true, message: null } });
    try {
      await this.json("/operations/entries/" + dialog.id + "/close", "POST", { closeNote: dialog.note });
      if (epoch === this.epoch) { this.patch({ closeDialog: null }); this.notify({ key: "itemClosed" }); await this.loadOperations(); }
    } catch (error) { if (epoch === this.epoch && !isAbort(error)) this.patch({ closeDialog: { ...dialog, busy: false, message: errorMessage(error) } }); }
    finally { if (epoch === this.epoch && this.state.closeDialog) this.patch({ closeDialog: { ...this.state.closeDialog, busy: false } }); }
  }
  async acknowledge() {
    const { summary, summaryBusy } = this.state, epoch = this.epoch;
    if (!summary || summaryBusy) return;
    this.patch({ summaryBusy: true });
    try { await this.json("/operations/summary/read", "POST", { revision: summary.revision }); if (epoch === this.epoch) this.notify({ key: "summarySaved" }); }
    catch (error) { if (epoch === this.epoch) this.showError(error); }
    finally { if (epoch === this.epoch) { this.patch({ summaryBusy: false }); await this.loadOperations(); } }
  }
  async viewPhoto(id: string) {
    const version = ++this.photoVersion, epoch = this.epoch;
    try {
      const blob = await (await this.api("/operations/photos/" + encodeURIComponent(id))).blob();
      if (epoch !== this.epoch || version !== this.photoVersion) return;
      if (this.state.photoUrl) URL.revokeObjectURL(this.state.photoUrl);
      this.patch({ photoUrl: URL.createObjectURL(blob) });
    } catch (error) { if (epoch === this.epoch && version === this.photoVersion) this.showError(error); }
  }
  closePhoto = () => { this.photoVersion++; if (this.state.photoUrl) URL.revokeObjectURL(this.state.photoUrl); this.patch({ photoUrl: null }); };
}
export const app = new AppStore();
